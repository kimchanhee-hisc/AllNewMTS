#include "allnewmts_mci.h"
#include "allnewmts_mci_socket.h"
#include "sha256.h"

#include <arpa/inet.h>
#include <algorithm>
#include <array>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>
#include <sys/socket.h>
#include <thread>
#include <unistd.h>
#include <vector>

namespace {

void hash(const std::string &value, uint8_t output[32]) {
  allnewmts_sha256(reinterpret_cast<const uint8_t *>(value.data()),
                   value.size(), output);
}

void decimal8(uint8_t *output, size_t value) {
  for (size_t index = 0; index < 8; ++index) {
    output[7 - index] = static_cast<uint8_t>('0' + value % 10);
    value /= 10;
  }
}

void field(std::vector<uint8_t> &bytes, size_t offset, size_t width,
           const char *value) {
  std::fill(bytes.begin() + offset, bytes.begin() + offset + width, ' ');
  std::memcpy(bytes.data() + offset, value,
              std::min(width, std::strlen(value)));
}

std::vector<uint8_t> initResponse() {
  std::vector<uint8_t> frame(
      ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE + ALLNEWMTS_MCI_INIT_BODY_SIZE,
      ' ');
  decimal8(frame.data(), frame.size() - 8);
  frame[8] = 'I';
  size_t body = ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE;
  field(frame, body, 32, "203.0.113.1");
  field(frame, body + 32, 32, "10.0.0.2");
  field(frame, body + 64, 8, "MCI00001");
  field(frame, body + 72, 8, "20260129");
  field(frame, body + 80, 12, "120102003004");
  field(frame, body + 92, 1, "B");
  field(frame, body + 93, 32, "198.51.100.2");
  return frame;
}

std::vector<uint8_t> initRequestGolden() {
  std::vector<uint8_t> expected(ALLNEWMTS_MCI_REQUEST_HEADER_SIZE, ' ');
  const auto copy = [&](size_t offset, const char *value) {
    std::memcpy(expected.data() + offset, value, std::strlen(value));
  };
  copy(0, "00000313I00SF000000S00000000313000003131100CC3ABCDE");
  copy(138, "000206920000");
  expected[158] = '1';
  expected[160] = '0';
  expected[161] = '0';
  expected[162] = '2';
  expected[163] = '0';
  expected[164] = 'Q';
  expected[294] = 'N';
  return expected;
}

std::vector<uint8_t> gd1000q1Response(char response_code = '0') {
  std::vector<uint8_t> body;
  for (size_t index = 0; index < 104; ++index) {
    if (index != 0) body.push_back(0x1e);
    const char *value =
        index == 0 ? "003530" : index == 2 ? "+70000" : "";
    body.insert(body.end(), value, value + std::strlen(value));
  }
  body.push_back(0x1f);
  std::vector<uint8_t> frame(
      ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE + body.size(), ' ');
  decimal8(frame.data(), frame.size() - 8);
  frame[8] = 'R';
  frame[9] = '0';
  frame[10] = '0';
  frame[11] = 'S';
  frame[12] = 'F';
  field(frame, 89, 8, "GD1000Q1");
  field(frame, 146, 4, "0001");
  field(frame, 150, 8, "MCI00001");
  frame[161] = response_code;
  frame[321] = '0';
  field(frame, 322, 9, "MCI000000");
  std::copy(body.begin(), body.end(),
            frame.begin() + ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE);
  return frame;
}

std::vector<uint8_t> commandResponse(const char request_id[5],
                                     size_t token_size,
                                     char response_code = '0') {
  std::vector<uint8_t> frame(
      ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE + token_size, ' ');
  decimal8(frame.data(), frame.size() - 8);
  frame[8] = 'X';
  frame[9] = '2';
  frame[10] = '0';
  frame[11] = 'S';
  frame[12] = 'F';
  field(frame, 146, 4, request_id);
  field(frame, 150, 8, "MCI00001");
  frame[161] = response_code;
  for (size_t index = 0; index < token_size; ++index)
    frame[ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE + index] =
        static_cast<uint8_t>((index * 17 + 3) & 0xff);
  return frame;
}

std::vector<uint8_t> ccsResponse(const char transaction_id[9],
                                 const char request_id[5], size_t frame_size,
                                 const char *body_prefix = nullptr) {
  std::vector<uint8_t> frame(frame_size, ' ');
  decimal8(frame.data(), frame.size() - 8);
  frame[8] = 'R';
  frame[9] = '0';
  frame[10] = '0';
  frame[11] = 'S';
  frame[12] = 'M';
  field(frame, 89, 8, transaction_id);
  field(frame, 146, 4, request_id);
  field(frame, 150, 8, "MCI00001");
  frame[161] = '0';
  frame[321] = '0';
  field(frame, 322, 9, "MCI000000");
  std::fill(frame.begin() + ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE, frame.end(), 0);
  if (body_prefix)
    std::memcpy(frame.data() + ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE, body_prefix,
                std::strlen(body_prefix));
  return frame;
}

std::vector<uint8_t> realtimePushBytes(const char *service, const char *key,
                                       const uint8_t *payload,
                                       size_t payload_size) {
  std::vector<uint8_t> frame(
      ALLNEWMTS_MCI_REALTIME_HEADER_SIZE + 3 +
          ALLNEWMTS_MCI_REALTIME_KEY_SIZE + 4 + 2 + payload_size,
      ' ');
  decimal8(frame.data(), frame.size() - 8);
  frame[8] = 'P';
  frame[9] = '0';
  frame[10] = '0';
  field(frame, 11, 2, "01");
  field(frame, ALLNEWMTS_MCI_REALTIME_HEADER_SIZE, 3, service);
  field(frame, ALLNEWMTS_MCI_REALTIME_HEADER_SIZE + 3,
        ALLNEWMTS_MCI_REALTIME_KEY_SIZE, key);
  char item_size[5];
  std::snprintf(item_size, sizeof(item_size), "%04zu", payload_size);
  field(frame, ALLNEWMTS_MCI_REALTIME_HEADER_SIZE + 3 +
                   ALLNEWMTS_MCI_REALTIME_KEY_SIZE,
        4, item_size);
  field(frame, ALLNEWMTS_MCI_REALTIME_HEADER_SIZE + 3 +
                   ALLNEWMTS_MCI_REALTIME_KEY_SIZE + 4,
        2, "01");
  std::memcpy(frame.data() + ALLNEWMTS_MCI_REALTIME_HEADER_SIZE + 3 +
                  ALLNEWMTS_MCI_REALTIME_KEY_SIZE + 4 + 2,
              payload, payload_size);
  return frame;
}

std::vector<uint8_t> realtimePush(const char *service, const char *key,
                                  const char *payload) {
  return realtimePushBytes(service, key,
                           reinterpret_cast<const uint8_t *>(payload),
                           std::strlen(payload));
}

std::vector<uint8_t> s00Push(uint32_t price, size_t record_size = 158) {
  std::vector<uint8_t> payload(record_size, ' ');
  if (record_size >= 22) {
    std::memcpy(payload.data(), "A005930", 7);
    std::memcpy(payload.data() + 9, "134501", 6);
    payload[15] = '0';
    payload[16] = '0';
    payload[17] = static_cast<uint8_t>(price);
    payload[18] = static_cast<uint8_t>(price >> 8);
    payload[19] = static_cast<uint8_t>(price >> 16);
    payload[20] = static_cast<uint8_t>(price >> 24);
    payload[21] = '-';
  }
  return realtimePushBytes("S00", "005930", payload.data(), payload.size());
}

struct Fake {
  std::string expected_host = "mci-beta.example.invalid";
  uint16_t expected_port = 1234;
  bool fail_first_open = false;
  bool authenticate_ok = true;
  size_t open_count = 0;
  size_t close_count = 0;
  size_t wait_count = 0;
  size_t authenticate_count = 0;
  size_t read_index = 0;
  uint64_t now = 1000;
  uint64_t read_advance = 100;
  std::vector<std::vector<uint8_t>> reads;
  std::vector<std::vector<uint8_t>> writes;
};

int open(void *opaque, const char *host, uint16_t port, uint32_t timeout,
         uint64_t generation) {
  auto &fake = *static_cast<Fake *>(opaque);
  assert(host == fake.expected_host);
  assert(port == fake.expected_port);
  assert(timeout == ALLNEWMTS_MCI_CONNECT_TIMEOUT_MS);
  assert(generation == fake.open_count + 1);
  ++fake.open_count;
  fake.read_index = 0;
  return !(fake.fail_first_open && fake.open_count == 1);
}

int write(void *opaque, const uint8_t *bytes, size_t size, uint32_t timeout,
          uint64_t generation) {
  auto &fake = *static_cast<Fake *>(opaque);
  assert(timeout == ALLNEWMTS_MCI_COMMAND_TIMEOUT_MS ||
         timeout == ALLNEWMTS_MCI_TRANSACTION_TIMEOUT_MS);
  assert(generation == fake.open_count);
  fake.writes.emplace_back(bytes, bytes + size);
  return 1;
}

int read(void *opaque, uint8_t *bytes, size_t capacity, size_t *size,
         uint32_t timeout, uint64_t generation) {
  auto &fake = *static_cast<Fake *>(opaque);
  assert(timeout > 0 && timeout <= ALLNEWMTS_MCI_TRANSACTION_TIMEOUT_MS);
  assert(generation == fake.open_count);
  assert(fake.read_index < fake.reads.size());
  const auto &source = fake.reads[fake.read_index++];
  assert(source.size() <= capacity);
  std::memcpy(bytes, source.data(), source.size());
  *size = source.size();
  fake.now += fake.read_advance;
  return 1;
}

int authenticate(void *opaque, const AllNewMTSMciSession *session,
                 uint64_t generation) {
  auto &fake = *static_cast<Fake *>(opaque);
  ++fake.authenticate_count;
  assert(generation == fake.open_count);
  assert(std::strcmp(session->handle, "MCI00001") == 0);
  return fake.authenticate_ok;
}

void close(void *opaque, uint64_t generation) {
  auto &fake = *static_cast<Fake *>(opaque);
  assert(generation > 0 && generation <= fake.open_count);
  ++fake.close_count;
}

void wait(void *opaque, uint32_t delay) {
  auto &fake = *static_cast<Fake *>(opaque);
  assert(delay == ALLNEWMTS_MCI_RETRY_DELAY_MS);
  ++fake.wait_count;
  fake.now += delay;
}

uint64_t now(void *opaque) {
  return static_cast<Fake *>(opaque)->now;
}

AllNewMTSMciTransport transport() {
  return {open, write, read, authenticate, close, wait, now};
}

int allowAuthentication(void *, const AllNewMTSMciSession *, uint64_t) {
  return 1;
}

std::vector<std::vector<uint8_t>> fragmentedReads() {
  const std::string polling = "00000005Hping";
  std::vector<uint8_t> combined(polling.begin(), polling.end());
  std::vector<uint8_t> response = initResponse();
  combined.insert(combined.end(), response.begin(), response.end());
  return {
      std::vector<uint8_t>(combined.begin(), combined.begin() + 3),
      std::vector<uint8_t>(combined.begin() + 3, combined.begin() + 217),
      std::vector<uint8_t>(combined.begin() + 217, combined.end()),
  };
}

}  // namespace

