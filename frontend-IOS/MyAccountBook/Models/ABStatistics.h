//
//  ABStatistics.h
//  MyAccountBook
//
//  统计数据模型，对齐 frontend/src/api/statistics.ts。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// 报表汇总（收入/支出/结余/笔数）
@interface ABReportSummary : NSObject
@property (nonatomic, copy) NSString *income;
@property (nonatomic, copy) NSString *expense;
@property (nonatomic, copy) NSString *balance;
@property (nonatomic, assign) NSInteger count;
- (instancetype)initWithDictionary:(NSDictionary *)dict;
@end

/// 报表分类项
@interface ABReportCategory : NSObject
@property (nonatomic, copy, nullable) NSString *categoryId;
@property (nonatomic, copy) NSString *name;
@property (nonatomic, copy) NSString *icon;
@property (nonatomic, copy) NSString *type;
@property (nonatomic, copy) NSString *sum;
@property (nonatomic, assign) double ratio;
@property (nonatomic, assign) NSInteger count;
@property (nonatomic, copy, nullable) NSString *parentId;
@property (nonatomic, copy, nullable) NSString *parentName;
- (instancetype)initWithDictionary:(NSDictionary *)dict;
@end

/// 趋势项
@interface ABReportTrendItem : NSObject
@property (nonatomic, copy) NSString *month;
@property (nonatomic, copy) NSString *label;
@property (nonatomic, copy) NSString *income;
@property (nonatomic, copy) NSString *expense;
- (instancetype)initWithDictionary:(NSDictionary *)dict;
@end

/// 报表数据（一次拿全）
@interface ABReportData : NSObject
@property (nonatomic, copy) NSString *period;
@property (nonatomic, copy) NSString *granularity;  // "year" | "month"
@property (nonatomic, copy) NSString *start;
@property (nonatomic, copy) NSString *end;
@property (nonatomic, strong) ABReportSummary *summary;
@property (nonatomic, strong) NSArray<ABReportCategory *> *expenseCategories;
@property (nonatomic, strong) NSArray<ABReportCategory *> *incomeCategories;
@property (nonatomic, strong) NSArray<ABReportCategory *> *expenseCategoriesL2;
@property (nonatomic, strong) NSArray<ABReportCategory *> *incomeCategoriesL2;
@property (nonatomic, strong) NSArray<ABReportTrendItem *> *trend;
- (instancetype)initWithDictionary:(NSDictionary *)dict;
@end

/// 区间统计项（今天/本周/本月/本年/去年）
@interface ABRangeStat : NSObject
@property (nonatomic, copy) NSString *key;
@property (nonatomic, copy) NSString *label;
@property (nonatomic, copy) NSString *period;
@property (nonatomic, copy) NSString *start;
@property (nonatomic, copy) NSString *end;
@property (nonatomic, copy) NSString *income;
@property (nonatomic, copy) NSString *expense;
@property (nonatomic, copy) NSString *balance;
@property (nonatomic, assign) NSInteger count;
- (instancetype)initWithDictionary:(NSDictionary *)dict;
@end

/// 首页总览
@interface ABOverview : NSObject
@property (nonatomic, copy) NSString *totalIncome;
@property (nonatomic, copy) NSString *totalExpense;
@property (nonatomic, copy) NSString *totalBalance;
@property (nonatomic, assign) NSInteger totalCount;
@property (nonatomic, strong) NSArray<ABRangeStat *> *ranges;
- (instancetype)initWithDictionary:(NSDictionary *)dict;
@end

NS_ASSUME_NONNULL_END
