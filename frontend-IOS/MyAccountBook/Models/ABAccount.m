//
//  ABAccount.m
//  MyAccountBook
//

#import "ABAccount.h"

@implementation ABAccount

- (instancetype)initWithDictionary:(NSDictionary *)dict {
    self = [super init];
    if (self) {
        id aid = dict[@"id"];
        _accountId = [aid isKindOfClass:NSString.class] ? aid : [NSString stringWithFormat:@"%@", aid ?: @""];
        _userId    = dict[@"userId"] ?: @"";
        _name      = dict[@"name"] ?: @"";
        _icon      = dict[@"icon"] ?: @"";
        _sort      = [dict[@"sort"] integerValue];
        _isDefault = [dict[@"isDefault"] boolValue];
        _createdAt = dict[@"createdAt"] ?: @"";
    }
    return self;
}

@end
