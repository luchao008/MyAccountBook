//
//  ABQueryBuilderTests.m
//  MyAccountBookTests
//
//  参数拼装的契约测试。
//
//  为什么先测这里：这个项目已经踩过两次同类 bug，**都是参数拼装错了、而且完全静默**——
//    ① 三处 size 传 500 / 10000（后端上限 100）→ 整条请求被拒 →
//       流水明细 / 日历 / 导出三个页面全都没数据，界面上看不出来；
//    ② 排序的 order 从没进过参数 → 菜单点了毫无反应。
//  这两类都能被下面任意一条断言钉住。
//

#import <XCTest/XCTest.h>
#import "ABQueryBuilder.h"
#import "ABFlowFilterViewController.h"   // ABFlowFilterValue

@interface ABQueryBuilderTests : XCTestCase
@end

@implementation ABQueryBuilderTests {
    ABFlowFilterValue *_empty;
}

- (void)setUp {
    _empty = [ABFlowFilterValue empty];
}

- (ABFlowFilterValue *)filterWithBlock:(void (^)(ABFlowFilterValue *f))block {
    ABFlowFilterValue *f = [ABFlowFilterValue empty];
    if (block) block(f);
    return f;
}

#pragma mark - 契约常量

/// 后端 `src/transaction/dto/transaction.dto.ts`:
/// `@Rule(RuleType.number().integer().min(1).max(100).default(20))`
/// ⚠️ 改这个数必须同步改后端 —— 超限是**整条请求被拒**，不是截断。
- (void)testMaxPageSizeMatchesBackendDTO {
    XCTAssertEqual([ABQueryBuilder maxPageSize], (NSUInteger)100);
}

- (void)testOrderValuesAreTheThreeBackendAccepts {
    XCTAssertEqualObjects([ABQueryBuilder allowedOrderValues],
                          ([NSSet setWithArray:@[@"time", @"amountDesc", @"amountAsc"]]));
}

#pragma mark - 参数名契约（防"参数名写错/传了不该传的"）

/// `/transactions/summary` 的每个键都必须在后端 DTO 里存在。
/// 传了 DTO 没有的键**不会报错、也不起作用** —— 排序之所以"点了没反应"
/// 就是因为有人以为 summary 支持 order。
- (void)testSummaryParamsContainOnlyKeysKnownToBackend {
    ABFlowFilterValue *f = [self filterWithBlock:^(ABFlowFilterValue *x) {
        x.start = @"2026-09-01";
        x.end = @"2026-09-30";
        x.type = @"expense";
        x.categoryIds = @[@"1", @"2"];
        x.minAmount = @"10.00";
        x.maxAmount = @"100.00";
        x.keyword = @"午饭";
    }];
    NSDictionary *params = [ABQueryBuilder summaryParamsWithFilter:f
                                                              unit:@"month"
                                                         accountId:@"7"];
    NSSet<NSString *> *allowed = [ABQueryBuilder allowedKeysForSummary];
    for (NSString *key in params.allKeys) {
        XCTAssertTrue([allowed containsObject:key],
                      @"summary 参数 %@ 不在 SummaryQueryDTO 里（后端会忽略它，静默失效）", key);
    }
    XCTAssertEqual(params.count, (NSUInteger)10);   // 7 个筛选键 + groupBy + unit + accountId
}

/// ⚠️ 这条是**回归测试**：`order` / `page` / `size` 不属于 summary 接口。
- (void)testSummaryParamsNeverCarryOrderPageOrSize {
    NSDictionary *params = [ABQueryBuilder summaryParamsWithFilter:_empty
                                                              unit:@"month"
                                                         accountId:@"7"];
    XCTAssertNil(params[@"order"]);
    XCTAssertNil(params[@"page"]);
    XCTAssertNil(params[@"size"]);
}

- (void)testGroupByIsAlwaysTime {
    NSDictionary *params = [ABQueryBuilder summaryParamsWithFilter:_empty
                                                              unit:@"month"
                                                         accountId:@"7"];
    XCTAssertEqualObjects(params[@"groupBy"], @"time");
}

- (void)testUnitIsOneOfTheFiveBackendAccepts {
    NSSet *allowed = [NSSet setWithArray:@[@"year", @"quarter", @"month", @"week", @"day"]];
    for (NSString *unit in @[@"year", @"quarter", @"month", @"week", @"day"]) {
        NSDictionary *p = [ABQueryBuilder summaryParamsWithFilter:_empty unit:unit accountId:@"7"];
        XCTAssertTrue([allowed containsObject:p[@"unit"]], @"unit=%@ 不合法", p[@"unit"]);
    }
}

