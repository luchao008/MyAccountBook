//
//  ABStorage.m
//  MyAccountBook
//

#import "ABStorage.h"

static NSString * const kKeyToken    = @"ab_token";
static NSString * const kKeyUserInfo = @"ab_userinfo";

@implementation ABStorage

+ (NSUserDefaults *)ud { return NSUserDefaults.standardUserDefaults; }

+ (NSString *)token { return [[self ud] stringForKey:kKeyToken]; }
+ (void)setToken:(NSString *)token {
    if (token.length) { [[self ud] setObject:token forKey:kKeyToken]; }
    else { [[self ud] removeObjectForKey:kKeyToken]; }
}

+ (NSDictionary *)userInfo { return [[self ud] dictionaryForKey:kKeyUserInfo]; }
+ (void)setUserInfo:(NSDictionary *)userInfo {
    if (userInfo) { [[self ud] setObject:userInfo forKey:kKeyUserInfo]; }
    else { [[self ud] removeObjectForKey:kKeyUserInfo]; }
}

+ (void)clearSession {
    [[self ud] removeObjectForKey:kKeyToken];
    [[self ud] removeObjectForKey:kKeyUserInfo];
    [[self ud] synchronize];
}

@end
