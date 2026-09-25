//
//  ABDateUtil.h
//  MyAccountBook
//
//  日期工具 —— 对齐 frontend/src/utils/period.ts
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABDateUtil : NSObject

/// Date -> "YYYY-MM-DD"（本地时区）
+ (NSString *)formatDate:(NSDate *)date;

/// 今天 "YYYY-MM-DD"
+ (NSString *)today;

/// 当前月份 "YYYY-MM"
+ (NSString *)currentMonth;

/// 当前年份 "YYYY"
+ (NSString *)currentYear;

/// 分组键 -> 日期区间（闭区间）
/// unit: year / quarter / month / week / day
+ (NSDictionary *)periodRange:(NSString *)key unit:(NSString *)unit;

/// 分组键 -> 展示标题 {title, sub}
+ (NSDictionary *)periodLabel:(NSString *)key unit:(NSString *)unit;

/// 日期 -> "13日 周一"
+ (NSString *)dayHeader:(NSString *)dateStr;

@end

NS_ASSUME_NONNULL_END
