//
//  ABStorage.h
//  MyAccountBook
//
//  轻量本地存储封装（token / userInfo），对齐前端 uni.getStorageSync('token') 用法。
//  简单键值用 NSUserDefaults；token 属敏感信息，后续可平滑替换为 Keychain。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABStorage : NSObject

+ (nullable NSString *)token;
+ (void)setToken:(nullable NSString *)token;

+ (nullable NSDictionary *)userInfo;
+ (void)setUserInfo:(nullable NSDictionary *)userInfo;

/// 清空登录态（token + userInfo）
+ (void)clearSession;

@end

NS_ASSUME_NONNULL_END
