//
//  ABConfig.h
//  MyAccountBook
//
//  全局配置 —— 环境可切换。对齐前端 frontend/src/utils/request.ts 的 BASE_URL 策略。
//  开发环境默认连本机后端 http://127.0.0.1:7001（模拟器可用）。
//  真机调试请把 kAPIHostDev 改成 Mac 的局域网 IP，如 http://192.168.x.x:7001
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, ABEnvironment) {
    ABEnvironmentDev = 0,
    ABEnvironmentProd = 1,
};

@interface ABConfig : NSObject

/// 当前环境（改这一处即可全局切换）
+ (ABEnvironment)environment;

/// API 根地址（含 /api 前缀），如 http://127.0.0.1:7001/api
+ (NSString *)apiBaseURL;

/// 请求超时（秒），对齐前端 10000ms
+ (NSTimeInterval)requestTimeout;

@end

NS_ASSUME_NONNULL_END