int main(int argc, char **argv) {
  assert(argc == 1 || argc == 2);
  if (argc == 2) {
    std::ifstream source(argv[1], std::ios::binary);
    assert(source);
    std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(source)),
                               std::istreambuf_iterator<char>());
    AllNewMTSMciEndpoint production{};
    assert(allnewmts_mci_preflight_beta(bytes.data(), bytes.size(),
                                        &production) == ALLNEWMTS_MCI_OK);
    std::cout << "PASS pinned MCI BETA endpoint source\n";
  }
  const std::string ip_dat =
      "[production]\nCNT=2\nIP1=unused.example.invalid\nPORT=1\n"
      "[\xeb\xb2\xa0\xed\x83\x80]\r\nCNT=1\r\n"
      "IP1=mci-beta.example.invalid\r\nPORT=1234\r\n"
      "[development]\nCNT=1\nIP1=unused.example.invalid\nPORT=2\n";
  uint8_t file_hash[32], endpoint_hash[32];
  hash(ip_dat, file_hash);
  hash("mci-beta.example.invalid:1234", endpoint_hash);

  AllNewMTSMciEndpoint endpoint{};
  assert(allnewmts_mci_test_preflight_beta(
             reinterpret_cast<const uint8_t *>(ip_dat.data()), ip_dat.size(),
             file_hash, endpoint_hash, &endpoint) == ALLNEWMTS_MCI_OK);
  assert(std::strcmp(endpoint.host, "mci-beta.example.invalid") == 0);
  assert(endpoint.port == 1234);

  const std::string invalid =
      "[\xeb\xb2\xa0\xed\x83\x80]\nCNT=2\n"
      "IP1=mci-beta.example.invalid\nPORT=1234\n";
  uint8_t invalid_hash[32];
  hash(invalid, invalid_hash);
  assert(allnewmts_mci_test_preflight_beta(
             reinterpret_cast<const uint8_t *>(invalid.data()),
             invalid.size(), invalid_hash, endpoint_hash,
             &endpoint) == ALLNEWMTS_MCI_BETA_ENDPOINT_INVALID);
  const std::string missing =
      "[beta]\nCNT=1\nIP1=mci-beta.example.invalid\nPORT=1234\n";
  hash(missing, invalid_hash);
  assert(allnewmts_mci_test_preflight_beta(
             reinterpret_cast<const uint8_t *>(missing.data()),
             missing.size(), invalid_hash, endpoint_hash,
             &endpoint) == ALLNEWMTS_MCI_BETA_ENDPOINT_INVALID);
  const std::string numeric =
      "[\xeb\xb2\xa0\xed\x83\x80]\nCNT=1\nIP1=192.0.2.1\nPORT=1234\n";
  hash(numeric, invalid_hash);
  assert(allnewmts_mci_test_preflight_beta(
             reinterpret_cast<const uint8_t *>(numeric.data()),
             numeric.size(), invalid_hash, endpoint_hash,
             &endpoint) == ALLNEWMTS_MCI_BETA_ENDPOINT_INVALID);
  const std::string changed_port =
      "[\xeb\xb2\xa0\xed\x83\x80]\nCNT=1\n"
      "IP1=mci-beta.example.invalid\nPORT=1235\n";
  hash(changed_port, invalid_hash);
  assert(allnewmts_mci_test_preflight_beta(
             reinterpret_cast<const uint8_t *>(changed_port.data()),
             changed_port.size(), invalid_hash, endpoint_hash,
             &endpoint) == ALLNEWMTS_MCI_BETA_SOURCE_MISMATCH);
  std::string changed_file = ip_dat + "\n";
  assert(allnewmts_mci_test_preflight_beta(
             reinterpret_cast<const uint8_t *>(changed_file.data()),
             changed_file.size(), file_hash, endpoint_hash,
             &endpoint) == ALLNEWMTS_MCI_BETA_SOURCE_MISMATCH);

  uint8_t request[ALLNEWMTS_MCI_REQUEST_HEADER_SIZE];
  assert(allnewmts_mci_build_init_request("ABCDE", request) ==
         ALLNEWMTS_MCI_OK);
  assert(std::vector<uint8_t>(request, request + sizeof(request)) ==
         initRequestGolden());

  AllNewMTSMciSession parsed{};
  std::vector<uint8_t> response = initResponse();
  assert(allnewmts_mci_parse_init_response(response.data(), response.size(),
                                           &parsed) == ALLNEWMTS_MCI_OK);
  assert(std::strcmp(parsed.public_ip, "203.0.113.1") == 0);
  assert(std::strcmp(parsed.private_ip, "10.0.0.2") == 0);
  assert(std::strcmp(parsed.selected_private_ip, "203.0.113.1") == 0);
  assert(std::strcmp(parsed.date, "20260129") == 0);
  response = initResponse();
  field(response, ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE + 32, 32, "172.16.1.7");
  assert(allnewmts_mci_parse_init_response(response.data(), response.size(),
                                           &parsed) == ALLNEWMTS_MCI_OK);
  assert(std::strcmp(parsed.private_ip, "172.16.1.7") == 0);
  assert(std::strcmp(parsed.selected_private_ip, "172.16.1.7") == 0);
  response = initResponse();
  assert(allnewmts_mci_parse_init_response(response.data(), response.size(),
                                           &parsed) == ALLNEWMTS_MCI_OK);
  response.pop_back();
  assert(allnewmts_mci_parse_init_response(response.data(), response.size(),
                                           &parsed) ==
         ALLNEWMTS_MCI_INIT_INVALID);
  response = initResponse();
  response[ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE + 72] = 'X';
  assert(allnewmts_mci_parse_init_response(response.data(), response.size(),
                                           &parsed) ==
         ALLNEWMTS_MCI_INIT_INVALID);
  response = initResponse();
  response.push_back(' ');
  decimal8(response.data(), response.size() - 8);
  assert(allnewmts_mci_parse_init_response(response.data(), response.size(),
                                           &parsed) ==
         ALLNEWMTS_MCI_INIT_INVALID);

  {
    const uint8_t samsung[] = {'0', '0', '5', '9', '3', '0'};
    const AllNewMTSMciRealtimeKey keys[] = {
        {samsung, sizeof(samsung)}};
    std::array<uint8_t, ALLNEWMTS_MCI_MAX_FRAME_SIZE> realtime{};
    size_t realtime_size = 0;
    assert(allnewmts_mci_build_realtime_request(
               "CC320", &parsed, "0000000001", '0', '0', "NEWMTS",
               parsed.selected_private_ip, "S00", keys, 1, realtime.data(),
               realtime.size(), &realtime_size) == ALLNEWMTS_MCI_OK);
    assert(realtime_size ==
           ALLNEWMTS_MCI_REQUEST_HEADER_SIZE +
               ALLNEWMTS_MCI_REALTIME_BODY_HEADER_SIZE + sizeof(samsung) + 1);
    assert(std::string(reinterpret_cast<char *>(realtime.data()), 13) ==
           "00000355" "000S0");
    assert(realtime[8] == '0' &&
           std::string(reinterpret_cast<char *>(realtime.data() + 89), 8) ==
               "S00     ");
    const uint8_t expected_body[] = {
        '0', '0', '0', '1', '0', 'S', '0', '0', ' ', ' ', ' ', ' ', ' ',
        ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', '0',
        '0', '0', '1', '0', '0', '0', '0', '0', '7', '0', '0', '5', '9',
        '3', '0', 0};
    assert(std::equal(
        realtime.begin() + ALLNEWMTS_MCI_REQUEST_HEADER_SIZE,
        realtime.begin() + realtime_size, std::begin(expected_body),
        std::end(expected_body)));
    assert(allnewmts_mci_build_realtime_request(
               "CC320", &parsed, "0000000002", '1', '0', "NEWMTS",
               parsed.selected_private_ip, "S00", keys, 1, realtime.data(),
               realtime.size(), &realtime_size) == ALLNEWMTS_MCI_OK);
    assert(realtime[8] == '1');

    std::vector<uint8_t> push =
        realtimePush("S00", "005930", "0059300000715000");
    AllNewMTSMciRealtimePush parsed_push{};
    size_t push_count = 0;
    assert(allnewmts_mci_parse_realtime_push(
               push.data(), push.size(), &parsed_push, 1, &push_count) ==
           ALLNEWMTS_MCI_OK);
    assert(push_count == 1 && std::strcmp(parsed_push.service, "S00") == 0 &&
           std::strcmp(parsed_push.key, "005930") == 0 &&
           parsed_push.item_size == 16 && parsed_push.item_count == 1 &&
           std::string(reinterpret_cast<char *>(
                           push.data() + parsed_push.payload_offset),
                       parsed_push.item_size) == "0059300000715000");
    push[9] = '2';
    assert(allnewmts_mci_parse_realtime_push(
               push.data(), push.size(), &parsed_push, 1, &push_count) ==
           ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID);
    push = realtimePush("S00", "005930", "0059300000715000");
    push.pop_back();
    assert(allnewmts_mci_parse_realtime_push(
               push.data(), push.size(), &parsed_push, 1, &push_count) ==
           ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID);

    AllNewMTSMciRealtimeRegistry *registry = nullptr;
    assert(allnewmts_mci_realtime_registry_create(&registry) ==
           ALLNEWMTS_MCI_OK);
    AllNewMTSMciRealtimeAction action{};
    assert(allnewmts_mci_realtime_acquire(
               registry, 10, "S00", samsung, sizeof(samsung), &action) ==
           ALLNEWMTS_MCI_OK);
    assert(action.transaction_type == '0');
    assert(allnewmts_mci_realtime_acquire(
               registry, 10, "S00", samsung, sizeof(samsung), &action) ==
           ALLNEWMTS_MCI_OK);
    assert(action.transaction_type == 0);
    assert(allnewmts_mci_realtime_acquire(
               registry, 20, "S00", samsung, sizeof(samsung), &action) ==
           ALLNEWMTS_MCI_OK);
    assert(action.transaction_type == 0);
    uint64_t scopes[2]{};
    size_t scope_count = 0;
    assert(allnewmts_mci_realtime_match(
               registry, "S00", samsung, sizeof(samsung), scopes, 2,
               &scope_count) == ALLNEWMTS_MCI_OK);
    assert(scope_count == 2 && scopes[0] == 10 && scopes[1] == 20);
    assert(allnewmts_mci_realtime_release(
               registry, 10, "S00", samsung, sizeof(samsung), &action) ==
           ALLNEWMTS_MCI_OK);
    assert(action.transaction_type == 0);
    assert(allnewmts_mci_realtime_release(
               registry, 20, "S00", samsung, sizeof(samsung), &action) ==
           ALLNEWMTS_MCI_OK);
    assert(action.transaction_type == '1');

    const uint8_t hynix[] = {'0', '0', '0', '6', '6', '0'};
    assert(allnewmts_mci_realtime_acquire(
               registry, 30, "S00", samsung, sizeof(samsung), &action) ==
           ALLNEWMTS_MCI_OK);
    assert(allnewmts_mci_realtime_acquire(
               registry, 30, "S00", hynix, sizeof(hynix), &action) ==
           ALLNEWMTS_MCI_OK);
    AllNewMTSMciRealtimeAction actions[2]{};
    size_t action_count = 0;
    assert(allnewmts_mci_realtime_replay(
               registry, actions, 2, &action_count) == ALLNEWMTS_MCI_OK);
    assert(action_count == 2 && actions[0].transaction_type == '0' &&
           actions[1].transaction_type == '0');
    assert(allnewmts_mci_realtime_release_scope(
               registry, 30, actions, 2, &action_count) ==
           ALLNEWMTS_MCI_OK);
    assert(action_count == 2 && actions[0].transaction_type == '1' &&
           actions[1].transaction_type == '1');
    assert(allnewmts_mci_realtime_match(
               registry, "S00", samsung, sizeof(samsung), scopes, 2,
               &scope_count) == ALLNEWMTS_MCI_REALTIME_NOT_FOUND);
    allnewmts_mci_realtime_registry_destroy(registry);
  }

  const uint8_t market_value[] = {'O', 'V'};
  const uint8_t instrument_value[] = {'F', 'X', '@', 'K', 'R', 'W'};
  const AllNewMTSMciSfidInput generic_inputs[] = {
      {"9001", market_value, sizeof(market_value)},
      {"9002", instrument_value, sizeof(instrument_value)},
      {"9246", nullptr, 0}};
  const AllNewMTSMciSfidOutput generic_outputs[] = {
      {"0004", 0}, {"0125", 1}};
  std::array<uint8_t, 256> generic_body{};
  size_t generic_body_size = 0;
  assert(allnewmts_mci_build_sfid_body(
             "3101", generic_inputs, 3, generic_outputs, 2,
             generic_body.data(), generic_body.size(), &generic_body_size) ==
         ALLNEWMTS_MCI_OK);
  const std::vector<uint8_t> expected_generic_body = {
      0x1f, '9', '0', '0', '1', 0x7f, 'O', 'V',
      0x1e, '9', '0', '0', '2', 0x7f, 'F', 'X', '@', 'K', 'R', 'W',
      0x1e, '9', '2', '4', '6', 0x7f,
      0x1e, 'G', 'I', 'D', 0x7f, '3', '1', '0', '1',
      0x1e, '0', '0', '0', '4',
      0x1e, '*', '0', '1', '2', '5', 0x1f};
  assert(std::vector<uint8_t>(
             generic_body.begin(),
             generic_body.begin() + generic_body_size) ==
         expected_generic_body);
  const AllNewMTSMciSfidOccurrence occurrence = {
      2, 0, 0, ALLNEWMTS_MCI_SFID_SELECTOR_VALUE_THEN_COUNT, nullptr, 0};
  std::array<uint8_t, 256> occurrence_request_body{};
  size_t occurrence_request_body_size = 0;
  assert(allnewmts_mci_build_sfid_occurrence_body(
             "3101", generic_inputs, 3, &occurrence, generic_outputs, 2,
             occurrence_request_body.data(), occurrence_request_body.size(),
             &occurrence_request_body_size) == ALLNEWMTS_MCI_OK);
  const std::string occurrence_selector = "$0000000000020@000";
  assert(std::search(
             occurrence_request_body.begin(),
             occurrence_request_body.begin() + occurrence_request_body_size,
             occurrence_selector.begin(), occurrence_selector.end()) !=
         occurrence_request_body.begin() + occurrence_request_body_size);
  const AllNewMTSMciSfidOccurrence count_first_occurrence = {
      2, 2, 0, ALLNEWMTS_MCI_SFID_SELECTOR_COUNT_THEN_VALUE, nullptr, 0};
  assert(allnewmts_mci_build_sfid_occurrence_body(
             "3101", generic_inputs, 3, &count_first_occurrence,
             generic_outputs, 2, occurrence_request_body.data(),
             occurrence_request_body.size(), &occurrence_request_body_size) ==
         ALLNEWMTS_MCI_OK);
  const std::string count_first_selector = "$0002000000020@000";
  assert(std::search(
             occurrence_request_body.begin(),
             occurrence_request_body.begin() + occurrence_request_body_size,
             count_first_selector.begin(), count_first_selector.end()) !=
         occurrence_request_body.begin() + occurrence_request_body_size);

  const uint8_t gd3122_market[] = {'O', 'V'};
  const AllNewMTSMciSfidInput gd3122_inputs[] = {
      {"9001", gd3122_market, sizeof(gd3122_market)},
      {"9160", nullptr, 0}};
  const AllNewMTSMciSfidOutput gd3122_outputs[] = {
      {"0009", 0}, {"1987", 0}, {"2202", 0}, {"2203", 0}};
  const AllNewMTSMciSfidOccurrence gd3122_initial = {
      20, 20, 0, ALLNEWMTS_MCI_SFID_SELECTOR_COUNT_THEN_VALUE, nullptr, 0};
  assert(allnewmts_mci_build_sfid_occurrence_body(
             "3122", gd3122_inputs, 2, &gd3122_initial, gd3122_outputs, 4,
             occurrence_request_body.data(), occurrence_request_body.size(),
             &occurrence_request_body_size) == ALLNEWMTS_MCI_OK);
  const std::string gd3122_initial_golden =
      "\x1f"
      "9001"
      "\x7f"
      "OV"
      "\x1e"
      "9160"
      "\x7f"
      "\x1e"
      "GID"
      "\x7f"
      "3122"
      "\x1e"
      "$0020000000200@000"
      "\x1e"
      "0009"
      "\x1e"
      "1987"
      "\x1e"
      "2202"
      "\x1e"
      "2203"
      "\x1f";
  assert(occurrence_request_body_size == 63);
  assert(std::equal(
      occurrence_request_body.begin(),
      occurrence_request_body.begin() + occurrence_request_body_size,
      reinterpret_cast<const uint8_t *>(gd3122_initial_golden.data()),
      reinterpret_cast<const uint8_t *>(gd3122_initial_golden.data()) +
          gd3122_initial_golden.size()));
  const uint8_t gd3122_key[] = {'0', '0', '0', '0', '0', '|',
                                '0', '0', '0', '2', '1'};
  const AllNewMTSMciSfidOccurrence gd3122_continuation = {
      20, 20, 2, ALLNEWMTS_MCI_SFID_SELECTOR_COUNT_THEN_VALUE,
      gd3122_key, sizeof(gd3122_key)};
  assert(allnewmts_mci_build_sfid_occurrence_body(
             "3122", gd3122_inputs, 2, &gd3122_continuation, gd3122_outputs,
             4, occurrence_request_body.data(), occurrence_request_body.size(),
             &occurrence_request_body_size) == ALLNEWMTS_MCI_OK);
  const std::string gd3122_continuation_selector =
      "$0020000000202@01100000|00021";
  assert(occurrence_request_body_size == 74);
  assert(std::search(
             occurrence_request_body.begin(),
             occurrence_request_body.begin() + occurrence_request_body_size,
             gd3122_continuation_selector.begin(),
             gd3122_continuation_selector.end()) !=
         occurrence_request_body.begin() + occurrence_request_body_size);

  AllNewMTSMciTransactionRequest generic_request{};
  std::memcpy(generic_request.transaction_id, "AB3101Q1", 9);
  std::memcpy(generic_request.request_id, "0042", 5);
  generic_request.interface_id = 'F';
  std::memcpy(generic_request.hts_id, "TESTUSER", 9);
  std::memcpy(generic_request.private_identity, "198.51.100.10", 14);
  generic_request.body = generic_body.data();
  generic_request.body_size = generic_body_size;
  std::array<uint8_t, ALLNEWMTS_MCI_MAX_FRAME_SIZE> generic_frame{};
  size_t generic_frame_size = 0;
  assert(allnewmts_mci_build_transaction_request(
             "CC320", &parsed, "0000000001", &generic_request,
             generic_frame.data(), generic_frame.size(),
             &generic_frame_size) == ALLNEWMTS_MCI_OK);
  assert(generic_frame_size ==
         ALLNEWMTS_MCI_REQUEST_HEADER_SIZE + generic_body_size);
  assert(std::string(
             reinterpret_cast<char *>(generic_frame.data() + 89), 8) ==
         "AB3101Q1");
  assert(std::string(
             reinterpret_cast<char *>(generic_frame.data() + 146), 4) ==
         "0042");
  assert(std::string(
             reinterpret_cast<char *>(generic_frame.data() + 202), 10) ==
         "TESTUSER  ");
  assert(std::vector<uint8_t>(
             generic_frame.begin() + ALLNEWMTS_MCI_REQUEST_HEADER_SIZE,
             generic_frame.begin() + generic_frame_size) ==
         expected_generic_body);

  std::array<uint8_t, 53> first_x_token{};
  std::array<uint8_t, 309> second_x_token{};
  for (size_t index = 0; index < first_x_token.size(); ++index)
    first_x_token[index] = static_cast<uint8_t>(index);
  for (size_t index = 0; index < second_x_token.size(); ++index)
    second_x_token[index] = static_cast<uint8_t>(255 - (index & 0xff));
  AllNewMTSMciCommandRequest command_request{};
  command_request.command = 'X';
  std::memcpy(command_request.request_id, "0001", 5);
  command_request.interface_id = 'F';
  std::memcpy(command_request.hts_id, "NEWMTS", 7);
  std::memcpy(command_request.private_identity, parsed.selected_private_ip,
              sizeof(command_request.private_identity));
  command_request.body = first_x_token.data();
  command_request.body_size = first_x_token.size();
  size_t command_frame_size = 0;
  assert(allnewmts_mci_build_command_request(
             "CC320", &parsed, "0000000002", &command_request,
             generic_frame.data(), generic_frame.size(),
             &command_frame_size) == ALLNEWMTS_MCI_OK);
  assert(command_frame_size == 374);
  assert(std::string(reinterpret_cast<char *>(generic_frame.data()), 13) ==
         "00000366X20SF");
  assert(std::vector<uint8_t>(
             generic_frame.begin() + ALLNEWMTS_MCI_REQUEST_HEADER_SIZE,
             generic_frame.begin() + command_frame_size) ==
         std::vector<uint8_t>(first_x_token.begin(), first_x_token.end()));
  assert(std::string(
             reinterpret_cast<char *>(generic_frame.data() + 146), 4) ==
         "0001");
  assert(std::string(
             reinterpret_cast<char *>(generic_frame.data() + 256), 32) ==
         "203.0.113.1                     ");

  command_request.body = second_x_token.data();
  command_request.body_size = second_x_token.size();
  assert(allnewmts_mci_build_command_request(
             "CC320", &parsed, "0000000003", &command_request,
             generic_frame.data(), generic_frame.size(),
             &command_frame_size) == ALLNEWMTS_MCI_OK);
  assert(command_frame_size == 630);
  assert(std::string(reinterpret_cast<char *>(generic_frame.data()), 13) ==
         "00000622X20SF");
  assert(std::string(
             reinterpret_cast<char *>(generic_frame.data() + 146), 4) ==
         "0001");
  std::memcpy(command_request.request_id, "0002", 5);
  assert(allnewmts_mci_build_command_request(
             "CC320", &parsed, "0000000003", &command_request,
             generic_frame.data(), generic_frame.size(),
             &command_frame_size) == ALLNEWMTS_MCI_INVALID_ARGUMENT);
  std::memcpy(command_request.request_id, "0001", 5);

  AllNewMTSMciCommandResponse command_response{};
  std::vector<uint8_t> first_x_response = commandResponse("0001", 1153);
  assert(allnewmts_mci_parse_command_response(
             first_x_response.data(), first_x_response.size(), &parsed,
             &command_response) == ALLNEWMTS_MCI_OK);
  assert(std::strcmp(command_response.request_id, "0001") == 0 &&
         command_response.command == 'X' &&
         command_response.interface_id == 'F' &&
         command_response.body_offset == ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE &&
         command_response.body_size == 1153);
  std::vector<uint8_t> second_x_response = commandResponse("0001", 92);
  assert(allnewmts_mci_parse_command_response(
             second_x_response.data(), second_x_response.size(), &parsed,
             &command_response) == ALLNEWMTS_MCI_OK);
  assert(std::strcmp(command_response.request_id, "0001") == 0 &&
         command_response.body_size == 92);
  std::vector<uint8_t> wrong_x_response = commandResponse("0002", 92);
  assert(allnewmts_mci_parse_command_response(
             wrong_x_response.data(), wrong_x_response.size(), &parsed,
             &command_response) == ALLNEWMTS_MCI_TRANSACTION_INVALID);
  second_x_response[161] = '1';
  assert(allnewmts_mci_parse_command_response(
             second_x_response.data(), second_x_response.size(), &parsed,
             &command_response) == ALLNEWMTS_MCI_TRANSACTION_REJECTED);

  std::array<uint8_t, 17> ccs_body{};
  std::fill(ccs_body.begin(), ccs_body.end(), ' ');
  std::memcpy(ccs_body.data(), "00", 2);
  std::memcpy(ccs_body.data() + 2, parsed.public_ip,
              std::strlen(parsed.public_ip));
  AllNewMTSMciTransactionRequest ccs_request{};
  std::memcpy(ccs_request.transaction_id, "CCS00997", 9);
  std::memcpy(ccs_request.request_id, "0097", 5);
  ccs_request.interface_id = 'M';
  std::memcpy(ccs_request.hts_id, "sampleusr", 10);
  std::memcpy(ccs_request.private_identity, parsed.selected_private_ip,
              sizeof(ccs_request.private_identity));
  ccs_request.body = ccs_body.data();
  ccs_request.body_size = ccs_body.size();
  assert(allnewmts_mci_build_transaction_request(
             "CC320", &parsed, "0000000097", &ccs_request,
             generic_frame.data(), generic_frame.size(),
             &generic_frame_size) == ALLNEWMTS_MCI_OK);
  assert(generic_frame_size == 338);
  assert(std::string(reinterpret_cast<char *>(generic_frame.data()), 13) ==
         "00000330S00SM");
  assert(std::string(
             reinterpret_cast<char *>(generic_frame.data() + 202), 10) ==
         "sampleusr ");
  assert(std::string(
             reinterpret_cast<char *>(generic_frame.data() + 224), 32) ==
         "203.0.113.1                     ");
  assert(std::string(
             reinterpret_cast<char *>(generic_frame.data() + 256), 32) ==
         "203.0.113.1                     ");
  assert(std::equal(ccs_body.begin(), ccs_body.end(),
                    generic_frame.begin() + ALLNEWMTS_MCI_REQUEST_HEADER_SIZE));

  AllNewMTSMciTransactionResponse ccs_response{};
  std::vector<uint8_t> ccs_frame = ccsResponse("CCS00997", "0097", 692, "00");
  assert(allnewmts_mci_parse_transaction_response(
             ccs_frame.data(), ccs_frame.size(), &parsed, &ccs_response) ==
         ALLNEWMTS_MCI_OK);
  assert(std::strcmp(ccs_response.transaction_id, "CCS00997") == 0 &&
         std::strcmp(ccs_response.request_id, "0097") == 0 &&
         ccs_response.interface_id == 'M' &&
         ccs_response.message_output_type == '0' &&
         std::strcmp(ccs_response.message_code, "MCI000000") == 0 &&
         ccs_response.body_offset == ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE &&
         ccs_response.body_size == 192 &&
         ccs_frame[ccs_response.body_offset] == '0' &&
         ccs_frame[ccs_response.body_offset + 1] == '0');

  std::array<uint8_t, 651> ccs00996_body{};
  std::fill(ccs00996_body.begin(), ccs00996_body.end(), ' ');
  std::memcpy(ccs00996_body.data(), "sampleusr", 9);
  AllNewMTSMciTransactionRequest ccs00996_request{};
  std::memcpy(ccs00996_request.transaction_id, "CCS00996", 9);
  std::memcpy(ccs00996_request.request_id, "0096", 5);
  ccs00996_request.interface_id = 'M';
  std::memcpy(ccs00996_request.hts_id, "sampleusr", 10);
  std::memcpy(ccs00996_request.private_identity, "R00000000000", 13);
  ccs00996_request.body = ccs00996_body.data();
  ccs00996_request.body_size = ccs00996_body.size();
  assert(allnewmts_mci_build_transaction_request(
             "CC321", &parsed, "0000000096", &ccs00996_request,
             generic_frame.data(), generic_frame.size(),
             &generic_frame_size) == ALLNEWMTS_MCI_OK);
  assert(generic_frame_size == 972);
  assert(std::string(reinterpret_cast<char *>(generic_frame.data()), 13) ==
         "00000964S00SM");
  assert(std::string(reinterpret_cast<char *>(generic_frame.data() + 43), 8) ==
         "CC3CC321");
  assert(std::string(reinterpret_cast<char *>(generic_frame.data() + 256),
                     32) == "R00000000000                    ");
  std::vector<uint8_t> ccs00996_frame = ccsResponse("CCS00996", "0096", 580);
  assert(allnewmts_mci_parse_transaction_response(
             ccs00996_frame.data(), ccs00996_frame.size(), &parsed,
             &ccs_response) == ALLNEWMTS_MCI_OK);
  assert(std::strcmp(ccs_response.transaction_id, "CCS00996") == 0 &&
         std::strcmp(ccs_response.request_id, "0096") == 0 &&
         ccs_response.interface_id == 'M' &&
         std::strcmp(ccs_response.message_code, "MCI000000") == 0 &&
         ccs_response.body_offset == ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE &&
         ccs_response.body_size == 80);

  std::array<uint8_t, ALLNEWMTS_MCI_MAX_FRAME_SIZE> quote_request{};
  size_t quote_request_size = 0;
  assert(allnewmts_mci_build_gd1000q1_request(
             "CC320", nullptr, "0000000001", quote_request.data(),
             quote_request.size(),
             &quote_request_size) == ALLNEWMTS_MCI_INVALID_ARGUMENT);
  assert(allnewmts_mci_build_gd1000q1_request(
             "CC320", &parsed, "0000000001", quote_request.data(),
             quote_request.size(), &quote_request_size) == ALLNEWMTS_MCI_OK);
  assert(quote_request_size == 890);
  assert(std::string(reinterpret_cast<char *>(quote_request.data() + 43), 8) ==
         "CC3CC320");
  assert(std::string(reinterpret_cast<char *>(quote_request.data() + 57), 32) ==
         "MCI00001202601291201020000000001");
  assert(std::string(reinterpret_cast<char *>(quote_request.data() + 89), 8) ==
         "GD1000Q1");
  const uint8_t expected_quote_body_hash[32] = {
      0x51, 0x04, 0x1b, 0x75, 0x5c, 0x77, 0xe1, 0x44,
      0x72, 0x3b, 0x95, 0xe9, 0x30, 0x69, 0x42, 0x3d,
      0xee, 0xb0, 0x5c, 0x0a, 0xd1, 0x3c, 0x2f, 0x1f,
      0xc1, 0x10, 0x9b, 0xca, 0xa5, 0x02, 0x1f, 0x82};
  uint8_t quote_body_hash[32];
  allnewmts_sha256(
      quote_request.data() + ALLNEWMTS_MCI_REQUEST_HEADER_SIZE,
      quote_request_size - ALLNEWMTS_MCI_REQUEST_HEADER_SIZE,
      quote_body_hash);
  assert(std::memcmp(quote_body_hash, expected_quote_body_hash,
                     sizeof(quote_body_hash)) == 0);
  assert(allnewmts_mci_build_gd1000q1_request(
             "CC320", &parsed, "bad-nonce!", quote_request.data(),
             quote_request.size(), &quote_request_size) ==
         ALLNEWMTS_MCI_INVALID_ARGUMENT);
  std::vector<uint8_t> quote_response = gd1000q1Response();
  AllNewMTSMciTransactionResponse generic_response{};
  assert(allnewmts_mci_parse_transaction_response(
             quote_response.data(), quote_response.size(), &parsed,
             &generic_response) == ALLNEWMTS_MCI_OK);
  assert(std::strcmp(generic_response.transaction_id, "GD1000Q1") == 0 &&
         std::strcmp(generic_response.request_id, "0001") == 0 &&
         generic_response.interface_id == 'F' &&
         generic_response.body_offset == ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE);
  assert(allnewmts_mci_parse_gd1000q1_response(
             quote_response.data(), quote_response.size(), &parsed) ==
         ALLNEWMTS_MCI_OK);
  const char quote_fids[][5] = {"0004", "0005"};
  const std::vector<uint8_t> positional_body = {
      '+', '7', '0', '0', '0', '0', 0x1e, 0x1f};
  AllNewMTSMciSfidValue quote_values[2]{};
  AllNewMTSMciSfidDecoded quote_decoded{};
  assert(allnewmts_mci_decode_sfid_body(
             positional_body.data(), positional_body.size(), "1000",
             quote_fids, 2, quote_values, 2, &quote_decoded) ==
         ALLNEWMTS_MCI_OK);
  assert(quote_decoded.record_count == 1 &&
         quote_decoded.value_count == 2 &&
         quote_decoded.continuation_size == 0);
  assert(std::string(
             reinterpret_cast<const char *>(positional_body.data() +
                                            quote_values[0].offset),
             quote_values[0].size) == "+70000");
  assert(quote_values[1].size == 0);
  const char arbitrary_fids[][5] = {"8123", "9456"};
  const std::vector<uint8_t> arbitrary_body = {'A', 0x1e, 0x1f};
  assert(allnewmts_mci_decode_sfid_body(
             arbitrary_body.data(), arbitrary_body.size(), "3101",
             arbitrary_fids, 2, quote_values, 2, &quote_decoded) ==
         ALLNEWMTS_MCI_OK);
  assert(quote_values[0].size == 1 && quote_values[1].size == 0);
  std::vector<uint8_t> occurrence_response_body = {
      '$', '0', '0', '0', '0', '0', '0', '1', '1', '0', '0', '0',
      '2', '0', 0x02, '0', '0', '3', 'K', 'E', 'Y',
      '1', '0', '0', 0x1e, '1', 0x1d,
      '2', '0', '0', 0x1e, 0x1f};
  AllNewMTSMciSfidValue occurrence_values[4]{};
  assert(allnewmts_mci_decode_sfid_occurrence_body(
             occurrence_response_body.data(), occurrence_response_body.size(),
             "3101", arbitrary_fids, 2, occurrence_values, 4,
             &quote_decoded) == ALLNEWMTS_MCI_OK);
  assert(quote_decoded.record_count == 2 &&
         quote_decoded.value_count == 4 &&
         quote_decoded.continuation_offset == 18 &&
         quote_decoded.continuation_size == 3 &&
         quote_decoded.payload_size == 11 && quote_decoded.mode == 0 &&
         quote_decoded.page_state == 0x02 &&
         occurrence_values[3].size == 0);
  occurrence_response_body[13] = '2';
  occurrence_response_body[14] = 0x03;
  assert(allnewmts_mci_decode_sfid_occurrence_body(
             occurrence_response_body.data(), occurrence_response_body.size(),
             "3101", arbitrary_fids, 2, occurrence_values, 4,
             &quote_decoded) == ALLNEWMTS_MCI_OK);
  assert(quote_decoded.mode == 2 && quote_decoded.page_state == 0x03);
  occurrence_response_body[14] = 0x01;
  assert(allnewmts_mci_decode_sfid_occurrence_body(
             occurrence_response_body.data(), occurrence_response_body.size(),
             "3101", arbitrary_fids, 2, occurrence_values, 4,
             &quote_decoded) == ALLNEWMTS_MCI_OK);
  assert(quote_decoded.mode == 2 && quote_decoded.page_state == 0x01);
  occurrence_response_body[14] = '@';
  assert(allnewmts_mci_decode_sfid_occurrence_body(
             occurrence_response_body.data(), occurrence_response_body.size(),
             "3101", arbitrary_fids, 2, occurrence_values, 4,
             &quote_decoded) ==
         ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID);
  occurrence_response_body[14] = 0x01;
  occurrence_response_body[8] = '0';
  assert(allnewmts_mci_decode_sfid_occurrence_body(
             occurrence_response_body.data(), occurrence_response_body.size(),
             "3101", arbitrary_fids, 2, occurrence_values, 4,
             &quote_decoded) ==
         ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID);
  const char invalid_fids[][5] = {"9X99"};
  assert(allnewmts_mci_decode_sfid_body(
             arbitrary_body.data(), arbitrary_body.size(), "3101",
             invalid_fids, 1, quote_values, 2, &quote_decoded) ==
         ALLNEWMTS_MCI_TRANSACTION_INVALID);
  const char duplicate_fids[][5] = {"0004", "0004"};
  assert(allnewmts_mci_decode_sfid_body(
             positional_body.data(), positional_body.size(), "1000",
             duplicate_fids, 2, quote_values, 2, &quote_decoded) ==
         ALLNEWMTS_MCI_TRANSACTION_INVALID);
  assert(allnewmts_mci_decode_sfid_body(
             positional_body.data(), positional_body.size(), "1000",
             quote_fids, 2, quote_values, 1, &quote_decoded) ==
         ALLNEWMTS_MCI_RESOURCE_LIMIT);
  quote_response = gd1000q1Response();
  quote_response.insert(quote_response.end() - 1, {0x1e, '1'});
  decimal8(quote_response.data(), quote_response.size() - 8);
  assert(allnewmts_mci_parse_gd1000q1_response(
             quote_response.data(), quote_response.size(), &parsed) ==
         ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID);
  quote_response = gd1000q1Response();
  quote_response.back() = 0x1e;
  assert(allnewmts_mci_parse_gd1000q1_response(
             quote_response.data(), quote_response.size(), &parsed) ==
         ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID);
  quote_response = gd1000q1Response();
  quote_response[ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE + 8] = 'x';
  assert(allnewmts_mci_parse_gd1000q1_response(
             quote_response.data(), quote_response.size(), &parsed) ==
         ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID);
  quote_response = gd1000q1Response('2');
  assert(allnewmts_mci_parse_gd1000q1_response(
             quote_response.data(), quote_response.size(), &parsed) ==
         ALLNEWMTS_MCI_TRANSACTION_REJECTED);
  quote_response = gd1000q1Response();
  std::fill(quote_response.begin() + ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE,
            quote_response.end(), ' ');
  assert(allnewmts_mci_parse_gd1000q1_response(
             quote_response.data(), quote_response.size(), &parsed) ==
         ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID);

  Fake fake;
  fake.fail_first_open = true;
  fake.reads = fragmentedReads();
  AllNewMTSMciTransport callbacks = transport();
  AllNewMTSMciClient *client = nullptr;
  assert(allnewmts_mci_create("ABCDE", &callbacks, &fake, &client) ==
         ALLNEWMTS_MCI_OK);
  assert(allnewmts_mci_connect_beta(
             client, reinterpret_cast<const uint8_t *>(ip_dat.data()),
             ip_dat.size()) == ALLNEWMTS_MCI_BETA_SOURCE_MISMATCH);
  assert(fake.open_count == 0);
  assert(allnewmts_mci_test_set_beta_hashes(client, file_hash,
                                            endpoint_hash) ==
         ALLNEWMTS_MCI_OK);
  assert(allnewmts_mci_connect_beta(
             client, reinterpret_cast<const uint8_t *>(ip_dat.data()),
             ip_dat.size()) == ALLNEWMTS_MCI_OK);
  assert(fake.open_count == 2 && fake.wait_count == 1);
  assert(fake.writes.size() == 2);
  assert(fake.writes[0] == initRequestGolden());
  assert(std::string(fake.writes[1].begin(), fake.writes[1].end()) ==
         "00000005Hping");
  uint64_t generation = 0;
  assert(allnewmts_mci_session(client, &parsed, &generation) ==
         ALLNEWMTS_MCI_OK);
  assert(generation == 2 && std::strcmp(parsed.handle, "MCI00001") == 0);
  allnewmts_mci_destroy(client);
  assert(fake.close_count == 2);

  Fake probe;
  probe.authenticate_ok = false;
  probe.reads = fragmentedReads();
  client = nullptr;
  assert(allnewmts_mci_create("ABCDE", &callbacks, &probe, &client) ==
         ALLNEWMTS_MCI_OK);
  assert(allnewmts_mci_test_set_beta_hashes(client, file_hash,
                                            endpoint_hash) ==
         ALLNEWMTS_MCI_OK);
  assert(allnewmts_mci_probe_beta(
             client, reinterpret_cast<const uint8_t *>(ip_dat.data()),
             ip_dat.size()) == ALLNEWMTS_MCI_OK);
  assert(probe.open_count == 1 && probe.close_count == 1 &&
         probe.wait_count == 0 && probe.authenticate_count == 0);
  assert(allnewmts_mci_session(client, &parsed, &generation) ==
         ALLNEWMTS_MCI_NOT_READY);
  allnewmts_mci_destroy(client);
  assert(probe.close_count == 1);

  Fake quote;
  quote.reads = {initResponse(), gd1000q1Response()};
  client = nullptr;
  assert(allnewmts_mci_create("CC320", &callbacks, &quote, &client) ==
         ALLNEWMTS_MCI_OK);
  assert(allnewmts_mci_test_set_beta_hashes(client, file_hash,
                                            endpoint_hash) ==
         ALLNEWMTS_MCI_OK);
  assert(allnewmts_mci_probe_beta_gd1000q1(
             client, reinterpret_cast<const uint8_t *>(ip_dat.data()),
             ip_dat.size()) == ALLNEWMTS_MCI_OK);
  assert(quote.open_count == 1 && quote.close_count == 1 &&
         quote.authenticate_count == 0 && quote.writes.size() == 2);
  quote_request_size = 0;
  assert(allnewmts_mci_build_gd1000q1_request(
             "CC320", &parsed, "0000000001", quote_request.data(),
             quote_request.size(), &quote_request_size) ==
         ALLNEWMTS_MCI_OK);
  assert(quote.writes[1] == std::vector<uint8_t>(
                                 quote_request.begin(),
                                 quote_request.begin() + quote_request_size));
  assert(allnewmts_mci_session(client, &parsed, &generation) ==
         ALLNEWMTS_MCI_NOT_READY);
  allnewmts_mci_destroy(client);
  assert(quote.close_count == 1);

  Fake realtime_probe;
  realtime_probe.reads = {initResponse(), s00Push(71500)};
  client = nullptr;
  assert(allnewmts_mci_create("CC320", &callbacks, &realtime_probe, &client) ==
         ALLNEWMTS_MCI_OK);
  assert(allnewmts_mci_test_set_beta_hashes(client, file_hash,
                                            endpoint_hash) ==
         ALLNEWMTS_MCI_OK);
  AllNewMTSMciRealtimeQuote realtime_quote{};
  assert(allnewmts_mci_probe_beta_s00_005930(
             client, reinterpret_cast<const uint8_t *>(ip_dat.data()),
             ip_dat.size(), &realtime_quote) == ALLNEWMTS_MCI_OK);
  assert(realtime_probe.open_count == 1 && realtime_probe.close_count == 1 &&
         realtime_probe.authenticate_count == 0 &&
         realtime_probe.writes.size() == 3);
  assert(realtime_probe.writes[1][8] == '0' &&
         realtime_probe.writes[2][8] == '1' &&
         realtime_quote.current_price == 71500 &&
         std::strcmp(realtime_quote.trade_time, "134501") == 0);
  allnewmts_mci_destroy(client);
  assert(realtime_probe.close_count == 1);

  Fake legacy_realtime_probe;
  legacy_realtime_probe.reads = {initResponse(), s00Push(71500, 118)};
  client = nullptr;
  assert(allnewmts_mci_create("CC320", &callbacks, &legacy_realtime_probe,
                              &client) == ALLNEWMTS_MCI_OK);
  assert(allnewmts_mci_test_set_beta_hashes(client, file_hash,
                                            endpoint_hash) ==
         ALLNEWMTS_MCI_OK);
  assert(allnewmts_mci_probe_beta_s00_005930(
             client, reinterpret_cast<const uint8_t *>(ip_dat.data()),
             ip_dat.size(), &realtime_quote) ==
         ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID);
  assert(legacy_realtime_probe.writes.size() == 3 &&
         legacy_realtime_probe.writes[2][8] == '1');
  allnewmts_mci_destroy(client);

  Fake denied;
  denied.authenticate_ok = false;
  denied.reads = fragmentedReads();
  client = nullptr;
  assert(allnewmts_mci_create("ABCDE", &callbacks, &denied, &client) ==
         ALLNEWMTS_MCI_OK);
  assert(allnewmts_mci_test_set_beta_hashes(client, file_hash,
                                            endpoint_hash) ==
         ALLNEWMTS_MCI_OK);
  assert(allnewmts_mci_connect_beta(
             client, reinterpret_cast<const uint8_t *>(ip_dat.data()),
             ip_dat.size()) == ALLNEWMTS_MCI_AUTH_FAILED);
  assert(denied.open_count == 6 && denied.close_count == 6 &&
         denied.wait_count == 5);
  assert(allnewmts_mci_session(client, &parsed, &generation) ==
         ALLNEWMTS_MCI_NOT_READY);
  allnewmts_mci_destroy(client);

  Fake timed_out;
  timed_out.reads = {std::vector<uint8_t>{'0', '0', '0'}};
  timed_out.read_advance = ALLNEWMTS_MCI_COMMAND_TIMEOUT_MS;
  client = nullptr;
  assert(allnewmts_mci_create("ABCDE", &callbacks, &timed_out, &client) ==
         ALLNEWMTS_MCI_OK);
  assert(allnewmts_mci_test_set_beta_hashes(client, file_hash,
                                            endpoint_hash) ==
         ALLNEWMTS_MCI_OK);
  assert(allnewmts_mci_connect_beta(
             client, reinterpret_cast<const uint8_t *>(ip_dat.data()),
             ip_dat.size()) == ALLNEWMTS_MCI_TRANSPORT_ERROR);
  assert(timed_out.open_count == 6 && timed_out.close_count == 6 &&
         timed_out.wait_count == 5);
  allnewmts_mci_destroy(client);

  int listener = ::socket(AF_INET, SOCK_STREAM, 0);
  assert(listener >= 0);
  sockaddr_in local{};
  local.sin_family = AF_INET;
  local.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  assert(bind(listener, reinterpret_cast<sockaddr *>(&local), sizeof(local)) ==
         0);
  socklen_t local_size = sizeof(local);
  assert(getsockname(listener, reinterpret_cast<sockaddr *>(&local),
                     &local_size) == 0);
  assert(listen(listener, 1) == 0);
  std::thread server([listener] {
    int peer = accept(listener, nullptr, nullptr);
    assert(peer >= 0);
    uint8_t received[4];
    size_t total = 0;
    while (total < sizeof(received)) {
      ssize_t amount =
          recv(peer, received + total, sizeof(received) - total, 0);
      assert(amount > 0);
      total += static_cast<size_t>(amount);
    }
    assert(std::memcmp(received, "ping", sizeof(received)) == 0);
    assert(send(peer, "pong", 4, 0) == 4);
    ::close(peer);
  });
  AllNewMTSMciTransport socket_callbacks{};
  void *socket_context = nullptr;
  assert(allnewmts_mci_socket_create(allowAuthentication, nullptr,
                                     &socket_callbacks, &socket_context) ==
         ALLNEWMTS_MCI_OK);
  assert(socket_callbacks.open(socket_context, "127.0.0.1",
                               ntohs(local.sin_port), 1000, 1));
  assert(socket_callbacks.write(
      socket_context, reinterpret_cast<const uint8_t *>("ping"), 4, 1000, 1));
  uint8_t reply[4];
  size_t reply_size = 0;
  assert(socket_callbacks.read(socket_context, reply, sizeof(reply),
                               &reply_size, 1000, 1));
  assert(reply_size == 4 && std::memcmp(reply, "pong", 4) == 0);
  assert(socket_callbacks.authenticate(socket_context, &parsed, 1));
  socket_callbacks.close(socket_context, 1);
  allnewmts_mci_socket_destroy(socket_context);
  server.join();
  ::close(listener);

  std::cout << "PASS MCI beta preflight, init/X/normal framing, SFID "
               "decoding, realtime, polling, auth gate, retry, and loopback TCP\n";
}
