//
//  ABCategorySelection.h
//  MyAccountBook
//
//  分类多选的**纯逻辑** —— 不依赖任何 UI，可被单测直接覆盖。
//
//  抽出来的原因：这套勾选规则有三个不变量，写错了**界面看起来完全正常**，
//  但筛出来的东西和用户以为的不是一回事。最隐蔽的是第三条：
//
//    `root.id ∈ 选中集` ⟺ 该一级的**全部二级也都在**选中集里
//
//  不做这一步的话：用户取消了一个二级、而 root.id 仍在选中集里，
//  后端「传一级连带其下全部二级」会把那次取消**吃掉** ——
//  用户点了"不要这个二级"，结果它还在。
//

#import <Foundation/Foundation.h>
#import "ABCategory.h"

NS_ASSUME_NONNULL_BEGIN

@interface ABCategorySelection : NSObject

/// 某一级分类及其全部二级的 id（勾一级 = 连带勾这些）
+ (NSArray<NSString *> *)idsAffectedByTogglingRoot:(ABCategory *)root
                                        allCategories:(NSArray<ABCategory *> *)all;

/// 全部 id（一级 + 其全部二级）
+ (NSArray<NSString *> *)allIdsInCategories:(NSArray<ABCategory *> *)all;

/// 一级分类列表：**收入在前、支出在后**，段内保持传入顺序（后端已按 sort / id 排好）
+ (NSArray<ABCategory *> *)rootsOfCategories:(NSArray<ABCategory *> *)all;

/// 某一级下的二级分类（保持传入顺序）
+ (NSArray<ABCategory *> *)childrenOfRoot:(ABCategory *)root
                            allCategories:(NSArray<ABCategory *> *)all;

/// 一级是否该留在选中集里（维护不变量）。
/// 规则：该一级**有二级且全被选中** ⇒ 留下；否则移除。
+ (BOOL)shouldSelectRoot:(ABCategory *)root
            withSelection:(NSSet<NSString *> *)selection
            allCategories:(NSArray<ABCategory *> *)all;

/// 一级的显示态。
/// 0 = 未选，1 = 全选，2 = **半选**（自身没勾，但其下有二级被勾）
+ (NSInteger)rootState:(ABCategory *)root
         withSelection:(NSSet<NSString *> *)selection
         allCategories:(NSArray<ABCategory *> *)all;

/// 全部一级都被选中
+ (BOOL)isAllSelectedWithSelection:(NSSet<NSString *> *)selection
                      allCategories:(NSArray<ABCategory *> *)all;

/// 提交时**压缩**：一级已勾 → 只发一级（后端会连带其下二级）；否则逐个发二级。
/// 顺序按 roots 顺序，行为稳定可断言。
+ (NSArray<NSString *> *)compressSelection:(NSSet<NSString *> *)selection
                              allCategories:(NSArray<ABCategory *> *)all;

/// 把「可能含一级 id」的选中集**展开**成「一级 + 其全部二级」，
/// 让 UI 勾选态与后端语义一致（进入页面时用）。
+ (NSSet<NSString *> *)expandSelection:(NSSet<NSString *> *)selection
                          allCategories:(NSArray<ABCategory *> *)all;

@end

NS_ASSUME_NONNULL_END
