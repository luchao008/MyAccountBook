//
//  ABConfig.m
//  MyAccountBook
//

#import "ABConfig.h"

// —— 开发环境：本机后端（模拟器可用；真机改局域网 IP）——
static NSString * const kAPIHostDev  = @"http://127.0.0.1:7001";
// —— 生产环境：留占位，上线前替换为真实域名 ——
static NSString * const kAPIHostProd = @"https://api.example.com";
// —— API 前缀，对齐前端 BASE_URL 默认 '/api' ——
static NSString * const kAPIPrefix   = @"/api";

@implementation ABConfig

+ (ABEnvironment)environment {
    return ABEnvironmentDev;
}

+ (NSString *)apiBaseURL {
    NSString *host = ([self environment] == ABEnvironmentDev) ? kAPIHostDev : kAPIHostProd;
    return [host stringByAppendingString:kAPIPrefix];
}

+ (NSTimeInterval)requestTimeout {
    return 10.0;
}

@end
