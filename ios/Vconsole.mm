#import "Vconsole.h"
#import <UIKit/UIKit.h>

@implementation Vconsole
RCT_EXPORT_MODULE()

RCT_EXPORT_METHOD(getSystemInfo:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    @try {
        UIDevice *device = [UIDevice currentDevice];
        NSProcessInfo *processInfo = [NSProcessInfo processInfo];
        double totalMemory = (double)processInfo.physicalMemory;

        NSDictionary *payload = @{
            @"manufacturer": @"Apple",
            @"model": device.model ?: @"",
            @"osVersion": device.systemVersion ?: @"",
            @"networkType": @"unknown",
            @"isNetworkReachable": @(NO),
            @"totalMemory": @(totalMemory),
            @"availableMemory": @(0)
        };

        resolve(payload);
    } @catch (NSException *exception) {
        reject(@"SYSTEM_INFO_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(getAppInfo:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    @try {
        NSDictionary *infoDictionary =
            [[NSBundle mainBundle] infoDictionary];
        NSString *version =
            [infoDictionary objectForKey:@"CFBundleShortVersionString"] ?: @"";
        NSString *buildNumber =
            [infoDictionary objectForKey:@"CFBundleVersion"] ?: @"";

        NSDictionary *payload = @{
            @"appVersion": version,
            @"buildNumber": buildNumber
        };
        resolve(payload);
    } @catch (NSException *exception) {
        reject(@"APP_INFO_ERROR", exception.reason, nil);
    }
}

@end
