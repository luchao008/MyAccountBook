//
//  ABFlowViewController.h
//  MyAccountBook
//
//  流水列表页（对齐 frontend/src/pages/flow/index.vue）
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABFlowViewController : UIViewController

/// 重新加载（记一笔保存后调用）
- (void)refresh;

@end

NS_ASSUME_NONNULL_END
