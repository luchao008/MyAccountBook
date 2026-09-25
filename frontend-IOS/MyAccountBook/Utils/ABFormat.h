//
//  ABFormat.h
//  MyAccountBook
//
//  金额格式化 —— 对齐 frontend/src/utils/format.ts
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABFormat : NSObject

/// 千分位金额，如 1866713.65 -> "1,866,713.65"；非法值返回 "0.00"
+ (NSString *)money:(nullable id)value;

/// 只保留两位小数，不加千分位
+ (NSString *)fixed2:(nullable id)value;

/// 日期字符串 -> 显示用（YYYY-MM-DD -> "M月D日"）
+ (NSString *)monthDayFromDate:(NSString *)dateStr;

@end

NS_ASSUME_NONNULL_END
