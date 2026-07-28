#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^AllNewMTSRuntimeEmit)(NSString *runtimeId, NSString *canonicalJSON);

@interface AllNewMTSRuntimeAdapter : NSObject
@property(nonatomic, copy, nullable) AllNewMTSRuntimeEmit emit;
- (NSDictionary<NSString *, NSString *> *)create:(NSString *)config;
- (NSDictionary<NSString *, NSString *> *)dispatch:(NSString *)runtimeId event:(NSString *)event;
- (NSDictionary<NSString *, NSString *> *)destroy:(NSString *)runtimeId;
@end

NS_ASSUME_NONNULL_END
