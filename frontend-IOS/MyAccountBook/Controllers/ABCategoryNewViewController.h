//
//  ABCategoryNewViewController.h
//  MyAccountBook
//
//  新建/编辑分类页 —— 对齐 frontend/src/pages/category-new/index.vue
//

#import <UIKit/UIKit.h>
#import "ABCategory.h"

NS_ASSUME_NONNULL_BEGIN

@interface ABCategoryNewViewController : UIViewController

/// 编辑模式传已有分类；新建传 nil
- (instancetype)initWithCategory:(nullable ABCategory *)category type:(NSString *)type parentId:(nullable NSString *)parentId;

@property (nonatomic, copy, nullable) void (^onSaved)(void);

@end

NS_ASSUME_NONNULL_END
