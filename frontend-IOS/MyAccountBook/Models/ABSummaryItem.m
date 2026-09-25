//
//  ABSummaryItem.m
//  MyAccountBook
//

#import "ABSummaryItem.h"

@implementation ABSummaryItem

- (instancetype)initWithDictionary:(NSDictionary *)dict {
    self = [super init];
    if (self) {
        _key     = dict[@"key"] ?: @"";
        _unit    = dict[@"unit"] ?: @"month";
        id n = dict[@"name"];
        _name = [n isKindOfClass:NSString.class] ? n : nil;
        id ic = dict[@"icon"];
        _icon = [ic isKindOfClass:NSString.class] ? ic : nil;
        _income  = [NSString stringWithFormat:@"%@", dict[@"income"] ?: @"0"];
        _expense = [NSString stringWithFormat:@"%@", dict[@"expense"] ?: @"0"];
        _balance = [NSString stringWithFormat:@"%@", dict[@"balance"] ?: @"0"];
        _count   = [dict[@"count"] integerValue];
    }
    return self;
}

- (BOOL)isCategoryGroup {
    return [self.unit isEqualToString:@"category"];
}

@end
