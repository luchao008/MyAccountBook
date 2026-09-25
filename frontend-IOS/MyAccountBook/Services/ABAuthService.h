//
//  ABAuthService.h
//  MyAccountBook
//
//  认证 API —— 对齐前端 frontend/src/api/auth.ts。
//    POST /auth/login    -> { token, expiresIn, user:{id,username} }
//    POST /auth/register -> { status:'pending', message, user }（申请制，不含 token）
//

#import <Foundation/Foundation.h>
#import "ABUser.h"

NS_ASSUME_NONNULL_BEGIN

typedef void (^ABLoginSuccess)(NSString *token, ABUser *user);
typedef void (^ABRegisterSuccess)(NSString *message, ABUser *user);
typedef void (^ABAuthFailure)(NSError *error);

@interface ABAuthService : NSObject

+ (void)loginWithUsername:(NSString *)username
                 password:(NSString *)password
                  success:(ABLoginSuccess)success
                  failure:(ABAuthFailure)failure;

+ (void)registerWithUsername:(NSString *)username
                    password:(NSString *)password
                     success:(ABRegisterSuccess)success
                     failure:(ABAuthFailure)failure;

@end

NS_ASSUME_NONNULL_END
