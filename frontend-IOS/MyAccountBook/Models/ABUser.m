//
//  ABUser.m
//  MyAccountBook
//

#import "ABUser.h"

@implementation ABUser

- (instancetype)initWithDictionary:(NSDictionary *)dict {
    self = [super init];
    if (self) {
        id uid = dict[@"id"];
        _userId   = [uid isKindOfClass:NSString.class] ? uid : [NSString stringWithFormat:@"%@", uid ?: @""];
        _username = dict[@"username"] ?: @"";
    }
    return self;
}

- (NSDictionary *)toDictionary {
    return @{ @"id": _userId ?: @"", @"username": _username ?: @"" };
}

@end
