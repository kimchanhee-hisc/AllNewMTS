#include "allnewmts_mci.h"
#include "sha256.h"

#include <algorithm>
#include <array>
#include <charconv>
#include <cstring>
#include <map>
#include <mutex>
#include <new>
#include <set>
#include <string>
#include <string_view>
#include <tuple>
#include <vector>

namespace {

constexpr uint8_t kBetaFileSha256[32] = {
    0xf4, 0xc8, 0x87, 0xff, 0x3c, 0x33, 0x1e, 0x46, 0x0f, 0x94, 0x90,
    0xe2, 0xdf, 0xd4, 0x61, 0x2f, 0xeb, 0xa4, 0x57, 0xfc, 0xe0, 0x21,
    0x18, 0x71, 0x5d, 0x8d, 0x23, 0x4b, 0x77, 0x1d, 0xc1, 0x44};
constexpr uint8_t kBetaEndpointSha256[32] = {
    0x42, 0x9a, 0x80, 0x1e, 0x3b, 0x3e, 0xc7, 0x48, 0x5a, 0x6e, 0xf5,
    0x81, 0x7c, 0xe7, 0xc0, 0x34, 0x15, 0x1f, 0x40, 0xb7, 0x99, 0xbc,
    0x33, 0x41, 0xc9, 0x3a, 0xc2, 0x71, 0x6d, 0xd9, 0x1a, 0x35};
constexpr std::string_view kBetaSection =
    "[\xeb\xb2\xa0\xed\x83\x80]";
constexpr size_t kGd1000q1BodySize = 569;
constexpr size_t kS00RecordSize = 158;
constexpr size_t kS00PriceOffset = 17;
constexpr std::array<std::string_view, 104> kGd1000q1OutputFids = {
    "0001",  "9241",  "*0004", "*0005", "0007",  "0006", "1731",
    "0011",  "1251",  "1682",  "1254",  "0003",  "2517", "2518",
    "2519",  "1171",  "1982",  "2495",  "2496",  "2497", "2498",
    "0185",  "0186",  "0187",  "0188",  "0725",  "0726", "0727",
    "0802",  "0728",  "1760",  "1253",  "1255",  "1891", "1252",
    "1256",  "2129",  "2136",  "2137",  "1987",  "0306", "0050",
    "0049",  "0051",  "0052",  "0209",  "0210",  "0115", "0116",
    "0014",  "0015",  "0010",  "0013",  "1509",  "1508", "1504",
    "1505",  "0017",  "0018",  "0012",  "0019",  "0299", "0055",
    "0656",  "2499",  "2500",  "2501",  "2502",  "0296", "0297",
    "*0272", "*0273", "*0274", "*0275", "*0276", "0021", "0028",
    "2139",  "2485",  "2486",  "2143",  "0171",  "0172", "0173",
    "0174",  "0278",  "0279",  "0797",  "0798",  "0799", "0800",
    "0684",  "0016",  "0378",  "0265",  "0571",  "0572", "0189",
    "0223",  "0327",  "2167",  "2168",  "1008",  "2665"};

enum class BetaMode { Connect, InitProbe, Gd1000q1Probe, S00Probe };

bool sameHash(const uint8_t *bytes, size_t size, const uint8_t expected[32]) {
  uint8_t actual[32];
  allnewmts_sha256(bytes, size, actual);
  return std::memcmp(actual, expected, sizeof(actual)) == 0;
}

std::string_view trim(std::string_view value) {
  while (!value.empty() &&
         (value.front() == ' ' || value.front() == '\t' ||
          value.front() == '\r'))
    value.remove_prefix(1);
  while (!value.empty() &&
         (value.back() == ' ' || value.back() == '\t' ||
          value.back() == '\r'))
    value.remove_suffix(1);
  return value;
}

bool validHost(std::string_view host) {
  if (host.empty() || host.size() > 253 || host.front() == '.' ||
      host.back() == '.' || host.front() == '-' || host.back() == '-')
    return false;
  bool alpha = false;
  for (unsigned char c : host) {
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) alpha = true;
    else if ((c < '0' || c > '9') && c != '.' && c != '-') return false;
  }
  return alpha;
}

uint32_t preflightBeta(const uint8_t *ip_dat, size_t size,
                       const uint8_t file_hash[32],
                       const uint8_t endpoint_hash[32],
                       AllNewMTSMciEndpoint *endpoint) {
  if (!ip_dat || !size || size > 64 * 1024 || !file_hash || !endpoint_hash ||
      !endpoint || std::memchr(ip_dat, '\0', size))
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  if (!sameHash(ip_dat, size, file_hash))
    return ALLNEWMTS_MCI_BETA_SOURCE_MISMATCH;

  std::string_view input(reinterpret_cast<const char *>(ip_dat), size);
  bool in_beta = false, found_beta = false, found_count = false,
       found_host = false, found_port = false;
  std::string host, port_text;
  size_t position = 0;
  while (position < input.size()) {
    size_t end = input.find('\n', position);
    if (end == std::string_view::npos) end = input.size();
    std::string_view line = trim(input.substr(position, end - position));
    position = end == input.size() ? end : end + 1;
    if (line.empty() || line.front() == '#') continue;
    if (line.front() == '[' && line.back() == ']') {
      if (line == kBetaSection) {
        if (found_beta) return ALLNEWMTS_MCI_BETA_ENDPOINT_INVALID;
        found_beta = in_beta = true;
      } else {
        in_beta = false;
      }
      continue;
    }
    if (!in_beta) continue;
    size_t separator = line.find('=');
    if (separator == std::string_view::npos ||
        line.find('=', separator + 1) != std::string_view::npos)
      return ALLNEWMTS_MCI_BETA_ENDPOINT_INVALID;
    std::string_view key = trim(line.substr(0, separator));
    std::string_view value = trim(line.substr(separator + 1));
    if (key == "CNT") {
      if (found_count || value != "1")
        return ALLNEWMTS_MCI_BETA_ENDPOINT_INVALID;
      found_count = true;
    } else if (key == "IP1") {
      if (found_host || !validHost(value))
        return ALLNEWMTS_MCI_BETA_ENDPOINT_INVALID;
      found_host = true;
      host.assign(value);
    } else if (key == "PORT") {
      if (found_port || value.empty())
        return ALLNEWMTS_MCI_BETA_ENDPOINT_INVALID;
      found_port = true;
      port_text.assign(value);
    } else {
      return ALLNEWMTS_MCI_BETA_ENDPOINT_INVALID;
    }
  }
  uint32_t port = 0;
  auto parsed = std::from_chars(port_text.data(),
                                port_text.data() + port_text.size(), port);
  if (!found_beta || !found_count || !found_host || !found_port ||
      parsed.ec != std::errc() ||
      parsed.ptr != port_text.data() + port_text.size() || port == 0 ||
      port > 65535)
    return ALLNEWMTS_MCI_BETA_ENDPOINT_INVALID;

  std::string selected = host + ":" + port_text;
  if (!sameHash(reinterpret_cast<const uint8_t *>(selected.data()),
                selected.size(), endpoint_hash))
    return ALLNEWMTS_MCI_BETA_SOURCE_MISMATCH;
  std::memset(endpoint, 0, sizeof(*endpoint));
  std::memcpy(endpoint->host, host.data(), host.size());
  endpoint->port = static_cast<uint16_t>(port);
  return ALLNEWMTS_MCI_OK;
}

void put(uint8_t *output, size_t offset, size_t width,
         std::string_view value) {
  std::memcpy(output + offset, value.data(), std::min(width, value.size()));
}

void decimalFixed(uint8_t *output, size_t width, size_t value) {
  for (size_t index = 0; index < width; ++index) {
    output[width - 1 - index] = static_cast<uint8_t>('0' + value % 10);
    value /= 10;
  }
}

void decimal8(uint8_t *output, size_t offset, size_t value) {
  decimalFixed(output + offset, 8, value);
}

bool frameSize(const uint8_t *bytes, size_t size, size_t &total) {
  if (!bytes || size < 8) return false;
  size_t following = 0;
  for (size_t index = 0; index < 8; ++index) {
    if (bytes[index] < '0' || bytes[index] > '9') return false;
    following = following * 10 + static_cast<size_t>(bytes[index] - '0');
  }
  total = following + 8;
  return total >= 9 && total <= ALLNEWMTS_MCI_MAX_FRAME_SIZE;
}

