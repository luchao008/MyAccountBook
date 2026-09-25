//
//  ABTransaction.m
//  MyAccountBook
//

#import "ABTransaction.h"

@implementation ABTxnCategory
- (instancetype)initWithDictionary:(NSDictionary *)dict {
    self = [super init];
    if (self) {
        id cid = dict[@"id"];
        _categoryId = [cid isKindOfClass:NSString.class] ? cid : [NSString stringWithFormat:@"%@", cid ?: @""];
        _name = dict[@"name"] ?: @"";
        _icon = dict[@"icon"] ?: @"";
        _type = dict[@"type"] ?: @"";
    }
    return self;
}
@end

@implementation ABTxnAccount
- (instancetype)initWithDictionary:(NSDictionary *)dict {
    self = [super init];
    if (self) {
        id aid = dict[@"id"];
        _accountId = [aid isKindOfClass:NSString.class] ? aid : [NSString stringWithFormat:@"%@", aid ?: @""];
        _name = dict[@"name"] ?: @"";
        _icon = dict[@"icon"] ?: @"";
        _isDefault = [dict[@"isDefault"] boolValue];
    }
    return self;
}
@end

@implementation ABTransaction

- (instancetype)initWithDictionary:(NSDictionary *)dict {
    self = [super init];
    if (self) {
        id tid = dict[@"id"];
        _txnId = [tid isKindOfClass:NSString.class] ? tid : [NSString stringWithFormat:@"%@", tid ?: @""];
        _userId     = dict[@"userId"] ?: @"";
        _type       = dict[@"type"] ?: @"expense";
        id amt      = dict[@"amount"];
        _amount     = [amt isKindOfClass:NSString.class] ? amt : [NSString stringWithFormat:@"%@", amt ?: @"0"];
        id cid      = dict[@"categoryId"];
        _categoryId = [cid isKindOfClass:NSString.class] ? cid : nil;
        _recordDate = dict[@"recordDate"] ?: @"";
        id rt       = dict[@"recordTime"];
        _recordTime = [rt isKindOfClass:NSString.class] ? rt : nil;
        _note       = dict[@"note"] ?: @"";
        _createdAt  = dict[@"createdAt"] ?: @"";
        id da       = dict[@"deletedAt"];
        _deletedAt  = [da isKindOfClass:NSString.class] ? da : nil;

        if ([dict[@"category"] isKindOfClass:NSDictionary.class]) {
            _category = [[ABTxnCategory alloc] initWithDictionary:dict[@"category"]];
        }
        if ([dict[@"account"] isKindOfClass:NSDictionary.class]) {
            _account = [[ABTxnAccount alloc] initWithDictionary:dict[@"account"]];
        }
    }
    return self;
}

- (NSString *)categoryName {
    return self.category.name.length ? self.category.name : @"未分类";
}

- (NSString *)categoryIcon {
    return self.category.icon ?: @"";
}

@end
