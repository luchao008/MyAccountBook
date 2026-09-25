//
//  ABCache.h
//  MyAccountBook
//
//  本地缓存层 —— 在线优先 + 本地缓存（YYCache）。
//  对齐前端 frontend/src/utils/offline.ts 的离线思路。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABCache : NSObject

+ (instancetype)sharedCache;

/// 写入缓存（内存 + 磁盘）
- (void)setObject:(nullable id)object forKey:(NSString *)key;

/// 读缓存（同步，命中内存立即返回）
- (nullable id)objectForKey:(NSString *)key;

/// 删缓存
- (void)removeObjectForKey:(NSString *)key;

/// 清空全部缓存
- (void)removeAllObjects;

@end

NS_ASSUME_NONNULL_END