bool textField(const uint8_t *bytes, size_t width, char *output,
               size_t output_size, bool required) {
  size_t begin = 0, end = width;
  while (begin < end && bytes[begin] == ' ') ++begin;
  while (end > begin && bytes[end - 1] == ' ') --end;
  if ((required && begin == end) || end - begin + 1 > output_size) return false;
  for (size_t index = begin; index < end; ++index)
    if (bytes[index] < 0x21 || bytes[index] > 0x7e) return false;
  std::memcpy(output, bytes + begin, end - begin);
  output[end - begin] = '\0';
  return true;
}

bool digits(const char *value, size_t width) {
  if (std::strlen(value) != width) return false;
  for (size_t index = 0; index < width; ++index)
    if (value[index] < '0' || value[index] > '9') return false;
  return true;
}

bool bytesAreDigits(const char *value, size_t width) {
  if (!value) return false;
  for (size_t index = 0; index < width; ++index)
    if (value[index] < '0' || value[index] > '9') return false;
  return true;
}

bool canonicalDigits(const char *value, size_t width) {
  return bytesAreDigits(value, width) && value[width] == '\0';
}

bool decimalValue(const uint8_t *value, size_t width, size_t &parsed) {
  parsed = 0;
  for (size_t index = 0; index < width; ++index) {
    if (value[index] < '0' || value[index] > '9') return false;
    parsed = parsed * 10 + static_cast<size_t>(value[index] - '0');
  }
  return true;
}

size_t printableLength(const char *value, size_t capacity) {
  if (!value) return 0;
  size_t length = 0;
  while (length < capacity && value[length] != '\0') {
    const unsigned char byte = static_cast<unsigned char>(value[length]);
    if (byte < 0x21 || byte > 0x7e) return 0;
    ++length;
  }
  return length < capacity && length != 0 ? length : 0;
}

bool signedDecimal(const uint8_t *value, size_t size) {
  if (!value || size == 0) return false;
  size_t index = value[0] == '+' || value[0] == '-' ? 1 : 0;
  if (index == size) return false;
  for (; index < size; ++index)
    if (value[index] < '0' || value[index] > '9') return false;
  return true;
}

bool structuralByte(uint8_t value) {
  return value == 0 || value == 0x1d || value == 0x1e || value == 0x1f ||
         value == 0x7f;
}

bool containsZeroIpSegment(std::string_view value) {
  size_t begin = 0;
  while (begin <= value.size()) {
    const size_t end = value.find('.', begin);
    const std::string_view segment =
        value.substr(begin, end == std::string_view::npos
                                ? value.size() - begin
                                : end - begin);
    if (segment == "0") return true;
    if (end == std::string_view::npos) return false;
    begin = end + 1;
  }
  return false;
}

}  // namespace

struct AllNewMTSMciClient {
  char channel_detail[5];
  AllNewMTSMciTransport transport;
  void *context = nullptr;
  uint64_t generation = 0;
  bool open = false;
  bool ready = false;
  uint8_t file_hash[32];
  uint8_t endpoint_hash[32];
  AllNewMTSMciSession session{};
};

namespace {

struct RealtimeRegistration {
  std::string service;
  std::string key;
  bool operator<(const RealtimeRegistration &other) const {
    return std::tie(service, key) < std::tie(other.service, other.key);
  }
};

bool realtimeService(std::string_view service) {
  if (service.empty() ||
      service.size() > ALLNEWMTS_MCI_REALTIME_SERVICE_SIZE)
    return false;
  for (unsigned char value : service)
    if (!((value >= 'A' && value <= 'Z') ||
          (value >= '0' && value <= '9')))
      return false;
  return true;
}

bool realtimeKey(const uint8_t *key, size_t size) {
  if (!key || size == 0 || size > ALLNEWMTS_MCI_REALTIME_KEY_SIZE)
    return false;
  for (size_t index = 0; index < size; ++index)
    if (key[index] < 0x21 || key[index] > 0x7e) return false;
  return true;
}

bool realtimeRegistration(const char *service, const uint8_t *key,
                          size_t key_size, RealtimeRegistration &result) {
  if (!service) return false;
  const size_t service_size =
      strnlen(service, ALLNEWMTS_MCI_REALTIME_SERVICE_SIZE + 1);
  if (service_size > ALLNEWMTS_MCI_REALTIME_SERVICE_SIZE ||
      !realtimeService(std::string_view(service, service_size)) ||
      !realtimeKey(key, key_size))
    return false;
  result.service.assign(service, service_size);
  result.key.assign(reinterpret_cast<const char *>(key), key_size);
  return true;
}

void realtimeAction(const RealtimeRegistration &registration, uint8_t type,
                    AllNewMTSMciRealtimeAction &action) {
  action = {};
  action.transaction_type = type;
  std::memcpy(action.service, registration.service.data(),
              registration.service.size());
  std::memcpy(action.key, registration.key.data(), registration.key.size());
  action.key_size = registration.key.size();
}

}  // namespace

struct AllNewMTSMciRealtimeRegistry {
  mutable std::mutex mutex;
  std::map<RealtimeRegistration, std::set<uint64_t>> registrations;
};

extern "C" uint32_t allnewmts_mci_build_init_request(
    const char channel_detail[5], uint8_t output[321]) {
  if (!channel_detail || !output) return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  for (size_t index = 0; index < 5; ++index)
    if (static_cast<unsigned char>(channel_detail[index]) < 0x21 ||
        static_cast<unsigned char>(channel_detail[index]) > 0x7e)
      return ALLNEWMTS_MCI_INVALID_ARGUMENT;

  std::memset(output, ' ', ALLNEWMTS_MCI_REQUEST_HEADER_SIZE);
  decimal8(output, 0, ALLNEWMTS_MCI_REQUEST_HEADER_SIZE - 8);
  output[8] = 'I';
  output[9] = '0';
  output[10] = '0';
  output[11] = 'S';
  output[12] = 'F';
  output[13] = '0';
  output[14] = '0';
  put(output, 15, 4, "0000");
  output[19] = 'S';
  put(output, 20, 3, "000");
  decimal8(output, 23, ALLNEWMTS_MCI_REQUEST_HEADER_SIZE - 8);
  decimal8(output, 31, ALLNEWMTS_MCI_REQUEST_HEADER_SIZE - 8);
  output[39] = '1';
  output[40] = '1';
  output[41] = '0';
  output[42] = '0';
  put(output, 43, 3, "CC3");
  put(output, 46, 5, std::string_view(channel_detail, 5));
  put(output, 138, 8, "00020692");
  put(output, 146, 4, "0000");
  output[158] = '1';
  output[160] = '0';
  output[161] = '0';
  output[162] = '2';
  output[163] = '0';
  output[164] = 'Q';
  output[294] = 'N';
  return ALLNEWMTS_MCI_OK;
}

extern "C" uint32_t allnewmts_mci_parse_init_response(
    const uint8_t *frame, size_t size, AllNewMTSMciSession *session) {
  if (!frame || !session) return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  size_t declared = 0;
  if (!frameSize(frame, size, declared) || declared != size ||
      size != ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE +
                  ALLNEWMTS_MCI_INIT_BODY_SIZE ||
      frame[8] != 'I')
    return ALLNEWMTS_MCI_INIT_INVALID;
  AllNewMTSMciSession parsed{};
  const uint8_t *body = frame + ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE;
  if (!textField(body, 32, parsed.public_ip, sizeof(parsed.public_ip), true) ||
      !textField(body + 32, 32, parsed.private_ip,
                 sizeof(parsed.private_ip), true) ||
      !textField(body + 64, 8, parsed.handle, sizeof(parsed.handle), true) ||
      !textField(body + 72, 8, parsed.date, sizeof(parsed.date), true) ||
      !textField(body + 80, 12, parsed.time, sizeof(parsed.time), true) ||
      !textField(body + 92, 1, parsed.type, sizeof(parsed.type), true) ||
      !textField(body + 93, 32, parsed.ip, sizeof(parsed.ip), true) ||
      !digits(parsed.date, 8) || !digits(parsed.time, 12) ||
      std::strlen(parsed.handle) != 8 || std::strlen(parsed.type) != 1)
    return ALLNEWMTS_MCI_INIT_INVALID;
  const char *selected =
      containsZeroIpSegment(parsed.private_ip) ? parsed.public_ip
                                               : parsed.private_ip;
  std::memcpy(parsed.selected_private_ip, selected, std::strlen(selected) + 1);
  *session = parsed;
  return ALLNEWMTS_MCI_OK;
}

