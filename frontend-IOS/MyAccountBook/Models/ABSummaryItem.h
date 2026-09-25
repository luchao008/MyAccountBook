//
//  ABSummaryItem.h
//  MyAccountBook
//
//  流水分组汇总项 —— 对齐 frontend/src/api/transaction.ts 的 SummaryItem
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABSummaryItem : NSObject

@property (nonatomic, copy) NSString *key;       // 2026 / 2026-Q3 / 2026-09 / 分类 id
@property (nonatomic, copy) NSString *unit;      // year/quarter/month/week/day/category
@property (nonatomic, copy, nullable) NSString *name;   // 分类维度才有
@property (nonatomic, copy, nullable) NSString *icon;   // 分类维度才有
@property (nonatomic, copy) NSString *income;
@property (nonatomic, copy) NSString *expense;
@property (nonatomic, copy) NSString *balance;
@property (nonatomic, assign) NSInteger count;

- (instancetype)initWithDictionary:(NSDictionary *)dict;

/// 该组是否为「分类」维度
- (BOOL)isCategoryGroup;

@end

NS_ASSUME_NONNULL_END
