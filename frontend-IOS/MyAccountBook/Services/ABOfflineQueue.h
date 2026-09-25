//
//  ABOfflineQueue.h
//  MyAccountBook
//
//  离线记账队列 —— 对齐 frontend/src/utils/offline.ts
//
//  范围（刻意压小）：只支持离线"新增"流水，不支持离线查询/编辑/删除。
//  幂等：每条带客户端生成的 clientId（UUID），后端 (user_id, client_id) 唯一，
//  重复提交只落一条。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABOfflineTxn : NSObject
@property (nonatomic, copy) NSString *clientId;
@property (nonatomic, assign) NSTimeInterval queuedAt;
@property (nonatomic, strong) NSDictionary *payload;
- (instancetype)initWithClientId:(NSString *)clientId payload:(NSDictionary *)payload;
@end

@interface ABOfflineQueue : NSObject

+ (instancetype)shared;

/// 待补传条数
- (NSInteger)count;

/// 入队
- (void)enqueue:(NSDictionary *)payload;

/// 补传（串行，成功即出队；某条失败则停止并保留）
- (void)flushWithCompletion:(void (^)(NSInteger sent, NSInteger remaining))completion;

/// 清空
- (void)clear;

@end

NS_ASSUME_NONNULL_END
