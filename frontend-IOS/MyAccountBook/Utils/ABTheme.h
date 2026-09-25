//
//  ABTheme.h
//  MyAccountBook
//
//  设计 Token —— 对齐前端 frontend/src/styles/tokens.scss（v1.1「iOS 原生观感 · 暖金调」）
//  仅声明，不产生副作用。
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// 十六进制颜色（如 0xF8F8F8）
static inline UIColor *ABColorHex(NSUInteger hex) {
    return [UIColor colorWithRed:((hex >> 16) & 0xFF) / 255.0
                           green:((hex >> 8) & 0xFF) / 255.0
                            blue:(hex & 0xFF) / 255.0
                           alpha:1.0];
}

@interface ABTheme : NSObject

// —— 表面三层 ——
+ (UIColor *)bgPage;        // #F8F8F8 页面底
+ (UIColor *)bgCard;        // #FFFFFF 卡片/列表行
+ (UIColor *)bgInset;       // #F5F5F5 内嵌槽
+ (UIColor *)line;          // #F1F1F1 分组内分隔线
+ (UIColor *)lineStrong;    // #E5E5EA 需强调的分隔
+ (UIColor *)bgMask;        // rgba(0,0,0,0.45) 弹层遮罩

// —— 文字阶 ——
+ (UIColor *)textPrimary;    // #222226
+ (UIColor *)textSecondary;  // #6B6B72
+ (UIColor *)textTertiary;   // #9A9AA0 仅装饰图形
+ (UIColor *)textDisabled;   // #AEAEB2
+ (UIColor *)textInverse;    // #FFFFFF 深底文字

// —— 品牌金 ——
+ (UIColor *)goldFill;      // #E4AD77 仅图形
+ (UIColor *)gold;          // #A85F12 文字/按钮底/Tab 选中
+ (UIColor *)goldPressed;   // #8F5312 按下态
+ (UIColor *)goldSoft;      // #FDF6EF 浅金底
+ (UIColor *)heroInk;       // #8F5312 Hero 区文字（压浅金渐变达标）

// —— 语义色 ——
+ (UIColor *)income;   // #D92D20 收入红
+ (UIColor *)expense;  // #0F7B7C 支出青绿
+ (UIColor *)info;     // #1D63B8
+ (UIColor *)danger;   // #D92D20
+ (UIColor *)warning;  // #B45309

// —— 字体 ——
+ (UIFont *)fontDisplayLg;  // 36 semibold
+ (UIFont *)fontDisplay;    // 28 semibold
+ (UIFont *)fontH1;         // 20 semibold
+ (UIFont *)fontH2;         // 17 medium
+ (UIFont *)fontBodyLg;     // 16 regular
+ (UIFont *)fontBody;       // 15 regular
+ (UIFont *)fontBodySm;     // 14 regular
+ (UIFont *)fontCaption;    // 12 regular

@end

// —— 间距（8px 栅格）——
static const CGFloat kSpace1 = 4.0;
static const CGFloat kSpace2 = 8.0;
static const CGFloat kSpace3 = 12.0;
static const CGFloat kSpace4 = 16.0;
static const CGFloat kSpace5 = 20.0;
static const CGFloat kSpace6 = 24.0;
static const CGFloat kSpace8 = 32.0;

// —— 圆角 ——
static const CGFloat kRadiusSm = 6.0;    // 分段控件、小控件
static const CGFloat kRadiusMd = 10.0;   // 输入框、按钮
static const CGFloat kRadiusCard = 16.0; // 卡片
static const CGFloat kRadiusPill = 999.0;

NS_ASSUME_NONNULL_END
