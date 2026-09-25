//
//  ABAccountImportViewController.h
//  MyAccountBook
//
//  从母本导入分类（对齐 frontend/src/pages/account-import/index.vue）
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABAccountImportViewController : UIViewController

- (instancetype)initWithAccountId:(NSString *)accountId;

@end

NS_ASSUME_NONNULL_END
