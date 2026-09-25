//
//  ABAccountService.h
//  MyAccountBook
//
//  账本 API —— 对齐 frontend/src/api/account.ts
//

#import <Foundation/Foundation.h>
#import "ABAccount.h"

NS_ASSUME_NONNULL_BEGIN

typedef void (^ABAccountsSuccess)(NSArray<ABAccount *> *list);
typedef void (^ABAccountSuccess)(ABAccount *account);
typedef void (^ABDictSuccess)(NSDictionary *dict);
typedef void (^ABArraySuccess)(NSArray *list);
typedef void (^ABServiceFailure)(NSError *error);

@interface ABAccountService : NSObject

+ (void)getAccounts:(ABAccountsSuccess)success failure:(ABServiceFailure)failure;

+ (void)createAccountWithName:(NSString *)name
                         icon:(nullable NSString *)icon
                      copyAll:(BOOL)copyAll
                  categoryIds:(nullable NSArray<NSString *> *)categoryIds
                      success:(ABAccountSuccess)success
                      failure:(ABServiceFailure)failure;

/// 分类候选：默认账本（母本）的全部分类（返回原始字典数组，由调用方解析）
+ (void)getCategoryCandidates:(ABArraySuccess)success failure:(ABServiceFailure)failure;

+ (void)importCategories:(NSString *)accountId
             categoryIds:(NSArray<NSString *> *)categoryIds
                 success:(ABDictSuccess)success
                 failure:(ABServiceFailure)failure;

+ (void)updateAccount:(NSString *)accountId
                 data:(NSDictionary *)data
              success:(ABAccountSuccess)success
              failure:(ABServiceFailure)failure;

/// 删除前预检：返回会连带删除多少笔交易
+ (void)getDeletePreview:(NSString *)accountId success:(ABDictSuccess)success failure:(ABServiceFailure)failure;

+ (void)deleteAccount:(NSString *)accountId
          confirmName:(NSString *)confirmName
              success:(ABDictSuccess)success
              failure:(ABServiceFailure)failure;

+ (void)previewMerge:(NSString *)targetId
            sourceId:(NSString *)sourceId
             success:(ABDictSuccess)success
             failure:(ABServiceFailure)failure;

+ (void)mergeAccounts:(NSString *)targetId
             sourceId:(NSString *)sourceId
              success:(ABDictSuccess)success
              failure:(ABServiceFailure)failure;

@end

NS_ASSUME_NONNULL_END
