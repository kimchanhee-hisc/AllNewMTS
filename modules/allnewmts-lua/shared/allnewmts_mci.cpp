#include "allnewmts_mci.h"
#include "sha256.h"

#include <algorithm>
#include <array>
#include <charconv>
#include <cstring>
#include <new>
#include <string>
#include <string_view>
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
constexpr uint8_t kGd1000q1Body[] = {
    0x1f, '9', '0', '0', '1', 0x7f, 'J',
    0x1e, '9', '0', '0', '2', 0x7f, '0', '0', '5', '9', '3', '0',
    0x1e, 'G', 'I', 'D', 0x7f, '1', '0', '0', '0',
    0x1e, '$', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0',
    '1', '0', '@', '0', '0', '0',
    0x1e, '0', '0', '0', '9',
    0x1e, '0', '0', '0', '4', 0x1f};

enum class BetaMode { Connect, InitProbe, Gd1000q1Probe };

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

void decimal8(uint8_t *output, size_t offset, size_t value) {
  char text[9];
  for (size_t index = 0; index < 8; ++index) {
    text[7 - index] = static_cast<char>('0' + value % 10);
    value /= 10;
  }
  std::memcpy(output + offset, text, 8);
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
  *session = parsed;
  return ALLNEWMTS_MCI_OK;
}

extern "C" uint32_t allnewmts_mci_build_gd1000q1_request(
    const char channel_detail[5], const AllNewMTSMciSession *session,
    const char request_nonce[10], uint8_t *output, size_t output_capacity,
    size_t *output_size) {
  constexpr size_t kSize =
      ALLNEWMTS_MCI_REQUEST_HEADER_SIZE + sizeof(kGd1000q1Body);
  if (!channel_detail || !session || !request_nonce || !output ||
      !output_size || output_capacity < kSize ||
      !bytesAreDigits(request_nonce, 10) ||
      !digits(session->date, 8) || !digits(session->time, 12) ||
      std::strlen(session->handle) != 8)
    return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  for (size_t index = 0; index < 5; ++index)
    if (static_cast<unsigned char>(channel_detail[index]) < 0x21 ||
        static_cast<unsigned char>(channel_detail[index]) > 0x7e)
      return ALLNEWMTS_MCI_INVALID_ARGUMENT;

  std::memset(output, ' ', kSize);
  decimal8(output, 0, kSize - 8);
  output[8] = 'S';
  output[9] = '0';
  output[10] = '0';
  output[11] = 'S';
  output[12] = 'F';
  output[13] = '0';
  output[14] = '0';
  put(output, 15, 4, "0000");
  output[19] = 'S';
  put(output, 20, 3, "000");
  decimal8(output, 23, kSize - 8);
  decimal8(output, 31, kSize - 8);
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
  put(output, 89, 8, "GD1000Q1");
  put(output, 118, 8, session->date);
  put(output, 126, 6, std::string_view(session->time, 6));
  put(output, 132, 6, "000000");
  put(output, 138, 8, "00020692");
  put(output, 146, 4, "0001");
  put(output, 150, 8, session->handle);
  output[158] = '1';
  output[160] = '0';
  output[161] = '0';
  output[162] = '2';
  output[163] = '0';
  output[164] = 'Q';
  put(output, 202, 6, "NEWMTS");
  put(output, 224, 32, session->public_ip);
  put(output, 256, 32, session->private_ip);
  output[294] = 'N';
  std::memcpy(output + ALLNEWMTS_MCI_REQUEST_HEADER_SIZE, kGd1000q1Body,
              sizeof(kGd1000q1Body));
  *output_size = kSize;
  return ALLNEWMTS_MCI_OK;
}

