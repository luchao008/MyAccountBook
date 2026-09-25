//
//  ABIconView.h
//  MyAccountBook
//
//  分类图标统一渲染视图 —— 对齐 frontend/src/components/CategoryIcon.vue
//  自动分流三种形态：
//    1. img:<中文名>  → 图片图标（bundle 内 PNG）
//    2. 其他非空字符串 → 当文字（emoji）渲染
//    3. 空             → 兜底 emoji
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABIconView : UIView

@property (nonatomic, copy, nullable) NSString *iconKey;
@property (nonatomic, assign) CGFloat size;

- (instancetype)initWithSize:(CGFloat)size;

@end

NS_ASSUME_NONNULL_END
