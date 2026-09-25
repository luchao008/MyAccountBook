//
//  ABNetworkMonitor.h
//  MyAccountBook
//
//  网络状态监听 —— 对齐前端 offline.ts 的 isOnline()。
//  用 AFNetworking 的 AFNetworkReachabilityManager。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABNetworkMonitor : NSObject

+ (instancetype)shared;

/// 当前是否在线
- (BOOL)isOnline;

/// 开始监听（联网恢复时回调）
- (void)startMonitoringWithReachable:(void (^)(void))onReachable;

@end

NS_ASSUME_NONNULL_END
