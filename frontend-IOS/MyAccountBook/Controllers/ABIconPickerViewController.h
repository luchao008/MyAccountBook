//
//  ABIconPickerViewController.h
//  MyAccountBook
//
//  图标选择页 —— 对齐 frontend/src/pages/icon-picker/index.vue
//  展示 img: 图片图标全集，选中回传。
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABIconPickerViewController : UIViewController

/// 初始 Tab（0=图片，1=彩色）
@property (nonatomic, assign) NSInteger initialTab;

@property (nonatomic, copy, nullable) void (^onPicked)(NSString *iconKey);

@end

NS_ASSUME_NONNULL_END
