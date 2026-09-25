//
//  ABAuthService.m
//  MyAccountBook
//

#import "ABAuthService.h"
#import "ABHttpClient.h"

@implementation ABAuthService

+ (void)loginWithUsername:(NSString *)username
                 password:(NSString *)password
                  success:(ABLoginSuccess)success
                  failure:(ABAuthFailure)failure {
    NSDictionary *params = @{ @"username": username ?: @"", @"password": password ?: @"" };
    [[ABHttpClient sharedClient] POST:@"/auth/login" params:params success:^(id data) {
        if (![data isKindOfClass:NSDictionary.class]) {
            if (failure) { failure([NSError errorWithDomain:@"ABAuth" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"返回数据格式异常"}]); }
            return;
        }
        NSString *token = data[@"token"] ?: @"";
        ABUser *user = [[ABUser alloc] initWithDictionary:data[@"user"] ?: @{}];
        if (success) { success(token, user); }
    } failure:^(NSError *error) {
        if (failure) { failure(error); }
    }];
}

+ (void)registerWithUsername:(NSString *)username
                    password:(NSString *)password
                     success:(ABRegisterSuccess)success
                     failure:(ABAuthFailure)failure {
    NSDictionary *params = @{ @"username": username ?: @"", @"password": password ?: @"" };
    [[ABHttpClient sharedClient] POST:@"/auth/register" params:params success:^(id data) {
        if (![data isKindOfClass:NSDictionary.class]) {
            if (failure) { failure([NSError errorWithDomain:@"ABAuth" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"返回数据格式异常"}]); }
            return;
        }
        NSString *message = data[@"message"] ?: @"申请已提交，请等待管理员审批";
        ABUser *user = [[ABUser alloc] initWithDictionary:data[@"user"] ?: @{}];
        if (success) { success(message, user); }
    } failure:^(NSError *error) {
        if (failure) { failure(error); }
    }];
}

@end
