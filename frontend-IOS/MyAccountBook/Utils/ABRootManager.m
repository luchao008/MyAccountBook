//
//  ABRootManager.m
//  MyAccountBook
//

#import "ABRootManager.h"
#import "ABStorage.h"
#import "ABLoginViewController.h"
#import "ABAccountSelectViewController.h"
#import "ABAccountStore.h"
#import "ABHttpClient.h"
#import <UIKit/UIKit.h>

NSString * const ABDidLoginNotification = @"ABDidLoginNotification";

@interface ABRootManager ()
@property (nonatomic, weak) UIWindow *window;
@end

@implementation ABRootManager

+ (instancetype)sharedManager {
    static ABRootManager *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[ABRootManager alloc] init];
    });
    return instance;
}

- (void)setupWithWindow:(UIWindow *)window {
    self.window = window;

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleLogin)
                                                 name:ABDidLoginNotification
                                               object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleUnauthorized)
                                                 name:ABHttpClientUnauthorizedNotification
                                               object:nil];

    if ([ABStorage token].length) {
        [self showMain];
    } else {
        [self showLogin];
    }
}

- (void)handleLogin {
    [self showMain];
}

- (void)handleUnauthorized {
    [self showLogin];
}

/// 登录后进入账本选择页（对齐前端 reLaunch 到 account-select）
- (void)showMain {
    ABAccountSelectViewController *select = [[ABAccountSelectViewController alloc] init];
    UINavigationController *nav = [[UINavigationController alloc] initWithRootViewController:select];
    nav.navigationBarHidden = YES;
    [self setRootViewController:nav animated:YES];
}

- (void)showLogin {
    ABLoginViewController *login = [[ABLoginViewController alloc] init];
    UINavigationController *nav = [[UINavigationController alloc] initWithRootViewController:login];
    nav.navigationBarHidden = YES;
    [self setRootViewController:nav animated:YES];
}

- (void)setRootViewController:(UIViewController *)vc animated:(BOOL)animated {
    if (!self.window) { return; }
    if (!animated) {
        self.window.rootViewController = vc;
        return;
    }
    [UIView transitionWithView:self.window
                      duration:0.3
                       options:UIViewAnimationOptionTransitionCrossDissolve
                    animations:^{
        BOOL oldState = [UIView areAnimationsEnabled];
        [UIView setAnimationsEnabled:NO];
        self.window.rootViewController = vc;
        [UIView setAnimationsEnabled:oldState];
    } completion:nil];
}

@end
