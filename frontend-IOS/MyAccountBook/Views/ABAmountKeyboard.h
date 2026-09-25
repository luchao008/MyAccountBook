//
//  ABAmountKeyboard.h
//  MyAccountBook
//
//  金额输入键盘 —— 对齐 frontend/src/components/AmountKeyboard.vue
//  4 列栅格；主操作「完成」右下角纵向跨两行；键高 48；1px 分隔线。
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABAmountKeyboard : UIView

/// 当前输入串（如 "38.5"）
@property (nonatomic, copy) NSString *value;
/// 底部安全区留白（贴屏幕底时用，按键区域会相应上移）
@property (nonatomic, assign) CGFloat bottomInset;
/// 完成
@property (nonatomic, copy, nullable) void (^onConfirm)(void);
/// 值变化
@property (nonatomic, copy, nullable) void (^onChange)(NSString *value);

@end

NS_ASSUME_NONNULL_END
