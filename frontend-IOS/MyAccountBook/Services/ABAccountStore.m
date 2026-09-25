//
//  ABAccountStore.m
//  MyAccountBook
//

#import "ABAccountStore.h"
#import "ABAccountService.h"

static NSString * const kCurrentAccountKey = @"ab_currentAccountId";

@implementation ABAccountStore

+ (instancetype)shared {
    static ABAccountStore *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[ABAccountStore alloc] init];
    });
    return instance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _list = @[];
        _currentId = [[NSUserDefaults standardUserDefaults] stringForKey:kCurrentAccountKey];
    }
    return self;
}

- (ABAccount *)current {
    if (!self.currentId) return nil;
    for (ABAccount *a in self.list) {
        if ([a.accountId isEqualToString:self.currentId]) return a;
    }
    return nil;
}

- (NSString *)currentName {
    ABAccount *a = [self current];
    return a.name.length ? a.name : @"账本";
}

- (ABAccount *)defaultAccount {
    for (ABAccount *a in self.list) {
        if (a.isDefault) return a;
    }
    return nil;
}

- (void)loadWithCompletion:(void (^)(BOOL, NSError *))completion {
    __weak typeof(self) weakSelf = self;
    [ABAccountService getAccounts:^(NSArray<ABAccount *> *list) {
        __strong typeof(weakSelf) self = weakSelf;
        self.list = list;
        self.loaded = YES;

        NSString *prevId = self.currentId;
        BOOL stillExists = NO;
        for (ABAccount *a in list) {
            if ([a.accountId isEqualToString:prevId ?: @""]) { stillExists = YES; break; }
        }

        if (!stillExists) {
            ABAccount *fallback = [self defaultAccount] ?: list.firstObject;
            self.currentId = fallback.accountId;
            if (self.currentId) {
                [[NSUserDefaults standardUserDefaults] setObject:self.currentId forKey:kCurrentAccountKey];
            } else {
                [[NSUserDefaults standardUserDefaults] removeObjectForKey:kCurrentAccountKey];
            }
        }

        if (completion) completion(![self.currentId isEqualToString:prevId ?: @""], nil);
    } failure:^(NSError *error) {
        if (completion) completion(NO, error);
    }];
}

- (void)refreshWithCompletion:(void (^)(NSError *))completion {
    __weak typeof(self) weakSelf = self;
    [ABAccountService getAccounts:^(NSArray<ABAccount *> *list) {
        __strong typeof(weakSelf) self = weakSelf;
        self.list = list;
        if (completion) completion(nil);
    } failure:^(NSError *error) {
        if (completion) completion(error);
    }];
}

- (void)switchTo:(NSString *)accountId {
    for (ABAccount *a in self.list) {
        if ([a.accountId isEqualToString:accountId]) {
            self.currentId = accountId;
            [[NSUserDefaults standardUserDefaults] setObject:accountId forKey:kCurrentAccountKey];
            return;
        }
    }
}

- (void)reset {
    self.list = @[];
    self.currentId = nil;
    self.loaded = NO;
    [[NSUserDefaults standardUserDefaults] removeObjectForKey:kCurrentAccountKey];
}

@end
