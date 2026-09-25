//
//  ABCache.m
//  MyAccountBook
//

#import "ABCache.h"
#import <YYCache/YYCache.h>

@interface ABCache ()
@property (nonatomic, strong) YYCache *cache;
@end

@implementation ABCache

+ (instancetype)sharedCache {
    static ABCache *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[ABCache alloc] init];
    });
    return instance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _cache = [[YYCache alloc] initWithName:@"com.luchao.MyAccountBook.cache"];
    }
    return self;
}

- (void)setObject:(id)object forKey:(NSString *)key {
    if (!key.length) { return; }
    if (object) { [self.cache setObject:object forKey:key]; }
    else { [self.cache removeObjectForKey:key]; }
}

- (id)objectForKey:(NSString *)key {
    if (!key.length) { return nil; }
    return [self.cache objectForKey:key];
}

- (void)removeObjectForKey:(NSString *)key {
    if (!key.length) { return; }
    [self.cache removeObjectForKey:key];
}

- (void)removeAllObjects {
    [self.cache removeAllObjects];
}

@end
