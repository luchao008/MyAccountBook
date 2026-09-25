//
//  AppDelegate.m
//  MyAccountBook
//

#import "AppDelegate.h"
#import "ABRootManager.h"
#import "ABOfflineQueue.h"
#import "ABNetworkMonitor.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
    [[ABRootManager sharedManager] setupWithWindow:self.window];
    [self.window makeKeyAndVisible];

    [self flushOfflineQueueIfNeeded];
    [[ABNetworkMonitor shared] startMonitoringWithReachable:^{
        [self flushOfflineQueueIfNeeded];
    }];

    return YES;
}

- (void)applicationDidBecomeActive:(UIApplication *)application {
    [self flushOfflineQueueIfNeeded];
}

- (void)flushOfflineQueueIfNeeded {
    if ([[ABOfflineQueue shared] count] == 0) return;
    if (![[ABNetworkMonitor shared] isOnline]) return;
    [[ABOfflineQueue shared] flushWithCompletion:^(NSInteger sent, NSInteger remaining) {
        if (sent > 0) {
            [[NSNotificationCenter defaultCenter] postNotificationName:@"ABOfflineFlushedNotification" object:nil];
        }
    }];
}

@end
