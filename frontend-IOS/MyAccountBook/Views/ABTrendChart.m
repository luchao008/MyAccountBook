//
//  ABTrendChart.m
//  MyAccountBook
//

#import "ABTrendChart.h"
#import "ABTheme.h"
#import "ABFormat.h"

@interface ABTrendChart ()
@property (nonatomic, strong) NSArray<ABReportTrendItem *> *items;
@end

@implementation ABTrendChart

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        self.backgroundColor = [ABTheme bgCard];
    }
    return self;
}

- (void)setTrend:(NSArray<ABReportTrendItem *> *)trend {
    _items = trend;
    [self setNeedsDisplay];
}

- (void)drawRect:(CGRect)rect {
    CGContextRef ctx = UIGraphicsGetCurrentContext();
    if (!ctx || !self.items.count) return;

    CGFloat W = self.bounds.size.width;
    CGFloat H = self.bounds.size.height;
    CGFloat padding = 16;
    CGFloat chartW = W - padding * 2;
    CGFloat chartH = H - 60;
    CGFloat top = 24;

    // 最大值
    double maxVal = 0;
    for (ABReportTrendItem *t in self.items) {
        maxVal = MAX(maxVal, [t.income doubleValue]);
        maxVal = MAX(maxVal, [t.expense doubleValue]);
    }
    if (maxVal <= 0) return;

    NSInteger n = self.items.count;
    CGFloat groupW = chartW / n;
    CGFloat barW = groupW * 0.3;

    for (NSInteger i = 0; i < n; i++) {
        ABReportTrendItem *t = self.items[i];
        CGFloat groupX = padding + i * groupW;

        double income = [t.income doubleValue];
        double expense = [t.expense doubleValue];

        // 收入柱（红）
        CGFloat incomeH = chartH * (income / maxVal);
        CGRect incomeRect = CGRectMake(groupX + groupW * 0.15, top + chartH - incomeH, barW, incomeH);
        CGContextSetFillColorWithColor(ctx, [ABTheme income].CGColor);
        CGContextFillRect(ctx, incomeRect);

        // 支出柱（青绿）
        CGFloat expenseH = chartH * (expense / maxVal);
        CGRect expenseRect = CGRectMake(groupX + groupW * 0.15 + barW + 2, top + chartH - expenseH, barW, expenseH);
        CGContextSetFillColorWithColor(ctx, [ABTheme expense].CGColor);
        CGContextFillRect(ctx, expenseRect);

        // X 轴标签
        NSString *label = t.label ?: t.month;
        NSDictionary *attrs = @{
            NSFontAttributeName: [UIFont systemFontOfSize:9],
            NSForegroundColorAttributeName: [ABTheme textSecondary],
        };
        CGSize size = [label sizeWithAttributes:attrs];
        [label drawAtPoint:CGPointMake(groupX + groupW / 2 - size.width / 2, top + chartH + 6) withAttributes:attrs];
    }

    // 基线
    CGContextSetStrokeColorWithColor(ctx, [ABTheme line].CGColor);
    CGContextSetLineWidth(ctx, 1);
    CGContextMoveToPoint(ctx, padding, top + chartH);
    CGContextAddLineToPoint(ctx, W - padding, top + chartH);
    CGContextStrokePath(ctx);
}

@end