uint32_t buildSfidBody(
    const char gid[5], const AllNewMTSMciSfidInput *inputs,
    size_t input_count, const AllNewMTSMciSfidOccurrence *occurrence,
    const AllNewMTSMciSfidOutput *outputs, size_t output_count,
    uint8_t *output, size_t output_capacity, size_t *output_size) {
  if (!canonicalDigits(gid, 4) || (input_count != 0 && !inputs) || !outputs ||
      output_count == 0 || !output || !output_size)
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;

  size_t required = 1 + (input_count == 0 ? 0 : 1) + 3 + 1 + 4 + 1;
  if (occurrence) {
    if (occurrence->record_count > 9999 ||
        occurrence->selector_value > 99999999 ||
        occurrence->mode > 9 ||
        occurrence->selector_order >
            ALLNEWMTS_MCI_SFID_SELECTOR_COUNT_THEN_VALUE ||
        occurrence->continuation_size > 999 ||
        (occurrence->continuation_size != 0 &&
         !occurrence->continuation_key))
      return ALLNEWMTS_MCI_TRANSACTION_INVALID;
    for (size_t index = 0; index < occurrence->continuation_size; ++index)
      if (structuralByte(occurrence->continuation_key[index]))
        return ALLNEWMTS_MCI_TRANSACTION_INVALID;
    if (required > SIZE_MAX - 1 - 18 - occurrence->continuation_size)
      return ALLNEWMTS_MCI_TRANSACTION_INVALID;
    required += 1 + 18 + occurrence->continuation_size;
  }
  for (size_t index = 0; index < input_count; ++index) {
    const size_t overhead = 4 + 1 + (index == 0 ? 0 : 1);
    if (!canonicalDigits(inputs[index].fid, 4) ||
        (inputs[index].value_size != 0 && !inputs[index].value) ||
        required > SIZE_MAX - overhead ||
        inputs[index].value_size > SIZE_MAX - required - overhead)
      return ALLNEWMTS_MCI_TRANSACTION_INVALID;
    for (size_t previous = 0; previous < index; ++previous)
      if (std::memcmp(inputs[previous].fid, inputs[index].fid, 5) == 0)
        return ALLNEWMTS_MCI_TRANSACTION_INVALID;
    for (size_t byte = 0; byte < inputs[index].value_size; ++byte)
      if (structuralByte(inputs[index].value[byte]))
        return ALLNEWMTS_MCI_TRANSACTION_INVALID;
    required += overhead + inputs[index].value_size;
  }
  for (size_t index = 0; index < output_count; ++index) {
    if (!canonicalDigits(outputs[index].fid, 4) ||
        outputs[index].attribute > 1 ||
        required > SIZE_MAX - 1 - outputs[index].attribute - 4)
      return ALLNEWMTS_MCI_TRANSACTION_INVALID;
    for (size_t previous = 0; previous < index; ++previous)
      if (std::memcmp(outputs[previous].fid, outputs[index].fid, 5) == 0)
        return ALLNEWMTS_MCI_TRANSACTION_INVALID;
    required += 1 + outputs[index].attribute + 4;
  }
  if (required > output_capacity) return ALLNEWMTS_MCI_RESOURCE_LIMIT;

  size_t cursor = 0;
  output[cursor++] = 0x1f;
  for (size_t index = 0; index < input_count; ++index) {
    if (index != 0) output[cursor++] = 0x1e;
    std::memcpy(output + cursor, inputs[index].fid, 4);
    cursor += 4;
    output[cursor++] = 0x7f;
    if (inputs[index].value_size != 0) {
      std::memcpy(output + cursor, inputs[index].value,
                  inputs[index].value_size);
      cursor += inputs[index].value_size;
    }
  }
  if (input_count != 0) output[cursor++] = 0x1e;
  std::memcpy(output + cursor, "GID", 3);
  cursor += 3;
  output[cursor++] = 0x7f;
  std::memcpy(output + cursor, gid, 4);
  cursor += 4;
  if (occurrence) {
    output[cursor++] = 0x1e;
    output[cursor++] = '$';
    if (occurrence->selector_order ==
        ALLNEWMTS_MCI_SFID_SELECTOR_COUNT_THEN_VALUE) {
      decimalFixed(output + cursor, 4, occurrence->record_count);
      cursor += 4;
      decimalFixed(output + cursor, 8, occurrence->selector_value);
      cursor += 8;
    } else {
      decimalFixed(output + cursor, 8, occurrence->selector_value);
      cursor += 8;
      decimalFixed(output + cursor, 4, occurrence->record_count);
      cursor += 4;
    }
    output[cursor++] = static_cast<uint8_t>('0' + occurrence->mode);
    output[cursor++] = '@';
    decimalFixed(output + cursor, 3, occurrence->continuation_size);
    cursor += 3;
    if (occurrence->continuation_size != 0) {
      std::memcpy(output + cursor, occurrence->continuation_key,
                  occurrence->continuation_size);
      cursor += occurrence->continuation_size;
    }
  }
  for (size_t index = 0; index < output_count; ++index) {
    output[cursor++] = 0x1e;
    if (outputs[index].attribute != 0) output[cursor++] = '*';
    std::memcpy(output + cursor, outputs[index].fid, 4);
    cursor += 4;
  }
  output[cursor++] = 0x1f;
  *output_size = cursor;
  return cursor == required ? ALLNEWMTS_MCI_OK
                            : ALLNEWMTS_MCI_TRANSACTION_INVALID;
}

extern "C" uint32_t allnewmts_mci_build_sfid_body(
    const char gid[5], const AllNewMTSMciSfidInput *inputs,
    size_t input_count, const AllNewMTSMciSfidOutput *outputs,
    size_t output_count, uint8_t *output, size_t output_capacity,
    size_t *output_size) {
  return buildSfidBody(gid, inputs, input_count, nullptr, outputs,
                       output_count, output, output_capacity, output_size);
}

extern "C" uint32_t allnewmts_mci_build_sfid_occurrence_body(
    const char gid[5], const AllNewMTSMciSfidInput *inputs,
    size_t input_count, const AllNewMTSMciSfidOccurrence *occurrence,
    const AllNewMTSMciSfidOutput *outputs, size_t output_count,
    uint8_t *output, size_t output_capacity, size_t *output_size) {
  if (!occurrence) return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  return buildSfidBody(gid, inputs, input_count, occurrence, outputs,
                       output_count, output, output_capacity, output_size);
}

