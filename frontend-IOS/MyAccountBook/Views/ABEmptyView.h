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

@end

NS_ASSUME_NONNULL_END
