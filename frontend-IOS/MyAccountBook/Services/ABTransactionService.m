//
//  ABTransactionService.m
//  MyAccountBook
//

#import "ABTransactionService.h"
#import "ABHttpClient.h"

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
