//
//  ABTransactionService.h
//  MyAccountBook
//
//  流水 API —— 对齐 frontend/src/api/transaction.ts
//

#import <Foundation/Foundation.h>
#import "ABTransaction.h"
#import "ABSummaryItem.h"

NS_ASSUME_NONNULL_BEGIN

typedef void (^ABTxnSuccess)(ABTransaction *txn);
typedef void (^ABTxnsSuccess)(NSArray<ABTransaction *> *list);
typedef void (^ABPageSuccess)(NSArray<ABTransaction *> *list, NSInteger total, NSInteger page, NSInteger size);
typedef void (^ABSummarySuccess)(NSArray<ABSummaryItem *> *list);
typedef void (^ABDictSuccess)(NSDictionary *dict);
typedef void (^ABServiceFailure)(NSError *error);

@interface ABTransactionService : NSObject

/// 分页查询流水
+ (void)getTransactions:(NSDictionary *)params success:(ABPageSuccess)success failure:(ABServiceFailure)failure;

/// 流水分组汇总（流水页主列表）
+ (void)getTransactionSummary:(NSDictionary *)params success:(ABSummarySuccess)success failure:(ABServiceFailure)failure;

+ (void)getTransaction:(NSString *)txnId success:(ABTxnSuccess)success failure:(ABServiceFailure)failure;

+ (void)createTransaction:(NSDictionary *)data success:(ABTxnSuccess)success failure:(ABServiceFailure)failure;

+ (void)updateTransaction:(NSString *)txnId data:(NSDictionary *)data success:(ABTxnSuccess)success failure:(ABServiceFailure)failure;

+ (void)deleteTransaction:(NSString *)txnId success:(ABDictSuccess)success failure:(ABServiceFailure)failure;

+ (void)restoreTransaction:(NSString *)txnId success:(ABTxnSuccess)success failure:(ABServiceFailure)failure;

+ (void)getDeletedTransactions:(ABTxnsSuccess)success failure:(ABServiceFailure)failure;

@end

NS_ASSUME_NONNULL_END
