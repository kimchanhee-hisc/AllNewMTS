#ifndef ALLNEWMTS_MCI_H
#define ALLNEWMTS_MCI_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
  ALLNEWMTS_MCI_OK = 0,
  ALLNEWMTS_MCI_INVALID_ARGUMENT = 1,
  ALLNEWMTS_MCI_BETA_SOURCE_MISMATCH = 2,
  ALLNEWMTS_MCI_BETA_ENDPOINT_INVALID = 3,
  ALLNEWMTS_MCI_TRANSPORT_ERROR = 4,
  ALLNEWMTS_MCI_FRAME_INVALID = 5,
  ALLNEWMTS_MCI_INIT_INVALID = 6,
  ALLNEWMTS_MCI_AUTH_FAILED = 7,
  ALLNEWMTS_MCI_NOT_READY = 8,
  ALLNEWMTS_MCI_RESOURCE_LIMIT = 9,
  ALLNEWMTS_MCI_TRANSACTION_REJECTED = 10,
  ALLNEWMTS_MCI_TRANSACTION_INVALID = 11,
  ALLNEWMTS_MCI_TRANSACTION_BODY_INVALID = 12
};

enum {
  ALLNEWMTS_MCI_CONNECT_TIMEOUT_MS = 15000,
  ALLNEWMTS_MCI_COMMAND_TIMEOUT_MS = 5000,
  ALLNEWMTS_MCI_TRANSACTION_TIMEOUT_MS = 30000,
  ALLNEWMTS_MCI_RETRY_DELAY_MS = 1000,
  ALLNEWMTS_MCI_AUTOMATIC_RETRIES = 5,
  ALLNEWMTS_MCI_REQUEST_HEADER_SIZE = 321,
  ALLNEWMTS_MCI_RESPONSE_HEADER_SIZE = 500,
  ALLNEWMTS_MCI_INIT_BODY_SIZE = 125,
  ALLNEWMTS_MCI_MAX_FRAME_SIZE = 7423
};

typedef struct AllNewMTSMciClient AllNewMTSMciClient;

typedef struct {
  char host[254];
  uint16_t port;
} AllNewMTSMciEndpoint;

typedef struct {
  char public_ip[33];
  char private_ip[33];
  char handle[9];
  char date[9];
  char time[13];
  char type[2];
  char ip[33];
} AllNewMTSMciSession;

typedef struct {
  int (*open)(void *context, const char *host, uint16_t port,
              uint32_t timeout_ms, uint64_t generation);
  int (*write)(void *context, const uint8_t *bytes, size_t size,
               uint32_t timeout_ms, uint64_t generation);
  int (*read)(void *context, uint8_t *bytes, size_t capacity, size_t *size,
              uint32_t timeout_ms, uint64_t generation);
  int (*authenticate)(void *context, const AllNewMTSMciSession *session,
                      uint64_t generation);
  void (*close)(void *context, uint64_t generation);
  void (*wait)(void *context, uint32_t delay_ms);
  uint64_t (*now_ms)(void *context);
} AllNewMTSMciTransport;

uint32_t allnewmts_mci_create(const char channel_detail[5],
                              const AllNewMTSMciTransport *transport,
                              void *context, AllNewMTSMciClient **client);

uint32_t allnewmts_mci_connect_beta(AllNewMTSMciClient *client,
                                    const uint8_t *ip_dat,
                                    size_t ip_dat_size);

uint32_t allnewmts_mci_probe_beta(AllNewMTSMciClient *client,
                                  const uint8_t *ip_dat,
                                  size_t ip_dat_size);

uint32_t allnewmts_mci_probe_beta_gd1000q1(
    AllNewMTSMciClient *client, const uint8_t *ip_dat, size_t ip_dat_size);

uint32_t allnewmts_mci_preflight_beta(const uint8_t *ip_dat,
                                      size_t ip_dat_size,
                                      AllNewMTSMciEndpoint *endpoint);

uint32_t allnewmts_mci_session(const AllNewMTSMciClient *client,
                               AllNewMTSMciSession *session,
                               uint64_t *generation);

void allnewmts_mci_destroy(AllNewMTSMciClient *client);

uint32_t allnewmts_mci_build_init_request(const char channel_detail[5],
                                          uint8_t output[321]);

uint32_t allnewmts_mci_parse_init_response(
    const uint8_t *frame, size_t frame_size, AllNewMTSMciSession *session);

uint32_t allnewmts_mci_build_gd1000q1_request(
    const char channel_detail[5], const AllNewMTSMciSession *session,
    const char request_nonce[10], uint8_t *output, size_t output_capacity,
    size_t *output_size);

uint32_t allnewmts_mci_parse_gd1000q1_response(
    const uint8_t *frame, size_t frame_size,
    const AllNewMTSMciSession *session);

#ifdef ALLNEWMTS_MCI_TESTING
uint32_t allnewmts_mci_test_preflight_beta(
    const uint8_t *ip_dat, size_t ip_dat_size,
    const uint8_t expected_file_sha256[32],
    const uint8_t expected_endpoint_sha256[32],
    AllNewMTSMciEndpoint *endpoint);
uint32_t allnewmts_mci_test_set_beta_hashes(
    AllNewMTSMciClient *client, const uint8_t expected_file_sha256[32],
    const uint8_t expected_endpoint_sha256[32]);
#endif

#ifdef __cplusplus
}
#endif

#endif
