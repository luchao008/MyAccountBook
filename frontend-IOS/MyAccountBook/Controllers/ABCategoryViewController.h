//
//  ABCategoryViewController.h
//  MyAccountBook
//
//  分类管理页（对齐 frontend/src/pages/category/index.vue）
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABCategoryViewController : UIViewController

/// type: @"expense"（默认）| @"income"
/// 对齐前端 `?type=expense|income` —— 类型是页面级参数，页内不再切换。
- (instancetype)initWithType:(NSString *)type;

@end

NS_ASSUME_NONNULL_END
