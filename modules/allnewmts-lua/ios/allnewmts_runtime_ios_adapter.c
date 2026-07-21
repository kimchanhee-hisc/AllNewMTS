#include "allnewmts_runtime_adapters.h"

AllNewMTSRuntimeResult allnewmts_runtime_ios_create(
    const uint8_t *bytes, size_t size, AllNewMTSRuntimeOutputSink sink,
    AllNewMTSRuntimeReleaseContext release_context, void *context) {
  return allnewmts_runtime_create(bytes, size, sink, release_context, context);
}

AllNewMTSRuntimeResult allnewmts_runtime_ios_dispatch(
    uint64_t runtime_id, const uint8_t *bytes, size_t size) {
  return allnewmts_runtime_dispatch(runtime_id, bytes, size);
}

AllNewMTSRuntimeResult allnewmts_runtime_ios_destroy(uint64_t runtime_id) {
  return allnewmts_runtime_destroy(runtime_id);
}
