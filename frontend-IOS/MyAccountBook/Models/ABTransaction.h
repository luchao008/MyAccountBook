//
//  ABTransaction.h
//  MyAccountBook
//
//  流水模型，对齐 frontend/src/api/transaction.ts 的 TransactionItem。
//  金额始终用字符串承载（如 "38.50"），避免浮点误差。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// 流水内嵌的分类信息
@interface ABTxnCategory : NSObject
@property (nonatomic, copy) NSString *categoryId;
@property (nonatomic, copy) NSString *name;
@property (nonatomic, copy) NSString *icon;
@property (nonatomic, copy) NSString *type;
- (instancetype)initWithDictionary:(NSDictionary *)dict;
@end

/// 流水内嵌的账本信息
@interface ABTxnAccount : NSObject
@property (nonatomic, copy) NSString *accountId;
@property (nonatomic, copy) NSString *name;
@property (nonatomic, copy) NSString *icon;
@property (nonatomic, assign) BOOL isDefault;
- (instancetype)initWithDictionary:(NSDictionary *)dict;
@end

@interface ABTransaction : NSObject

@property (nonatomic, copy) NSString *txnId;
@property (nonatomic, copy) NSString *userId;
@property (nonatomic, copy) NSString *type;        // "income" | "expense"
@property (nonatomic, copy) NSString *amount;      // 字符串 "38.50"
@property (nonatomic, copy, nullable) NSString *categoryId;
@property (nonatomic, copy) NSString *recordDate;  // YYYY-MM-DD
@property (nonatomic, copy, nullable) NSString *recordTime; // HH:mm:ss
@property (nonatomic, copy) NSString *note;
@property (nonatomic, copy) NSString *createdAt;
@property (nonatomic, copy, nullable) NSString *deletedAt;
@property (nonatomic, strong, nullable) ABTxnCategory *category;
@property (nonatomic, strong, nullable) ABTxnAccount *account;

- (instancetype)initWithDictionary:(NSDictionary *)dict;

/// 分类显示名（无分类时返回"未分类"）
- (NSString *)categoryName;
/// 分类图标（无分类时返回空串）
- (NSString *)categoryIcon;

@end

NS_ASSUME_NONNULL_END
