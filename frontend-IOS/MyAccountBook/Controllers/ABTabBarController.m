//
//  ABTabBarController.m
//  MyAccountBook
//

#import "ABTabBarController.h"
#import "ABTheme.h"
#import "ABFlowViewController.h"
#import "ABReportViewController.h"
#import "ABRecordViewController.h"

@interface ABTabBarController () <UITabBarControllerDelegate>
@end

@implementation ABTabBarController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.delegate = self;

    ABFlowViewController *flow = [[ABFlowViewController alloc] init];
    UINavigationController *flowNav = [[UINavigationController alloc] initWithRootViewController:flow];
    flowNav.navigationBarHidden = YES;
    flowNav.tabBarItem = [[UITabBarItem alloc] initWithTitle:@"流水" image:[UIImage systemImageNamed:@"list.bullet.rectangle"] tag:0];

    // 占位项（点击时被拦截，不展示）
    UIViewController *recordPlaceholder = [[UIViewController alloc] init];
    recordPlaceholder.tabBarItem = [[UITabBarItem alloc] initWithTitle:@"记一笔" image:[UIImage systemImageNamed:@"plus.circle.fill"] tag:1];

    ABReportViewController *report = [[ABReportViewController alloc] init];
    report.tabBarItem = [[UITabBarItem alloc] initWithTitle:@"报表" image:[UIImage systemImageNamed:@"chart.bar"] tag:2];

    self.viewControllers = @[flowNav, recordPlaceholder, report];

    self.tabBar.tintColor = [ABTheme gold];
    self.tabBar.unselectedItemTintColor = [ABTheme textSecondary];
    self.tabBar.backgroundColor = [ABTheme bgCard];
}

#pragma mark - UITabBarControllerDelegate

- (BOOL)tabBarController:(UITabBarController *)tabBarController shouldSelectViewController:(UIViewController *)viewController {
    NSInteger index = [tabBarController.viewControllers indexOfObject:viewController];
    if (index == 1) {
        [self presentRecord];
        return NO;
    }
    return YES;
}

- (void)presentRecord {
    ABRecordViewController *record = [[ABRecordViewController alloc] initWithTransaction:nil];
    UINavigationController *nav = [[UINavigationController alloc] initWithRootViewController:record];
    nav.modalPresentationStyle = UIModalPresentationPageSheet;

    record.title = @"记一笔";
    record.navigationItem.leftBarButtonItem = [[UIBarButtonItem alloc] initWithTitle:@"取消" style:UIBarButtonItemStylePlain target:self action:@selector(dismissRecord)];

    __weak typeof(self) weakSelf = self;
    record.onSaved = ^{
        __strong typeof(weakSelf) self = weakSelf;
        UINavigationController *flowNav = self.viewControllers.firstObject;
        UIViewController *root = flowNav.viewControllers.firstObject;
        if ([root isKindOfClass:ABFlowViewController.class]) {
            [(ABFlowViewController *)root refresh];
        }
    };
    [self presentViewController:nav animated:YES completion:nil];
}

- (void)dismissRecord {
    [self dismissViewControllerAnimated:YES completion:nil];
}

@end