extern "C" uint32_t allnewmts_mci_parse_gd1000q1_response(
    const uint8_t *frame, size_t size, const AllNewMTSMciSession *session) {
  size_t declared = 0;
  if (!frame || !session || !frameSize(frame, size, declared) ||
      declared != size || size <= ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE ||
      frame[8] != 'R' || frame[9] != '0' || frame[10] != '0' ||
      frame[12] != 'F' ||
      std::memcmp(frame + 89, "GD1000Q1", 8) != 0 ||
      std::memcmp(frame + 146, "0001", 4) != 0 ||
      std::memcmp(frame + 150, session->handle, 8) != 0)
    return ALLNEWMTS_MCI_TRANSACTION_INVALID;
  if (frame[161] != '0') return ALLNEWMTS_MCI_TRANSACTION_REJECTED;
  bool non_empty = false;
  for (size_t index = ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE; index < size;
       ++index)
    if (frame[index] != ' ' && frame[index] != '\0') {
      non_empty = true;
      break;
    }
  if (!non_empty) return ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID;
  return ALLNEWMTS_MCI_OK;
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

static uint32_t connectBeta(AllNewMTSMciClient *client, const uint8_t *ip_dat,
                            size_t ip_dat_size, uint32_t automatic_retries,
                            BetaMode mode) {
  if (!client || client->open) return ALLNEWMTS_MCI_INVALID_ARGUMENT;
  try {
  AllNewMTSMciEndpoint endpoint{};
  uint32_t preflight =
      preflightBeta(ip_dat, ip_dat_size, client->file_hash,
                    client->endpoint_hash, &endpoint);
  if (preflight != ALLNEWMTS_MCI_OK) return preflight;

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
        AllNewMTSMciSession quote_session{};
        bool quote_sent = false;
        bool finished = false;
        while (!finished) {
          std::array<uint8_t, 4096> chunk{};
          size_t amount = 0;
          const uint32_t timeout =
              quote_sent ? ALLNEWMTS_MCI_TRANSACTION_TIMEOUT_MS
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
          pending.insert(pending.end(), chunk.begin(), chunk.begin() + amount);
          while (pending.size() >= 8) {
            size_t frame_size = 0;
            if (!frameSize(pending.data(), pending.size(), frame_size)) {
              last = ALLNEWMTS_MCI_FRAME_INVALID;
              finished = true;
              break;
            }
            if (pending.size() < frame_size) break;
            if (pending[8] == 'H') {
              if (!client->transport.write(
                      client->context, pending.data(), frame_size,
                      timeout, generation)) {
                last = ALLNEWMTS_MCI_TRANSPORT_ERROR;
                finished = true;
                break;
              }
            } else if (!quote_sent && pending[8] == 'I') {
              AllNewMTSMciSession candidate{};
              last = allnewmts_mci_parse_init_response(
                  pending.data(), frame_size, &candidate);
              if (last == ALLNEWMTS_MCI_OK && mode == BetaMode::Connect) {
                if (!client->transport.authenticate(client->context, &candidate,
                                                    generation)) {
                  last = ALLNEWMTS_MCI_AUTH_FAILED;
                } else {
                  client->session = candidate;
                  client->ready = true;
                }
              } else if (last == ALLNEWMTS_MCI_OK &&
                         mode == BetaMode::Gd1000q1Probe) {
                std::array<uint8_t, ALLNEWMTS_MCI_MAX_FRAME_SIZE>
                    quote_request{};
                char nonce[10];
                uint64_t value = generation;
                for (size_t index = 0; index < sizeof(nonce); ++index) {
                  nonce[sizeof(nonce) - 1 - index] =
                      static_cast<char>('0' + value % 10);
                  value /= 10;
                }
                size_t quote_request_size = 0;
                last = allnewmts_mci_build_gd1000q1_request(
                    client->channel_detail, &candidate, nonce,
                    quote_request.data(), quote_request.size(),
                    &quote_request_size);
                if (last == ALLNEWMTS_MCI_OK &&
                    client->transport.write(
                        client->context, quote_request.data(),
                        quote_request_size,
                        ALLNEWMTS_MCI_TRANSACTION_TIMEOUT_MS, generation)) {
                  quote_session = candidate;
                  quote_sent = true;
                  started = client->transport.now_ms(client->context);
                } else {
                  if (last == ALLNEWMTS_MCI_OK)
                    last = ALLNEWMTS_MCI_TRANSPORT_ERROR;
                  finished = true;
                }
              }
              if (mode != BetaMode::Gd1000q1Probe ||
                  last != ALLNEWMTS_MCI_OK)
                finished = true;
            } else if (quote_sent && pending[8] == 'R') {
              last = allnewmts_mci_parse_gd1000q1_response(
                  pending.data(), frame_size, &quote_session);
              finished = true;
            } else {
              last = ALLNEWMTS_MCI_FRAME_INVALID;
              finished = true;
            }
            pending.erase(pending.begin(), pending.begin() + frame_size);
          }
        }
        if (client->ready) return ALLNEWMTS_MCI_OK;
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
                     ALLNEWMTS_MCI_AUTOMATIC_RETRIES, BetaMode::Connect);
}

extern "C" uint32_t allnewmts_mci_probe_beta(
    AllNewMTSMciClient *client, const uint8_t *ip_dat, size_t ip_dat_size) {
  return connectBeta(client, ip_dat, ip_dat_size, 0, BetaMode::InitProbe);
}

extern "C" uint32_t allnewmts_mci_probe_beta_gd1000q1(
    AllNewMTSMciClient *client, const uint8_t *ip_dat, size_t ip_dat_size) {
  return connectBeta(client, ip_dat, ip_dat_size, 0,
                     BetaMode::Gd1000q1Probe);
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
