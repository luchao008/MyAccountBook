//
//  ABCategoryMultiSelectViewController.h
//  MyAccountBook
//
//  分类多选（筛选用）—— 对齐 frontend/src/components/FlowCategoryPicker.vue
//
//  一级 + 缩进的二级，每行右侧圆形勾选框。
//  · 一级在前、二级缩进；**收入一级在前、支出一级在后**，段内各按 sort
//  · 勾一级 = 连带其下全部二级；部分子被选中时一级显示**半选态**（横线）
//  · 默认全展开，折叠状态记在页内
//  · **空数组 = 全选 = 不过滤**；「全不选」也按不过滤处理（与类型筛选同口径）
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABCategoryMultiSelectViewController : UIViewController

/// 已选分类 id（**空数组 = 不过滤 = 全选**）
- (instancetype)initWithAccountId:(nullable NSString *)accountId
                      selectedIds:(NSArray<NSString *> *)selectedIds;

/// 点「确定」回传 —— 已**压缩**：一级已勾则只发一级（后端会连带其下二级）；
/// 全选 / 全不选都回传空数组
@property (nonatomic, copy, nullable) void (^onDone)(NSArray<NSString *> *ids);

@end

NS_ASSUME_NONNULL_END
