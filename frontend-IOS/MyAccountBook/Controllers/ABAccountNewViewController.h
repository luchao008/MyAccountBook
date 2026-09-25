//
//  ABAccountNewViewController.h
//  MyAccountBook
//
//  新建账本页（对齐 frontend/src/pages/account-new/index.vue）
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABAccountNewViewController : UIViewController

@property (nonatomic, copy, nullable) void (^onCreated)(void);

@end

NS_ASSUME_NONNULL_END
