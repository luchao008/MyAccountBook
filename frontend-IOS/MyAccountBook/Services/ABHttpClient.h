//
//  ABHttpClient.h
//  MyAccountBook
//
//  网络层 —— 对齐前端 frontend/src/utils/request.ts：
//    1. baseURL = ABConfig.apiBaseURL（默认 http://127.0.0.1:7001/api）
//    2. 请求自动注入 Authorization: Bearer <token>
//    3. 响应剥掉 { code, data, message } 外壳，成功（code==0）回调直接拿到 data
//    4. token 失效（code==40100 或裸 401）→ 清登录态并通知跳登录页
//    5. 422 统一提示「输入有误，请检查后重试」
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// 业务成功回调：data 为剥壳后的内容（可能是 NSDictionary / NSArray / 基础类型）
typedef void (^ABSuccessBlock)(id _Nullable data);
/// 失败回调：error 携带 message（userInfo[NSLocalizedDescriptionKey]）
typedef void (^ABFailureBlock)(NSError *error);

/// 登录态失效通知（token 过期/无效）。由 AppDelegate 或根控制器监听后跳登录页。
extern NSString * const ABHttpClientUnauthorizedNotification;

@interface ABHttpClient : NSObject

+ (instancetype)sharedClient;

- (void)GET:(NSString *)path
     params:(nullable NSDictionary *)params
    success:(nullable ABSuccessBlock)success
    failure:(nullable ABFailureBlock)failure;

- (void)POST:(NSString *)path
      params:(nullable NSDictionary *)params
     success:(nullable ABSuccessBlock)success
     failure:(nullable ABFailureBlock)failure;

- (void)PUT:(NSString *)path
     params:(nullable NSDictionary *)params
    success:(nullable ABSuccessBlock)success
    failure:(nullable ABFailureBlock)failure;

/// DELETE。注意：path 上的查询串需自行拼好（对齐前端 luch-request 的 delete(url, data) 用法）
- (void)DELETE:(NSString *)path
       params:(nullable NSDictionary *)params
      success:(nullable ABSuccessBlock)success
      failure:(nullable ABFailureBlock)failure;

@end

NS_ASSUME_NONNULL_END
