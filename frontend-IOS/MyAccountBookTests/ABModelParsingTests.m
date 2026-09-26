//
//  ABModelParsingTests.m
//  MyAccountBookTests
//
//  出参解析的契约测试 —— 入参那半边已有 `ABQueryBuilderTests` 钉着，这里是另一半。
//
//  为什么值得测：**字段名读错是静默的**。后端把 `recordDate` 写成 `record_date`、
//  把 `sum` 包进嵌套对象里，模型读不到时只会得到 nil / 0，界面照样渲染，
//  只是金额变 0.00、日期变空 —— 与"这页本来就没数据"长得一模一样。
//
//  ⚠️ 下面每个 fixture 的键名都是**对着真实响应抄的**（2026-09-26 用 demo 账号
//     逐个接口抓的实际返回），不是照 VO 文件猜的。
//

#import <XCTest/XCTest.h>
#import "ABTransaction.h"
#import "ABAccount.h"
#import "ABCategory.h"
#import "ABSummaryItem.h"
#import "ABStatistics.h"

@interface ABModelParsingTests : XCTestCase
@end

@implementation ABModelParsingTests

#pragma mark - ABTransaction

/// `/transactions` 的 list[0] 实际返回这 14 个键
/// （`category` / `account` 是**嵌套对象**，未分类时 category 为 null）
- (void)testTransactionParsesRealResponseShape {
    NSDictionary *dict = @{
        @"id": @"55994",
        @"userId": @"2",
        @"type": @"expense",
        @"amount": @"1.23",
        @"categoryId": @"12",
        @"recordDate": @"2026-09-25",
        @"recordTime": @"12:30",
        @"note": @"午饭",
        @"clientId": @"test-idem",
        @"createdAt": @"2026-09-24T18:43:53.059Z",
        @"deletedAt": [NSNull null],
        @"accountId": @"3",
        @"category": @{@"id": @"12", @"name": @"餐饮", @"icon": @"img:餐饮", @"type": @"expense"},
        @"account": @{@"id": @"3", @"name": @"默认账本", @"icon": @"wallet", @"isDefault": @YES},
    };
    ABTransaction *t = [[ABTransaction alloc] initWithDictionary:dict];

    XCTAssertEqualObjects(t.txnId, @"55994");
    XCTAssertEqualObjects(t.amount, @"1.23", @"金额是字符串，别当数字解析");
    XCTAssertEqualObjects(t.recordDate, @"2026-09-25");
    XCTAssertEqualObjects(t.recordTime, @"12:30");
    XCTAssertEqualObjects(t.note, @"午饭");
    XCTAssertNil(t.deletedAt, @"JSON null 不该变成字面量 \"<null>\"");

    // 名称/图标来自**嵌套对象**，不是平铺字段
    XCTAssertEqualObjects(t.categoryName, @"餐饮");
    XCTAssertEqualObjects(t.categoryIcon, @"img:餐饮");
    XCTAssertEqualObjects(t.account.name, @"默认账本");
    XCTAssertTrue(t.account.isDefault);
}

/// 未分类流水：`categoryId` 与 `category` **都是 null**
- (void)testTransactionHandlesUncategorized {
    NSDictionary *dict = @{
        @"id": @"1", @"type": @"expense", @"amount": @"1.23",
        @"categoryId": [NSNull null], @"recordDate": @"2026-09-25",
        @"category": [NSNull null], @"account": [NSNull null],
    };
    ABTransaction *t = [[ABTransaction alloc] initWithDictionary:dict];
    XCTAssertNil(t.categoryId);
    XCTAssertNil(t.category);
    XCTAssertEqualObjects(t.categoryName, @"未分类", @"名称要有兜底文案");
    XCTAssertEqualObjects(t.categoryIcon, @"", @"图标兜底空串（ABIconView 会画默认图标）");
}

/// id 是 BIGINT，JSON 里可能是**数字** —— 模型必须统一转字符串，
/// 否则 `isEqualToString:` 全部失配（本项目铁律：ID 一律字符串）
- (void)testNumericIdsBecomeStrings {
    ABTransaction *t = [[ABTransaction alloc] initWithDictionary:
                        @{@"id": @(42), @"amount": @(12.5), @"type": @"income"}];
    XCTAssertEqualObjects(t.txnId, @"42");
    XCTAssertEqualObjects(t.amount, @"12.5");

    ABAccount *a = [[ABAccount alloc] initWithDictionary:@{@"id": @(7), @"name": @"A"}];
    XCTAssertEqualObjects(a.accountId, @"7");

    ABCategory *c = [[ABCategory alloc] initWithDictionary:@{@"id": @(9), @"name": @"C"}];
    XCTAssertEqualObjects(c.categoryId, @"9");
}

