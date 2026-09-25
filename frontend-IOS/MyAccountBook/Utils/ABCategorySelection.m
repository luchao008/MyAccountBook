//
//  ABCategorySelection.m
//  MyAccountBook
//

#import "ABCategorySelection.h"

@implementation ABCategorySelection

+ (NSArray<NSString *> *)childrenOfRoot:(ABCategory *)root
                          allCategories:(NSArray<ABCategory *> *)all {
    NSMutableArray<NSString *> *out = [NSMutableArray array];
    for (ABCategory *c in all) {
        if (c.parentId.length && [c.parentId isEqualToString:root.categoryId]) {
            [out addObject:c.categoryId];
        }
    }
    return out;
}

+ (NSArray<NSString *> *)idsAffectedByTogglingRoot:(ABCategory *)root
                                     allCategories:(NSArray<ABCategory *> *)all {
    NSMutableArray<NSString *> *out = [NSMutableArray arrayWithObject:root.categoryId];
    [out addObjectsFromArray:[self childrenOfRoot:root allCategories:all]];
    return out;
}

+ (NSArray<NSString *> *)allIdsInCategories:(NSArray<ABCategory *> *)all {
    NSMutableArray<NSString *> *out = [NSMutableArray array];
    for (ABCategory *r in [self rootsOfCategories:all]) {
        [out addObject:r.categoryId];
        [out addObjectsFromArray:[self childrenOfRoot:r allCategories:all]];
    }
    return out;
}

+ (NSArray<ABCategory *> *)rootsOfCategories:(NSArray<ABCategory *> *)all {
    NSMutableArray<ABCategory *> *income = [NSMutableArray array];
    NSMutableArray<ABCategory *> *expense = [NSMutableArray array];
    for (ABCategory *c in all) {
        if (c.parentId.length) continue;
        if ([c.type isEqualToString:@"income"]) [income addObject:c];
        else [expense addObject:c];
    }
    return [income arrayByAddingObjectsFromArray:expense];
}

+ (BOOL)shouldSelectRoot:(ABCategory *)root
           withSelection:(NSSet<NSString *> *)selection
           allCategories:(NSArray<ABCategory *> *)all {
    NSArray<NSString *> *kids = [self childrenOfRoot:root allCategories:all];
    if (kids.count == 0) return NO;
    for (NSString *kid in kids) {
        if (![selection containsObject:kid]) return NO;
    }
    return YES;
}

+ (NSInteger)rootState:(ABCategory *)root
         withSelection:(NSSet<NSString *> *)selection
         allCategories:(NSArray<ABCategory *> *)all {
    if ([selection containsObject:root.categoryId]) return 1;
    for (NSString *kid in [self childrenOfRoot:root allCategories:all]) {
        if ([selection containsObject:kid]) return 2;
    }
    return 0;
}

+ (BOOL)isAllSelectedWithSelection:(NSSet<NSString *> *)selection
                     allCategories:(NSArray<ABCategory *> *)all {
    NSArray<ABCategory *> *roots = [self rootsOfCategories:all];
    if (roots.count == 0) return NO;
    for (ABCategory *r in roots) {
        if (![selection containsObject:r.categoryId]) return NO;
    }
    return YES;
}

+ (NSArray<NSString *> *)compressSelection:(NSSet<NSString *> *)selection
                             allCategories:(NSArray<ABCategory *> *)all {
    NSMutableArray<NSString *> *out = [NSMutableArray array];
    for (ABCategory *r in [self rootsOfCategories:all]) {
        if ([selection containsObject:r.categoryId]) {
            // 一级已勾 → 只发一级，后端会连带其下全部二级
            [out addObject:r.categoryId];
        } else {
            for (NSString *kid in [self childrenOfRoot:r allCategories:all]) {
                if ([selection containsObject:kid]) [out addObject:kid];
            }
        }
    }
    return out;
}

+ (NSSet<NSString *> *)expandSelection:(NSSet<NSString *> *)selection
                          allCategories:(NSArray<ABCategory *> *)all {
    NSMutableSet<NSString *> *out = [NSMutableSet setWithSet:selection];
    for (ABCategory *r in [self rootsOfCategories:all]) {
        if ([selection containsObject:r.categoryId]) {
            [out addObject:r.categoryId];
            [out addObjectsFromArray:[self childrenOfRoot:r allCategories:all]];
        }
    }
    return out;
}

@end
