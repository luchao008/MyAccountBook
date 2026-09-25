//
//  ABTimePicker.h
//  MyAccountBook
//
//  时间选择器 —— 对齐 frontend/src/components/DateTimePicker.vue 的时间部分。
//  底部弹出滚轮，选 HH:mm。
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABTimePicker : UIView

/// 当前时间（HH:mm），可能为 nil（未记录时间）
@property (nonatomic, copy, nullable) NSString *time;
@property (nonatomic, copy, nullable) void (^onTimeChanged)(NSString * _Nullable time);
@property (nonatomic, copy, nullable) void (^onDismiss)(void);

- (void)show;
- (void)hide;

@end

NS_ASSUME_NONNULL_END
