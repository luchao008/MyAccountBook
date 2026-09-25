//
//  ABCategorySelectionTests.m
//  MyAccountBookTests
//
//  分类多选的勾选规则。这套规则有三个不变量，写错了**界面看起来完全正常**，
//  但筛出来的东西和用户以为的不是一回事：
//    1. 勾一级 = 连带其下全部二级
//    2. 部分子被选中 ⇒ 一级显示**半选**
//    3. ⚠️ `root.id ∈ 选中集` ⟺ 该一级的**全部二级也都在**选中集里
//  第三条最隐蔽：不做的话，用户取消了一个二级、而 root.id 仍在，
//  后端「传一级连带其下全部二级」会把那次取消**吃掉** ——
//  用户点了"不要这个二级"，结果它还在。
//
//  ⚠️ 本文件用 `sel:` / `arr:`（逗号分隔字符串）而不是 `@[@"a", @"b"]` 字面量：
//     **方括号不保护逗号**，`XCTAssertEqualObjects(x, @[@"a", @"b"])` 会被预处理器
//     当成 3 个宏参数，直接编译不过。要么给字面量套一层括号，要么走字符串。
//

#import <XCTest/XCTest.h>
#import "ABCategorySelection.h"

@interface ABCategorySelectionTests : XCTestCase
@end

@implementation ABCategorySelectionTests {
    NSArray<ABCategory *> *_all;
    ABCategory *_i1, *_i11, *_i12, *_i2;      // 收入：I1 有两个二级；I2 无二级
    ABCategory *_e1, *_e11, *_e12, *_e2;      // 支出：E1 有两个二级；E2 无二级
}

- (ABCategory *)cat:(NSString *)cid type:(NSString *)type parent:(NSString *)pid {
    NSMutableDictionary *d = [NSMutableDictionary dictionary];
    d[@"id"] = cid;
    d[@"name"] = cid;
    d[@"type"] = type;
    if (pid) d[@"parentId"] = pid;
    return [[ABCategory alloc] initWithDictionary:d];
}

/// "I1,I11" → NSSet（空串 → 空集）
- (NSSet *)sel:(NSString *)csv {
    if (!csv.length) return [NSSet set];
    return [NSSet setWithArray:[csv componentsSeparatedByString:@","]];
}

/// "I1,I11" → NSArray（保序，用于断言顺序）
- (NSArray<NSString *> *)arr:(NSString *)csv {
    if (!csv.length) return @[];
    return [csv componentsSeparatedByString:@","];
}

- (void)setUp {
    _i1  = [self cat:@"I1"  type:@"income"  parent:nil];
    _i11 = [self cat:@"I11" type:@"income"  parent:@"I1"];
    _i12 = [self cat:@"I12" type:@"income"  parent:@"I1"];
    _i2  = [self cat:@"I2"  type:@"income"  parent:nil];
    _e1  = [self cat:@"E1"  type:@"expense" parent:nil];
    _e11 = [self cat:@"E11" type:@"expense" parent:@"E1"];
    _e12 = [self cat:@"E12" type:@"expense" parent:@"E1"];
    _e2  = [self cat:@"E2"  type:@"expense" parent:nil];

    // 故意把支出排在前面传入 —— 输出必须自己把收入提到前面
    _all = @[_e1, _e11, _e12, _e2, _i1, _i11, _i12, _i2];
}

#pragma mark - 树结构

/// 收入一级在前、支出在后；段内保持传入顺序（后端已按 sort / id 排好）
- (void)testRootsPutIncomeFirst {
    NSArray<ABCategory *> *roots = [ABCategorySelection rootsOfCategories:_all];
    XCTAssertEqualObjects([roots valueForKey:@"categoryId"], [self arr:@"I1,I2,E1,E2"]);
}

