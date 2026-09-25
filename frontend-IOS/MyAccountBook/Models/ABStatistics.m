//
//  ABStatistics.m
//  MyAccountBook
//

#import "ABStatistics.h"

@implementation ABReportSummary
- (instancetype)initWithDictionary:(NSDictionary *)dict {
    self = [super init];
    if (self) {
        _income  = [NSString stringWithFormat:@"%@", dict[@"income"] ?: @"0"];
        _expense = [NSString stringWithFormat:@"%@", dict[@"expense"] ?: @"0"];
        _balance = [NSString stringWithFormat:@"%@", dict[@"balance"] ?: @"0"];
        _count   = [dict[@"count"] integerValue];
    }
    return self;
}
@end

@implementation ABReportCategory
- (instancetype)initWithDictionary:(NSDictionary *)dict {
    self = [super init];
    if (self) {
        id cid = dict[@"categoryId"];
        _categoryId = [cid isKindOfClass:NSString.class] ? cid : nil;
        _name = dict[@"name"] ?: @"";
        _icon = dict[@"icon"] ?: @"";
        _type = dict[@"type"] ?: @"expense";
        _sum  = [NSString stringWithFormat:@"%@", dict[@"sum"] ?: @"0"];
        _ratio = [dict[@"ratio"] doubleValue];
        _count = [dict[@"count"] integerValue];
        id pid = dict[@"parentId"];
        _parentId = [pid isKindOfClass:NSString.class] ? pid : nil;
        id pn = dict[@"parentName"];
        _parentName = [pn isKindOfClass:NSString.class] ? pn : nil;
    }
    return self;
}
@end

@implementation ABReportTrendItem
- (instancetype)initWithDictionary:(NSDictionary *)dict {
    self = [super init];
    if (self) {
        _month   = dict[@"month"] ?: @"";
        _label   = dict[@"label"] ?: @"";
        _income  = [NSString stringWithFormat:@"%@", dict[@"income"] ?: @"0"];
        _expense = [NSString stringWithFormat:@"%@", dict[@"expense"] ?: @"0"];
    }
    return self;
}
@end

@implementation ABReportData

static NSArray *ABMapArray(NSArray *arr, Class cls) {
    if (![arr isKindOfClass:NSArray.class]) return @[];
    NSMutableArray *out = [NSMutableArray array];
    for (id item in arr) {
        if ([item isKindOfClass:NSDictionary.class]) {
            [out addObject:[[cls alloc] initWithDictionary:item]];
        }
    }
    return out;
}

- (instancetype)initWithDictionary:(NSDictionary *)dict {
    self = [super init];
    if (self) {
        _period      = dict[@"period"] ?: @"";
        _granularity = dict[@"granularity"] ?: @"month";
        _start       = dict[@"start"] ?: @"";
        _end         = dict[@"end"] ?: @"";
        _summary = [[ABReportSummary alloc] initWithDictionary:dict[@"summary"] ?: @{}];
        _expenseCategories   = ABMapArray(dict[@"expenseCategories"], ABReportCategory.class);
        _incomeCategories    = ABMapArray(dict[@"incomeCategories"], ABReportCategory.class);
        _expenseCategoriesL2 = ABMapArray(dict[@"expenseCategoriesL2"], ABReportCategory.class);
        _incomeCategoriesL2  = ABMapArray(dict[@"incomeCategoriesL2"], ABReportCategory.class);
        _trend               = ABMapArray(dict[@"trend"], ABReportTrendItem.class);
    }
    return self;
}
@end

@implementation ABRangeStat
- (instancetype)initWithDictionary:(NSDictionary *)dict {
    self = [super init];
    if (self) {
        _key     = dict[@"key"] ?: @"";
        _label   = dict[@"label"] ?: @"";
        _period  = dict[@"period"] ?: @"";
        _start   = dict[@"start"] ?: @"";
        _end     = dict[@"end"] ?: @"";
        _income  = [NSString stringWithFormat:@"%@", dict[@"income"] ?: @"0"];
        _expense = [NSString stringWithFormat:@"%@", dict[@"expense"] ?: @"0"];
        _balance = [NSString stringWithFormat:@"%@", dict[@"balance"] ?: @"0"];
        _count   = [dict[@"count"] integerValue];
    }
    return self;
}
@end

@implementation ABOverview
- (instancetype)initWithDictionary:(NSDictionary *)dict {
    self = [super init];
    if (self) {
        NSDictionary *total = [dict[@"total"] isKindOfClass:NSDictionary.class] ? dict[@"total"] : @{};
        _totalIncome  = [NSString stringWithFormat:@"%@", total[@"income"] ?: @"0"];
        _totalExpense = [NSString stringWithFormat:@"%@", total[@"expense"] ?: @"0"];
        _totalBalance = [NSString stringWithFormat:@"%@", total[@"balance"] ?: @"0"];
        _totalCount   = [total[@"count"] integerValue];
        _ranges = ABMapArray(dict[@"ranges"], ABRangeStat.class);
    }
    return self;
}
@end
