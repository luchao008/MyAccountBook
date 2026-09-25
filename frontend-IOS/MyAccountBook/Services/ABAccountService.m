//
//  ABAccountService.m
//  MyAccountBook
//

#import "ABAccountService.h"
#import "ABHttpClient.h"

@implementation ABAccountService

static NSArray<ABAccount *> *ABMapAccounts(id data) {
    NSMutableArray *out = [NSMutableArray array];
    if ([data isKindOfClass:NSArray.class]) {
        for (id item in data) {
            if ([item isKindOfClass:NSDictionary.class]) {
                [out addObject:[[ABAccount alloc] initWithDictionary:item]];
            }
        }
    }
    return out;
}

+ (void)getAccounts:(ABAccountsSuccess)success failure:(ABServiceFailure)failure {
    [[ABHttpClient sharedClient] GET:@"/accounts" params:nil success:^(id data) {
        if (success) success(ABMapAccounts(data));
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)createAccountWithName:(NSString *)name
                         icon:(NSString *)icon
                      copyAll:(BOOL)copyAll
                  categoryIds:(NSArray<NSString *> *)categoryIds
                      success:(ABAccountSuccess)success
                      failure:(ABServiceFailure)failure {
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    params[@"name"] = name ?: @"";
    if (icon.length) params[@"icon"] = icon;
    params[@"copyAll"] = @(copyAll);
    if (categoryIds) params[@"categoryIds"] = categoryIds;

    [[ABHttpClient sharedClient] POST:@"/accounts" params:params success:^(id data) {
        if (success && [data isKindOfClass:NSDictionary.class]) {
            success([[ABAccount alloc] initWithDictionary:data]);
        }
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)getCategoryCandidates:(ABArraySuccess)success failure:(ABServiceFailure)failure {
    [[ABHttpClient sharedClient] GET:@"/accounts/category-candidates" params:nil success:^(id data) {
        if (success) success([data isKindOfClass:NSArray.class] ? data : @[]);
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)importCategories:(NSString *)accountId
             categoryIds:(NSArray<NSString *> *)categoryIds
                 success:(ABDictSuccess)success
                 failure:(ABServiceFailure)failure {
    NSString *path = [NSString stringWithFormat:@"/accounts/%@/categories", accountId];
    [[ABHttpClient sharedClient] POST:path params:@{ @"categoryIds": categoryIds ?: @[] } success:^(id data) {
        if (success) success([data isKindOfClass:NSDictionary.class] ? data : @{});
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)updateAccount:(NSString *)accountId
                 data:(NSDictionary *)data
              success:(ABAccountSuccess)success
              failure:(ABServiceFailure)failure {
    NSString *path = [NSString stringWithFormat:@"/accounts/%@", accountId];
    [[ABHttpClient sharedClient] PUT:path params:data success:^(id resp) {
        if (success && [resp isKindOfClass:NSDictionary.class]) {
            success([[ABAccount alloc] initWithDictionary:resp]);
        }
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)getDeletePreview:(NSString *)accountId success:(ABDictSuccess)success failure:(ABServiceFailure)failure {
    NSString *path = [NSString stringWithFormat:@"/accounts/%@/delete-preview", accountId];
    [[ABHttpClient sharedClient] GET:path params:nil success:^(id data) {
        if (success) success([data isKindOfClass:NSDictionary.class] ? data : @{});
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)deleteAccount:(NSString *)accountId
          confirmName:(NSString *)confirmName
              success:(ABDictSuccess)success
              failure:(ABServiceFailure)failure {
    // 查询串直接拼进 URL（对齐前端 account.ts 的说明）
    NSString *encoded = [confirmName stringByAddingPercentEncodingWithAllowedCharacters:NSCharacterSet.URLQueryAllowedCharacterSet];
    NSString *path = [NSString stringWithFormat:@"/accounts/%@?confirmName=%@", accountId, encoded ?: @""];
    [[ABHttpClient sharedClient] DELETE:path params:nil success:^(id data) {
        if (success) success([data isKindOfClass:NSDictionary.class] ? data : @{});
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)previewMerge:(NSString *)targetId
            sourceId:(NSString *)sourceId
             success:(ABDictSuccess)success
             failure:(ABServiceFailure)failure {
    NSDictionary *params = @{ @"targetId": targetId ?: @"", @"sourceId": sourceId ?: @"" };
    [[ABHttpClient sharedClient] POST:@"/accounts/merge-preview" params:params success:^(id data) {
        if (success) success([data isKindOfClass:NSDictionary.class] ? data : @{});
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)mergeAccounts:(NSString *)targetId
             sourceId:(NSString *)sourceId
              success:(ABDictSuccess)success
              failure:(ABServiceFailure)failure {
    NSDictionary *params = @{ @"targetId": targetId ?: @"", @"sourceId": sourceId ?: @"" };
    [[ABHttpClient sharedClient] POST:@"/accounts/merge" params:params success:^(id data) {
        if (success) success([data isKindOfClass:NSDictionary.class] ? data : @{});
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

@end
