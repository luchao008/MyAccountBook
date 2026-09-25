//
//  ABRootManager.h
//  MyAccountBook
//
//  根路由管理 —— 根据登录态切换 登录页 / 主框架，
//  并监听登录成功、登录失效通知。
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// 登录成功通知（登录页发出）
extern NSString * const ABDidLoginNotification;

@interface ABRootManager : NSObject

+ (instancetype)sharedManager;

/// 设置 window 并展示合适的根控制器（已登录 -> 主框架；否则 -> 登录页）
- (void)setupWithWindow:(UIWindow *)window;

/// 切换到主框架（登录成功后调用）
- (void)showMain;

/// 切换到登录页（登出 / token 失效时调用）
- (void)showLogin;

@end

NS_ASSUME_NONNULL_END