static uint32_t buildSessionRequest(
    const char channel_detail[5], const AllNewMTSMciSession *session,
    const char request_nonce[10], uint8_t type, uint8_t encryption_flag,
    uint8_t interface_id, const char request_id[5],
    std::string_view transaction_id, const char *hts_id,
    size_t hts_id_capacity, const char *private_identity,
    size_t private_identity_capacity, const uint8_t *body, size_t body_size,
    uint8_t *output, size_t output_capacity, size_t *output_size) {
  const size_t public_ip_size =
      session ? printableLength(session->public_ip, sizeof(session->public_ip))
              : 0;
  const size_t hts_id_size = printableLength(hts_id, hts_id_capacity);
  const size_t private_identity_size =
      printableLength(private_identity, private_identity_capacity);
  if (!channel_detail || !session || !request_nonce || !request_id || !output ||
      !output_size || type < 0x21 || type > 0x7e ||
      encryption_flag < '0' || encryption_flag > '9' ||
      interface_id < 0x21 || interface_id > 0x7e ||
      !canonicalDigits(request_id, 4) || hts_id_size == 0 ||
      private_identity_size == 0 ||
      transaction_id.size() > 8 || (body_size != 0 && !body) ||
      body_size >
          ALLNEWMTS_MCI_MAX_FRAME_SIZE - ALLNEWMTS_MCI_REQUEST_HEADER_SIZE ||
      !bytesAreDigits(request_nonce, 10) ||
      !canonicalDigits(session->date, 8) ||
      !canonicalDigits(session->time, 12) ||
      printableLength(session->handle, sizeof(session->handle)) != 8 ||
      public_ip_size == 0)
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  for (size_t index = 0; index < 5; ++index)
    if (static_cast<unsigned char>(channel_detail[index]) < 0x21 ||
        static_cast<unsigned char>(channel_detail[index]) > 0x7e)
      return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  const size_t size = ALLNEWMTS_MCI_REQUEST_HEADER_SIZE + body_size;
  if (output_capacity < size) return ALLNEWMTS_MCI_RESOURCE_LIMIT;

  if (body_size != 0)
    std::memmove(output + ALLNEWMTS_MCI_REQUEST_HEADER_SIZE, body, body_size);
  std::memset(output, ' ', ALLNEWMTS_MCI_REQUEST_HEADER_SIZE);
  decimal8(output, 0, size - 8);
  output[8] = type;
  output[9] = encryption_flag;
  output[10] = '0';
  output[11] = 'S';
  output[12] = interface_id;
  output[13] = '0';
  output[14] = '0';
  put(output, 15, 4, "0000");
  output[19] = 'S';
  put(output, 20, 3, "000");
  decimal8(output, 23, size - 8);
  decimal8(output, 31, size - 8);
  output[39] = '1';
  output[40] = '1';
  output[41] = '0';
  output[42] = '0';
  put(output, 43, 3, "CC3");
  put(output, 46, 5, std::string_view(channel_detail, 5));

  constexpr size_t kGuidOffset = 57;
  put(output, kGuidOffset, 8, session->handle);
  put(output, kGuidOffset + 8, 8, session->date);
  put(output, kGuidOffset + 16, 6, std::string_view(session->time, 6));
  put(output, kGuidOffset + 22, 10, std::string_view(request_nonce, 10));
  put(output, 89, 8, transaction_id);
  put(output, 118, 8, session->date);
  put(output, 126, 6, std::string_view(session->time, 6));
  put(output, 132, 6, "000000");
  put(output, 138, 8, "00020692");
  put(output, 146, 4, request_id);
  put(output, 150, 8, session->handle);
  output[158] = '1';
  output[160] = '0';
  output[161] = '0';
  output[162] = '2';
  output[163] = '0';
  output[164] = 'Q';
  put(output, 202, 10, std::string_view(hts_id, hts_id_size));
  put(output, 224, 32,
      std::string_view(session->public_ip, public_ip_size));
  put(output, 256, 32,
      std::string_view(private_identity, private_identity_size));
  output[294] = 'N';
  *output_size = size;
  return ALLNEWMTS_MCI_OK;
}

extern "C" uint32_t allnewmts_mci_build_transaction_request(
    const char channel_detail[5], const AllNewMTSMciSession *session,
    const char request_nonce[10],
    const AllNewMTSMciTransactionRequest *request, uint8_t *output,
    size_t output_capacity, size_t *output_size) {
  const size_t transaction_id_size =
      request ? printableLength(request->transaction_id,
                                sizeof(request->transaction_id))
              : 0;
  if (!request || transaction_id_size == 0)
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  return buildSessionRequest(
      channel_detail, session, request_nonce, 'S', '0',
      request->interface_id, request->request_id,
      std::string_view(request->transaction_id, transaction_id_size),
      request->hts_id, sizeof(request->hts_id), request->private_identity,
      sizeof(request->private_identity), request->body, request->body_size,
      output, output_capacity, output_size);
}

extern "C" uint32_t allnewmts_mci_build_command_request(
    const char channel_detail[5], const AllNewMTSMciSession *session,
    const char request_nonce[10], const AllNewMTSMciCommandRequest *request,
    uint8_t *output, size_t output_capacity, size_t *output_size) {
  if (!request || request->command != 'X' ||
      std::memcmp(request->request_id, "0001", 5) != 0 ||
      request->body_size == 0)
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  return buildSessionRequest(
      channel_detail, session, request_nonce, request->command, '2',
      request->interface_id, request->request_id, {}, request->hts_id,
      sizeof(request->hts_id), request->private_identity,
      sizeof(request->private_identity), request->body, request->body_size,
      output, output_capacity, output_size);
}

extern "C" uint32_t allnewmts_mci_build_gd1000q1_request(
    const char channel_detail[5], const AllNewMTSMciSession *session,
    const char request_nonce[10], uint8_t *output, size_t output_capacity,
    size_t *output_size) {
  if (!session) return ALLNEWMTS_MCI_INVALID_ARGUMENT;

  const uint8_t market[] = {'J'};
  const uint8_t instrument[] = {'0', '0', '3', '5', '3', '0'};
  const uint8_t exchange[] = {'K'};
  AllNewMTSMciSfidInput inputs[4]{};
  const char *input_fids[] = {"9001", "9002", "9241", "9246"};
  const uint8_t *input_values[] = {market, instrument, exchange, nullptr};
  const size_t input_sizes[] = {sizeof(market), sizeof(instrument),
                                sizeof(exchange), 0};
  for (size_t index = 0; index < 4; ++index) {
    std::memcpy(inputs[index].fid, input_fids[index], 5);
    inputs[index].value = input_values[index];
    inputs[index].value_size = input_sizes[index];
  }
  std::array<AllNewMTSMciSfidOutput, kGd1000q1OutputFids.size()> outputs{};
  for (size_t index = 0; index < outputs.size(); ++index) {
    std::string_view fid = kGd1000q1OutputFids[index];
    outputs[index].attribute = fid.front() == '*' ? 1 : 0;
    if (outputs[index].attribute != 0) fid.remove_prefix(1);
    std::memcpy(outputs[index].fid, fid.data(), fid.size());
  }
  std::array<uint8_t, kGd1000q1BodySize> body{};
  size_t body_size = 0;
  uint32_t code = allnewmts_mci_build_sfid_body(
      "1000", inputs, 4, outputs.data(), outputs.size(), body.data(),
      body.size(), &body_size);
  if (code != ALLNEWMTS_MCI_OK || body_size != body.size())
    return code == ALLNEWMTS_MCI_OK ? ALLNEWMTS_MCI_TRANSACTION_INVALID
                                    : code;

  AllNewMTSMciTransactionRequest request{};
  std::memcpy(request.transaction_id, "GD1000Q1", 9);
  std::memcpy(request.request_id, "0001", 5);
  request.interface_id = 'F';
  std::memcpy(request.hts_id, "NEWMTS", 7);
  std::memcpy(request.private_identity, session->selected_private_ip,
              sizeof(request.private_identity));
  request.body = body.data();
  request.body_size = body.size();
  return allnewmts_mci_build_transaction_request(
      channel_detail, session, request_nonce, &request, output,
      output_capacity, output_size);
}

extern "C" uint32_t allnewmts_mci_build_realtime_request(
    const char channel_detail[5], const AllNewMTSMciSession *session,
    const char request_nonce[10], uint8_t transaction_type,
    uint8_t interface_id, const char hts_id[11],
    const char private_identity[33], const char *service,
    const AllNewMTSMciRealtimeKey *keys, size_t key_count, uint8_t *output,
    size_t output_capacity, size_t *output_size) {
  if (!service || !keys || key_count == 0 || key_count > 9999 ||
      (transaction_type != '0' && transaction_type != '1'))
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  const size_t service_size =
      strnlen(service, ALLNEWMTS_MCI_REALTIME_SERVICE_SIZE + 1);
  if (service_size > 8 ||
      !realtimeService(std::string_view(service, service_size)))
    return ALLNEWMTS_MCI_TRANSACTION_INVALID;

  size_t key_bytes = 0;
  for (size_t index = 0; index < key_count; ++index) {
    if (!realtimeKey(keys[index].bytes, keys[index].size) ||
        key_bytes > 999999 - keys[index].size - 1)
      return ALLNEWMTS_MCI_TRANSACTION_INVALID;
    key_bytes += keys[index].size + 1;
  }
  const size_t body_size =
      ALLNEWMTS_MCI_REALTIME_BODY_HEADER_SIZE + key_bytes;
  if (body_size >
      ALLNEWMTS_MCI_MAX_FRAME_SIZE - ALLNEWMTS_MCI_REQUEST_HEADER_SIZE)
    return ALLNEWMTS_MCI_RESOURCE_LIMIT;

  std::array<uint8_t, ALLNEWMTS_MCI_MAX_FRAME_SIZE> body{};
  decimalFixed(body.data(), 4, 1);
  body[4] = '0';
  std::fill(body.begin() + 5,
            body.begin() + 5 + ALLNEWMTS_MCI_REALTIME_SERVICE_SIZE, ' ');
  std::memcpy(body.data() + 5, service, service_size);
  decimalFixed(body.data() + 25, 4, key_count);
  decimalFixed(body.data() + 29, 6, key_bytes);
  size_t cursor = ALLNEWMTS_MCI_REALTIME_BODY_HEADER_SIZE;
  for (size_t index = 0; index < key_count; ++index) {
    std::memcpy(body.data() + cursor, keys[index].bytes, keys[index].size);
    cursor += keys[index].size;
    body[cursor++] = 0;
  }
  if (cursor != body_size) return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
  return buildSessionRequest(
      channel_detail, session, request_nonce, transaction_type, '0',
      interface_id, "0000", std::string_view(service, service_size), hts_id,
      11, private_identity, 33, body.data(), body_size, output,
      output_capacity, output_size);
}