#pragma mark - ABAccount

- (void)testAccountParsesRealResponseShape {
    // /accounts 实际返回：createdAt, icon, id, isDefault, name, sort, userId
    ABAccount *a = [[ABAccount alloc] initWithDictionary:@{
        @"id": @"3", @"userId": @"2", @"name": @"默认账本", @"icon": @"wallet",
        @"sort": @0, @"isDefault": @YES, @"createdAt": @"2026-09-01T00:00:00.000Z",
    }];
    XCTAssertEqualObjects(a.name, @"默认账本");
    XCTAssertTrue(a.isDefault);
    XCTAssertEqualObjects(a.createdAt, @"2026-09-01T00:00:00.000Z");
}

#pragma mark - ABCategory

- (void)testCategoryParsesRealResponseShape {
    // /categories 实际返回：accountId, icon, id, isHidden, name, parentId, sort, type, userId
    ABCategory *root = [[ABCategory alloc] initWithDictionary:@{
        @"id": @"12", @"accountId": @"3", @"name": @"餐饮", @"icon": @"img:餐饮",
        @"type": @"expense", @"sort": @1, @"isHidden": @NO, @"parentId": [NSNull null],
    }];
    XCTAssertTrue([root isRoot]);
    XCTAssertFalse(root.isHidden);

    ABCategory *child = [[ABCategory alloc] initWithDictionary:@{
        @"id": @"13", @"accountId": @"3", @"name": @"午餐", @"type": @"expense",
        @"parentId": @"12", @"isHidden": @YES,
    }];
    XCTAssertFalse([child isRoot]);
    XCTAssertEqualObjects(child.parentId, @"12");
    XCTAssertTrue(child.isHidden);
}

#pragma mark - ABSummaryItem（分组汇总）

/// 时间维度：`/transactions/summary?groupBy=time` 实际返回
/// `balance, count, expense, income, key, unit`（**没有** name/icon/parentName）
- (void)testSummaryItemParsesTimeDimension {
    ABSummaryItem *g = [[ABSummaryItem alloc] initWithDictionary:@{
        @"key": @"2026-09", @"unit": @"month", @"income": @"16000.00",
        @"expense": @"264.53", @"balance": @"15735.47", @"count": @13,
    }];
    XCTAssertEqualObjects(g.key, @"2026-09");
    XCTAssertEqualObjects(g.unit, @"month");
    XCTAssertEqualObjects(g.balance, @"15735.47");
    XCTAssertEqual(g.count, 13);
    XCTAssertFalse(g.isCategoryGroup);
    XCTAssertNil(g.name);
    XCTAssertNil(g.parentName);
}

/// 分类维度：多出 `name` / `icon` / `parentName`，且 `unit` 固定是 "category"
- (void)testSummaryItemParsesCategoryDimension {
    ABSummaryItem *g = [[ABSummaryItem alloc] initWithDictionary:@{
        @"key": @"31150", @"unit": @"category", @"name": @"职业收入", @"icon": @"💼",
        @"parentName": [NSNull null], @"income": @"1731087.15", @"expense": @"0.00",
        @"balance": @"1731087.15", @"count": @390,
    }];
    XCTAssertTrue(g.isCategoryGroup);
    XCTAssertEqualObjects(g.name, @"职业收入");
    XCTAssertEqualObjects(g.icon, @"💼");
    XCTAssertNil(g.parentName, @"一级口径下 parentName 是 null");

    // 二级口径才有 parentName（组头副标题用它）
    ABSummaryItem *l2 = [[ABSummaryItem alloc] initWithDictionary:@{
        @"key": @"31151", @"unit": @"category", @"name": @"工资收入",
        @"parentName": @"职业收入", @"income": @"0.00", @"expense": @"0.00",
        @"balance": @"0.00", @"count": @0,
    }];
    XCTAssertEqualObjects(l2.parentName, @"职业收入");
}

/// 「未分类」分组的 key 是后端硬编码的 `__none__`
- (void)testSummaryItemUncategorizedKey {
    ABSummaryItem *g = [[ABSummaryItem alloc] initWithDictionary:@{
        @"key": @"__none__", @"unit": @"category", @"name": @"未分类",
        @"icon": @"", @"parentName": [NSNull null],
        @"income": @"0.00", @"expense": @"1.23", @"balance": @"-1.23", @"count": @1,
    }];
    XCTAssertEqualObjects(g.key, @"__none__");
    XCTAssertTrue(g.isCategoryGroup);
}

#pragma mark - ABOverview / ABRangeStat

