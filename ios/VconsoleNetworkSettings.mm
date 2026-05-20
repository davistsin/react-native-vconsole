#import "VconsoleNetworkSettings.h"

#import <Security/Security.h>

#import <React/RCTHTTPRequestHandler.h>

static NSString *const VconsoleHandledKey = @"VconsoleHandledKey";
static NSString *const VconsoleOriginalHostKey = @"VconsoleOriginalHostKey";

@interface VconsoleNetworkURLProtocol : NSURLProtocol <NSURLSessionDataDelegate>

@property (nonatomic, strong) NSURLSession *session;
@property (nonatomic, strong) NSURLSessionDataTask *task;
@property (nonatomic, copy) NSString *originalHost;

+ (NSURLSessionConfiguration *)sessionConfiguration;

@end

@implementation VconsoleNetworkSettings

static BOOL gCustomDNSEnabled = NO;
static BOOL gCustomHeadersEnabled = NO;
static NSDictionary<NSString *, NSString *> *gCustomDNSRules;
static NSDictionary<NSString *, NSString *> *gCustomHeaders;

+ (void)initialize
{
  if (self != [VconsoleNetworkSettings class]) {
    return;
  }

  gCustomDNSRules = @{};
  gCustomHeaders = @{};
}

+ (void)install
{
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    RCTSetCustomNSURLSessionConfigurationProvider(^NSURLSessionConfiguration * {
      return [VconsoleNetworkURLProtocol sessionConfiguration];
    });
  });
}

+ (void)updateWithConfig:(NSDictionary *)config
{
  NSDictionary *customDNS = [config[@"customDNS"] isKindOfClass:[NSDictionary class]] ? config[@"customDNS"] : @{};
  NSDictionary *customHeaders =
      [config[@"customHeaders"] isKindOfClass:[NSDictionary class]] ? config[@"customHeaders"] : @{};

  @synchronized(self) {
    gCustomDNSEnabled = [customDNS[@"enabled"] boolValue];
    gCustomHeadersEnabled = [customHeaders[@"enabled"] boolValue];
    gCustomDNSRules = [self normalizedDNSRules:customDNS[@"rules"]];
    gCustomHeaders = [self normalizedHeaders:customHeaders[@"headers"]];
  }
}

+ (BOOL)isCustomDNSEnabled
{
  @synchronized(self) {
    return gCustomDNSEnabled;
  }
}

+ (BOOL)isCustomHeadersEnabled
{
  @synchronized(self) {
    return gCustomHeadersEnabled;
  }
}

+ (BOOL)hasActiveCustomHandling
{
  @synchronized(self) {
    BOOL hasDNS = gCustomDNSEnabled && gCustomDNSRules.count > 0;
    BOOL hasHeaders = gCustomHeadersEnabled && gCustomHeaders.count > 0;
    return hasDNS || hasHeaders;
  }
}

+ (NSDictionary<NSString *,NSString *> *)customDNSRules
{
  @synchronized(self) {
    return gCustomDNSRules;
  }
}

+ (NSDictionary<NSString *,NSString *> *)customHeaders
{
  @synchronized(self) {
    return gCustomHeaders;
  }
}