extern "C" uint32_t allnewmts_mci_parse_realtime_push(
    const uint8_t *frame, size_t size, AllNewMTSMciRealtimePush *pushes,
    size_t push_capacity, size_t *push_count) {
  if (!frame || !push_count || (push_capacity != 0 && !pushes))
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  size_t declared = 0, count = 0;
  if (!frameSize(frame, size, declared) || declared != size ||
      size < ALLNEWMTS_MCI_REALTIME_HEADER_SIZE || frame[8] != 'P' ||
      frame[9] != '0' || frame[10] != '0' ||
      !decimalValue(frame + 11, 2, count) || count == 0)
    return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;

  std::vector<AllNewMTSMciRealtimePush> parsed;
  try {
    parsed.reserve(count);
    size_t cursor = ALLNEWMTS_MCI_REALTIME_HEADER_SIZE;
    for (size_t index = 0; index < count; ++index) {
      constexpr size_t header_size = 3 + ALLNEWMTS_MCI_REALTIME_KEY_SIZE + 4 + 2;
      if (cursor > size || size - cursor < header_size)
        return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
      AllNewMTSMciRealtimePush push{};
      if (!textField(frame + cursor, 3, push.service,
                     sizeof(push.service), true) ||
          !realtimeService(push.service) ||
          !textField(frame + cursor + 3, ALLNEWMTS_MCI_REALTIME_KEY_SIZE,
                     push.key, sizeof(push.key), false) ||
          !decimalValue(frame + cursor + 3 +
                            ALLNEWMTS_MCI_REALTIME_KEY_SIZE,
                        4, push.item_size) ||
          !decimalValue(frame + cursor + 3 +
                            ALLNEWMTS_MCI_REALTIME_KEY_SIZE + 4,
                        2, push.item_count) ||
          push.item_size == 0 || push.item_count == 0 ||
          push.item_size > SIZE_MAX / push.item_count)
        return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
      cursor += header_size;
      const size_t payload_size = push.item_size * push.item_count;
      if (payload_size > size - cursor)
        return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
      push.payload_offset = cursor;
      cursor += payload_size;
      parsed.push_back(push);
    }
    if (cursor != size)
      return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
  } catch (const std::bad_alloc &) {
    return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  }
  if (parsed.size() > push_capacity) return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  std::copy(parsed.begin(), parsed.end(), pushes);
  *push_count = parsed.size();
  return ALLNEWMTS_MCI_OK;
}

uint32_t decodeSfidRows(
    const uint8_t *body, size_t payload_begin, size_t payload_end,
    size_t record_count, const char gid[5], const char output_fids[][5],
    size_t output_count, AllNewMTSMciSfidValue *values,
    size_t value_capacity, size_t continuation_offset,
    size_t continuation_size, size_t payload_size, uint8_t mode,
    uint8_t page_state, AllNewMTSMciSfidDecoded *decoded) {
  if (!body || !gid || !output_fids || output_count == 0 || !values ||
      !decoded || !canonicalDigits(gid, 4) || payload_begin > payload_end)
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  for (size_t index = 0; index < output_count; ++index) {
    if (!canonicalDigits(output_fids[index], 4))
      return ALLNEWMTS_MCI_TRANSACTION_INVALID;
    for (size_t previous = 0; previous < index; ++previous)
      if (std::memcmp(output_fids[previous], output_fids[index], 5) == 0)
        return ALLNEWMTS_MCI_TRANSACTION_INVALID;
  }
  if (record_count != 0 && output_count > SIZE_MAX / record_count)
    return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  const size_t value_count = record_count * output_count;
  if (value_capacity < value_count)
    return ALLNEWMTS_MCI_RESOURCE_LIMIT;

  std::vector<AllNewMTSMciSfidValue> parsed;
  try {
    parsed.reserve(value_count);
  } catch (const std::bad_alloc &) {
    return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  }
  size_t cursor = payload_begin;
  for (size_t record = 0; record < record_count; ++record) {
    size_t row_end = payload_end;
    if (record + 1 < record_count) {
      const uint8_t *separator = static_cast<const uint8_t *>(
          std::memchr(body + cursor, 0x1d, payload_end - cursor));
      if (!separator) return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
      row_end = static_cast<size_t>(separator - body);
    } else if (std::memchr(body + cursor, 0x1d, payload_end - cursor)) {
      return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
    }
    for (size_t field = 0; field < output_count; ++field) {
      size_t field_end = row_end;
      if (field + 1 < output_count) {
        const uint8_t *separator = static_cast<const uint8_t *>(
            std::memchr(body + cursor, 0x1e, row_end - cursor));
        if (!separator) return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
        field_end = static_cast<size_t>(separator - body);
      } else if (std::memchr(body + cursor, 0x1e, row_end - cursor)) {
        return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
      }
      for (size_t index = cursor; index < field_end; ++index)
        if (structuralByte(body[index]))
          return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
      parsed.push_back({cursor, field_end - cursor});
      cursor = field_end + (field + 1 < output_count ? 1 : 0);
    }
    cursor = row_end + (record + 1 < record_count ? 1 : 0);
  }
  if (cursor != payload_end)
    return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;

  std::copy(parsed.begin(), parsed.end(), values);
  *decoded = {record_count, value_count, continuation_offset,
              continuation_size, payload_size, mode, page_state};
  return ALLNEWMTS_MCI_OK;
}

extern "C" uint32_t allnewmts_mci_decode_sfid_body(
    const uint8_t *body, size_t size, const char gid[5],
    const char output_fids[][5], size_t output_count,
    AllNewMTSMciSfidValue *values, size_t value_capacity,
    AllNewMTSMciSfidDecoded *decoded) {
  if (!body || size < output_count || body[size - 1] != 0x1f)
    return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
  return decodeSfidRows(body, 0, size - 1, 1, gid, output_fids,
                        output_count, values, value_capacity, 0, 0, size, 0,
                        0, decoded);
}

extern "C" uint32_t allnewmts_mci_decode_sfid_occurrence_body(
    const uint8_t *body, size_t size, const char gid[5],
    const char output_fids[][5], size_t output_count,
    AllNewMTSMciSfidValue *values, size_t value_capacity,
    AllNewMTSMciSfidDecoded *decoded) {
  constexpr size_t kSelectorSize = 18;
  size_t payload_size = 0, record_count = 0, continuation_size = 0;
  if (!body || size < kSelectorSize + 1 || body[0] != '$' ||
      !decimalValue(body + 1, 8, payload_size) ||
      !decimalValue(body + 9, 4, record_count) || body[13] < '0' ||
      body[13] > '9' ||
      (body[14] != 0x01 && body[14] != 0x02 && body[14] != 0x03) ||
      !decimalValue(body + 15, 3, continuation_size) ||
      continuation_size > size - kSelectorSize - 1 ||
      payload_size != size - kSelectorSize - continuation_size ||
      body[size - 1] != 0x1f)
    return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
  return decodeSfidRows(
      body, kSelectorSize + continuation_size, size - 1, record_count, gid,
      output_fids, output_count, values, value_capacity, kSelectorSize,
      continuation_size, payload_size,
      static_cast<uint8_t>(body[13] - '0'), body[14], decoded);
}

