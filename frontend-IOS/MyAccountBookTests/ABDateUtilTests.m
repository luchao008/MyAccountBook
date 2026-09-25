//
//  ABDateUtilTests.m
//  MyAccountBookTests
//

#import <XCTest/XCTest.h>
#import "ABDateUtil.h"

@interface ABDateUtilTests : XCTestCase
@end

@implementation ABDateUtilTests

- (BOOL)matches:(NSString *)value pattern:(NSString *)pattern {
    if (![value isKindOfClass:NSString.class]) return NO;
    NSRegularExpression *re = [NSRegularExpression regularExpressionWithPattern:pattern
                                                                       options:0 error:nil];
    return [re numberOfMatchesInString:value options:0 range:NSMakeRange(0, value.length)] == 1;
}

#pragma mark - 格式（后端 DATE_PATTERN = ^\d{4}-\d{2}-\d{2}$）

- (void)testTodayMatchesBackendDatePattern {
    XCTAssertTrue([self matches:[ABDateUtil today] pattern:@"^\\d{4}-\\d{2}-\\d{2}$"],
                  @"today = %@", [ABDateUtil today]);
}

- (void)testMonthAndYearFormats {
    XCTAssertTrue([self matches:[ABDateUtil currentMonth] pattern:@"^\\d{4}-\\d{2}$"]);
    XCTAssertTrue([self matches:[ABDateUtil currentYear] pattern:@"^\\d{4}$"]);
}

- (void)testSingleDigitMonthAndDayAreZeroPadded {
    NSDateComponents *c = [[NSDateComponents alloc] init];
    c.year = 2026; c.month = 1; c.day = 5;
    NSDate *d = [[NSCalendar currentCalendar] dateFromComponents:c];
    XCTAssertEqualObjects([ABDateUtil formatDate:d], @"2026-01-05");
}

#pragma mark - periodRange：month

- (void)testMonthRangeCoversWholeMonth {
    NSDictionary *r = [ABDateUtil periodRange:@"2026-09" unit:@"month"];
    XCTAssertEqualObjects(r[@"start"], @"2026-09-01");
    XCTAssertEqualObjects(r[@"end"], @"2026-09-30");
}

/// 月末天数不能写死 30/31 —— 2 月要按闰年判断
- (void)testFebruaryRangeNonLeapYear {
    NSDictionary *r = [ABDateUtil periodRange:@"2026-02" unit:@"month"];
    XCTAssertEqualObjects(r[@"end"], @"2026-02-28");
}

- (void)testFebruaryRangeLeapYear {
    NSDictionary *r = [ABDateUtil periodRange:@"2028-02" unit:@"month"];
    XCTAssertEqualObjects(r[@"end"], @"2028-02-29");
}

- (void)testMonthRangeAcceptsSingleDigitMonth {
    NSDictionary *r = [ABDateUtil periodRange:@"2026-1" unit:@"month"];
    XCTAssertEqualObjects(r[@"start"], @"2026-01-01");
    XCTAssertEqualObjects(r[@"end"], @"2026-01-31");
}

#pragma mark - periodRange：year / quarter / day

- (void)testYearRange {
    NSDictionary *r = [ABDateUtil periodRange:@"2026" unit:@"year"];
    XCTAssertEqualObjects(r[@"start"], @"2026-01-01");
    XCTAssertEqualObjects(r[@"end"], @"2026-12-31");
}

- (void)testQuarterRange {
    XCTAssertEqualObjects([ABDateUtil periodRange:@"2026-Q1" unit:@"quarter"][@"start"], @"2026-01-01");
    XCTAssertEqualObjects([ABDateUtil periodRange:@"2026-Q1" unit:@"quarter"][@"end"], @"2026-03-31");
    XCTAssertEqualObjects([ABDateUtil periodRange:@"2026-Q3" unit:@"quarter"][@"start"], @"2026-07-01");
    XCTAssertEqualObjects([ABDateUtil periodRange:@"2026-Q3" unit:@"quarter"][@"end"], @"2026-09-30");
    XCTAssertEqualObjects([ABDateUtil periodRange:@"2026-Q4" unit:@"quarter"][@"end"], @"2026-12-31");
}

