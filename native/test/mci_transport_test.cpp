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
  const std::vector<uint8_t> body = {
      0x1f, '0', '0', '0', '4', 0x7f, '7', '0', '0', '0', '0', 0x1f};
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
  std::copy(body.begin(), body.end(),
            frame.begin() + ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE);
  return frame;
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
  assert(std::strcmp(parsed.date, "20260129") == 0);
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

  std::array<uint8_t, ALLNEWMTS_MCI_MAX_FRAME_SIZE> quote_request{};
  size_t quote_request_size = 0;
  assert(allnewmts_mci_build_gd1000q1_request(
             "CC320", &parsed, "0000000001", quote_request.data(),
             quote_request.size(), &quote_request_size) ==
         ALLNEWMTS_MCI_OK);
  assert(quote_request_size == 379);
  assert(std::string(reinterpret_cast<char *>(quote_request.data() + 43), 8) ==
         "CC3CC320");
  assert(std::string(reinterpret_cast<char *>(quote_request.data() + 57), 32) ==
         "MCI00001202601291201020000000001");
  assert(std::string(reinterpret_cast<char *>(quote_request.data() + 89), 8) ==
         "GD1000Q1");
  const std::vector<uint8_t> quote_body = {
      0x1f, '9', '0', '0', '1', 0x7f, 'J',
      0x1e, '9', '0', '0', '2', 0x7f, '0', '0', '5', '9', '3', '0',
      0x1e, 'G', 'I', 'D', 0x7f, '1', '0', '0', '0',
      0x1e, '$', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0',
      '1', '0', '@', '0', '0', '0',
      0x1e, '0', '0', '0', '9',
      0x1e, '0', '0', '0', '4', 0x1f};
  assert(std::vector<uint8_t>(
             quote_request.begin() + ALLNEWMTS_MCI_REQUEST_HEADER_SIZE,
             quote_request.begin() + quote_request_size) == quote_body);
  assert(allnewmts_mci_build_gd1000q1_request(
             "CC320", &parsed, "bad-nonce!", quote_request.data(),
             quote_request.size(), &quote_request_size) ==
         ALLNEWMTS_MCI_INVALID_ARGUMENT);
  std::vector<uint8_t> quote_response = gd1000q1Response();
  assert(allnewmts_mci_parse_gd1000q1_response(
             quote_response.data(), quote_response.size(), &parsed) ==
         ALLNEWMTS_MCI_OK);
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

  std::cout << "PASS MCI beta preflight, init/GD1000Q1 framing, polling, "
               "auth gate, retry, and loopback TCP\n";
}
