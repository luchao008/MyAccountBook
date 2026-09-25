//
//  ABDateUtil.m
//  MyAccountBook
//

#import "ABDateUtil.h"

@implementation ABDateUtil

+ (NSString *)formatDate:(NSDate *)date {
    NSCalendar *cal = [NSCalendar currentCalendar];
    NSDateComponents *c = [cal components:NSCalendarUnitYear | NSCalendarUnitMonth | NSCalendarUnitDay fromDate:date];
    return [NSString stringWithFormat:@"%04ld-%02ld-%02ld", (long)c.year, (long)c.month, (long)c.day];
}

+ (NSString *)today {
    return [self formatDate:[NSDate date]];
}

+ (NSString *)currentMonth {
    NSString *d = [self formatDate:[NSDate date]];
    return [d substringToIndex:7];
}

+ (NSString *)currentYear {
    NSString *d = [self formatDate:[NSDate date]];
    return [d substringToIndex:4];
}

+ (NSDictionary *)periodRange:(NSString *)key unit:(NSString *)unit {
    if ([unit isEqualToString:@"year"]) {
        return @{ @"start": [NSString stringWithFormat:@"%@-01-01", key],
                  @"end": [NSString stringWithFormat:@"%@-12-31", key] };
    }

    if ([unit isEqualToString:@"month"]) {
        NSArray *p = [key componentsSeparatedByString:@"-"];
        NSInteger y = [p[0] integerValue];
        NSInteger m = [p[1] integerValue];
        NSInteger lastDay = [self lastDayOfYear:y month:m];
        return @{ @"start": [NSString stringWithFormat:@"%04ld-%02ld-01", (long)y, (long)m],
                  @"end": [NSString stringWithFormat:@"%04ld-%02ld-%02ld", (long)y, (long)m, (long)lastDay] };
    }

    if ([unit isEqualToString:@"quarter"]) {
        NSArray *p = [key componentsSeparatedByString:@"-Q"];
        NSInteger y = [p[0] integerValue];
        NSInteger q = [p[1] integerValue];
        NSInteger startM = (q - 1) * 3 + 1;
        NSInteger endM = startM + 2;
        NSInteger lastDay = [self lastDayOfYear:y month:endM];
        return @{ @"start": [NSString stringWithFormat:@"%04ld-%02ld-01", (long)y, (long)startM],
                  @"end": [NSString stringWithFormat:@"%04ld-%02ld-%02ld", (long)y, (long)endM, (long)lastDay] };
    }

    if ([unit isEqualToString:@"week"]) {
        // 2026-W37 -> ISO 周（周一为起点）
        NSArray *p = [key componentsSeparatedByString:@"-W"];
        NSInteger y = [p[0] integerValue];
        NSInteger w = [p[1] integerValue];
        NSDate *start = [self isoWeekStart:y week:w];
        NSDate *end = [start dateByAddingTimeInterval:6 * 86400];
        return @{ @"start": [self formatDate:start], @"end": [self formatDate:end] };
    }

    // day
    return @{ @"start": key, @"end": key };
}

+ (NSInteger)lastDayOfYear:(NSInteger)year month:(NSInteger)month {
    NSDateComponents *c = [[NSDateComponents alloc] init];
    c.year = year;
    c.month = month;
    NSCalendar *cal = [NSCalendar currentCalendar];
    NSDate *date = [cal dateFromComponents:c];
    NSRange range = [cal rangeOfUnit:NSCalendarUnitDay inUnit:NSCalendarUnitMonth forDate:date];
    return range.length;
}

+ (NSDate *)isoWeekStart:(NSInteger)year week:(NSInteger)week {
    NSCalendar *cal = [NSCalendar currentCalendar];
    NSDateComponents *jan4c = [[NSDateComponents alloc] init];
    jan4c.year = year;
    jan4c.month = 1;
    jan4c.day = 4;
    NSDate *jan4 = [cal dateFromComponents:jan4c];

    // jan4 的 ISO 星期（1=周一 ... 7=周日）
    NSInteger dow = [cal component:NSCalendarUnitWeekday fromDate:jan4];
    NSInteger isoDow = (dow == 1) ? 7 : (dow - 1); // Calendar 的 1=周日

    NSDate *week1Monday = [jan4 dateByAddingTimeInterval:-(isoDow - 1) * 86400];
    return [week1Monday dateByAddingTimeInterval:(week - 1) * 7 * 86400];
}

+ (NSDictionary *)periodLabel:(NSString *)key unit:(NSString *)unit {
    if ([unit isEqualToString:@"year"]) {
        return @{ @"title": [NSString stringWithFormat:@"%@年", key], @"sub": @"" };
    }
    if ([unit isEqualToString:@"quarter"]) {
        NSArray *p = [key componentsSeparatedByString:@"-Q"];
        return @{ @"title": [NSString stringWithFormat:@"%ld季度", (long)[p[1] integerValue]], @"sub": p[0] };
    }
    if ([unit isEqualToString:@"month"]) {
        NSArray *p = [key componentsSeparatedByString:@"-"];
        return @{ @"title": [NSString stringWithFormat:@"%ld月", (long)[p[1] integerValue]], @"sub": p[0] };
    }
    if ([unit isEqualToString:@"week"]) {
        NSArray *p = [key componentsSeparatedByString:@"-W"];
        return @{ @"title": [NSString stringWithFormat:@"第%ld周", (long)[p[1] integerValue]], @"sub": p[0] };
    }
    // day
    NSArray *p = [key componentsSeparatedByString:@"-"];
    if (p.count >= 3) {
        return @{ @"title": [NSString stringWithFormat:@"%ld月%ld日", (long)[p[1] integerValue], (long)[p[2] integerValue]],
                  @"sub": p[0] };
    }
    return @{ @"title": key, @"sub": @"" };
}

+ (NSString *)dayHeader:(NSString *)dateStr {
    NSArray *p = [dateStr componentsSeparatedByString:@"-"];
    if (p.count < 3) return dateStr;

    NSDateComponents *c = [[NSDateComponents alloc] init];
    c.year = [p[0] integerValue];
    c.month = [p[1] integerValue];
    c.day = [p[2] integerValue];
    NSDate *date = [[NSCalendar currentCalendar] dateFromComponents:c];

    NSArray *names = @[@"周日", @"周一", @"周二", @"周三", @"周四", @"周五", @"周六"];
    NSInteger dow = [[NSCalendar currentCalendar] component:NSCalendarUnitWeekday fromDate:date];
    return [NSString stringWithFormat:@"%ld日 %@", (long)[p[2] integerValue], names[dow - 1]];
}

@end