- (void)testListParamsContainOnlyKeysKnownToBackend {
    ABFlowFilterValue *f = [self filterWithBlock:^(ABFlowFilterValue *x) {
        x.start = @"2026-09-01";
        x.end = @"2026-09-30";
        x.type = @"income";
        x.categoryIds = @[@"3"];
        x.minAmount = @"1.00";
        x.keyword = @"工资";
    }];
    NSDictionary *params = [ABQueryBuilder listParamsWithFilter:f
                                                          start:nil
                                                            end:nil
                                                          order:@"amountDesc"
                                                           size:@(20)
                                                      accountId:@"7"];
    NSSet<NSString *> *allowed = [ABQueryBuilder allowedKeysForList];
    for (NSString *key in params.allKeys) {
        XCTAssertTrue([allowed containsObject:key],
                      @"list 参数 %@ 不在 QueryTransactionDTO 里", key);
    }
}

#pragma mark - size 上限（三处真实 bug 的护栏）

/// ⚠️ **回归测试**：以前明细传 500、日历传 500、导出传 10000，
/// 后端 `max(100)` 把整条请求拒掉，症状是「这三个页面就是没数据」。
- (void)testOversizedSizeIsClampedToBackendLimit {
    ABFlowFilterValue *f = _empty;
    for (NSNumber *huge in @[@(500), @(10000), @(101)]) {
        NSDictionary *params = [ABQueryBuilder listParamsWithFilter:f
                                                              start:nil end:nil order:nil
                                                               size:huge
                                                          accountId:@"7"];
        XCTAssertEqualObjects(params[@"size"], @(100),
                              @"size=%@ 应被夹到 100（超限是整条请求被拒）", huge);
    }
}

- (void)testSizeWithinLimitIsKeptUnchanged {
    NSDictionary *params = [ABQueryBuilder listParamsWithFilter:_empty
                                                          start:nil end:nil order:nil
                                                           size:@(37)
                                                      accountId:@"7"];
    XCTAssertEqualObjects(params[@"size"], @(37));
}

- (void)testZeroOrNegativeSizeIsClampedToOne {
    for (NSNumber *bad in @[@(0), @(-5)]) {
        NSDictionary *params = [ABQueryBuilder listParamsWithFilter:_empty
                                                              start:nil end:nil order:nil
                                                               size:bad
                                                          accountId:@"7"];
        XCTAssertEqualObjects(params[@"size"], @(1), @"size=%@ 应被夹到 1", bad);
    }
}

- (void)testSizeOmittedWhenNil {
    NSDictionary *params = [ABQueryBuilder listParamsWithFilter:_empty
                                                          start:nil end:nil order:nil
                                                           size:nil
                                                      accountId:@"7"];
    XCTAssertNil(params[@"size"]);
}

#pragma mark - order（"排序点了没反应"的护栏）

/// ⚠️ **回归测试**：`order` 一度只是被赋给了一个属性、从没进过请求参数。
- (void)testListParamsCarryOrderWhenSet {
    NSDictionary *params = [ABQueryBuilder listParamsWithFilter:_empty
                                                          start:nil end:nil
                                                          order:@"amountDesc"
                                                           size:nil
                                                      accountId:@"7"];
    XCTAssertEqualObjects(params[@"order"], @"amountDesc");
}

- (void)testListParamsOmitOrderWhenNil {
    NSDictionary *params = [ABQueryBuilder listParamsWithFilter:_empty
                                                          start:nil end:nil order:nil
                                                           size:nil
                                                      accountId:@"7"];
    XCTAssertNil(params[@"order"], @"nil 时不该传 —— 后端默认 time");
}

#pragma mark - 筛选口径

/// 类型：**只有恰好选中 1 种才传**。nil = 全部（前端把"全选"与"全不选"都归到不过滤）
- (void)testTypeOmittedWhenNotFiltered {
    NSDictionary *params = [ABQueryBuilder summaryParamsWithFilter:_empty
                                                              unit:@"month" accountId:@"7"];
    XCTAssertNil(params[@"type"]);
}

- (void)testTypeIncludedWhenSingleTypeSelected {
    ABFlowFilterValue *f = [self filterWithBlock:^(ABFlowFilterValue *x) { x.type = @"expense"; }];
    NSDictionary *params = [ABQueryBuilder summaryParamsWithFilter:f unit:@"month" accountId:@"7"];
    XCTAssertEqualObjects(params[@"type"], @"expense");
}

/// 分类：**空数组 = 不过滤**；非空时逗号分隔（传一级 id 后端会连带其下二级）
- (void)testCategoryIdsOmittedWhenEmpty {
    NSDictionary *params = [ABQueryBuilder summaryParamsWithFilter:_empty
                                                              unit:@"month" accountId:@"7"];
    XCTAssertNil(params[@"categoryIds"]);
}

- (void)testCategoryIdsJoinedWithComma {
    ABFlowFilterValue *f = [self filterWithBlock:^(ABFlowFilterValue *x) {
        x.categoryIds = @[@"12", @"34"];
    }];
    NSDictionary *params = [ABQueryBuilder summaryParamsWithFilter:f unit:@"month" accountId:@"7"];
    XCTAssertEqualObjects(params[@"categoryIds"], @"12,34");
}

