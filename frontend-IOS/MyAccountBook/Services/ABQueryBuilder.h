//
//  ABQueryBuilder.h
//  MyAccountBook
//
//  请求参数的**唯一拼装处** —— 把「界面状态」翻译成「后端 query 参数」。
//
//  为什么单独抽出来（不是为了好看）：
//  这个项目已经踩过两次同类 bug，**都是参数拼装错了、而且完全静默**：
//    ① 三处 `size` 传 500 / 10000，超过后端上限 100 → 整条请求被拒，
//       失败只落在日志里，三个页面「看起来就是没数据」；
//    ② 排序的 `order` 从没进过参数 → 菜单是真的、效果是假的，点完毫无反应。
//  抽成纯类之后，这两类错误都能被单测钉住（见 `MyAccountBookTests/`）。
//
//  ⚠️ 所有常量都以**后端 DTO 为准**，改后端要同步改这里（单测会拦住漏改）。
//

#import <Foundation/Foundation.h>

@class ABFlowFilterValue;

NS_ASSUME_NONNULL_BEGIN

@interface ABQueryBuilder : NSObject

#pragma mark - 后端契约常量

/// 列表接口 `size` 上限。
/// 后端 `src/transaction/dto/transaction.dto.ts`:
/// `@Rule(RuleType.number().integer().min(1).max(100).default(20))`
/// ⚠️ **超限是整条请求被拒，不是截断** —— 要全量必须循环分页。
+ (NSUInteger)maxPageSize;

/// 循环分页拉全量时的安全上限（与前端 `pages/export` 的 `MAX_PAGES` 一致）
+ (NSUInteger)maxPages;

/// `order` 的合法取值：后端 `RuleType.string().valid('time','amountDesc','amountAsc')`
+ (NSSet<NSString *> *)allowedOrderValues;

/// 把 size 夹进后端允许的 [1, maxPageSize]。
/// ⚠️ 别自己写 `MIN(size.unsignedIntegerValue, max)` —— 负数的补码巨值会被判成
///    "没超"，再被抬成上限（`-5` 会变成 `100`）。单测抓到过。
+ (NSUInteger)clampSize:(NSInteger)raw;

/// `/transactions/summary` 允许的 query 键（对照 `SummaryQueryDTO` 逐条列出）。
/// ⚠️ **不含 `order` / `page` / `size`** —— 那个 DTO 里根本没有这三个字段，
///    传了不会报错但也不起作用（排序之所以"点了没反应"就是踩在这上面）。
+ (NSSet<NSString *> *)allowedKeysForSummary;

/// `/transactions`（列表）允许的 query 键（对照 `QueryTransactionDTO`）
+ (NSSet<NSString *> *)allowedKeysForList;

#pragma mark - 拼装

/// 分组汇总参数（`GET /transactions/summary`）
+ (NSDictionary *)summaryParamsWithFilter:(ABFlowFilterValue *)filter
                                     unit:(NSString *)unit
                                accountId:(nullable NSString *)accountId;

/// 明细列表参数（`GET /transactions`）。
///
/// @param start/end 传非 nil 表示用「本组的区间」覆盖筛选里的时间 ——
///        展开某个分组时用该组自己的日期区间，与用户选的全局范围语义不同。
/// @param order     排序方式；nil = 不传（后端默认 time）
/// @param size      每页条数；**必须 ≤ maxPageSize**，由单测钉住
+ (NSDictionary *)listParamsWithFilter:(ABFlowFilterValue *)filter
                                 start:(nullable NSString *)start
                                   end:(nullable NSString *)end
                                 order:(nullable NSString *)order
                                  size:(nullable NSNumber *)size
                             accountId:(nullable NSString *)accountId;

/// 搜索参数（`GET /transactions`）。
///
/// ⚠️ **不带任何其它筛选条件**（除账本）—— 搜索是「在全部流水里找」，
///    带上时间范围 / 金额区间会让用户困惑「我明明有这笔却搜不到」。
///    账本必须带：那是数据隔离的边界。
+ (NSDictionary *)searchParamsWithKeyword:(NSString *)keyword
                                     size:(nullable NSNumber *)size
                                accountId:(nullable NSString *)accountId;

@end

NS_ASSUME_NONNULL_END
