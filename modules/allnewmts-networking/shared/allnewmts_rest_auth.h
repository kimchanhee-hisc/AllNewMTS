#ifndef ALLNEWMTS_REST_AUTH_H
#define ALLNEWMTS_REST_AUTH_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
  ALLNEWMTS_REST_AUTH_OK = 0,
  ALLNEWMTS_REST_AUTH_INVALID_ARGUMENT = 1,
  ALLNEWMTS_REST_AUTH_TRANSPORT_ERROR = 2,
  ALLNEWMTS_REST_AUTH_HTTP_ERROR = 3,
  ALLNEWMTS_REST_AUTH_RESPONSE_INVALID = 4,
  ALLNEWMTS_REST_AUTH_REJECTED = 5,
  ALLNEWMTS_REST_AUTH_NOT_READY = 6,
  ALLNEWMTS_REST_AUTH_RESOURCE_LIMIT = 7
};

enum {
  ALLNEWMTS_REST_AUTH_ROUNDS = 4,
  ALLNEWMTS_REST_AUTH_FRESH_MS = 300000,
  ALLNEWMTS_REST_AUTH_MAX_RESPONSE_SIZE = 8192,
  ALLNEWMTS_REST_AUTH_MAX_ACCESS_KEY_SIZE = 1024,
  ALLNEWMTS_REST_AUTH_MAX_ACCESS_TOKEN_SIZE = 4096,
  ALLNEWMTS_REST_TRANSACTION_TIMEOUT_MS = 30000,
  ALLNEWMTS_REST_TRANSACTION_MAX_BODY_SIZE = 262144,
  ALLNEWMTS_REST_TRANSACTION_MAX_RESPONSE_SIZE = 262144,
  ALLNEWMTS_REST_TRANSACTION_MAX_FIELDS = 1024
};

typedef struct AllNewMTSRestAuth AllNewMTSRestAuth;

typedef struct {
  const char *name;
  const char *value;
} AllNewMTSRestAuthHeader;

typedef struct {
  const char *path;
  const AllNewMTSRestAuthHeader *headers;
  size_t header_count;
  const uint8_t *body;
  size_t body_size;
  uint32_t timeout_ms;
} AllNewMTSRestAuthRequest;

typedef struct {
  int (*post)(void *context, const AllNewMTSRestAuthRequest *request,
              uint16_t *http_status, uint8_t *response,
              size_t response_capacity, size_t *response_size);
  uint64_t (*now_ms)(void *context);
} AllNewMTSRestAuthTransport;

typedef struct {
  char access_key[ALLNEWMTS_REST_AUTH_MAX_ACCESS_KEY_SIZE];
  char access_token[ALLNEWMTS_REST_AUTH_MAX_ACCESS_TOKEN_SIZE];
  uint64_t generation;
  uint64_t issued_at_ms;
} AllNewMTSRestCredentials;

typedef struct {
  const char *name;
  size_t maximum_size;
} AllNewMTSRestTransactionField;

typedef struct {
  const char *name;
  const uint8_t *value;
  size_t value_size;
} AllNewMTSRestTransactionInput;

typedef struct {
  const char *name;
  char *value;
  size_t value_capacity;
  size_t value_size;
  int present;
} AllNewMTSRestTransactionOutput;

typedef struct {
  const char *transaction_id;
  const char *input_block;
  const char *output_block;
  const AllNewMTSRestTransactionField *input_fields;
  size_t input_field_count;
  const AllNewMTSRestTransactionField *output_fields;
  size_t output_field_count;
  int read_only;
} AllNewMTSRestTransactionSchema;

uint32_t allnewmts_rest_auth_create(
    const char channel_detail[6], const char *client_id, const char *auth_key,
    const char *hts_id, const AllNewMTSRestAuthTransport *transport,
    void *context, AllNewMTSRestAuth **manager);

uint32_t allnewmts_rest_auth_prepare(AllNewMTSRestAuth *manager,
                                     int force_issue,
                                     AllNewMTSRestCredentials *credentials);

uint32_t allnewmts_rest_auth_unauthorized(
    AllNewMTSRestAuth *manager, uint64_t credential_generation,
    uint16_t http_status, AllNewMTSRestCredentials *credentials);

uint32_t allnewmts_rest_auth_snapshot(
    AllNewMTSRestAuth *manager, AllNewMTSRestCredentials *credentials);

uint32_t allnewmts_rest_transaction_call(
    AllNewMTSRestAuth *manager,
    const AllNewMTSRestTransactionSchema *schema,
    const AllNewMTSRestTransactionInput *inputs, size_t input_count,
    const char *screen_filename, AllNewMTSRestTransactionOutput *outputs,
    size_t output_count);

void allnewmts_rest_auth_destroy(AllNewMTSRestAuth *manager);

#ifdef __cplusplus
}
#endif

#endif
