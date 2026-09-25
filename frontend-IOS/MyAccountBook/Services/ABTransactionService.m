//
//  ABTransactionService.m
//  MyAccountBook
//

#import "ABTransactionService.h"
#import "ABHttpClient.h"
#import "ABQueryBuilder.h"

@implementation ABTransactionService

static NSArray<ABTransaction *> *ABMapTxns(id data) {
    NSMutableArray *out = [NSMutableArray array];
    if ([data isKindOfClass:NSArray.class]) {
        for (id item in data) {
            if ([item isKindOfClass:NSDictionary.class]) {
                [out addObject:[[ABTransaction alloc] initWithDictionary:item]];
            }
        }
    }
    return out;
}

+ (void)getTransactions:(NSDictionary *)params success:(ABPageSuccess)success failure:(ABServiceFailure)failure {
    [[ABHttpClient sharedClient] GET:@"/transactions" params:params success:^(id data) {
        if (![data isKindOfClass:NSDictionary.class]) {
            if (success) success(@[], 0, 1, 20);
            return;
        }
        NSArray<ABTransaction *> *list = ABMapTxns(data[@"list"]);
        NSInteger total = [data[@"total"] integerValue];
        NSInteger page  = [data[@"page"] integerValue];
        NSInteger size  = [data[@"size"] integerValue];
        if (success) success(list, total, page, size);
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

/// 列表接口 size 上限与分页安全上限**统一从 ABQueryBuilder 取** ——
/// 这个值被三处踩过（明细 / 日历 / 导出全传了超限值，三个页面都没数据），
/// 常量散在各处就是会漏改。单测钉住 `maxPageSize == 100`。
static NSInteger abTxnPageSize(void) { return (NSInteger)[ABQueryBuilder maxPageSize]; }
static NSInteger abTxnMaxPages(void) { return (NSInteger)[ABQueryBuilder maxPages]; }

/// getAllTransactions 的递归实现。定义在调用者之前，省掉前向声明。
+ (void)fetchTxnPage:(NSInteger)page
              params:(NSDictionary *)params
         accumulated:(NSMutableArray<ABTransaction *> *)acc
             success:(ABTxnListSuccess)success
             failure:(ABServiceFailure)failure {

    NSMutableDictionary *p = [NSMutableDictionary dictionaryWithDictionary:params ?: @{}];
    p[@"page"] = @(page);
    p[@"size"] = @(abTxnPageSize());

    [self getTransactions:p success:^(NSArray<ABTransaction *> *list, NSInteger total, NSInteger curPage, NSInteger size) {
        [acc addObjectsFromArray:list ?: @[]];
        // 与前端一致的三个退出条件：本页为空 / 已取够 / 触到安全上限
        if (list.count == 0 || (NSInteger)acc.count >= total || page >= abTxnMaxPages()) {
            if (success) success([acc copy]);
            return;
        }
        [self fetchTxnPage:page + 1 params:params accumulated:acc success:success failure:failure];
    } failure:failure];
}

+ (void)getAllTransactions:(NSDictionary *)params success:(ABTxnListSuccess)success failure:(ABServiceFailure)failure {
    [self fetchTxnPage:1 params:params accumulated:[NSMutableArray array] success:success failure:failure];
}

+ (void)getTransactionSummary:(NSDictionary *)params success:(ABSummarySuccess)success failure:(ABServiceFailure)failure {
    [[ABHttpClient sharedClient] GET:@"/transactions/summary" params:params success:^(id data) {
        NSMutableArray<ABSummaryItem *> *out = [NSMutableArray array];
        if ([data isKindOfClass:NSArray.class]) {
            for (id item in data) {
                if ([item isKindOfClass:NSDictionary.class]) {
                    [out addObject:[[ABSummaryItem alloc] initWithDictionary:item]];
                }
            }
        }
        if (success) success(out);
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)getTransaction:(NSString *)txnId success:(ABTxnSuccess)success failure:(ABServiceFailure)failure {
    NSString *path = [NSString stringWithFormat:@"/transactions/%@", txnId];
    [[ABHttpClient sharedClient] GET:path params:nil success:^(id data) {
        if (success && [data isKindOfClass:NSDictionary.class]) {
            success([[ABTransaction alloc] initWithDictionary:data]);
        }
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)createTransaction:(NSDictionary *)data success:(ABTxnSuccess)success failure:(ABServiceFailure)failure {
    [[ABHttpClient sharedClient] POST:@"/transactions" params:data success:^(id resp) {
        if (success && [resp isKindOfClass:NSDictionary.class]) {
            success([[ABTransaction alloc] initWithDictionary:resp]);
        }
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)updateTransaction:(NSString *)txnId data:(NSDictionary *)data success:(ABTxnSuccess)success failure:(ABServiceFailure)failure {
    NSString *path = [NSString stringWithFormat:@"/transactions/%@", txnId];
    [[ABHttpClient sharedClient] PUT:path params:data success:^(id resp) {
        if (success && [resp isKindOfClass:NSDictionary.class]) {
            success([[ABTransaction alloc] initWithDictionary:resp]);
        }
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)deleteTransaction:(NSString *)txnId success:(ABDictSuccess)success failure:(ABServiceFailure)failure {
    NSString *path = [NSString stringWithFormat:@"/transactions/%@", txnId];
    [[ABHttpClient sharedClient] DELETE:path params:nil success:^(id data) {
        if (success) success([data isKindOfClass:NSDictionary.class] ? data : @{});
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)restoreTransaction:(NSString *)txnId success:(ABTxnSuccess)success failure:(ABServiceFailure)failure {
    NSString *path = [NSString stringWithFormat:@"/transactions/%@/restore", txnId];
    [[ABHttpClient sharedClient] POST:path params:nil success:^(id resp) {
        if (success && [resp isKindOfClass:NSDictionary.class]) {
            success([[ABTransaction alloc] initWithDictionary:resp]);
        }
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)getDeletedTransactions:(ABTxnsSuccess)success failure:(ABServiceFailure)failure {
    [[ABHttpClient sharedClient] GET:@"/transactions/deleted" params:nil success:^(id data) {
        if (success) success(ABMapTxns(data));
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

@end
