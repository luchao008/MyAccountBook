//
//  ABTimePicker.m
//  MyAccountBook
//

#import "ABTimePicker.h"
#import "ABTheme.h"
#import <Masonry/Masonry.h>

@interface ABTimePicker () <UIPickerViewDataSource, UIPickerViewDelegate>

@property (nonatomic, strong) UIView *mask;
@property (nonatomic, strong) UIView *panel;
@property (nonatomic, strong) UIPickerView *picker;
@property (nonatomic, strong) NSArray<NSString *> *hours;
@property (nonatomic, strong) NSArray<NSString *> *minutes;

@end

@implementation ABTimePicker

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        NSMutableArray *h = [NSMutableArray array];
        for (NSInteger i = 0; i < 24; i++) [h addObject:[NSString stringWithFormat:@"%02ld", (long)i]];
        _hours = h;

        NSMutableArray *m = [NSMutableArray array];
        for (NSInteger i = 0; i < 60; i++) [m addObject:[NSString stringWithFormat:@"%02ld", (long)i]];
        _minutes = m;

        [self setupViews];
    }
    return self;
}

- (void)setupViews {
    self.mask = [[UIView alloc] init];
    self.mask.backgroundColor = [ABTheme bgMask];
    self.mask.alpha = 0;
    UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(hide)];
    [self.mask addGestureRecognizer:tap];
    [self addSubview:self.mask];

    self.panel = [[UIView alloc] init];
    self.panel.backgroundColor = [ABTheme bgCard];
    self.panel.layer.cornerRadius = 16;
    self.panel.layer.maskedCorners = kCALayerMinXMinYCorner | kCALayerMaxXMinYCorner;
    [self addSubview:self.panel];

    // 顶部操作条
    UIButton *cancel = [UIButton buttonWithType:UIButtonTypeSystem];
    [cancel setTitle:@"取消" forState:UIControlStateNormal];
    [cancel setTitleColor:[ABTheme textSecondary] forState:UIControlStateNormal];
    [cancel addTarget:self action:@selector(hide) forControlEvents:UIControlEventTouchUpInside];
    [self.panel addSubview:cancel];

    UIButton *clear = [UIButton buttonWithType:UIButtonTypeSystem];
    [clear setTitle:@"清除时间" forState:UIControlStateNormal];
    [clear setTitleColor:[ABTheme danger] forState:UIControlStateNormal];
    [clear addTarget:self action:@selector(onClear) forControlEvents:UIControlEventTouchUpInside];
    [self.panel addSubview:clear];

    UIButton *confirm = [UIButton buttonWithType:UIButtonTypeSystem];
    [confirm setTitle:@"确定" forState:UIControlStateNormal];
    [confirm setTitleColor:[ABTheme gold] forState:UIControlStateNormal];
    [confirm addTarget:self action:@selector(onConfirm) forControlEvents:UIControlEventTouchUpInside];
    [self.panel addSubview:confirm];

    self.picker = [[UIPickerView alloc] init];
    self.picker.dataSource = self;
    self.picker.delegate = self;
    [self.panel addSubview:self.picker];

    [self.mask mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(self);
    }];
    [self.panel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.right.bottom.equalTo(self);
        make.height.mas_equalTo(300);
    }];
    [cancel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.panel).offset(16);
        make.top.equalTo(self.panel).offset(12);
        make.height.mas_equalTo(36);
    }];
    [clear mas_makeConstraints:^(MASConstraintMaker *make) {
        make.centerX.equalTo(self.panel);
        make.centerY.equalTo(cancel);
    }];
    [confirm mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(self.panel).offset(-16);
        make.centerY.equalTo(cancel);
    }];
    [self.picker mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(cancel.mas_bottom).offset(4);
        make.left.right.bottom.equalTo(self.panel);
    }];
}

- (void)setTime:(NSString *)time {
    _time = time;
    if (!time.length) return;
    NSArray *parts = [time componentsSeparatedByString:@":"];
    if (parts.count >= 2) {
        NSInteger h = [parts[0] integerValue];
        NSInteger m = [parts[1] integerValue];
        [self.picker selectRow:h inComponent:0 animated:NO];
        [self.picker selectRow:m inComponent:1 animated:NO];
    }
}

- (void)show {
    self.hidden = NO;
    [UIView animateWithDuration:0.25 animations:^{
        self.mask.alpha = 1;
    }];
}

- (void)hide {
    [UIView animateWithDuration:0.25 animations:^{
        self.mask.alpha = 0;
    } completion:^(BOOL finished) {
        self.hidden = YES;
        if (self.onDismiss) self.onDismiss();
    }];
}

- (void)onClear {
    self.time = nil;
    if (self.onTimeChanged) self.onTimeChanged(nil);
    [self hide];
}

- (void)onConfirm {
    NSInteger h = [self.picker selectedRowInComponent:0];
    NSInteger m = [self.picker selectedRowInComponent:1];
    NSString *value = [NSString stringWithFormat:@"%02ld:%02ld", (long)h, (long)m];
    self.time = value;
    if (self.onTimeChanged) self.onTimeChanged(value);
    [self hide];
}

#pragma mark - UIPickerView

- (NSInteger)numberOfComponentsInPickerView:(UIPickerView *)pickerView {
    return 2;
}

- (NSInteger)pickerView:(UIPickerView *)pickerView numberOfRowsInComponent:(NSInteger)component {
    return component == 0 ? self.hours.count : self.minutes.count;
}

- (NSString *)pickerView:(UIPickerView *)pickerView titleForRow:(NSInteger)row forComponent:(NSInteger)component {
    return component == 0 ? self.hours[row] : self.minutes[row];
}

- (CGFloat)pickerView:(UIPickerView *)pickerView widthForComponent:(NSInteger)component {
    return 80;
}

@end
