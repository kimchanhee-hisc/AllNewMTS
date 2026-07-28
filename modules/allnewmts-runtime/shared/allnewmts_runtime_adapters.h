#ifndef ALLNEWMTS_RUNTIME_ADAPTERS_H
#define ALLNEWMTS_RUNTIME_ADAPTERS_H

#include "allnewmts_runtime.h"

#ifdef __cplusplus
extern "C" {
#endif

uint32_t allnewmts_runtime_adapter_parse_id(const uint8_t *, size_t, uint64_t *);

AllNewMTSRuntimeResult allnewmts_runtime_ios_create(
    const uint8_t *, size_t, AllNewMTSRuntimeOutputSink,
    AllNewMTSRuntimeReleaseContext, void *);
AllNewMTSRuntimeResult allnewmts_runtime_ios_dispatch(uint64_t,
                                                       const uint8_t *, size_t);
AllNewMTSRuntimeResult allnewmts_runtime_ios_destroy(uint64_t);

AllNewMTSRuntimeResult allnewmts_runtime_android_create(
    const uint8_t *, size_t, AllNewMTSRuntimeOutputSink,
    AllNewMTSRuntimeReleaseContext, void *);
AllNewMTSRuntimeResult allnewmts_runtime_android_dispatch(uint64_t,
                                                           const uint8_t *, size_t);
AllNewMTSRuntimeResult allnewmts_runtime_android_destroy(uint64_t);

#ifdef __cplusplus
}
#endif

#endif
