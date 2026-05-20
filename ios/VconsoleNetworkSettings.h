#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface VconsoleNetworkSettings : NSObject

+ (void)install;
+ (void)updateWithConfig:(NSDictionary *)config;

+ (BOOL)isCustomDNSEnabled;
+ (BOOL)isCustomHeadersEnabled;
+ (BOOL)hasActiveCustomHandling;
+ (NSDictionary<NSString *, NSString *> *)customDNSRules;
+ (NSDictionary<NSString *, NSString *> *)customHeaders;

@end

NS_ASSUME_NONNULL_END
