//
//  ABRingChart.h
//  MyAccountBook
//
//  分类占比环形图 —— 对齐 frontend/src/components/RingChart.vue
//  Core Graphics 手绘：白色底环 + 扇区留 gap；图例含名称/金额/占比。
//

#import <UIKit/UIKit.h>
#import "ABStatistics.h"

NS_ASSUME_NONNULL_BEGIN

@interface ABRingChart : UIView

/// 设置数据（自动取 Top 6 + 其他）
- (void)setCategories:(NSArray<ABReportCategory *> *)categories;

@end

NS_ASSUME_NONNULL_END
