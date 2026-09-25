//
//  ABHttpClient.m
//  MyAccountBook
//

#import "ABHttpClient.h"
#import "ABConfig.h"
#import "ABStorage.h"
#import <AFNetworking/AFNetworking.h>

NSString * const ABHttpClientUnauthorizedNotification = @"ABHttpClientUnauthorizedNotification";

// 业务码：登录态失效（对齐前端 request.ts）
static const NSInteger kCodeUnauthorized = 40100;

@interface ABHttpClient ()
@property (nonatomic, strong) AFHTTPSessionManager *manager;
@end

@implementation ABHttpClient

+ (instancetype)sharedClient {
    static ABHttpClient *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[ABHttpClient alloc] init];
    });
    return instance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        // AFNetworking 的 baseURL 必须以 '/' 结尾，否则路径拼接会出错
        NSString *base = [ABConfig apiBaseURL];
        if (![base hasSuffix:@"/"]) { base = [base stringByAppendingString:@"/"]; }
        _manager = [[AFHTTPSessionManager alloc] initWithBaseURL:[NSURL URLWithString:base]];
        _manager.requestSerializer = [AFJSONRequestSerializer serializer];
        [_manager.requestSerializer setTimeoutInterval:[ABConfig requestTimeout]];
        _manager.responseSerializer = [AFJSONResponseSerializer serializer];
        _manager.responseSerializer.acceptableContentTypes = [NSSet setWithObjects:@"application/json", @"text/json", @"text/plain", nil];
    }
    return self;
}

#pragma mark - Public

- (void)GET:(NSString *)path params:(NSDictionary *)params success:(ABSuccessBlock)success failure:(ABFailureBlock)failure {
    [self requestMethod:@"GET" path:path params:params success:success failure:failure];
}

- (void)POST:(NSString *)path params:(NSDictionary *)params success:(ABSuccessBlock)success failure:(ABFailureBlock)failure {
    [self requestMethod:@"POST" path:path params:params success:success failure:failure];
}

- (void)PUT:(NSString *)path params:(NSDictionary *)params success:(ABSuccessBlock)success failure:(ABFailureBlock)failure {
    [self requestMethod:@"PUT" path:path params:params success:success failure:failure];
}

- (void)DELETE:(NSString *)path params:(NSDictionary *)params success:(ABSuccessBlock)success failure:(ABFailureBlock)failure {
    [self requestMethod:@"DELETE" path:path params:params success:success failure:failure];
}

#pragma mark - Core

- (void)requestMethod:(NSString *)method
                 path:(NSString *)path
               params:(NSDictionary *)params
              success:(ABSuccessBlock)success
              failure:(ABFailureBlock)failure {
    // AFNetworking 会把以 '/' 开头的 path 当作绝对路径，从而丢掉 baseURL 的路径部分
    // （如 /api）。这里统一去掉开头的 '/'，保证与 baseURL 正确拼接。
    NSString *relativePath = path;
    while ([relativePath hasPrefix:@"/"]) {
        relativePath = [relativePath substringFromIndex:1];
    }

    // 注入 token
    NSString *token = [ABStorage token];
    if (token.length) {
        [self.manager.requestSerializer setValue:[NSString stringWithFormat:@"Bearer %@", token]
                              forHTTPHeaderField:@"Authorization"];
    } else {
        [self.manager.requestSerializer setValue:nil forHTTPHeaderField:@"Authorization"];
    }

    void (^successBlock)(NSURLSessionDataTask *, id) = ^(NSURLSessionDataTask *task, id responseObject) {
        [self handleResponse:responseObject success:success failure:failure];
    };
    void (^failureBlock)(NSURLSessionDataTask *, NSError *) = ^(NSURLSessionDataTask *task, NSError *error) {
        [self handleTransportError:error failure:failure];
    };

    if ([method isEqualToString:@"GET"]) {
        [self.manager GET:relativePath parameters:params headers:nil progress:nil success:successBlock failure:failureBlock];
    } else if ([method isEqualToString:@"PUT"]) {
        [self.manager PUT:relativePath parameters:params headers:nil success:successBlock failure:failureBlock];
    } else if ([method isEqualToString:@"DELETE"]) {
        [self.manager DELETE:relativePath parameters:params headers:nil success:successBlock failure:failureBlock];
    } else {
        [self.manager POST:relativePath parameters:params headers:nil progress:nil success:successBlock failure:failureBlock];
    }
}

/// 处理业务响应：剥壳 + 统一错误
- (void)handleResponse:(id)responseObject success:(ABSuccessBlock)success failure:(ABFailureBlock)failure {
    NSDictionary *body = [responseObject isKindOfClass:NSDictionary.class] ? responseObject : nil;
    NSInteger code = [body[@"code"] integerValue];

    if (code == 0) {
        if (success) { success(body[@"data"]); }
        return;
    }

    // 登录态失效
    if (code == kCodeUnauthorized) {
        [self handleUnauthorized];
        if (failure) { failure([self errorWithMessage:body[@"message"] ?: @"登录已失效，请重新登录"]); }
        return;
    }

    NSString *msg = body[@"message"] ?: @"网络异常，请稍后重试";
    if (failure) { failure([self errorWithMessage:msg]); }
}

/// 处理传输层错误（HTTP 状态码非 2xx / 网络异常）
- (void)handleTransportError:(NSError *)error failure:(ABFailureBlock)failure {
    NSInteger status = error.userInfo[AFNetworkingOperationFailingURLResponseErrorKey]
        ? [(NSHTTPURLResponse *)error.userInfo[AFNetworkingOperationFailingURLResponseErrorKey] statusCode] : 0;

    NSDictionary *body = nil;
    id responseData = error.userInfo[AFNetworkingOperationFailingURLResponseDataErrorKey];
    if ([responseData isKindOfClass:NSData.class]) {
        id json = [NSJSONSerialization JSONObjectWithData:responseData options:0 error:nil];
        if ([json isKindOfClass:NSDictionary.class]) { body = json; }
    }

    NSInteger code = [body[@"code"] integerValue];

    // token 失效：业务码 40100，或裸 401（无业务码）
    if (code == kCodeUnauthorized || (status == 401 && code == 0)) {
        [self handleUnauthorized];
        if (failure) { failure([self errorWithMessage:body[@"message"] ?: @"登录已失效，请重新登录"]); }
        return;
    }

    NSString *msg;
    if (status == 422) {
        msg = @"输入有误，请检查后重试";
    } else {
        msg = body[@"message"] ?: @"网络异常，请稍后重试";
    }
    if (failure) { failure([self errorWithMessage:msg]); }
}

/// 清登录态 + 广播登录失效通知
- (void)handleUnauthorized {
    [ABStorage clearSession];
    dispatch_async(dispatch_get_main_queue(), ^{
        [[NSNotificationCenter defaultCenter] postNotificationName:ABHttpClientUnauthorizedNotification object:nil];
    });
}

- (NSError *)errorWithMessage:(NSString *)message {
    return [NSError errorWithDomain:@"ABHttpClientErrorDomain"
                               code:-1
                           userInfo:@{NSLocalizedDescriptionKey: message ?: @"网络异常，请稍后重试"}];
}

@end