extern "C" uint32_t allnewmts_mci_parse_command_response(
    const uint8_t *frame, size_t size, const AllNewMTSMciSession *session,
    AllNewMTSMciCommandResponse *response) {
  size_t declared = 0;
  if (!frame || !session || !response || !frameSize(frame, size, declared) ||
      declared != size || size <= ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE ||
      frame[8] != 'X' || frame[9] != '2' || frame[10] != '0' ||
      frame[12] < 0x21 || frame[12] > 0x7e ||
      std::memcmp(frame + 150, session->handle, 8) != 0 ||
      frame[161] < '0' || frame[161] > '9')
    return ALLNEWMTS_MCI_TRANSACTION_INVALID;

  AllNewMTSMciCommandResponse parsed{};
  if (!textField(frame + 146, 4, parsed.request_id,
                 sizeof(parsed.request_id), true) ||
      std::memcmp(parsed.request_id, "0001", 5) != 0)
    return ALLNEWMTS_MCI_TRANSACTION_INVALID;
  parsed.command = frame[8];
  parsed.interface_id = frame[12];
  parsed.response_code = frame[161];
  parsed.body_offset = ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE;
  parsed.body_size = size - ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE;
  if (parsed.response_code != '0')
    return ALLNEWMTS_MCI_TRANSACTION_REJECTED;
  *response = parsed;
  return ALLNEWMTS_MCI_OK;
}

extern "C" uint32_t allnewmts_mci_parse_transaction_response(
    const uint8_t *frame, size_t size, const AllNewMTSMciSession *session,
    AllNewMTSMciTransactionResponse *response) {
  size_t declared = 0;
  if (!frame || !session || !response || !frameSize(frame, size, declared) ||
      declared != size || size < ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE ||
      frame[8] != 'R' || frame[9] != '0' || frame[10] != '0' ||
      frame[12] < 0x21 || frame[12] > 0x7e ||
      std::memcmp(frame + 150, session->handle, 8) != 0 ||
      (frame[321] != ' ' &&
       (frame[321] < 0x21 || frame[321] > 0x7e)) ||
      frame[161] < '0' || frame[161] > '9')
    return ALLNEWMTS_MCI_TRANSACTION_INVALID;

  AllNewMTSMciTransactionResponse parsed{};
  if (!textField(frame + 89, 8, parsed.transaction_id,
                 sizeof(parsed.transaction_id), true) ||
      !textField(frame + 146, 4, parsed.request_id,
                 sizeof(parsed.request_id), true) ||
      !textField(frame + 322, 9, parsed.message_code,
                 sizeof(parsed.message_code), false) ||
      !textField(frame + 411, 9, parsed.supplemental_message_code,
                 sizeof(parsed.supplemental_message_code), false) ||
      !canonicalDigits(parsed.request_id, 4))
    return ALLNEWMTS_MCI_TRANSACTION_INVALID;
  parsed.interface_id = frame[12];
  parsed.response_code = frame[161];
  parsed.message_output_type = frame[321];
  parsed.body_offset = ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE;
  parsed.body_size = size - ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE;
  if (parsed.response_code != '0')
    return ALLNEWMTS_MCI_TRANSACTION_REJECTED;
  *response = parsed;
  return ALLNEWMTS_MCI_OK;
}

extern "C" uint32_t allnewmts_mci_parse_gd1000q1_response(
    const uint8_t *frame, size_t size, const AllNewMTSMciSession *session) {
  AllNewMTSMciTransactionResponse response{};
  uint32_t code = allnewmts_mci_parse_transaction_response(
      frame, size, session, &response);
  if (code != ALLNEWMTS_MCI_OK) return code;
  if (response.interface_id != 'F' ||
      std::strcmp(response.transaction_id, "GD1000Q1") != 0 ||
      std::strcmp(response.request_id, "0001") != 0 ||
      response.body_size == 0)
    return ALLNEWMTS_MCI_TRANSACTION_INVALID;
  char output_fids[kGd1000q1OutputFids.size()][5]{};
  for (size_t index = 0; index < kGd1000q1OutputFids.size(); ++index) {
    std::string_view fid = kGd1000q1OutputFids[index];
    if (fid.front() == '*') fid.remove_prefix(1);
    std::memcpy(output_fids[index], fid.data(), fid.size());
  }
  std::array<AllNewMTSMciSfidValue, kGd1000q1OutputFids.size()> values{};
  AllNewMTSMciSfidDecoded decoded{};
  code = allnewmts_mci_decode_sfid_body(
      frame + response.body_offset, response.body_size, "1000", output_fids,
      kGd1000q1OutputFids.size(), values.data(), values.size(), &decoded);
  if (code != ALLNEWMTS_MCI_OK) return code;
  const uint8_t *body = frame + response.body_offset;
  return decoded.record_count == 1 &&
                 decoded.value_count == kGd1000q1OutputFids.size() &&
                 decoded.continuation_size == 0 &&
                 signedDecimal(body + values[2].offset, values[2].size)
             ? ALLNEWMTS_MCI_OK
             : ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
}

extern "C" uint32_t allnewmts_mci_create(
    const char channel_detail[5], const AllNewMTSMciTransport *transport,
    void *context, AllNewMTSMciClient **client) {
  if (!channel_detail || !transport || !transport->open || !transport->write ||
      !transport->read || !transport->authenticate || !transport->close ||
      !transport->wait || !transport->now_ms || !client)
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  uint8_t request[ALLNEWMTS_MCI_REQUEST_HEADER_SIZE];
  uint32_t code = allnewmts_mci_build_init_request(channel_detail, request);
  if (code != ALLNEWMTS_MCI_OK) return code;
  auto *created = new (std::nothrow) AllNewMTSMciClient();
  if (!created) return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  std::memcpy(created->channel_detail, channel_detail, 5);
  created->transport = *transport;
  created->context = context;
  std::memcpy(created->file_hash, kBetaFileSha256, 32);
  std::memcpy(created->endpoint_hash, kBetaEndpointSha256, 32);
  *client = created;
  return ALLNEWMTS_MCI_OK;
}

void nonce(uint64_t value, char output[10]) {
  for (size_t index = 0; index < 10; ++index) {
    output[9 - index] = static_cast<char>('0' + value % 10);
    value /= 10;
  }
}

uint32_t parseS00Quote(const uint8_t *frame, size_t frame_size,
                       AllNewMTSMciRealtimeQuote *quote) {
  std::array<AllNewMTSMciRealtimePush, 99> pushes{};
  size_t push_count = 0;
  uint32_t code = allnewmts_mci_parse_realtime_push(
      frame, frame_size, pushes.data(), pushes.size(), &push_count);
  if (code != ALLNEWMTS_MCI_OK) return code;
  for (size_t push_index = 0; push_index < push_count; ++push_index) {
    const AllNewMTSMciRealtimePush &push = pushes[push_index];
    if (std::strcmp(push.service, "S00") != 0 ||
        std::strcmp(push.key, "005930") != 0 ||
        push.item_size != kS00RecordSize)
      continue;
    for (size_t item_index = 0; item_index < push.item_count; ++item_index) {
      const uint8_t *item =
          frame + push.payload_offset + item_index * push.item_size;
      char item_code[10]{};
      if (!textField(item, 9, item_code, sizeof(item_code), true))
        continue;
      const size_t item_code_size = std::strlen(item_code);
      if (item_code_size < 6 ||
          std::strcmp(item_code + item_code_size - 6, "005930") != 0 ||
          !bytesAreDigits(reinterpret_cast<const char *>(item + 9), 6))
        continue;
      const uint32_t price =
          static_cast<uint32_t>(item[kS00PriceOffset]) |
          (static_cast<uint32_t>(item[kS00PriceOffset + 1]) << 8) |
          (static_cast<uint32_t>(item[kS00PriceOffset + 2]) << 16) |
          (static_cast<uint32_t>(item[kS00PriceOffset + 3]) << 24);
      if (price == 0 || price > 10000000) continue;
      std::memcpy(quote->trade_time, item + 9, 6);
      quote->trade_time[6] = '\0';
      quote->current_price = price;
      return ALLNEWMTS_MCI_OK;
    }
  }
  return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
}

