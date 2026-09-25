//
//  ABAmountKeyboard.m
//  MyAccountBook
//

#import "ABAmountKeyboard.h"
#import "ABTheme.h"

static const NSInteger kMaxIntLen = 9;
static const NSInteger kMaxDecimalLen = 2;
static const CGFloat kKeyHeight = 48;
static const CGFloat kGap = 1;

@interface ABAmountKeyboard ()

@property (nonatomic, strong) NSMutableArray<UIButton *> *allButtons;
@property (nonatomic, strong) NSMutableDictionary<NSString *, UIButton *> *buttonMap;

@end

@implementation ABAmountKeyboard

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        _value = @"";
        _allButtons = [NSMutableArray array];
        self.backgroundColor = [ABTheme line];
        [self buildKeys];
    }
    return self;
}

/// 纯 frame 布局：4 列 × 4 行，confirm 跨右下两行，0 跨两列
- (void)buildKeys {
    NSArray *specs = @[
        @[@"7", @"8", @"9", @"del"],
        @[@"4", @"5", @"6", @"clear"],
        @[@"1", @"2", @"3", @"confirm"],
        @[@"0", @".", @"", @""],
    ];

    // 先建按钮并记录
    NSMutableDictionary *buttonMap = [NSMutableDictionary dictionary];
    for (NSInteger r = 0; r < 4; r++) {
        for (NSInteger c = 0; c < 4; c++) {
            NSString *title = specs[r][c];
            if (!title.length) continue;
            if (buttonMap[title]) continue;  // 0 只建一次

            UIButton *btn;
            if ([title isEqualToString:@"confirm"]) {
                btn = [self makeConfirmKey:@"完成"];
            } else if ([title isEqualToString:@"del"]) {
                btn = [self makeFnKey:@"删除" action:@"del"];
            } else if ([title isEqualToString:@"clear"]) {
                btn = [self makeFnKey:@"清空" action:@"clear"];
            } else {
                btn = [self makeKey:title action:title];
            }
            buttonMap[title] = btn;
            [self addSubview:btn];
            [self.allButtons addObject:btn];
        }
    }

    self.buttonMap = buttonMap;
    [self setNeedsLayout];
}

- (void)layoutSubviews {
    [super layoutSubviews];
    CGFloat W = self.bounds.size.width;
    // 减去底部安全区，避免按键被 home indicator 拉高
    CGFloat H = self.bounds.size.height - self.bottomInset;
    CGFloat keyW = (W - 3 * kGap) / 4.0;
    CGFloat keyH = (H - 3 * kGap) / 4.0;

    // 每格的 frame（col, row, colSpan, rowSpan）
    NSDictionary *layout = @{
        @"7":  @[@0, @0, @1, @1],
        @"8":  @[@1, @0, @1, @1],
        @"9":  @[@2, @0, @1, @1],
        @"del": @[@3, @0, @1, @1],
        @"4":  @[@0, @1, @1, @1],
        @"5":  @[@1, @1, @1, @1],
        @"6":  @[@2, @1, @1, @1],
        @"clear": @[@3, @1, @1, @1],
        @"1":  @[@0, @2, @1, @1],
        @"2":  @[@1, @2, @1, @1],
        @"3":  @[@2, @2, @1, @1],
        @"confirm": @[@3, @2, @1, @2],
        @"0":  @[@0, @3, @2, @1],
        @".":  @[@2, @3, @1, @1],
    };

    [self.buttonMap enumerateKeysAndObjectsUsingBlock:^(NSString *key, UIButton *btn, BOOL *stop) {
        NSArray *spec = layout[key];
        if (!spec) return;
        NSInteger col = [spec[0] integerValue];
        NSInteger row = [spec[1] integerValue];
        NSInteger colSpan = [spec[2] integerValue];
        NSInteger rowSpan = [spec[3] integerValue];

        CGFloat x = col * (keyW + kGap);
        CGFloat y = row * (keyH + kGap);
        CGFloat w = colSpan * keyW + (colSpan - 1) * kGap;
        CGFloat h = rowSpan * keyH + (rowSpan - 1) * kGap;
        btn.frame = CGRectMake(x, y, w, h);
    }];
}

