//
//  ABQueryBuilder.m
//  MyAccountBook
//

#import "ABQueryBuilder.h"
#import "ABFlowFilterViewController.h"   // ABFlowFilterValue

@implementation ABQueryBuilder

#pragma mark - 契约常量

+ (NSUInteger)maxPageSize { return 100; }
+ (NSUInteger)maxPages { return 200; }

+ (NSSet<NSString *> *)allowedOrderValues {
    return [NSSet setWithArray:@[@"time", @"amountDesc", @"amountAsc"]];
}

+ (NSSet<NSString *> *)allowedKeysForSummary {
    // 对照 SummaryQueryDTO：groupBy / level / unit / start / end / type /
    // categoryIds / accountId / keyword / minAmount / maxAmount
    return [NSSet setWithArray:@[
        @"groupBy", @"level", @"unit", @"start", @"end", @"type",
        @"categoryIds", @"accountId", @"keyword", @"minAmount", @"maxAmount",
    ]];
}

+ (NSSet<NSString *> *)allowedKeysForList {
    // 对照 QueryTransactionDTO：start / end / type / categoryId / accountId /
    // categoryIds / keyword / minAmount / maxAmount / order / page / size
    return [NSSet setWithArray:@[
        @"start", @"end", @"type", @"categoryId", @"accountId", @"categoryIds",
        @"keyword", @"minAmount", @"maxAmount", @"order", @"page", @"size",
    ]];
}

#pragma mark - 拼装

/// 把筛选条件写进参数。
///
/// ⚠️ 三条口径都对齐前端 `filterOnlyParams()`，写错了**不会报错**、只是结果不对：
///   · **类型只在恰好选中 1 种时传** —— nil = 全部
///     （前端把「全选」与「全不选」都归到不过滤，所以对外只有三种状态）
///   · **分类空数组 = 不过滤**；传一级 id 时后端会连带其下全部二级
///   · **金额必须先过 normalizedAmount:** —— 后端 AMOUNT_PATTERN 拒绝 "0"
+ (void)applyFilter:(ABFlowFilterValue *)filter
          toParams:(NSMutableDictionary *)params
             start:(nullable NSString *)start
               end:(nullable NSString *)end {
    ABFlowFilterValue *f = filter ?: [ABFlowFilterValue empty];

    NSString *s = start ?: f.start;
    NSString *e = end ?: f.end;
    if (s.length) params[@"start"] = s;
    if (e.length) params[@"end"] = e;

    if (f.type.length) params[@"type"] = f.type;

    NSArray<NSString *> *cats = f.categoryIds ?: @[];
    if (cats.count) params[@"categoryIds"] = [cats componentsJoinedByString:@","];

    NSString *min = [ABFlowFilterValue normalizedAmount:f.minAmount];
    NSString *max = [ABFlowFilterValue normalizedAmount:f.maxAmount];
    if (min.length) params[@"minAmount"] = min;
    if (max.length) params[@"maxAmount"] = max;

    if (f.keyword.length) params[@"keyword"] = f.keyword;
}

+ (void)applyAccountId:(nullable NSString *)accountId to:(NSMutableDictionary *)params {
    if (accountId.length) params[@"accountId"] = accountId;
}

/// 把 size 夹进后端允许的 [1, maxPageSize]。
///
/// ⚠️ **不能写成 `MIN(size.unsignedIntegerValue, max)`** —— 负数的
/// `unsignedIntegerValue` 是补码巨值，会被 MIN 判成"没超"，再被 MAX 抬成上限，
/// 于是 `-5` 变成 `100` 而不是 `1`（单测抓到过）。
+ (NSUInteger)clampSize:(NSInteger)raw {
    if (raw < 1) return 1;
    if ((NSUInteger)raw > [self maxPageSize]) return [self maxPageSize];
    return (NSUInteger)raw;
}

+ (NSDictionary *)summaryParamsWithFilter:(ABFlowFilterValue *)filter
                                     unit:(NSString *)unit
                                accountId:(NSString *)accountId {
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    params[@"groupBy"] = @"time";
    params[@"unit"] = unit.length ? unit : @"month";
    [self applyFilter:filter toParams:params start:nil end:nil];
    [self applyAccountId:accountId to:params];
    return [params copy];
}

+ (NSDictionary *)listParamsWithFilter:(ABFlowFilterValue *)filter
                                 start:(NSString *)start
                                   end:(NSString *)end
                                 order:(NSString *)order
                                  size:(NSNumber *)size
                             accountId:(NSString *)accountId {
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    [self applyFilter:filter toParams:params start:start end:end];

    if (order.length) params[@"order"] = order;

    if (size) {
        // 夹到后端上限内 —— 宁可少取也不能整条被拒（超限是**整条请求失败**，
        // 而且失败只落在日志里，界面上完全看不出来）
        params[@"size"] = @([self clampSize:size.integerValue]);
    }

    [self applyAccountId:accountId to:params];
    return [params copy];
}

+ (NSDictionary *)searchParamsWithKeyword:(NSString *)keyword
                                     size:(NSNumber *)size
                                accountId:(NSString *)accountId {
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    params[@"keyword"] = keyword ?: @"";
    if (size) {
        params[@"size"] = @([self clampSize:size.integerValue]);
    }
    [self applyAccountId:accountId to:params];
    return [params copy];
}

@end
