//
//  ABAccount.h
//  MyAccountBook
//
//  账本模型，对齐 frontend/src/api/account.ts 的 AccountItem。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABAccount : NSObject

@property (nonatomic, copy) NSString *accountId;
@property (nonatomic, copy) NSString *userId;
@property (nonatomic, copy) NSString *name;
@property (nonatomic, copy) NSString *icon;
@property (nonatomic, assign) NSInteger sort;
@property (nonatomic, assign) BOOL isDefault;
@property (nonatomic, copy) NSString *createdAt;

- (instancetype)initWithDictionary:(NSDictionary *)dict;

@end

NS_ASSUME_NONNULL_END
