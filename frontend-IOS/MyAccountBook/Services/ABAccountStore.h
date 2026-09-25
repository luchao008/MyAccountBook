//
//  ABAccountStore.h
//  MyAccountBook
//
//  当前账本管理（单例）—— 对齐 frontend/src/store/account.ts。
//  当前账本 id 存 NSUserDefaults（key: ab_currentAccountId）。
//

#import <Foundation/Foundation.h>
#import "ABAccount.h"

NS_ASSUME_NONNULL_BEGIN

@interface ABAccountStore : NSObject

+ (instancetype)shared;

@property (nonatomic, strong) NSArray<ABAccount *> *list;
@property (nonatomic, copy, nullable) NSString *currentId;
@property (nonatomic, assign) BOOL loaded;

/// 当前账本对象
- (nullable ABAccount *)current;
- (NSString *)currentName;
- (nullable ABAccount *)defaultAccount;

/// 加载账本列表，并保证 currentId 指向存在的账本。
/// 返回是否发生了「自动回退」（调用方可据此刷新业务数据）
- (void)loadWithCompletion:(void (^)(BOOL changed, NSError * _Nullable error))completion;

/// 仅刷新列表
- (void)refreshWithCompletion:(void (^)(NSError * _Nullable error))completion;

/// 切换当前账本
- (void)switchTo:(NSString *)accountId;

- (void)reset;

@end

NS_ASSUME_NONNULL_END
