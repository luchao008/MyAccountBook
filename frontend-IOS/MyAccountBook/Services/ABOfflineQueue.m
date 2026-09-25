//
//  ABOfflineQueue.m
//  MyAccountBook
//

#import "ABOfflineQueue.h"
#import "ABTransactionService.h"

static NSString * const kQueueKey = @"ab_offline_txn_queue";

@implementation ABOfflineTxn

- (instancetype)initWithClientId:(NSString *)clientId payload:(NSDictionary *)payload {
    self = [super init];
    if (self) {
        _clientId = clientId;
        _payload = payload;
        _queuedAt = [[NSDate date] timeIntervalSince1970];
    }
    return self;
}

- (NSDictionary *)toDictionary {
    return @{ @"clientId": _clientId,
              @"queuedAt": @(_queuedAt),
              @"payload": _payload ?: @{} };
}

+ (instancetype)fromDictionary:(NSDictionary *)dict {
    ABOfflineTxn *t = [[ABOfflineTxn alloc] initWithClientId:dict[@"clientId"] ?: @"" payload:dict[@"payload"] ?: @{}];
    t.queuedAt = [dict[@"queuedAt"] doubleValue];
    return t;
}

@end

@implementation ABOfflineQueue

+ (instancetype)shared {
    static ABOfflineQueue *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[ABOfflineQueue alloc] init];
    });
    return instance;
}

- (NSArray<NSDictionary *> *)rawList {
    NSArray *arr = [[NSUserDefaults standardUserDefaults] arrayForKey:kQueueKey];
    return [arr isKindOfClass:NSArray.class] ? arr : @[];
}

- (void)saveList:(NSArray<NSDictionary *> *)list {
    [[NSUserDefaults standardUserDefaults] setObject:list forKey:kQueueKey];
    [[NSUserDefaults standardUserDefaults] synchronize];
}

- (NSInteger)count {
    return [self rawList].count;
}

- (NSString *)genClientId {
    return [[NSUUID UUID] UUIDString];
}

- (void)enqueue:(NSDictionary *)payload {
    ABOfflineTxn *txn = [[ABOfflineTxn alloc] initWithClientId:[self genClientId] payload:payload];
    NSMutableArray *list = [[self rawList] mutableCopy];
    [list addObject:[txn toDictionary]];
    [self saveList:list];
    NSLog(@"[offline] 已入队，当前待补传 %lu 条", (unsigned long)list.count);
}

- (void)flushWithCompletion:(void (^)(NSInteger, NSInteger))completion {
    NSArray<NSDictionary *> *list = [self rawList];
    if (!list.count) {
        if (completion) completion(0, 0);
        return;
    }

    NSMutableArray *remaining = [list mutableCopy];
    __block NSInteger sent = 0;

    // 串行补传：某条失败即停止（保留剩余，包括当前这条）
    __block NSInteger index = 0;
    __block void (^step)(void);
    step = ^{
        if (index >= (NSInteger)remaining.count) {
            [self saveList:remaining];
            if (completion) completion(sent, remaining.count);
            return;
        }

        NSDictionary *dict = remaining[index];
        ABOfflineTxn *txn = [ABOfflineTxn fromDictionary:dict];
        NSMutableDictionary *params = [txn.payload mutableCopy];
        params[@"clientId"] = txn.clientId;

        [ABTransactionService createTransaction:params success:^(ABTransaction *t) {
            sent += 1;
            [remaining removeObjectAtIndex:index];  // 成功后移除，index 不前进
            step();
        } failure:^(NSError *error) {
            NSLog(@"[offline] 补传中断: %@", error.localizedDescription);
            [self saveList:remaining];
            if (completion) completion(sent, remaining.count);
        }];
    };
    step();
}

- (void)clear {
    [self saveList:@[]];
}

@end