static uint32_t connectBeta(AllNewMTSMciClient *client, const uint8_t *ip_dat,
                            size_t ip_dat_size, uint32_t automatic_retries,
                            BetaMode mode,
                            AllNewMTSMciRealtimeQuote *realtime_quote) {
  if (!client || client->open ||
      (mode == BetaMode::S00Probe && !realtime_quote))
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  try {
    AllNewMTSMciEndpoint endpoint{};
    uint32_t preflight = preflightBeta(ip_dat, ip_dat_size, client->file_hash,
                                       client->endpoint_hash, &endpoint);
    if (preflight != ALLNEWMTS_MCI_OK)
      return preflight;

    uint32_t last = ALLNEWMTS_MCI_TRANSPORT_ERROR;
    for (uint32_t attempt = 0; attempt <= automatic_retries; ++attempt) {
      uint64_t generation = ++client->generation;
      client->ready = false;
      std::memset(&client->session, 0, sizeof(client->session));
      if (!client->transport.open(client->context, endpoint.host, endpoint.port,
                                  ALLNEWMTS_MCI_CONNECT_TIMEOUT_MS,
                                  generation)) {
        last = ALLNEWMTS_MCI_TRANSPORT_ERROR;
        client->transport.close(client->context, generation);
      } else {
        client->open = true;
        uint8_t request[ALLNEWMTS_MCI_REQUEST_HEADER_SIZE];
        allnewmts_mci_build_init_request(client->channel_detail, request);
        if (!client->transport.write(client->context, request, sizeof(request),
                                     ALLNEWMTS_MCI_COMMAND_TIMEOUT_MS,
                                     generation)) {
          last = ALLNEWMTS_MCI_TRANSPORT_ERROR;
        } else {
          std::vector<uint8_t> pending;
          pending.reserve(ALLNEWMTS_MCI_MAX_FRAME_SIZE * 2);
          uint64_t started = client->transport.now_ms(client->context);
          AllNewMTSMciSession probe_session{};
          bool request_sent = false;
          bool realtime_registered = false;
          bool finished = false;
          while (!finished) {
            std::array<uint8_t, 4096> chunk{};
            size_t amount = 0;
            const uint32_t timeout = request_sent
                                         ? ALLNEWMTS_MCI_TRANSACTION_TIMEOUT_MS
                                         : ALLNEWMTS_MCI_COMMAND_TIMEOUT_MS;
            const uint64_t now = client->transport.now_ms(client->context);
            if (now < started || now - started >= timeout) {
              last = ALLNEWMTS_MCI_TRANSPORT_ERROR;
              break;
            }
            if (!client->transport.read(
                    client->context, chunk.data(), chunk.size(), &amount,
                    static_cast<uint32_t>(timeout - (now - started)),
                    generation) ||
                amount == 0 || amount > chunk.size() ||
                pending.size() + amount > ALLNEWMTS_MCI_MAX_FRAME_SIZE * 2) {
              last = ALLNEWMTS_MCI_TRANSPORT_ERROR;
              break;
            }
            pending.insert(pending.end(), chunk.begin(),
                           chunk.begin() + amount);
            while (pending.size() >= 8) {
              size_t frame_size = 0;
              if (!frameSize(pending.data(), pending.size(), frame_size)) {
                last = ALLNEWMTS_MCI_FRAME_INVALID;
                finished = true;
                break;
              }
              if (pending.size() < frame_size)
                break;
              if (pending[8] == 'H') {
                if (!client->transport.write(client->context, pending.data(),
                                             frame_size, timeout, generation)) {
                  last = ALLNEWMTS_MCI_TRANSPORT_ERROR;
                  finished = true;
                  break;
                }
              } else if (!request_sent && pending[8] == 'I') {
                AllNewMTSMciSession candidate{};
                last = allnewmts_mci_parse_init_response(
                    pending.data(), frame_size, &candidate);
                if (last == ALLNEWMTS_MCI_OK && mode == BetaMode::Connect) {
                  if (!client->transport.authenticate(client->context,
                                                      &candidate, generation)) {
                    last = ALLNEWMTS_MCI_AUTH_FAILED;
                  } else {
                    client->session = candidate;
                    client->ready = true;
                  }
                } else if (last == ALLNEWMTS_MCI_OK &&
                           (mode == BetaMode::Gd1000q1Probe ||
                            mode == BetaMode::S00Probe)) {
                  std::array<uint8_t, ALLNEWMTS_MCI_MAX_FRAME_SIZE>
                      probe_request{};
                  char request_nonce[10];
                  nonce(generation, request_nonce);
                  size_t probe_request_size = 0;
                  if (mode == BetaMode::Gd1000q1Probe) {
                    last = allnewmts_mci_build_gd1000q1_request(
                        client->channel_detail, &candidate, request_nonce,
                        probe_request.data(), probe_request.size(),
                        &probe_request_size);
                  } else {
                    constexpr uint8_t key[] = {'0', '0', '5', '9', '3', '0'};
                    const AllNewMTSMciRealtimeKey keys[] = {
                        {key, sizeof(key)}};
                    last = allnewmts_mci_build_realtime_request(
                        client->channel_detail, &candidate, request_nonce, '0',
                        '0', "NEWMTS", candidate.selected_private_ip, "S00",
                        keys, 1, probe_request.data(), probe_request.size(),
                        &probe_request_size);
                  }
                  if (last == ALLNEWMTS_MCI_OK &&
                      client->transport.write(
                          client->context, probe_request.data(),
                          probe_request_size,
                          ALLNEWMTS_MCI_TRANSACTION_TIMEOUT_MS, generation)) {
                    probe_session = candidate;
                    request_sent = true;
                    realtime_registered = mode == BetaMode::S00Probe;
                    started = client->transport.now_ms(client->context);
                  } else {
                    if (last == ALLNEWMTS_MCI_OK)
                      last = ALLNEWMTS_MCI_TRANSPORT_ERROR;
                    finished = true;
                  }
                }
                if ((mode != BetaMode::Gd1000q1Probe &&
                     mode != BetaMode::S00Probe) ||
                    last != ALLNEWMTS_MCI_OK)
                  finished = true;
              } else if (request_sent &&
                         mode == BetaMode::Gd1000q1Probe &&
                         pending[8] == 'R') {
                last = allnewmts_mci_parse_gd1000q1_response(
                    pending.data(), frame_size, &probe_session);
                finished = true;
              } else if (request_sent && mode == BetaMode::S00Probe &&
                         pending[8] == 'P') {
                last = parseS00Quote(pending.data(), frame_size,
                                     realtime_quote);
                finished = true;
              } else {
                last = ALLNEWMTS_MCI_FRAME_INVALID;
                finished = true;
              }
              pending.erase(pending.begin(), pending.begin() + frame_size);
            }
          }
          if (realtime_registered) {
            constexpr uint8_t key[] = {'0', '0', '5', '9', '3', '0'};
            const AllNewMTSMciRealtimeKey keys[] = {{key, sizeof(key)}};
            std::array<uint8_t, ALLNEWMTS_MCI_MAX_FRAME_SIZE> unsubscribe{};
            char request_nonce[10];
            nonce(generation + 1, request_nonce);
            size_t unsubscribe_size = 0;
            uint32_t unsubscribe_code = allnewmts_mci_build_realtime_request(
                client->channel_detail, &probe_session, request_nonce, '1',
                '0', "NEWMTS", probe_session.selected_private_ip, "S00", keys,
                1, unsubscribe.data(), unsubscribe.size(), &unsubscribe_size);
            if (unsubscribe_code != ALLNEWMTS_MCI_OK ||
                !client->transport.write(
                    client->context, unsubscribe.data(), unsubscribe_size,
                    ALLNEWMTS_MCI_COMMAND_TIMEOUT_MS, generation))
              last = unsubscribe_code == ALLNEWMTS_MCI_OK
                         ? ALLNEWMTS_MCI_TRANSPORT_ERROR
                         : unsubscribe_code;
          }
          if (client->ready)
            return ALLNEWMTS_MCI_OK;
        }
        client->transport.close(client->context, generation);
        client->open = false;
      }
      if (attempt < automatic_retries)
        client->transport.wait(client->context, ALLNEWMTS_MCI_RETRY_DELAY_MS);
    }
    return last;
  } catch (const std::bad_alloc &) {
    if (client->open) {
      client->transport.close(client->context, client->generation);
      client->open = false;
    }
    client->ready = false;
    return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  }
}

extern "C" uint32_t allnewmts_mci_connect_beta(
    AllNewMTSMciClient *client, const uint8_t *ip_dat, size_t ip_dat_size) {
  return connectBeta(client, ip_dat, ip_dat_size,
                     ALLNEWMTS_MCI_AUTOMATIC_RETRIES, BetaMode::Connect,
                     nullptr);
}

extern "C" uint32_t allnewmts_mci_probe_beta(
    AllNewMTSMciClient *client, const uint8_t *ip_dat, size_t ip_dat_size) {
  return connectBeta(client, ip_dat, ip_dat_size, 0, BetaMode::InitProbe,
                     nullptr);
}

