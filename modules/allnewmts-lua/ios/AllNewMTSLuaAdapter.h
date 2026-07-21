#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface AllNewMTSLuaAdapter : NSObject

- (BOOL)create;
- (nullable NSString *)evaluate:(NSString *)source error:(NSError **)error;
- (void)destroy;

@end

NS_ASSUME_NONNULL_END
