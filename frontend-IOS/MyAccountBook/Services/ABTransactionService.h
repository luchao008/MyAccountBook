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

/// 全量列表（getAllTransactions: 循环分页拼出来的完整结果）
typedef void (^ABTxnListSuccess)(NSArray<ABTransaction *> *list);
typedef void (^ABSummarySuccess)(NSArray<ABSummaryItem *> *list);
typedef void (^ABDictSuccess)(NSDictionary *dict);
typedef void (^ABServiceFailure)(NSError *error);

@interface ABTransactionService : NSObject

/// 分页查询流水
+ (void)getTransactions:(NSDictionary *)params success:(ABPageSuccess)success failure:(ABServiceFailure)failure;

/// 循环分页拉全量，回调拿到的是**完整**列表。
///
/// ⚠️ 列表接口的 `size` 上限是 **100**（后端 `RuleType.number().integer().min(1).max(100)`），
/// 直接传 500 / 10000 会被参数校验拒绝，返回「输入有误，请检查后重试」——
/// 而且**请求是失败的，不是被截断的**，调用方会拿到空数据。
/// 所以凡是需要「全部流水」的场景（明细展开 / 日历月视图 / 导出）都必须走这个方法。
///
/// 退出条件与前端 `pages/export` 一致：本页为空 / 已取够 total / 触到 200 页安全上限。
+ (void)getAllTransactions:(NSDictionary *)params
                   success:(ABTxnListSuccess)success
                   failure:(ABServiceFailure)failure;

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
