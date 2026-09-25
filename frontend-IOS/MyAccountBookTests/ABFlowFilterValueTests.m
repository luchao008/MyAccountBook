//
//  ABFlowFilterValueTests.m
//  MyAccountBookTests
//

#import <XCTest/XCTest.h>
#import "ABFlowFilterViewController.h"

@interface ABFlowFilterValueTests : XCTestCase
@end

@implementation ABFlowFilterValueTests

#pragma mark - 金额清洗

/// 后端 AMOUNT_PATTERN = `/^(?!0+(\.0{1,2})?$)\d+(\.\d{1,2})?$/`
/// **"0" 会被拒** —— 用户手输 "0" 很自然（想筛"大于 0"）。
/// 直接发出去 → 整条请求被参数校验拒掉，且失败只落在日志里。
- (void)testZeroAmountsNormalizeToNil {
    for (NSString *raw in @[@"0", @"0.0", @"0.00", @"00", @"0.000", @" 0 "]) {
        XCTAssertNil([ABFlowFilterValue normalizedAmount:raw], @"%@ 应视为未设置", raw);
    }
}

- (void)testEmptyAndNilAmountsNormalizeToNil {
    XCTAssertNil([ABFlowFilterValue normalizedAmount:nil]);
    XCTAssertNil([ABFlowFilterValue normalizedAmount:@""]);
    XCTAssertNil([ABFlowFilterValue normalizedAmount:@"   "]);
}

- (void)testValidAmountsPassThrough {
    XCTAssertEqualObjects([ABFlowFilterValue normalizedAmount:@"10"], @"10");
    XCTAssertEqualObjects([ABFlowFilterValue normalizedAmount:@"10.5"], @"10.5");
    XCTAssertEqualObjects([ABFlowFilterValue normalizedAmount:@"99.99"], @"99.99");
    XCTAssertEqualObjects([ABFlowFilterValue normalizedAmount:@"0.01"], @"0.01");
}

- (void)testAmountsAreTrimmed {
    XCTAssertEqualObjects([ABFlowFilterValue normalizedAmount:@" 12.30 "], @"12.30");
}

#pragma mark - hasAny（对齐前端 hasFilter，但不含顶部搜索关键词）

- (void)testEmptyValueHasNoFilter {
    XCTAssertFalse([ABFlowFilterValue empty].hasAny);
}

- (void)testEachConditionAloneCountsAsFilter {
    NSArray<NSDictionary<NSString *, id> *> *cases = @[
        @{@"start": @"2026-09-01"},
        @{@"end": @"2026-09-30"},
        @{@"type": @"expense"},
        @{@"categoryIds": @[@"1"]},
        @{@"minAmount": @"10.00"},
        @{@"maxAmount": @"100.00"},
        @{@"keyword": @"午饭"},
    ];
    for (NSDictionary<NSString *, id> *c in cases) {
        ABFlowFilterValue *f = [ABFlowFilterValue empty];
        [f setValuesForKeysWithDictionary:c];
        XCTAssertTrue(f.hasAny, @"%@ 应该算作有筛选", c.allKeys.firstObject);
    }
}

/// 只有**恰好一种**类型才算筛 —— nil = 全部。
/// （前端把「全选」与「全不选」都归到不过滤，所以没有别的状态。）
- (void)testNilTypeDoesNotCountAsFilter {
    ABFlowFilterValue *f = [ABFlowFilterValue empty];
    f.type = nil;
    XCTAssertFalse(f.hasAny);
}

/// 空数组 = 不过滤
- (void)testEmptyCategoryIdsDoNotCountAsFilter {
    ABFlowFilterValue *f = [ABFlowFilterValue empty];
    f.categoryIds = @[];
    XCTAssertFalse(f.hasAny);
}

/// 金额是 "0" 时不算筛（因为发出去会被拒，等于没设）
- (void)testZeroAmountDoesNotCountAsFilter {
    ABFlowFilterValue *f = [ABFlowFilterValue empty];
    f.minAmount = @"0";
    f.maxAmount = @"0.00";
    XCTAssertFalse(f.hasAny);
}

#pragma mark - 拷贝

- (void)testCopyIsIndependent {
    ABFlowFilterValue *a = [ABFlowFilterValue empty];
    a.type = @"expense";
    a.categoryIds = @[@"1", @"2"];

    ABFlowFilterValue *b = [a copy];
    XCTAssertEqualObjects(b.type, @"expense");
    XCTAssertEqualObjects(b.categoryIds, (@[@"1", @"2"]));

    // 改副本不该动原值（草稿语义靠它：改完点确定才生效）
    b.type = @"income";
    b.categoryIds = @[@"9"];
    XCTAssertEqualObjects(a.type, @"expense");
    XCTAssertEqualObjects(a.categoryIds, (@[@"1", @"2"]));
}

@end
