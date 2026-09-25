//
//  ABAlert.m
//  MyAccountBook
//

#import "ABAlert.h"

@implementation ABAlert

+ (void)prepareSheet:(UIAlertController *)sheet
              anchor:(UIView *)anchor
                  in:(UIViewController *)vc {
    if (!sheet || !vc) return;

    // iPhone：什么都不做 —— 交给系统按 modal ActionSheet 呈现（底部/卡片，带取消）
    if (vc.traitCollection.userInterfaceIdiom != UIUserInterfaceIdiomPad) return;

    // iPad：必须给锚点，否则 present 时崩
    UIView *target = anchor ?: vc.view;
    sheet.popoverPresentationController.sourceView = target;
    sheet.popoverPresentationController.sourceRect = target.bounds;
}

@end