extern "C" uint32_t allnewmts_mci_probe_beta_gd1000q1(
    AllNewMTSMciClient *client, const uint8_t *ip_dat, size_t ip_dat_size) {
  return connectBeta(client, ip_dat, ip_dat_size, 0,
                     BetaMode::Gd1000q1Probe, nullptr);
}

extern "C" uint32_t allnewmts_mci_probe_beta_s00_005930(
    AllNewMTSMciClient *client, const uint8_t *ip_dat, size_t ip_dat_size,
    AllNewMTSMciRealtimeQuote *quote) {
  if (!quote) return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  *quote = {};
  return connectBeta(client, ip_dat, ip_dat_size, 0, BetaMode::S00Probe,
                     quote);
}

extern "C" uint32_t allnewmts_mci_preflight_beta(
    const uint8_t *ip_dat, size_t ip_dat_size,
    AllNewMTSMciEndpoint *endpoint) {
  try {
    return preflightBeta(ip_dat, ip_dat_size, kBetaFileSha256,
                         kBetaEndpointSha256, endpoint);
  } catch (const std::bad_alloc &) {
    return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  }
}

extern "C" uint32_t allnewmts_mci_session(
    const AllNewMTSMciClient *client, AllNewMTSMciSession *session,
    uint64_t *generation) {
  if (!client || !session || !generation)
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  if (!client->ready) return ALLNEWMTS_MCI_NOT_READY;
  *session = client->session;
  *generation = client->generation;
  return ALLNEWMTS_MCI_OK;
}

extern "C" void allnewmts_mci_destroy(AllNewMTSMciClient *client) {
  if (!client) return;
  if (client->open)
    client->transport.close(client->context, client->generation);
  delete client;
}

extern "C" uint32_t allnewmts_mci_realtime_registry_create(
    AllNewMTSMciRealtimeRegistry **registry) {
  if (!registry) return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  auto *created = new (std::nothrow) AllNewMTSMciRealtimeRegistry();
  if (!created) return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  *registry = created;
  return ALLNEWMTS_MCI_OK;
}

extern "C" uint32_t allnewmts_mci_realtime_acquire(
    AllNewMTSMciRealtimeRegistry *registry, uint64_t scope_id,
    const char *service, const uint8_t *key, size_t key_size,
    AllNewMTSMciRealtimeAction *action) {
  if (!registry || !scope_id || !action)
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  RealtimeRegistration registration;
  if (!realtimeRegistration(service, key, key_size, registration))
    return ALLNEWMTS_MCI_TRANSACTION_INVALID;
  try {
    std::lock_guard<std::mutex> lock(registry->mutex);
    auto found = registry->registrations.find(registration);
    if (found == registry->registrations.end()) {
      if (registry->registrations.size() >=
          ALLNEWMTS_MCI_REALTIME_MAX_REGISTRATIONS)
        return ALLNEWMTS_MCI_RESOURCE_LIMIT;
      found = registry->registrations
                  .emplace(registration, std::set<uint64_t>{scope_id})
                  .first;
      realtimeAction(registration, '0', *action);
      return ALLNEWMTS_MCI_OK;
    }
    found->second.insert(scope_id);
    realtimeAction(registration, 0, *action);
    return ALLNEWMTS_MCI_OK;
  } catch (const std::bad_alloc &) {
    return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  }
}

extern "C" uint32_t allnewmts_mci_realtime_release(
    AllNewMTSMciRealtimeRegistry *registry, uint64_t scope_id,
    const char *service, const uint8_t *key, size_t key_size,
    AllNewMTSMciRealtimeAction *action) {
  if (!registry || !scope_id || !action)
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  RealtimeRegistration registration;
  if (!realtimeRegistration(service, key, key_size, registration))
    return ALLNEWMTS_MCI_TRANSACTION_INVALID;
  std::lock_guard<std::mutex> lock(registry->mutex);
  auto found = registry->registrations.find(registration);
  if (found == registry->registrations.end() ||
      !found->second.erase(scope_id))
    return ALLNEWMTS_MCI_REALTIME_NOT_FOUND;
  const bool final = found->second.empty();
  realtimeAction(registration, final ? '1' : 0, *action);
  if (final) registry->registrations.erase(found);
  return ALLNEWMTS_MCI_OK;
}

extern "C" uint32_t allnewmts_mci_realtime_release_scope(
    AllNewMTSMciRealtimeRegistry *registry, uint64_t scope_id,
    AllNewMTSMciRealtimeAction *actions, size_t action_capacity,
    size_t *action_count) {
  if (!registry || !scope_id || !action_count ||
      (action_capacity != 0 && !actions))
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  std::lock_guard<std::mutex> lock(registry->mutex);
  size_t required = 0;
  for (const auto &entry : registry->registrations)
    if (entry.second.size() == 1 && entry.second.count(scope_id)) ++required;
  if (required > action_capacity) return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  size_t output = 0;
  for (auto iterator = registry->registrations.begin();
       iterator != registry->registrations.end();) {
    if (!iterator->second.erase(scope_id)) {
      ++iterator;
      continue;
    }
    if (iterator->second.empty()) {
      realtimeAction(iterator->first, '1', actions[output++]);
      iterator = registry->registrations.erase(iterator);
    } else {
      ++iterator;
    }
  }
  *action_count = output;
  return ALLNEWMTS_MCI_OK;
}

extern "C" uint32_t allnewmts_mci_realtime_replay(
    const AllNewMTSMciRealtimeRegistry *registry,
    AllNewMTSMciRealtimeAction *actions, size_t action_capacity,
    size_t *action_count) {
  if (!registry || !action_count || (action_capacity != 0 && !actions))
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  std::lock_guard<std::mutex> lock(registry->mutex);
  if (registry->registrations.size() > action_capacity)
    return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  size_t output = 0;
  for (const auto &entry : registry->registrations)
    realtimeAction(entry.first, '0', actions[output++]);
  *action_count = output;
  return ALLNEWMTS_MCI_OK;
}

extern "C" uint32_t allnewmts_mci_realtime_match(
    const AllNewMTSMciRealtimeRegistry *registry, const char *service,
    const uint8_t *key, size_t key_size, uint64_t *scope_ids,
    size_t scope_capacity, size_t *scope_count) {
  if (!registry || !scope_count || (scope_capacity != 0 && !scope_ids))
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  RealtimeRegistration registration;
  if (!realtimeRegistration(service, key, key_size, registration))
    return ALLNEWMTS_MCI_TRANSACTION_INVALID;
  std::lock_guard<std::mutex> lock(registry->mutex);
  auto found = registry->registrations.find(registration);
  if (found == registry->registrations.end())
    return ALLNEWMTS_MCI_REALTIME_NOT_FOUND;
  if (found->second.size() > scope_capacity)
    return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  std::copy(found->second.begin(), found->second.end(), scope_ids);
  *scope_count = found->second.size();
  return ALLNEWMTS_MCI_OK;
}

extern "C" void allnewmts_mci_realtime_registry_destroy(
    AllNewMTSMciRealtimeRegistry *registry) {
  delete registry;
}

#ifdef ALLNEWMTS_MCI_TESTING
extern "C" uint32_t allnewmts_mci_test_preflight_beta(
    const uint8_t *ip_dat, size_t ip_dat_size,
    const uint8_t expected_file_sha256[32],
    const uint8_t expected_endpoint_sha256[32],
    AllNewMTSMciEndpoint *endpoint) {
  try {
    return preflightBeta(ip_dat, ip_dat_size, expected_file_sha256,
                         expected_endpoint_sha256, endpoint);
  } catch (const std::bad_alloc &) {
    return ALLNEWMTS_MCI_RESOURCE_LIMIT;
  }
}

extern "C" uint32_t allnewmts_mci_test_set_beta_hashes(
    AllNewMTSMciClient *client, const uint8_t expected_file_sha256[32],
    const uint8_t expected_endpoint_sha256[32]) {
  if (!client || !expected_file_sha256 || !expected_endpoint_sha256 ||
      client->open)
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  std::memcpy(client->file_hash, expected_file_sha256, 32);
  std::memcpy(client->endpoint_hash, expected_endpoint_sha256, 32);
  return ALLNEWMTS_MCI_OK;
}
#endif
