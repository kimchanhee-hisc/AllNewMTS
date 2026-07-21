#import "AllNewMTSLuaAdapter.h"

#include "allnewmts_lua_adapters.h"

@implementation AllNewMTSLuaAdapter {
  AllNewMTSLua *_runtime;
}

- (BOOL)create {
  [self destroy];
  _runtime = allnewmts_lua_ios_create();
  return _runtime != nullptr;
}

- (nullable NSString *)evaluate:(NSString *)source error:(NSError **)error {
  char result[4096] = {0};
  char message[4096] = {0};
  if (!allnewmts_lua_ios_evaluate(_runtime, source.UTF8String, result, sizeof(result), message, sizeof(message))) {
    if (error) {
      *error = [NSError errorWithDomain:@"AllNewMTSLua" code:1
                               userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithUTF8String:message]}];
    }
    return nil;
  }
  return [NSString stringWithUTF8String:result];
}

- (void)destroy {
  allnewmts_lua_ios_destroy(_runtime);
  _runtime = nullptr;
}

- (void)dealloc {
  [self destroy];
}

@end