/// 金额：后端 AMOUNT_PATTERN = `/^(?!0+(\.0{1,2})?$)\d+(\.\d{1,2})?$/` —— **"0" 会被拒**。
/// 用户手输 "0" 很自然，直接发出去会让整条请求失败且失败静默。
- (void)testZeroAmountIsDroppedNotSent {
    for (NSString *zero in @[@"0", @"0.0", @"0.00", @"00", @""]) {
        ABFlowFilterValue *f = [self filterWithBlock:^(ABFlowFilterValue *x) {
            x.minAmount = zero;
            x.maxAmount = zero;
        }];
        NSDictionary *params = [ABQueryBuilder summaryParamsWithFilter:f unit:@"month" accountId:@"7"];
        XCTAssertNil(params[@"minAmount"], @"minAmount=%@ 不该发出去", zero);
        XCTAssertNil(params[@"maxAmount"], @"maxAmount=%@ 不该发出去", zero);
    }
}

- (void)testPositiveAmountIsKept {
    ABFlowFilterValue *f = [self filterWithBlock:^(ABFlowFilterValue *x) {
        x.minAmount = @"10.00";
        x.maxAmount = @"99.99";
    }];
    NSDictionary *params = [ABQueryBuilder summaryParamsWithFilter:f unit:@"month" accountId:@"7"];
    XCTAssertEqualObjects(params[@"minAmount"], @"10.00");
    XCTAssertEqualObjects(params[@"maxAmount"], @"99.99");
}

#pragma mark - 时间

/// 展开明细时用**本组的区间**覆盖筛选里的时间（一个是"组"，一个是"用户选的范围"）
- (void)testGroupRangeOverridesFilterDates {
    ABFlowFilterValue *f = [self filterWithBlock:^(ABFlowFilterValue *x) {
        x.start = @"2026-01-01";
        x.end = @"2026-12-31";
    }];
    NSDictionary *params = [ABQueryBuilder listParamsWithFilter:f
                                                          start:@"2026-09-01"
                                                            end:@"2026-09-30"
                                                          order:nil size:nil accountId:@"7"];
    XCTAssertEqualObjects(params[@"start"], @"2026-09-01");
    XCTAssertEqualObjects(params[@"end"], @"2026-09-30");
}

- (void)testFilterDatesUsedWhenNoOverride {
    ABFlowFilterValue *f = [self filterWithBlock:^(ABFlowFilterValue *x) {
        x.start = @"2026-01-01";
        x.end = @"2026-12-31";
    }];
    NSDictionary *params = [ABQueryBuilder listParamsWithFilter:f
                                                          start:nil end:nil order:nil size:nil
                                                      accountId:@"7"];
    XCTAssertEqualObjects(params[@"start"], @"2026-01-01");
    XCTAssertEqualObjects(params[@"end"], @"2026-12-31");
}

/// 后端 DATE_PATTERN = `/^\d{4}-\d{2}-\d{2}$/` —— 格式不对会被整条拒掉
- (void)testDatesMatchBackendDatePattern {
    NSRegularExpression *re = [NSRegularExpression regularExpressionWithPattern:@"^\\d{4}-\\d{2}-\\d{2}$"
                                                                       options:0 error:nil];
    ABFlowFilterValue *f = [self filterWithBlock:^(ABFlowFilterValue *x) {
        x.start = @"2026-01-01";
        x.end = @"2026-12-31";
    }];
    NSDictionary *params = [ABQueryBuilder listParamsWithFilter:f
                                                          start:nil end:nil order:nil size:nil
                                                      accountId:@"7"];
    for (NSString *key in @[@"start", @"end"]) {
        NSString *v = params[key];
        NSUInteger m = [re numberOfMatchesInString:v options:0 range:NSMakeRange(0, v.length)];
        XCTAssertEqual(m, (NSUInteger)1, @"%@=%@ 不符合 DATE_PATTERN", key, v);
    }
}

#pragma mark - 搜索

/// 搜索**不带任何其它筛选条件**（除账本）—— 它是「在全部流水里找」，
/// 带上时间范围会让用户困惑「我明明有这笔却搜不到」。
- (void)testSearchParamsCarryOnlyKeywordSizeAndAccountId {
    NSDictionary *params = [ABQueryBuilder searchParamsWithKeyword:@"餐"
                                                              size:@(100)
                                                         accountId:@"7"];
    XCTAssertEqualObjects([NSSet setWithArray:params.allKeys],
                          ([NSSet setWithArray:@[@"keyword", @"size", @"accountId"]]));
    XCTAssertEqualObjects(params[@"keyword"], @"餐");
    XCTAssertEqualObjects(params[@"size"], @(100));
}

/// 搜索的 size 也要受限 —— 同一类 bug 不要在这里重犯
- (void)testSearchSizeIsClamped {
    NSDictionary *params = [ABQueryBuilder searchParamsWithKeyword:@"餐"
                                                              size:@(5000)
                                                         accountId:@"7"];
    XCTAssertEqualObjects(params[@"size"], @(100));
}

@end
