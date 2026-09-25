//
//  ABCategoryService.m
//  MyAccountBook
//

#import "ABCategoryService.h"
#import "ABHttpClient.h"

@implementation ABCategoryService

static NSArray<ABCategory *> *ABMapCategories(id data) {
    NSMutableArray *out = [NSMutableArray array];
    if ([data isKindOfClass:NSArray.class]) {
        for (id item in data) {
            if ([item isKindOfClass:NSDictionary.class]) {
                [out addObject:[[ABCategory alloc] initWithDictionary:item]];
            }
        }
    }
    return out;
}

+ (void)getCategories:(NSString *)accountId
                 type:(NSString *)type
             parentId:(NSString *)parentId
           visibility:(NSString *)visibility
              success:(ABCatsSuccess)success
              failure:(ABServiceFailure)failure {
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    if (accountId) params[@"accountId"] = accountId;
    if (type) params[@"type"] = type;
    if (parentId) params[@"parentId"] = parentId;
    if (visibility) params[@"visibility"] = visibility;

    [[ABHttpClient sharedClient] GET:@"/categories" params:params success:^(id data) {
        if (success) success(ABMapCategories(data));
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)createCategory:(NSDictionary *)data success:(ABCatSuccess)success failure:(ABServiceFailure)failure {
    [[ABHttpClient sharedClient] POST:@"/categories" params:data success:^(id resp) {
        if (success && [resp isKindOfClass:NSDictionary.class]) {
            success([[ABCategory alloc] initWithDictionary:resp]);
        }
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)updateCategory:(NSString *)accountId
                    id:(NSString *)categoryId
                  data:(NSDictionary *)data
               success:(ABCatSuccess)success
               failure:(ABServiceFailure)failure {
    NSString *path = [NSString stringWithFormat:@"/categories/%@?accountId=%@", categoryId, accountId ?: @""];
    [[ABHttpClient sharedClient] PUT:path params:data success:^(id resp) {
        if (success && [resp isKindOfClass:NSDictionary.class]) {
            success([[ABCategory alloc] initWithDictionary:resp]);
        }
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)deleteCategory:(NSString *)accountId id:(NSString *)categoryId success:(ABDictSuccess)success failure:(ABServiceFailure)failure {
    NSString *path = [NSString stringWithFormat:@"/categories/%@?accountId=%@", categoryId, accountId ?: @""];
    [[ABHttpClient sharedClient] DELETE:path params:nil success:^(id data) {
        if (success) success([data isKindOfClass:NSDictionary.class] ? data : @{});
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)batchDeleteCategories:(NSString *)accountId ids:(NSArray<NSString *> *)ids success:(ABDictSuccess)success failure:(ABServiceFailure)failure {
    NSDictionary *params = @{ @"accountId": accountId ?: @"", @"ids": ids ?: @[] };
    [[ABHttpClient sharedClient] POST:@"/categories/batch-delete" params:params success:^(id data) {
        if (success) success([data isKindOfClass:NSDictionary.class] ? data : @{});
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)batchHideCategories:(NSString *)accountId ids:(NSArray<NSString *> *)ids hidden:(BOOL)hidden success:(ABDictSuccess)success failure:(ABServiceFailure)failure {
    NSDictionary *params = @{ @"accountId": accountId ?: @"", @"ids": ids ?: @[], @"hidden": @(hidden) };
    [[ABHttpClient sharedClient] POST:@"/categories/batch-hide" params:params success:^(id data) {
        if (success) success([data isKindOfClass:NSDictionary.class] ? data : @{});
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)reorderCategories:(NSString *)accountId type:(NSString *)type parentId:(NSString *)parentId ids:(NSArray<NSString *> *)ids success:(ABDictSuccess)success failure:(ABServiceFailure)failure {
    NSDictionary *params = @{
        @"accountId": accountId ?: @"",
        @"type": type ?: @"expense",
        @"parentId": parentId ?: @"",
        @"ids": ids ?: @[],
    };
    [[ABHttpClient sharedClient] POST:@"/categories/reorder" params:params success:^(id data) {
        if (success) success([data isKindOfClass:NSDictionary.class] ? data : @{});
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

@end
