//
//  ABFlowFilterViewController.h
//  MyAccountBook
//
//  流水筛选面板 —— 对齐 frontend/src/components/FlowFilterPanel.vue
//  时间 / 分类 / 类型 / 金额 / 备注 五行 + 底部「重置 / 确定」。
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * 已应用的筛选条件。
 *
 * ⚠️ **口径对齐前端 FlowFilter，有三处容易写错的地方**：
 *
 * 1. `type` **不是多选**。前端 `types` 虽然是数组，但语义上
 *    「全选（2 项）」与「全不选（0 项）」**都等于不过滤**，
 *    只有"恰好选中 1 种"才真的缩小结果集 —— 所以对外只有三种可观测状态。
 *    这里直接收敛成单值：nil = 全部 / @"income" / @"expense"。
 * 2. `categoryIds` **空数组 = 不过滤**（与 type 同口径）。
 *    元素可以是一级 id（后端会连带其下全部二级）。
 * 3. 金额是**字符串**，且后端 AMOUNT_PATTERN 会拒绝 "0"（`(?!0+(\.0{1,2})?$)`）。
 *    所以取值为 "0" 时按"未设置"处理，见 `+ normalizedAmount:`。
 */
@interface ABFlowFilterValue : NSObject <NSCopying>

@property (nonatomic, copy, nullable) NSString *start;      // YYYY-MM-DD，nil = 不限
@property (nonatomic, copy, nullable) NSString *end;
@property (nonatomic, copy) NSString *timeLabel;            // 展示用：全部时间 / 本月 / 自定义…
@property (nonatomic, copy, nullable) NSString *type;       // nil / income / expense
@property (nonatomic, copy) NSArray<NSString *> *categoryIds;
@property (nonatomic, copy, nullable) NSString *minAmount;
@property (nonatomic, copy, nullable) NSString *maxAmount;
@property (nonatomic, copy, nullable) NSString *keyword;

/// 空值（什么都没筛）
+ (instancetype)empty;

/// 是否存在生效中的条件 —— 与前端 `hasFilter` 判据一致
- (BOOL)hasAny;

/// 金额串清洗：空串 / "0" / "0.0" / "0.00" 一律返回 nil（后端 pattern 会拒）
+ (nullable NSString *)normalizedAmount:(nullable NSString *)raw;

@end

@interface ABFlowFilterViewController : UIViewController

/// 当前值（调用方持有；面板进来时以它为草稿初值）
@property (nonatomic, strong) ABFlowFilterValue *value;

/// 点「确定」回调。⚠️ 只有点确定才回调 —— 「重置」只改草稿，等确定才生效（对齐前端）
@property (nonatomic, copy, nullable) void (^onApply)(ABFlowFilterValue *value);

- (instancetype)initWithValue:(ABFlowFilterValue *)value accountId:(nullable NSString *)accountId;

@end

NS_ASSUME_NONNULL_END