- (CGSize)intrinsicContentSize {
    return CGSizeMake(UIViewNoIntrinsicMetric, kKeyHeight * 4 + kGap * 3);
}

#pragma mark - Factory

- (UIButton *)makeKey:(NSString *)title action:(NSString *)action {
    UIButton *btn = [UIButton buttonWithType:UIButtonTypeSystem];
    [btn setTitle:title forState:UIControlStateNormal];
    [btn setTitleColor:[ABTheme textPrimary] forState:UIControlStateNormal];
    btn.titleLabel.font = [ABTheme fontH1];
    btn.backgroundColor = [ABTheme bgCard];
    [btn addTarget:self action:@selector(onNumberTap:) forControlEvents:UIControlEventTouchUpInside];
    btn.accessibilityIdentifier = action;
    return btn;
}

- (UIButton *)makeFnKey:(NSString *)title action:(NSString *)action {
    UIButton *btn = [UIButton buttonWithType:UIButtonTypeSystem];
    [btn setTitle:title forState:UIControlStateNormal];
    [btn setTitleColor:[ABTheme textSecondary] forState:UIControlStateNormal];
    btn.titleLabel.font = [ABTheme fontBody];
    btn.backgroundColor = [ABTheme bgInset];
    [btn addTarget:self action:@selector(onNumberTap:) forControlEvents:UIControlEventTouchUpInside];
    btn.accessibilityIdentifier = action;
    return btn;
}

- (UIButton *)makeConfirmKey:(NSString *)title {
    UIButton *btn = [UIButton buttonWithType:UIButtonTypeSystem];
    [btn setTitle:title forState:UIControlStateNormal];
    [btn setTitleColor:[ABTheme textInverse] forState:UIControlStateNormal];
    btn.titleLabel.font = [ABTheme fontBodyLg];
    btn.backgroundColor = [ABTheme gold];
    [btn addTarget:self action:@selector(onConfirmTap) forControlEvents:UIControlEventTouchUpInside];
    return btn;
}

#pragma mark - 输入规则（与前端逐条一致）

- (void)onNumberTap:(UIButton *)sender {
    NSString *action = sender.accessibilityIdentifier;
    if ([action isEqualToString:@"del"]) { [self backspace]; return; }
    if ([action isEqualToString:@"clear"]) { [self clear]; return; }
    [self press:action];
}

- (void)onConfirmTap {
    if (self.onConfirm) self.onConfirm();
}

- (void)press:(NSString *)ch {
    NSString *next = self.value ?: @"";

    if ([ch isEqualToString:@"."]) {
        if ([next containsString:@"."]) return;
        if (next.length == 0) next = @"0";
        [self updateValue:[next stringByAppendingString:@"."]];
        return;
    }

    NSRange dotRange = [next rangeOfString:@"."];
    if (dotRange.location != NSNotFound) {
        NSInteger decimalLen = next.length - dotRange.location - 1;
        if (decimalLen >= kMaxDecimalLen) return;
    }

    if (dotRange.location == NSNotFound) {
        NSString *trimmed = [self trimLeadingZeros:next];
        if ((NSInteger)trimmed.length >= kMaxIntLen) return;
    }

    if ([next isEqualToString:@"0"]) next = @"";
    [self updateValue:[next stringByAppendingString:ch]];
}

- (NSString *)trimLeadingZeros:(NSString *)s {
    NSInteger i = 0;
    while (i < (NSInteger)s.length && [s characterAtIndex:i] == '0') i++;
    return [s substringFromIndex:i];
}

- (void)backspace {
    NSString *v = self.value ?: @"";
    if (v.length > 0) [self updateValue:[v substringToIndex:v.length - 1]];
}

- (void)clear { [self updateValue:@""]; }

- (void)updateValue:(NSString *)value {
    self.value = value;
    if (self.onChange) self.onChange(value);
}

@end
