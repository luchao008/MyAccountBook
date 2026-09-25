//
//  ABNetworkMonitor.m
//  MyAccountBook
//

#import "ABNetworkMonitor.h"
#import <AFNetworking/AFNetworking.h>

@interface ABNetworkMonitor ()
@property (nonatomic, strong) AFNetworkReachabilityManager *manager;
@property (nonatomic, copy, nullable) void (^reachableBlock)(void);
@end

@implementation ABNetworkMonitor

+ (instancetype)shared {
    static ABNetworkMonitor *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[ABNetworkMonitor alloc] init];
    });
    return instance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _manager = [AFNetworkReachabilityManager sharedManager];
    }
    return self;
}

- (BOOL)isOnline {
    return self.manager.isReachable;
}

- (void)startMonitoringWithReachable:(void (^)(void))onReachable {
    self.reachableBlock = onReachable;
    __weak typeof(self) weakSelf = self;
    [self.manager setReachabilityStatusChangeBlock:^(AFNetworkReachabilityStatus status) {
        __strong typeof(weakSelf) self = weakSelf;
        if (status != AFNetworkReachabilityStatusNotReachable && self.reachableBlock) {
            self.reachableBlock();
        }
    }];
    [self.manager startMonitoring];
}

@end