- (void)testChildrenOfRoot {
    XCTAssertEqualObjects([ABCategorySelection childrenOfRoot:_e1 allCategories:_all],
                          [self arr:@"E11,E12"]);
    XCTAssertEqualObjects([ABCategorySelection childrenOfRoot:_e2 allCategories:_all], [self arr:@""]);
}

- (void)testAllIdsIncludesRootsAndChildren {
    NSArray<NSString *> *ids = [ABCategorySelection allIdsInCategories:_all];
    XCTAssertEqualObjects([NSSet setWithArray:ids], [self sel:@"I1,I11,I12,I2,E1,E11,E12,E2"]);
    XCTAssertEqual(ids.count, (NSUInteger)8, @"不该有重复");
}

#pragma mark - 不变量 1：勾一级 = 连带其下全部二级

- (void)testTogglingRootAffectsRootAndAllChildren {
    NSArray<NSString *> *affected = [ABCategorySelection idsAffectedByTogglingRoot:_i1
                                                                     allCategories:_all];
    XCTAssertEqualObjects([NSSet setWithArray:affected], [self sel:@"I1,I11,I12"]);
}

/// 没有二级的一级：只影响它自己
- (void)testTogglingRootWithoutChildrenAffectsOnlyItself {
    XCTAssertEqualObjects([ABCategorySelection idsAffectedByTogglingRoot:_i2 allCategories:_all],
                          [self arr:@"I2"]);
}

#pragma mark - 不变量 2：半选态

- (void)testRootStateUnchecked {
    XCTAssertEqual([ABCategorySelection rootState:_i1
                                    withSelection:[self sel:@"E1"]
                                    allCategories:_all], 0);
}

- (void)testRootStateChecked {
    XCTAssertEqual([ABCategorySelection rootState:_i1
                                    withSelection:[self sel:@"I1,I11,I12"]
                                    allCategories:_all], 1);
}

/// 自身没勾、但有一个二级被勾 → 半选（前端显示金色横线圆）
- (void)testRootStateIndeterminate {
    XCTAssertEqual([ABCategorySelection rootState:_i1
                                    withSelection:[self sel:@"I11"]
                                    allCategories:_all], 2);
    XCTAssertEqual([ABCategorySelection rootState:_i1
                                    withSelection:[self sel:@"I11,I12"]
                                    allCategories:_all], 2,
                   @"二级全勾但一级 id 不在 → 仍是半选（不变量被破坏的状态）");
}

/// 一级自身在集合里 → 走"全选"分支（判据顺序与前端一致）
- (void)testRootStateIsFullWhenRootIdPresentEvenIfSomeKidMissing {
    XCTAssertEqual([ABCategorySelection rootState:_i1
                                    withSelection:[self sel:@"I1,I11"]
                                    allCategories:_all], 1);
}

#pragma mark - 不变量 3：root.id 的选择状态必须与"全部二级都在"等价

- (void)testShouldSelectRootRequiresAllChildren {
    XCTAssertTrue([ABCategorySelection shouldSelectRoot:_i1
                                          withSelection:[self sel:@"I11,I12"]
                                          allCategories:_all]);
    XCTAssertFalse([ABCategorySelection shouldSelectRoot:_i1
                                           withSelection:[self sel:@"I11"]
                                           allCategories:_all],
                   @"少一个二级 → 一级 id 必须被移除（否则那次取消会被后端吃掉）");
    XCTAssertFalse([ABCategorySelection shouldSelectRoot:_i1
                                           withSelection:[self sel:@""]
                                           allCategories:_all]);
}

/// 没有二级的一级永远不会被自动选中 —— 它自己就是一个叶子
- (void)testShouldSelectRootFalseWhenNoChildren {
    XCTAssertFalse([ABCategorySelection shouldSelectRoot:_i2
                                           withSelection:[self sel:@"I2"]
                                           allCategories:_all]);
}

