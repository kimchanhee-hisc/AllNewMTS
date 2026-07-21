#ifndef ALLNEWMTS_RUNTIME_H
#define ALLNEWMTS_RUNTIME_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
  uint32_t code;
  uint64_t runtime_id;
  uint64_t reserved_revision;
} AllNewMTSRuntimeResult;

typedef void (*AllNewMTSRuntimeOutputSink)(void *context,
                                           uint64_t runtime_id,
                                           const uint8_t *canonical_json,
                                           size_t canonical_json_size);
typedef void (*AllNewMTSRuntimeReleaseContext)(void *context);

enum {
  ALLNEWMTS_RUNTIME_OK = 0,
  ALLNEWMTS_RUNTIME_INVALID_ARGUMENT = 1,
  ALLNEWMTS_RUNTIME_RESOURCE_LIMIT = 2,
  ALLNEWMTS_RUNTIME_RESOURCE_NOT_FOUND = 3,
  ALLNEWMTS_RUNTIME_RESOURCE_HASH_MISMATCH = 4,
  ALLNEWMTS_RUNTIME_LOAD_ERROR = 5,
  ALLNEWMTS_RUNTIME_NOT_FOUND = 6,
  ALLNEWMTS_RUNTIME_CLOSING = 7,
  ALLNEWMTS_RUNTIME_CLOSED = 8,
  ALLNEWMTS_RUNTIME_INVALID = 9,
  ALLNEWMTS_RUNTIME_STALE_REVISION = 10,
  ALLNEWMTS_RUNTIME_QUEUE_LIMIT = 11,
  ALLNEWMTS_RUNTIME_WRONG_RUNTIME = 12,
  ALLNEWMTS_RUNTIME_WRONG_TRANSACTION = 13,
  ALLNEWMTS_RUNTIME_DUPLICATE_CALLBACK = 14,
  ALLNEWMTS_RUNTIME_LATE_CALLBACK = 15,
  ALLNEWMTS_RUNTIME_CANCELED_CALLBACK = 16,
  ALLNEWMTS_RUNTIME_REENTRANT_CALL = 17
};

AllNewMTSRuntimeResult allnewmts_runtime_create(
    const uint8_t *config_json,
    size_t config_json_size,
    AllNewMTSRuntimeOutputSink sink,
    AllNewMTSRuntimeReleaseContext release_context,
    void *context);

AllNewMTSRuntimeResult allnewmts_runtime_dispatch(
    uint64_t runtime_id,
    const uint8_t *event_json,
    size_t event_json_size);

AllNewMTSRuntimeResult allnewmts_runtime_destroy(uint64_t runtime_id);

const char *allnewmts_runtime_result_name(uint32_t code);

#ifdef ALLNEWMTS_RUNTIME_TESTING
typedef struct {
  size_t allocator_current;
  size_t allocator_peak;
  size_t committed_bytes;
  size_t staged_bytes;
  size_t staged_commands;
  size_t pending_events;
  size_t pending_bytes;
  size_t outstanding_tokens;
  size_t outstanding_token_bytes;
  size_t last_staged_bytes;
  size_t token_commit_copied_bytes;
} AllNewMTSRuntimeTestCounters;
int allnewmts_runtime_test_counters(uint64_t runtime_id,
                                    AllNewMTSRuntimeTestCounters *counters);
void allnewmts_runtime_test_next_lua_allocator_limit(size_t bytes);
int allnewmts_runtime_test_lua_allocator_limit(uint64_t runtime_id,
                                               size_t bytes);
int allnewmts_runtime_test_fail_next_native_allocation(uint64_t runtime_id,
                                                       uint32_t phase);
int allnewmts_runtime_test_instruction_limit_exceeded(uint64_t instructions);
int allnewmts_runtime_test_stage_charge(size_t charged, size_t bytes,
                                        size_t *result);
void allnewmts_runtime_test_set_next_runtime_id(uint64_t next_id);
void allnewmts_runtime_test_set_next_token_id(uint64_t next_id);
int allnewmts_runtime_test_pause_next_request(uint64_t runtime_id);
int allnewmts_runtime_test_wait_request_prepared(uint64_t runtime_id);
int allnewmts_runtime_test_resume_request(uint64_t runtime_id);
#endif

#ifdef __cplusplus
}
#endif

#endif
