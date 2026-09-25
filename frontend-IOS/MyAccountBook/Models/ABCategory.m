//
//  ABCategory.m
//  MyAccountBook
//

#import "ABCategory.h"

@implementation ABCategory

- (instancetype)initWithDictionary:(NSDictionary *)dict {
    self = [super init];
    if (self) {
        id cid = dict[@"id"];
        _categoryId = [cid isKindOfClass:NSString.class] ? cid : [NSString stringWithFormat:@"%@", cid ?: @""];
        _userId     = dict[@"userId"] ?: @"";
        _accountId  = dict[@"accountId"] ?: @"";
        _name       = dict[@"name"] ?: @"";
        _type       = dict[@"type"] ?: @"expense";
        _icon       = dict[@"icon"] ?: @"";
        _sort       = [dict[@"sort"] integerValue];
        id pid      = dict[@"parentId"];
        _parentId   = [pid isKindOfClass:NSString.class] ? pid : nil;
        _isHidden   = [dict[@"isHidden"] boolValue];
    }
    return self;
}

- (BOOL)isRoot {
    return self.parentId == nil || self.parentId.length == 0;
}

@end