/// ⚠️ 核心断言：**任何**选中集压缩后再展开都必须**等价**（不是"差不多"）。
/// 这条一旦不成立，界面显示的和实际筛的就是两回事。
- (void)testCompressedOutputIsAlwaysEquivalentToSelection {
    NSArray<NSString *> *selections = @[@"",
                                        @"I11",
                                        @"I11,I12",
                                        @"I1,I11,I12",
                                        @"I11,E11,E12",
                                        @"I1,I11,I12,E1,E11,E12,I2,E2",
                                        @"I2",
                                        @"E11"];
    for (NSString *raw in selections) {
        NSSet *sel = [self sel:raw];
        NSArray<NSString *> *compressed = [ABCategorySelection compressSelection:sel
                                                                   allCategories:_all];
        NSSet *roundTrip = [ABCategorySelection expandSelection:[NSSet setWithArray:compressed]
                                                  allCategories:_all];
        XCTAssertEqualObjects(roundTrip, sel, @"选中集「%@」压缩后不等价", raw);
    }
}

#pragma mark - 压缩：一级已勾则只发一级

- (void)testCompressKeepsRootIdWhenAllChildrenSelected {
    XCTAssertEqualObjects([ABCategorySelection compressSelection:[self sel:@"I1,I11,I12"]
                                                   allCategories:_all],
                          [self arr:@"I1"]);
}

- (void)testCompressKeepsIndividualChildrenWhenRootNotSelected {
    XCTAssertEqualObjects([ABCategorySelection compressSelection:[self sel:@"I11"]
                                                   allCategories:_all],
                          [self arr:@"I11"]);
}

- (void)testCompressOrderFollowsRootsOrder {
    XCTAssertEqualObjects([ABCategorySelection compressSelection:[self sel:@"E11,I11,E2,I2"]
                                                   allCategories:_all],
                          [self arr:@"I11,I2,E11,E2"]);
}

- (void)testCompressEmptySelection {
    XCTAssertEqualObjects([ABCategorySelection compressSelection:[self sel:@""]
                                                   allCategories:_all], [self arr:@""]);
}

#pragma mark - 全选判定

- (void)testIsAllSelected {
    NSSet *everything = [NSSet setWithArray:[ABCategorySelection allIdsInCategories:_all]];
    XCTAssertTrue([ABCategorySelection isAllSelectedWithSelection:everything allCategories:_all]);
    XCTAssertFalse([ABCategorySelection isAllSelectedWithSelection:[self sel:@"I1,E1"]
                                                     allCategories:_all],
                   @"二级都在但一级 id 缺失 → 不算全选（「取消全选」判据靠它）");
}

- (void)testIsAllSelectedFalseWhenNoCategories {
    XCTAssertFalse([ABCategorySelection isAllSelectedWithSelection:[self sel:@""]
                                                     allCategories:[self arr:@""]]);
}

#pragma mark - 展开（进入页面时把"含一级 id"的选中集补全）

- (void)testExpandSelectionAddsChildrenOfSelectedRoots {
    XCTAssertEqualObjects([ABCategorySelection expandSelection:[self sel:@"I1"] allCategories:_all],
                          [self sel:@"I1,I11,I12"]);
}

- (void)testExpandSelectionKeepsLoneChildren {
    XCTAssertEqualObjects([ABCategorySelection expandSelection:[self sel:@"I11"] allCategories:_all],
                          [self sel:@"I11"]);
}

#pragma mark - 分类 id 类型（后端 BIGINT，模型转字符串）

/// 后端 id 是 BIGINT，JSON 里可能是数字 —— 模型必须统一转成字符串，
/// 否则 `isEqualToString:` 全部失配（本项目铁律：ID 一律字符串）。
- (void)testNumericIdIsConvertedToString {
    NSDictionary *d = @{@"id": @(12), @"name": @"餐饮", @"type": @"expense"};
    ABCategory *c = [[ABCategory alloc] initWithDictionary:d];
    XCTAssertEqualObjects(c.categoryId, @"12");
    XCTAssertTrue([c isRoot], @"没有 parentId 就是一级");
}

@end
