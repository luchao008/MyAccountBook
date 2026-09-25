//
//  ABAlert.h
//  MyAccountBook
//
//  ActionSheet 的 popover 锚点统一入口 —— 抹平 iPhone / iPad 的差异。
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABAlert : NSObject

/// 给 ActionSheet 配 iPad 需要的 popover 锚点。
///
/// ⚠️ **iPhone 上绝不能设 `popoverPresentationController`。**
/// 设了之后 iOS 26 会按 popover 呈现，而 popover 模式**会自动省略「取消」按钮** ——
/// 实测症状：`sheet.actions` 里明明有「取消」，界面上就是不画。
/// 用户只能靠点外部关闭，很容易以为是"这个弹窗卡住了"。
///
/// iPad 上又**必须**提供 sourceView / sourceRect，否则直接崩。
/// 所以按 idiom 分流，全部走这个方法，别在调用处自己写。
///
/// @param anchor 锚定视图（iPad 上贴着它弹）；传 nil 用 vc.view 的中心
+ (void)prepareSheet:(UIAlertController *)sheet
              anchor:(nullable UIView *)anchor
                  in:(UIViewController *)vc;

@end

NS_ASSUME_NONNULL_END
