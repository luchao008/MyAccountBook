//
//  ABUser.h
//  MyAccountBook
//
//  用户模型，对齐前端 frontend/src/store/user.ts 的 UserInfo。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABUser : NSObject

@property (nonatomic, copy) NSString *userId;
@property (nonatomic, copy) NSString *username;

- (instancetype)initWithDictionary:(NSDictionary *)dict;
- (NSDictionary *)toDictionary;

@end

NS_ASSUME_NONNULL_END