+ (NSDictionary<NSString *, NSString *> *)normalizedDNSRules:(id)rules
{
  if (![rules isKindOfClass:[NSArray class]]) {
    return @{};
  }

  NSMutableDictionary<NSString *, NSString *> *result = [NSMutableDictionary new];
  for (id item in (NSArray *)rules) {
    if (![item isKindOfClass:[NSDictionary class]]) {
      continue;
    }
    NSString *domain = [[item[@"domain"] description] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    NSString *ip = [[item[@"ip"] description] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (domain.length == 0 || ip.length == 0) {
      continue;
    }
    result[domain.lowercaseString] = ip;
  }
  return result;
}

+ (NSDictionary<NSString *, NSString *> *)normalizedHeaders:(id)headers
{
  if (![headers isKindOfClass:[NSArray class]]) {
    return @{};
  }

  NSMutableDictionary<NSString *, NSString *> *result = [NSMutableDictionary new];
  for (id item in (NSArray *)headers) {
    if (![item isKindOfClass:[NSDictionary class]]) {
      continue;
    }
    NSString *key = [[item[@"key"] description] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    NSString *value = [[item[@"value"] description] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (key.length == 0) {
      continue;
    }
    result[key] = value;
  }
  return result;
}

@end

@implementation VconsoleNetworkURLProtocol

+ (BOOL)canInitWithRequest:(NSURLRequest *)request
{
  if ([NSURLProtocol propertyForKey:VconsoleHandledKey inRequest:request]) {
    return NO;
  }

  NSString *scheme = request.URL.scheme.lowercaseString;
  if (![scheme isEqualToString:@"http"] && ![scheme isEqualToString:@"https"]) {
    return NO;
  }

  NSString *host = request.URL.host.lowercaseString;
  BOOL shouldApplyHeaders = [VconsoleNetworkSettings isCustomHeadersEnabled] &&
      [VconsoleNetworkSettings customHeaders].count > 0;
  BOOL shouldApplyDNS = [VconsoleNetworkSettings isCustomDNSEnabled] &&
      host.length > 0 &&
      [VconsoleNetworkSettings customDNSRules][host] != nil;

  return shouldApplyHeaders || shouldApplyDNS;
}

+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request
{
  return request;
}

+ (NSURLSessionConfiguration *)sessionConfiguration
{
  NSDictionary *infoDictionary = [[NSBundle mainBundle] infoDictionary];
  NSNumber *useWifiOnly = [infoDictionary objectForKey:@"ReactNetworkForceWifiOnly"];

  NSURLSessionConfiguration *configuration = [NSURLSessionConfiguration defaultSessionConfiguration];
  if (useWifiOnly) {
    configuration.allowsCellularAccess = ![useWifiOnly boolValue];
  }
  configuration.HTTPShouldSetCookies = YES;
  configuration.HTTPCookieAcceptPolicy = NSHTTPCookieAcceptPolicyAlways;
  configuration.HTTPCookieStorage = [NSHTTPCookieStorage sharedHTTPCookieStorage];
  if ([VconsoleNetworkSettings hasActiveCustomHandling]) {
    configuration.protocolClasses = @[ self ];
  }
  return configuration;
}

+ (NSMutableURLRequest *)preparedRequestFromRequest:(NSURLRequest *)request
{
  NSMutableURLRequest *mutableRequest = [request mutableCopy];
  [NSURLProtocol setProperty:@YES forKey:VconsoleHandledKey inRequest:mutableRequest];

  NSDictionary<NSString *, NSString *> *headers = [VconsoleNetworkSettings customHeaders];
  if ([VconsoleNetworkSettings isCustomHeadersEnabled]) {
    [headers enumerateKeysAndObjectsUsingBlock:^(NSString *key, NSString *value, BOOL *stop) {
      [mutableRequest setValue:value forHTTPHeaderField:key];
    }];
  }

  if (![VconsoleNetworkSettings isCustomDNSEnabled]) {
    return mutableRequest;
  }

  NSString *host = request.URL.host.lowercaseString;
  NSString *mappedIP = [VconsoleNetworkSettings customDNSRules][host];
  if (mappedIP.length == 0) {
    return mutableRequest;
  }

  NSURLComponents *components = [NSURLComponents componentsWithURL:request.URL resolvingAgainstBaseURL:NO];
  if (components == nil) {
    return mutableRequest;
  }

  NSString *originalHost = request.URL.host ?: @"";
  components.host = mappedIP;
  if (components.URL != nil) {
    mutableRequest.URL = components.URL;
    [mutableRequest setValue:[self hostHeaderValueForURL:request.URL] forHTTPHeaderField:@"Host"];
    [NSURLProtocol setProperty:originalHost forKey:VconsoleOriginalHostKey inRequest:mutableRequest];
  }

  return mutableRequest;
}

+ (NSString *)hostHeaderValueForURL:(NSURL *)url
{
  if (url.port != nil) {
    return [NSString stringWithFormat:@"%@:%@", url.host ?: @"", url.port];
  }
  return url.host ?: @"";
}

- (void)startLoading
{
  NSMutableURLRequest *request = [[self class] preparedRequestFromRequest:self.request];
  self.originalHost = [NSURLProtocol propertyForKey:VconsoleOriginalHostKey inRequest:request];

  NSURLSessionConfiguration *configuration = [NSURLSessionConfiguration defaultSessionConfiguration];
  configuration.HTTPShouldSetCookies = YES;
  configuration.HTTPCookieAcceptPolicy = NSHTTPCookieAcceptPolicyAlways;
  configuration.HTTPCookieStorage = [NSHTTPCookieStorage sharedHTTPCookieStorage];

  self.session = [NSURLSession sessionWithConfiguration:configuration delegate:self delegateQueue:nil];
  self.task = [self.session dataTaskWithRequest:request];
  [self.task resume];
}

- (void)stopLoading
{
  [self.task cancel];
  [self.session invalidateAndCancel];
  self.task = nil;
  self.session = nil;
}

- (void)URLSession:(NSURLSession *)session
          dataTask:(NSURLSessionDataTask *)dataTask
didReceiveResponse:(NSURLResponse *)response
 completionHandler:(void (^)(NSURLSessionResponseDisposition disposition))completionHandler
{
  [self.client URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageNotAllowed];
  completionHandler(NSURLSessionResponseAllow);
}

- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)dataTask didReceiveData:(NSData *)data
{
  [self.client URLProtocol:self didLoadData:data];
}

- (void)URLSession:(NSURLSession *)session
              task:(NSURLSessionTask *)task
willPerformHTTPRedirection:(NSHTTPURLResponse *)response
        newRequest:(NSURLRequest *)request
 completionHandler:(void (^)(NSURLRequest * _Nullable))completionHandler
{
  completionHandler([[self class] preparedRequestFromRequest:request]);
}

- (void)URLSession:(NSURLSession *)session
              task:(NSURLSessionTask *)task
didReceiveChallenge:(NSURLAuthenticationChallenge *)challenge
 completionHandler:(void (^)(NSURLSessionAuthChallengeDisposition disposition, NSURLCredential * _Nullable credential))completionHandler
{
  if (![challenge.protectionSpace.authenticationMethod isEqualToString:NSURLAuthenticationMethodServerTrust]) {
    completionHandler(NSURLSessionAuthChallengePerformDefaultHandling, nil);
    return;
  }

  SecTrustRef serverTrust = challenge.protectionSpace.serverTrust;
  if (serverTrust == nil || self.originalHost.length == 0) {
    completionHandler(NSURLSessionAuthChallengePerformDefaultHandling, nil);
    return;
  }

  SecPolicyRef policy = SecPolicyCreateSSL(true, (__bridge CFStringRef)self.originalHost);
  SecTrustSetPolicies(serverTrust, policy);
  CFRelease(policy);

  BOOL isTrusted = NO;
  if (@available(iOS 13.0, *)) {
    NSError *error = nil;
    isTrusted = SecTrustEvaluateWithError(serverTrust, &error);
  } else {
    SecTrustResultType result;
    OSStatus status = SecTrustEvaluate(serverTrust, &result);
    isTrusted = status == errSecSuccess &&
        (result == kSecTrustResultProceed || result == kSecTrustResultUnspecified);
  }

  if (isTrusted) {
    completionHandler(NSURLSessionAuthChallengeUseCredential, [NSURLCredential credentialForTrust:serverTrust]);
  } else {
    completionHandler(NSURLSessionAuthChallengePerformDefaultHandling, nil);
  }
}

- (void)URLSession:(NSURLSession *)session
              task:(NSURLSessionTask *)task
didCompleteWithError:(NSError *)error
{
  if (error != nil) {
    [self.client URLProtocol:self didFailWithError:error];
  } else {
    [self.client URLProtocolDidFinishLoading:self];
  }
  [self.session finishTasksAndInvalidate];
  self.task = nil;
  self.session = nil;
}

@end
