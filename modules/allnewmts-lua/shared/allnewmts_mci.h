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
  char selected_private_ip[33];
  char handle[9];
  char date[9];
  char time[13];
  char type[2];
  char ip[33];
} AllNewMTSMciSession;

typedef struct {
  size_t offset;
  size_t size;
} AllNewMTSMciSfidValue;

typedef struct {
  size_t record_count;
  size_t value_count;
  size_t continuation_offset;
  size_t continuation_size;
  size_t payload_size;
  uint8_t mode;
  uint8_t page_state;
} AllNewMTSMciSfidDecoded;

typedef struct {
  char fid[5];
  const uint8_t *value;
  size_t value_size;
} AllNewMTSMciSfidInput;

typedef struct {
  char fid[5];
  uint8_t attribute;
} AllNewMTSMciSfidOutput;

typedef struct {
  uint32_t record_count;
  uint32_t selector_value;
  uint8_t mode;
  uint8_t selector_order;
  const uint8_t *continuation_key;
  size_t continuation_size;
} AllNewMTSMciSfidOccurrence;

enum {
  ALLNEWMTS_MCI_SFID_SELECTOR_VALUE_THEN_COUNT = 0,
  ALLNEWMTS_MCI_SFID_SELECTOR_COUNT_THEN_VALUE = 1
};

typedef struct {
  uint8_t command;
  char request_id[5];
  uint8_t interface_id;
  char hts_id[11];
  char private_identity[33];
  const uint8_t *body;
  size_t body_size;
} AllNewMTSMciCommandRequest;

typedef struct {
  uint8_t command;
  char request_id[5];
  uint8_t interface_id;
  uint8_t response_code;
  size_t body_offset;
  size_t body_size;
} AllNewMTSMciCommandResponse;

typedef struct {
  char transaction_id[9];
  char request_id[5];
  uint8_t interface_id;
  char hts_id[11];
  char private_identity[33];
  const uint8_t *body;
  size_t body_size;
} AllNewMTSMciTransactionRequest;

typedef struct {
  char transaction_id[9];
  char request_id[5];
  uint8_t interface_id;
  uint8_t response_code;
  uint8_t message_output_type;
  char message_code[10];
  char supplemental_message_code[10];
  size_t body_offset;
  size_t body_size;
} AllNewMTSMciTransactionResponse;

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

uint32_t allnewmts_mci_build_sfid_body(
    const char gid[5], const AllNewMTSMciSfidInput *inputs,
    size_t input_count, const AllNewMTSMciSfidOutput *outputs,
    size_t output_count, uint8_t *output, size_t output_capacity,
    size_t *output_size);

uint32_t allnewmts_mci_build_sfid_occurrence_body(
    const char gid[5], const AllNewMTSMciSfidInput *inputs,
    size_t input_count, const AllNewMTSMciSfidOccurrence *occurrence,
    const AllNewMTSMciSfidOutput *outputs, size_t output_count,
    uint8_t *output, size_t output_capacity, size_t *output_size);

uint32_t allnewmts_mci_build_transaction_request(
    const char channel_detail[5], const AllNewMTSMciSession *session,
    const char request_nonce[10],
    const AllNewMTSMciTransactionRequest *request, uint8_t *output,
    size_t output_capacity, size_t *output_size);

uint32_t allnewmts_mci_build_command_request(
    const char channel_detail[5], const AllNewMTSMciSession *session,
    const char request_nonce[10], const AllNewMTSMciCommandRequest *request,
    uint8_t *output, size_t output_capacity, size_t *output_size);

uint32_t allnewmts_mci_parse_command_response(
    const uint8_t *frame, size_t frame_size,
    const AllNewMTSMciSession *session,
    AllNewMTSMciCommandResponse *response);

uint32_t allnewmts_mci_parse_transaction_response(
    const uint8_t *frame, size_t frame_size,
    const AllNewMTSMciSession *session,
    AllNewMTSMciTransactionResponse *response);

uint32_t allnewmts_mci_build_gd1000q1_request(
    const char channel_detail[5], const AllNewMTSMciSession *session,
    const char request_nonce[10], uint8_t *output, size_t output_capacity,
    size_t *output_size);

uint32_t allnewmts_mci_decode_sfid_body(
    const uint8_t *body, size_t body_size, const char gid[5],
    const char output_fids[][5], size_t output_count,
    AllNewMTSMciSfidValue *values, size_t value_capacity,
    AllNewMTSMciSfidDecoded *decoded);

uint32_t allnewmts_mci_decode_sfid_occurrence_body(
    const uint8_t *body, size_t body_size, const char gid[5],
    const char output_fids[][5], size_t output_count,
    AllNewMTSMciSfidValue *values, size_t value_capacity,
    AllNewMTSMciSfidDecoded *decoded);

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
