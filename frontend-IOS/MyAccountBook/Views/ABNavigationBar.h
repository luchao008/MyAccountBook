//
//  ABNavigationBar.h
//  MyAccountBook
//
//  自定义导航栏（对齐各页面的顶部栏）
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABNavigationBar : UIView

@property (nonatomic, strong, readonly) UILabel *titleLabel;
@property (nonatomic, strong, readonly) UIButton *backButton;
@property (nonatomic, strong, readonly) UIButton *rightButton;

/// 是否显示返回按钮（默认 YES）
@property (nonatomic, assign) BOOL showsBackButton;

- (void)setTitle:(NSString *)title;

/// 返回按钮 / 右侧按钮点击回调
@property (nonatomic, copy, nullable) void (^onBack)(void);
@property (nonatomic, copy, nullable) void (^onRight)(void);

/// 设置右侧按钮文案（传 nil 隐藏）
- (void)setRightTitle:(nullable NSString *)title;

@end

NS_ASSUME_NONNULL_END
