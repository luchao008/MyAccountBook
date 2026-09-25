//
//  ABCategory.h
//  MyAccountBook
//
//  分类模型，对齐 frontend/src/api/category.ts 的 CategoryItem。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABCategory : NSObject

@property (nonatomic, copy) NSString *categoryId;
@property (nonatomic, copy) NSString *userId;
@property (nonatomic, copy) NSString *accountId;
@property (nonatomic, copy) NSString *name;
@property (nonatomic, copy) NSString *type;      // "income" | "expense"
@property (nonatomic, copy) NSString *icon;
@property (nonatomic, assign) NSInteger sort;
@property (nonatomic, copy, nullable) NSString *parentId;  // nil = 一级分类
@property (nonatomic, assign) BOOL isHidden;

- (instancetype)initWithDictionary:(NSDictionary *)dict;

/// 是否一级分类
- (BOOL)isRoot;

@end

NS_ASSUME_NONNULL_END
