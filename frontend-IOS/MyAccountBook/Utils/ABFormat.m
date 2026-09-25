//
//  ABFormat.m
//  MyAccountBook
//

#import "ABFormat.h"

@implementation ABFormat

+ (NSString *)money:(id)value {
    double num = 0;
    if ([value isKindOfClass:NSString.class]) {
        num = [value doubleValue];
    } else if ([value isKindOfClass:NSNumber.class]) {
        num = [value doubleValue];
    } else {
        return @"0.00";
    }

    NSString *fixed = [NSString stringWithFormat:@"%.2f", fabs(num)];
    NSArray *parts = [fixed componentsSeparatedByString:@"."];
    NSString *intPart = parts.firstObject;
    NSString *decPart = parts.count > 1 ? parts[1] : @"00";

    // 千分位
    NSMutableString *withSep = [NSMutableString string];
    NSInteger len = intPart.length;
    for (NSInteger i = 0; i < len; i++) {
        if (i > 0 && (len - i) % 3 == 0) {
            [withSep appendString:@","];
        }
        unichar c = [intPart characterAtIndex:i];
        [withSep appendFormat:@"%C", c];
    }

    NSString *sign = num < 0 ? @"-" : @"";
    return [NSString stringWithFormat:@"%@%@.%@", sign, withSep, decPart];
}

+ (NSString *)fixed2:(id)value {
    double num = 0;
    if ([value isKindOfClass:NSString.class]) num = [value doubleValue];
    else if ([value isKindOfClass:NSNumber.class]) num = [value doubleValue];
    return [NSString stringWithFormat:@"%.2f", num];
}

+ (NSString *)monthDayFromDate:(NSString *)dateStr {
    NSArray *parts = [dateStr componentsSeparatedByString:@"-"];
    if (parts.count < 3) return dateStr;
    return [NSString stringWithFormat:@"%ld月%ld日",
            (long)[parts[1] integerValue], (long)[parts[2] integerValue]];
}

@end
