//
//  ABTrendChart.h
//  MyAccountBook
//
//  12 个月收支趋势柱状图 —— 对齐 frontend/src/components/TrendChart.vue
//  Core Graphics 手绘：收入红 / 支出青绿双色柱。
//

#import <UIKit/UIKit.h>
#import "ABStatistics.h"

NS_ASSUME_NONNULL_BEGIN

@interface ABTrendChart : UIView

- (void)setTrend:(NSArray<ABReportTrendItem *> *)trend;

@end

NS_ASSUME_NONNULL_END
