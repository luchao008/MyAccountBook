//
//  ABCategoryGrid.h
//  MyAccountBook
//
//  分类网格 —— 对齐 frontend/src/components/CategoryGrid.vue
//  4 列；图标 48px 圆形；选中态浅金底 + 2px 金色描边。
//

#import <UIKit/UIKit.h>
#import "ABCategory.h"

NS_ASSUME_NONNULL_BEGIN

@interface ABCategoryGrid : UIView

@property (nonatomic, strong) NSArray<ABCategory *> *categories;
@property (nonatomic, copy, nullable) NSString *selectedId;
@property (nonatomic, copy, nullable) void (^onPick)(ABCategory *category);

@end

NS_ASSUME_NONNULL_END
