#import <Foundation/Foundation.h>

#import "AllNewMTSRuntimeAdapter.h"

#include <cstdio>
#include <cstdlib>

int main(int argc, char **argv) {
  if (argc != 4) return 2;
  @autoreleasepool {
    NSString *config = [NSString stringWithUTF8String:argv[1]];
    NSString *event = [NSString stringWithUTF8String:argv[2]];
    NSString *expected = [NSString stringWithUTF8String:argv[3]];
    __block AllNewMTSRuntimeAdapter *adapter = [[AllNewMTSRuntimeAdapter alloc] init];
    __weak AllNewMTSRuntimeAdapter *weakAdapter = adapter;
    adapter.emit = ^(NSString *runtimeId, NSString *canonicalJSON) {
      if (![runtimeId isEqualToString:@"1"] || ![canonicalJSON isEqualToString:expected]) std::abort();
      AllNewMTSRuntimeAdapter *strongAdapter = weakAdapter;
      if (!strongAdapter) std::abort();
      NSDictionary<NSString *, NSString *> *destroyed = [strongAdapter destroy:runtimeId];
      if (![destroyed[@"code"] isEqualToString:@"OK"]) std::abort();
      strongAdapter.emit = nil;
      std::fwrite(canonicalJSON.UTF8String, 1, [canonicalJSON lengthOfBytesUsingEncoding:NSUTF8StringEncoding], stdout);
      std::fputc('\n', stdout);
      std::fflush(stdout);
      std::_Exit(0);
    };
    NSDictionary<NSString *, NSString *> *created = [adapter create:config];
    if (![created[@"code"] isEqualToString:@"OK"] || ![created[@"runtimeId"] isEqualToString:@"1"]) return 3;
    NSDictionary<NSString *, NSString *> *admitted = [adapter dispatch:created[@"runtimeId"] event:event];
    if (![admitted[@"code"] isEqualToString:@"OK"] || ![admitted[@"reservedRevision"] isEqualToString:@"1"]) return 4;
    dispatch_main();
  }
}
