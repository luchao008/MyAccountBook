//
//  ABRingChart.m
//  MyAccountBook
//

#import "ABRingChart.h"
#import "ABTheme.h"
#import "ABFormat.h"

// 图表 7 色（对齐 frontend/src/constants/chart.ts 的 CHART_SERIES）
static NSArray<NSString *> *kChartSeries(void) {
    static NSArray *arr = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        arr = @[@"#0E7C86", @"#7c3aed", @"#0e7c42", @"#c2185b", @"#1d63b8", @"#c2410c", @"#8a94a6"];
    });
    return arr;
}

static const NSInteger kMaxSlices = 6;

@interface ABRingChart ()
@property (nonatomic, strong) NSArray<ABReportCategory *> *slices;
@property (nonatomic, strong) NSMutableArray<UILabel *> *legendLabels;
@end

@implementation ABRingChart

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        self.backgroundColor = [ABTheme bgCard];
        _legendLabels = [NSMutableArray array];
    }
    return self;
}

- (void)setCategories:(NSArray<ABReportCategory *> *)categories {
    // 取前 6 个，其余归入「其他」
    if (categories.count > kMaxSlices) {
        NSArray *top = [categories subarrayWithRange:NSMakeRange(0, kMaxSlices)];
        double otherSum = 0;
        NSInteger otherCount = 0;
        for (NSInteger i = kMaxSlices; i < categories.count; i++) {
            otherSum += [categories[i].sum doubleValue];
            otherCount += categories[i].count;
        }
        ABReportCategory *other = [[ABReportCategory alloc] initWithDictionary:@{
            @"name": @"其他",
            @"icon": @"",
            @"type": @"expense",
            @"sum": [NSString stringWithFormat:@"%.2f", otherSum],
            @"ratio": @0,
            @"count": @(otherCount),
        }];
        NSMutableArray *arr = [NSMutableArray arrayWithArray:top];
        [arr addObject:other];
        _slices = arr;
    } else {
        _slices = categories;
    }

    [self setNeedsDisplay];
    [self layoutLegend];
}

- (void)drawRect:(CGRect)rect {
    CGContextRef ctx = UIGraphicsGetCurrentContext();
    if (!ctx) return;

    CGFloat W = self.bounds.size.width;
    CGFloat H = self.bounds.size.height;
    CGFloat radius = MIN(W, H) * 0.32;
    CGPoint center = CGPointMake(W / 2.0, radius + 20);
    CGFloat lineWidth = radius * 0.5;

    // 计算总和
    double total = 0;
    for (ABReportCategory *c in self.slices) {
        total += [c.sum doubleValue];
    }
    if (total <= 0) return;

    // 画扇区（留 gap）
    CGFloat startAngle = -M_PI_2;  // 从 12 点方向开始
    CGFloat gap = 0.03;            // 扇区间隙（弧度）

    for (NSInteger i = 0; i < self.slices.count; i++) {
        ABReportCategory *c = self.slices[i];
        double ratio = [c.sum doubleValue] / total;
        CGFloat angle = ratio * 2 * M_PI;
        if (angle <= gap * 2) continue;

        CGFloat endAngle = startAngle + angle - gap;

        UIColor *color = [self colorAtIndex:i];
        CGContextSetStrokeColorWithColor(ctx, color.CGColor);
        CGContextSetLineWidth(ctx, lineWidth);
        CGContextSetLineCap(ctx, kCGLineCapButt);

        CGContextAddArc(ctx, center.x, center.y, radius, startAngle + gap / 2, endAngle, 0);
        CGContextStrokePath(ctx);

        startAngle += angle;
    }

    // 中心文字（总支出）
    NSString *totalText = [ABFormat money:@(total)];
    NSDictionary *attrs = @{
        NSFontAttributeName: [UIFont systemFontOfSize:18 weight:UIFontWeightSemibold],
        NSForegroundColorAttributeName: [ABTheme textPrimary],
    };
    CGSize textSize = [totalText sizeWithAttributes:attrs];
    [totalText drawAtPoint:CGPointMake(center.x - textSize.width / 2, center.y - textSize.height / 2) withAttributes:attrs];

    NSString *label = @"总支出";
    NSDictionary *labelAttrs = @{
        NSFontAttributeName: [ABTheme fontCaption],
        NSForegroundColorAttributeName: [ABTheme textSecondary],
    };
    CGSize labelSize = [label sizeWithAttributes:labelAttrs];
    [label drawAtPoint:CGPointMake(center.x - labelSize.width / 2, center.y + 8) withAttributes:labelAttrs];
}

- (UIColor *)colorAtIndex:(NSInteger)index {
    NSArray *series = kChartSeries();
    NSString *hex = series[index % series.count];
    return [self colorFromHex:hex];
}

- (UIColor *)colorFromHex:(NSString *)hex {
    NSString *s = [hex stringByReplacingOccurrencesOfString:@"#" withString:@""];
    unsigned int rgb = 0;
    [[NSScanner scannerWithString:s] scanHexInt:&rgb];
    return [UIColor colorWithRed:((rgb >> 16) & 0xFF) / 255.0
                           green:((rgb >> 8) & 0xFF) / 255.0
                            blue:(rgb & 0xFF) / 255.0
                           alpha:1.0];
}

- (void)layoutLegend {
    for (UILabel *l in self.legendLabels) { [l removeFromSuperview]; }
    [self.legendLabels removeAllObjects];

    CGFloat W = self.bounds.size.width;
    CGFloat H = self.bounds.size.height;
    CGFloat radius = MIN(W, H) * 0.32;
    CGFloat legendTop = radius * 2 + 40;

    CGFloat rowH = 24;
    for (NSInteger i = 0; i < self.slices.count; i++) {
        ABReportCategory *c = self.slices[i];
        UILabel *row = [[UILabel alloc] init];
        row.font = [ABTheme fontCaption];
        row.textColor = [ABTheme textSecondary];
        row.text = [NSString stringWithFormat:@"● %@  %@  %.1f%%",
                    c.name, [ABFormat money:c.sum], c.ratio];
        row.frame = CGRectMake(16, legendTop + i * rowH, W - 32, rowH);
        row.textColor = [self colorAtIndex:i];
        [self addSubview:row];
        [self.legendLabels addObject:row];
    }
}

@end
