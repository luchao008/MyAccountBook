//
//  ABEmptyView.h
//  MyAccountBook
//
//  空状态视图（对齐 frontend/src/components/EmptyState.vue）
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABEmptyView : UIView

- (instancetype)initWithText:(NSString *)text;
- (instancetype)initWithIcon:(nullable NSString *)icon text:(NSString *)text;

/// 复用同一个空状态时要能换文案（如「搜索备注、分类名或金额」→「没有找到相关流水」）
- (void)setText:(NSString *)text;

@end

NS_ASSUME_NONNULL_END
