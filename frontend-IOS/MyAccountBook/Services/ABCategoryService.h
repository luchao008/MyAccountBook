//
//  ABCategoryService.h
//  MyAccountBook
//
//  分类 API —— 对齐 frontend/src/api/category.ts
//

#import <Foundation/Foundation.h>
#import "ABCategory.h"

NS_ASSUME_NONNULL_BEGIN

typedef void (^ABCatsSuccess)(NSArray<ABCategory *> *list);
typedef void (^ABCatSuccess)(ABCategory *category);
typedef void (^ABDictSuccess)(NSDictionary *dict);
typedef void (^ABServiceFailure)(NSError *error);

@interface ABCategoryService : NSObject

/// visibility: nil=默认(all) / @"all" / @"visible"
+ (void)getCategories:(NSString *)accountId
                 type:(nullable NSString *)type
             parentId:(nullable NSString *)parentId
           visibility:(nullable NSString *)visibility
              success:(ABCatsSuccess)success
              failure:(ABServiceFailure)failure;

+ (void)createCategory:(NSDictionary *)data success:(ABCatSuccess)success failure:(ABServiceFailure)failure;

+ (void)updateCategory:(NSString *)accountId
                    id:(NSString *)categoryId
                  data:(NSDictionary *)data
               success:(ABCatSuccess)success
               failure:(ABServiceFailure)failure;

+ (void)deleteCategory:(NSString *)accountId id:(NSString *)categoryId success:(ABDictSuccess)success failure:(ABServiceFailure)failure;

+ (void)batchDeleteCategories:(NSString *)accountId ids:(NSArray<NSString *> *)ids success:(ABDictSuccess)success failure:(ABServiceFailure)failure;

+ (void)batchHideCategories:(NSString *)accountId ids:(NSArray<NSString *> *)ids hidden:(BOOL)hidden success:(ABDictSuccess)success failure:(ABServiceFailure)failure;

+ (void)reorderCategories:(NSString *)accountId type:(NSString *)type parentId:(nullable NSString *)parentId ids:(NSArray<NSString *> *)ids success:(ABDictSuccess)success failure:(ABServiceFailure)failure;

@end

NS_ASSUME_NONNULL_END