- (void)testDayRangeIsTheDayItself {
    NSDictionary *r = [ABDateUtil periodRange:@"2026-09-11" unit:@"day"];
    XCTAssertEqualObjects(r[@"start"], @"2026-09-11");
    XCTAssertEqualObjects(r[@"end"], @"2026-09-11");
}

#pragma mark - periodRange：week（ISO 周，必须与后端 %x-%v 对齐）

/// 后端 `CONCAT(DATE_FORMAT(t.record_date,'%x'), '-W', LPAD(WEEK(t.record_date,3),2,'0'))`
/// —— ISO 周（周一为起点，含 1 月 4 日的那周为第 1 周）。
/// 算错一周的后果是**点开某个"周"看到的明细是隔壁周的**，而且金额合计对不上也看不出来。
- (void)testWeekRangeUsesIsoWeek {
    NSDictionary *r = [ABDateUtil periodRange:@"2026-W37" unit:@"week"];
    XCTAssertEqualObjects(r[@"start"], @"2026-09-07");   // 周一
    XCTAssertEqualObjects(r[@"end"], @"2026-09-13");     // 周日
}

/// ISO 年的跨年边界：2026-W01 从 **2025-12-29** 开始（那天是周一）
- (void)testWeekRangeCrossesYearBoundary {
    NSDictionary *r = [ABDateUtil periodRange:@"2026-W01" unit:@"week"];
    XCTAssertEqualObjects(r[@"start"], @"2025-12-29");
    XCTAssertEqualObjects(r[@"end"], @"2026-01-04");
}

- (void)testWeekRangeStartsOnMonday {
    NSCalendar *cal = [NSCalendar currentCalendar];
    for (NSInteger w = 1; w <= 52; w += 7) {
        NSDictionary *r = [ABDateUtil periodRange:[NSString stringWithFormat:@"2026-W%02ld", (long)w]
                                             unit:@"week"];
        NSArray<NSString *> *p = [r[@"start"] componentsSeparatedByString:@"-"];
        NSDateComponents *c = [[NSDateComponents alloc] init];
        c.year = [p[0] integerValue]; c.month = [p[1] integerValue]; c.day = [p[2] integerValue];
        NSDate *d = [cal dateFromComponents:c];
        XCTAssertEqual([cal component:NSCalendarUnitWeekday fromDate:d], 2,
                       @"第 %ld 周的起点不是周一：%@", (long)w, r[@"start"]);
    }
}

/// 每个 periodRange 的结果都必须能当 DATE_PATTERN 用（发出去就不会被拒）
- (void)testAllRangesMatchBackendDatePattern {
    NSArray<NSArray<NSString *> *> *cases = @[
        @[@"2026", @"year"], @[@"2026-Q3", @"quarter"], @[@"2026-09", @"month"],
        @[@"2026-W37", @"week"], @[@"2026-09-11", @"day"],
    ];
    for (NSArray<NSString *> *c in cases) {
        NSDictionary *r = [ABDateUtil periodRange:c[0] unit:c[1]];
        XCTAssertTrue([self matches:r[@"start"] pattern:@"^\\d{4}-\\d{2}-\\d{2}$"],
                      @"%@(%@) start=%@", c[0], c[1], r[@"start"]);
        XCTAssertTrue([self matches:r[@"end"] pattern:@"^\\d{4}-\\d{2}-\\d{2}$"],
                      @"%@(%@) end=%@", c[0], c[1], r[@"end"]);
        XCTAssertNotEqual([r[@"start"] compare:r[@"end"]], NSOrderedDescending,
                          @"%@(%@) 起止顺序反了", c[0], c[1]);
    }
}

@end
