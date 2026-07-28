#import "AllNewMTSRuntimeAdapter.h"

#include "allnewmts_runtime_adapters.h"

static uint64_t ParseRuntimeId(NSString *value, BOOL *ok) {
  NSData *bytes = [value dataUsingEncoding:NSUTF8StringEncoding];
  uint64_t parsed = 0;
  *ok = allnewmts_runtime_adapter_parse_id((const uint8_t *)bytes.bytes, bytes.length, &parsed) == ALLNEWMTS_RUNTIME_OK;
  return *ok ? parsed : 0;
}

static NSDictionary<NSString *, NSString *> *Result(AllNewMTSRuntimeResult result) {
  return @{
    @"code": [NSString stringWithUTF8String:allnewmts_runtime_result_name(result.code)],
    @"runtimeId": [NSString stringWithFormat:@"%llu", result.runtime_id],
    @"reservedRevision": [NSString stringWithFormat:@"%llu", result.reserved_revision]
  };
}

static void Output(void *context, uint64_t runtimeId, const uint8_t *bytes, size_t size) {
  AllNewMTSRuntimeAdapter *adapter = (__bridge AllNewMTSRuntimeAdapter *)context;
  NSData *copy = [NSData dataWithBytes:bytes length:size];
  NSString *json = [[NSString alloc] initWithData:copy encoding:NSUTF8StringEncoding];
  NSString *identifier = [NSString stringWithFormat:@"%llu", runtimeId];
  dispatch_async(dispatch_get_main_queue(), ^{ if (adapter.emit && json) adapter.emit(identifier, json); });
}

static void Release(void *context) { CFBridgingRelease(context); }

@implementation AllNewMTSRuntimeAdapter
- (NSDictionary<NSString *, NSString *> *)create:(NSString *)config {
  NSData *bytes = [config dataUsingEncoding:NSUTF8StringEncoding];
  void *context = (__bridge_retained void *)self;
  AllNewMTSRuntimeResult result = allnewmts_runtime_ios_create((const uint8_t *)bytes.bytes, bytes.length, Output, Release, context);
  if (result.code != ALLNEWMTS_RUNTIME_OK) CFBridgingRelease(context);
  return Result(result);
}
- (NSDictionary<NSString *, NSString *> *)dispatch:(NSString *)runtimeId event:(NSString *)event {
  BOOL ok = NO; uint64_t identifier = ParseRuntimeId(runtimeId, &ok);
  if (!ok) return Result((AllNewMTSRuntimeResult){ALLNEWMTS_RUNTIME_INVALID_ARGUMENT, 0, 0});
  NSData *bytes = [event dataUsingEncoding:NSUTF8StringEncoding];
  return Result(allnewmts_runtime_ios_dispatch(identifier, (const uint8_t *)bytes.bytes, bytes.length));
}
- (NSDictionary<NSString *, NSString *> *)destroy:(NSString *)runtimeId {
  BOOL ok = NO; uint64_t identifier = ParseRuntimeId(runtimeId, &ok);
  if (!ok) return Result((AllNewMTSRuntimeResult){ALLNEWMTS_RUNTIME_INVALID_ARGUMENT, 0, 0});
  return Result(allnewmts_runtime_ios_destroy(identifier));
}
@end