/// `/statistics/overview` 实际返回 `{ranges, total}`，
/// ranges[i] 比 total 多 `key/label/period/start/end`
- (void)testOverviewParsesNestedTotalAndRanges {
    ABOverview *o = [[ABOverview alloc] initWithDictionary:@{
        @"total": @{@"income": @"16000.00", @"expense": @"264.53",
                    @"balance": @"15735.47", @"count": @13},
        @"ranges": @[
            @{@"key": @"today", @"label": @"今天", @"period": @"2026-09-26",
              @"start": @"2026-09-26", @"end": @"2026-09-26",
              @"income": @"0.00", @"expense": @"0.00", @"balance": @"0.00", @"count": @0},
            @{@"key": @"month", @"label": @"本月", @"period": @"2026-09",
              @"start": @"2026-09-01", @"end": @"2026-09-30",
              @"income": @"16000.00", @"expense": @"264.53", @"balance": @"15735.47", @"count": @13},
        ],
    }];
    XCTAssertEqualObjects(o.totalIncome, @"16000.00");
    XCTAssertEqualObjects(o.totalBalance, @"15735.47");
    XCTAssertEqual(o.totalCount, 13);
    XCTAssertEqual(o.ranges.count, (NSUInteger)2);
    XCTAssertEqualObjects(o.ranges[0].key, @"today");
    XCTAssertEqualObjects(o.ranges[1].label, @"本月");
}

#pragma mark - ABReportData

/// `/statistics/report` 的分类条目实际返回
/// `categoryId, count, icon, name, parentId, parentName, ratio, sum, type`
- (void)testReportParsesCategoriesAndSummary {
    ABReportData *d = [[ABReportData alloc] initWithDictionary:@{
        @"period": @"2026-09", @"granularity": @"month",
        @"start": @"2026-09-01", @"end": @"2026-09-30",
        @"summary": @{@"income": @"16000.00", @"expense": @"264.53",
                      @"balance": @"15735.47", @"count": @13},
        @"expenseCategories": @[
            @{@"categoryId": @"12", @"name": @"餐饮", @"icon": @"img:餐饮",
              @"type": @"expense", @"sum": @"264.53", @"ratio": @100,
              @"count": @13, @"parentId": [NSNull null], @"parentName": [NSNull null]},
        ],
        @"incomeCategories": @[],
        @"expenseCategoriesL2": @[],
        @"incomeCategoriesL2": @[],
        @"trend": @[],
    }];
    XCTAssertEqualObjects(d.granularity, @"month");
    XCTAssertEqualObjects(d.summary.expense, @"264.53");
    XCTAssertEqual(d.expenseCategories.count, (NSUInteger)1);

    ABReportCategory *c = d.expenseCategories[0];
    XCTAssertEqualObjects(c.name, @"餐饮");
    XCTAssertEqualObjects(c.sum, @"264.53");
    XCTAssertEqual(c.ratio, 100.0);
    XCTAssertNil(c.parentId);
}

/// 年度报表才有 trend（12 条）；条目键是 `month / label / income / expense`
- (void)testReportParsesTrend {
    ABReportData *d = [[ABReportData alloc] initWithDictionary:@{
        @"period": @"2026", @"granularity": @"year",
        @"summary": @{}, @"expenseCategories": @[], @"incomeCategories": @[],
        @"expenseCategoriesL2": @[], @"incomeCategoriesL2": @[],
        @"trend": @[@{@"month": @"2026-01", @"label": @"01月",
                      @"income": @"3105.30", @"expense": @"23566.40"}],
    }];
    XCTAssertEqualObjects(d.granularity, @"year");
    XCTAssertEqual(d.trend.count, (NSUInteger)1);
    XCTAssertEqualObjects(d.trend[0].label, @"01月");
    XCTAssertEqualObjects(d.trend[0].income, @"3105.30");
}

/// 缺字段 / 类型不对时不能崩、也不能给出"看起来像真数据"的假值
- (void)testEmptyDictsDegradeSafely {
    ABReportData *d = [[ABReportData alloc] initWithDictionary:@{}];
    XCTAssertEqualObjects(d.summary.income, @"0");
    XCTAssertEqualObjects(d.expenseCategories, @[]);
    XCTAssertEqualObjects(d.trend, @[]);

    ABOverview *o = [[ABOverview alloc] initWithDictionary:@{}];
    XCTAssertEqualObjects(o.totalExpense, @"0");
    XCTAssertEqualObjects(o.ranges, @[]);

    // categories 里混进非字典元素：跳过而不是崩
    ABReportData *d2 = [[ABReportData alloc] initWithDictionary:@{@"expenseCategories": @[@"垃圾", @{@"name": @"餐饮"}]}];
    XCTAssertEqual(d2.expenseCategories.count, (NSUInteger)1);
}

@end
