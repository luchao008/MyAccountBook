//
//  ABCategoryPicker.h
//  MyAccountBook
//
//  二级分类选择器 —— 对齐 frontend/src/components/CategoryPicker.vue
//  左侧一级分类侧栏 + 右侧二级分类网格（4 列）。
//

#import <UIKit/UIKit.h>
#import "ABCategory.h"

NS_ASSUME_NONNULL_BEGIN

@interface ABCategoryPicker : UIView

@property (nonatomic, copy, nullable) void (^onPicked)(ABCategory *category);
@property (nonatomic, copy, nullable) void (^onDismiss)(void);

/// 需要选择的收支类型（income / expense）
- (instancetype)initWithType:(NSString *)type accountId:(NSString *)accountId;
- (void)setCategories:(NSArray<ABCategory *> *)categories;
- (void)setSelectedId:(nullable NSString *)selectedId;
- (void)show;
- (void)hide;

@end

NS_ASSUME_NONNULL_END
