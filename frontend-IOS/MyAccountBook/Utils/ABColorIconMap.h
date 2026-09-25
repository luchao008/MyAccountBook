//
//  ABColorIconMap.h
//  MyAccountBook
//
//  彩色图标（colorful: / life:）→ bundle 内 PNG 名映射。
//  由 scripts/gen_color_icons.js 从 frontend/src/constants/color-icons.ts 生成，请勿手改。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABColorIconMap : NSObject

/// 彩色图标 key → PNG 文件名（不含扩展名）。不存在返回 nil。
+ (nullable NSString *)imageNameForKey:(NSString *)iconKey;

/// 是否为彩色图标 key（前缀 colorful: / life:）
+ (BOOL)isColorIconKey:(NSString *)iconKey;

/// 全部彩色图标 key（已排序）
+ (NSArray<NSString *> *)allKeys;

@end

NS_ASSUME_NONNULL_END
