//
//  ABFlowFilterViewController.m
//  MyAccountBook
//

#import "ABFlowFilterViewController.h"
#import "ABCategoryMultiSelectViewController.h"
#import "ABCategoryService.h"
#import "ABAccountStore.h"
#import "ABNavigationBar.h"
#import "ABDateUtil.h"
#import "ABAlert.h"
#import "ABTheme.h"
#import <Masonry/Masonry.h>

static const CGFloat kRowHeight = 52.0;
static const CGFloat kFooterHeight = 64.0;

#pragma mark - 模型

@implementation ABFlowFilterValue

+ (instancetype)empty {
    ABFlowFilterValue *v = [[ABFlowFilterValue alloc] init];
    v.timeLabel = @"全部时间";
    v.categoryIds = @[];
    return v;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _timeLabel = @"全部时间";
        _categoryIds = @[];
    }
    return self;
}

- (id)copyWithZone:(NSZone *)zone {
    ABFlowFilterValue *v = [[ABFlowFilterValue allocWithZone:zone] init];
    v.start = self.start;
    v.end = self.end;
    v.timeLabel = self.timeLabel;
    v.type = self.type;
    v.categoryIds = [self.categoryIds copy];
    v.minAmount = self.minAmount;
    v.maxAmount = self.maxAmount;
    v.keyword = self.keyword;
    return v;
}

/// 判据与前端 `hasFilter` 一致。
/// ⚠️ 不含**顶部搜索关键词** —— 那是流水页的另一个状态，由调用方一并判断。
- (BOOL)hasAny {
    if (self.start.length || self.end.length) return YES;
    if ([ABFlowFilterValue normalizedAmount:self.minAmount].length) return YES;
    if ([ABFlowFilterValue normalizedAmount:self.maxAmount].length) return YES;
    if (self.keyword.length) return YES;
    if (self.type.length) return YES;                 // nil = 全部，只有恰好 1 种才真筛
    if (self.categoryIds.count > 0) return YES;       // 空数组 = 不过滤
    return NO;
}

/// 金额串清洗。
/// ⚠️ 后端 AMOUNT_PATTERN = `/^(?!0+(\.0{1,2})?$)\d+(\.\d{1,2})?$/` —— **"0" 会被拒**。
///    用户手输 "0" 是很自然的事（想筛"大于 0"），直接发出去会让**整条请求**失败，
///    而失败只落在日志里、界面上完全看不出来（本项目已经为同类问题排查过一轮）。
+ (NSString *)normalizedAmount:(NSString *)raw {
    if (!raw.length) return nil;
    NSString *s = [raw stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
    if (!s.length) return nil;
    if ([s doubleValue] == 0) return nil;     // "0" / "0.0" / "0.00" / "00" 一律视为未设
    return s;
}

@end

#pragma mark - 面板

@interface ABFlowFilterViewController () <UITextFieldDelegate>

@property (nonatomic, copy, nullable) NSString *accountId;
@property (nonatomic, strong) ABNavigationBar *navBar;
@property (nonatomic, strong) UIScrollView *scroll;
@property (nonatomic, strong) UIView *card;
@property (nonatomic, strong) ABFlowFilterValue *draft;

// 行内的值
@property (nonatomic, strong) UILabel *timeValueLabel;
@property (nonatomic, strong) UILabel *timeSubLabel;
@property (nonatomic, strong) UILabel *categoryValueLabel;
@property (nonatomic, strong) UILabel *typeValueLabel;
@property (nonatomic, strong) UITextField *minField;
@property (nonatomic, strong) UITextField *maxField;
@property (nonatomic, strong) UITextField *keywordField;

// 分类名翻译（只用于「分类」行的文案）
@property (nonatomic, strong) NSArray<ABCategory *> *categories;

// 自定义区间弹窗里的两个日期选择器
@property (nonatomic, strong) UIDatePicker *customStartPicker;
@property (nonatomic, strong) UIDatePicker *customEndPicker;

@end

@implementation ABFlowFilterViewController

- (instancetype)initWithValue:(ABFlowFilterValue *)value accountId:(NSString *)accountId {
    self = [super init];
    if (self) {
        _accountId = [accountId copy];
        // 草稿：改完点「确定」才生效，中途返回不污染已应用的筛选（对齐前端 draft 语义）
        _draft = [(value ?: [ABFlowFilterValue empty]) copy];
        _categories = @[];
    }
    return self;
}

- (instancetype)init {
    return [self initWithValue:[ABFlowFilterValue empty] accountId:[ABAccountStore shared].currentId];
}

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    [self setupNavBar];
    [self setupBody];
    [self setupFooter];
    [self refreshValues];
    [self loadCategoriesForLabel];
}

- (void)viewDidLayoutSubviews {
    [super viewDidLayoutSubviews];
    // 内容高度显式算 —— 不靠 UIScrollView 的自动推导（5 行 + 上下留白）
    CGFloat cardH = kRowHeight * 5 + 4;
    self.scroll.contentSize = CGSizeMake(self.scroll.bounds.size.width, cardH + kSpace8);
}

#pragma mark - 视图

- (void)setupNavBar {
    self.navBar = [[ABNavigationBar alloc] init];
    [self.navBar setTitle:@"筛选"];
    [self.navBar setRightTitle:@"重置"];
    __weak typeof(self) weakSelf = self;
    // 返回 = 放弃本次修改（草稿不落地）
    self.navBar.onBack = ^{ [weakSelf.navigationController popViewControllerAnimated:YES]; };
    self.navBar.onRight = ^{ [weakSelf resetDraft]; };
    [self.view addSubview:self.navBar];
    [self.navBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(self.view);
        make.height.mas_equalTo(88);
    }];
}

- (void)setupBody {
    self.scroll = [[UIScrollView alloc] init];
    self.scroll.backgroundColor = [ABTheme bgPage];
    self.scroll.keyboardDismissMode = UIScrollViewKeyboardDismissModeOnDrag;
    self.scroll.alwaysBounceVertical = YES;
    [self.view addSubview:self.scroll];
    [self.scroll mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.navBar.mas_bottom);
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.view).offset(-kFooterHeight);
    }];

    self.card = [[UIView alloc] init];
    self.card.backgroundColor = [ABTheme bgCard];
    self.card.layer.cornerRadius = kRadiusCard;
    [self.scroll addSubview:self.card];
    [self.card mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.scroll).offset(kSpace4);
        make.left.equalTo(self.view).offset(kSpace4);
        make.right.equalTo(self.view).offset(-kSpace4);
        make.height.mas_equalTo(kRowHeight * 5 + 4);
    }];

    self.timeValueLabel = [self valueLabel];
    self.timeSubLabel = [[UILabel alloc] init];
    self.timeSubLabel.font = [ABTheme fontCaption];
    self.timeSubLabel.textColor = [ABTheme textSecondary];
    self.timeSubLabel.textAlignment = NSTextAlignmentRight;
    self.categoryValueLabel = [self valueLabel];
    self.typeValueLabel = [self valueLabel];

    // ① 时间（右侧两行：预设名 + 具体区间）
    UIView *timeMain = [[UIView alloc] init];
    [timeMain addSubview:self.timeValueLabel];
    [timeMain addSubview:self.timeSubLabel];
    [self.timeValueLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(timeMain);
    }];
    [self.timeSubLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.timeValueLabel.mas_bottom).offset(2);
        make.left.right.bottom.equalTo(timeMain);
    }];
    UIView *timeRow = [self tapRowWithIcon:@"clock" title:@"时间" main:timeMain selector:@selector(onTime)];

    // ② 分类
    UIView *catRow = [self tapRowWithIcon:@"tag" title:@"分类"
                                     main:[self mainWithLabel:self.categoryValueLabel]
                                 selector:@selector(onCategory)];

    // ③ 类型
    UIView *typeRow = [self tapRowWithIcon:@"line.3.horizontal.decrease" title:@"类型"
                                      main:[self mainWithLabel:self.typeValueLabel]
                                  selector:@selector(onType)];

    // ④ 金额（最低 - 最高）
    self.minField = [self amountField:@"最低"];
    self.maxField = [self amountField:@"最高"];
    UILabel *sep = [[UILabel alloc] init];
    sep.text = @"-";
    sep.font = [ABTheme fontBodySm];
    sep.textColor = [ABTheme textDisabled];
    UIView *amountMain = [[UIView alloc] init];
    [amountMain addSubview:self.minField];
    [amountMain addSubview:sep];
    [amountMain addSubview:self.maxField];
    [self.minField mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.top.bottom.equalTo(amountMain);
        make.width.mas_equalTo(84);
        make.height.mas_equalTo(32);
    }];
    [sep mas_makeConstraints:^(MASConstraintMaker *make) {
        make.centerY.equalTo(amountMain);
        make.left.equalTo(self.minField.mas_right).offset(kSpace2);
    }];
    [self.maxField mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(sep.mas_right).offset(kSpace2);
        make.right.top.bottom.equalTo(amountMain);
        make.width.mas_equalTo(84);
        make.height.mas_equalTo(32);
    }];
    UIView *amountRow = [self inputRowWithIcon:@"creditcard" title:@"金额" main:amountMain];

    // ⑤ 备注
    self.keywordField = [self amountField:@"填写备注关键词"];
    self.keywordField.keyboardType = UIKeyboardTypeDefault;
    self.keywordField.textAlignment = NSTextAlignmentRight;
    UIView *kwMain = [[UIView alloc] init];
    [kwMain addSubview:self.keywordField];
    [self.keywordField mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(kwMain);
        make.height.mas_equalTo(32);
    }];
    UIView *kwRow = [self inputRowWithIcon:@"tag" title:@"备注" main:kwMain];

    NSArray<UIView *> *rows = @[timeRow, catRow, typeRow, amountRow, kwRow];
    UIView *prev = nil;
    for (NSInteger i = 0; i < (NSInteger)rows.count; i++) {
        UIView *row = rows[i];
        [self.card addSubview:row];
        [row mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.right.equalTo(self.card);
            make.height.mas_equalTo(kRowHeight);
            if (prev) make.top.equalTo(prev.mas_bottom);
            else make.top.equalTo(self.card).offset(2);
        }];
        if (i < (NSInteger)rows.count - 1) {
            UIView *line = [[UIView alloc] init];
            line.backgroundColor = [ABTheme line];
            [self.card addSubview:line];
            [line mas_makeConstraints:^(MASConstraintMaker *make) {
                make.left.equalTo(self.card).offset(kSpace4);
                make.right.equalTo(self.card);
                make.top.equalTo(row.mas_bottom);
                make.height.mas_equalTo(1);
            }];
        }
        prev = row;
    }
}

- (void)setupFooter {
    UIView *footer = [[UIView alloc] init];
    footer.backgroundColor = [ABTheme bgPage];
    [self.view addSubview:footer];

    UIButton *done = [UIButton buttonWithType:UIButtonTypeSystem];
    [done setTitle:@"确定" forState:UIControlStateNormal];
    [done setTitleColor:[ABTheme textInverse] forState:UIControlStateNormal];
    done.titleLabel.font = [ABTheme fontBodyLg];
    done.backgroundColor = [ABTheme gold];
    done.layer.cornerRadius = kRadiusMd;
    [done addTarget:self action:@selector(onConfirm) forControlEvents:UIControlEventTouchUpInside];
    [footer addSubview:done];

    [footer mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.right.bottom.equalTo(self.view);
        make.height.mas_equalTo(kFooterHeight);
    }];
    [done mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(footer).offset(kSpace4);
        make.right.equalTo(footer).offset(-kSpace4);
        make.top.equalTo(footer).offset(kSpace2);
        make.height.mas_equalTo(44);
    }];
}

#pragma mark - 行构件

- (UILabel *)valueLabel {
    UILabel *l = [[UILabel alloc] init];
    l.font = [ABTheme fontBodySm];
    l.textColor = [ABTheme textSecondary];
    l.textAlignment = NSTextAlignmentRight;
    return l;
}

- (UIView *)mainWithLabel:(UILabel *)label {
    UIView *main = [[UIView alloc] init];
    [main addSubview:label];
    [label mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(main);
    }];
    return main;
}

/// 可点击行：图标 + 标题 + 右侧内容 + 箭头（点击区是一层透明按钮，铺满整行）
- (UIView *)tapRowWithIcon:(NSString *)symbol
                     title:(NSString *)title
                      main:(UIView *)main
                  selector:(SEL)selector {
    UIView *row = [[UIView alloc] init];

    UIImageView *icon = [self iconView:symbol];
    UILabel *label = [self titleLabel:title];
    UIImageView *arrow = [self iconView:@"chevron.right"];
    arrow.tintColor = [ABTheme textDisabled];

    [row addSubview:icon];
    [row addSubview:label];
    [row addSubview:main];
    [row addSubview:arrow];

    [icon mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(row).offset(kSpace4);
        make.centerY.equalTo(row);
    }];
    [label mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(icon.mas_right).offset(kSpace3);
        make.centerY.equalTo(row);
    }];
    [arrow mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(row).offset(-kSpace3);
        make.centerY.equalTo(row);
    }];
    // 箭头宽 20 + 右边距 12 → main 的右边界 = -(12 + 20 + 8)
    [main mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(row).offset(-(kSpace3 + 20 + kSpace2));
        make.centerY.equalTo(row);
        make.left.greaterThanOrEqualTo(label.mas_right).offset(kSpace2);
    }];

    UIButton *hit = [UIButton buttonWithType:UIButtonTypeCustom];
    [hit addTarget:self action:selector forControlEvents:UIControlEventTouchUpInside];
    [row addSubview:hit];
    [hit mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(row);
    }];
    return row;
}

/// 输入行：图标 + 标题 + 右侧输入区（无箭头）
- (UIView *)inputRowWithIcon:(NSString *)symbol title:(NSString *)title main:(UIView *)main {
    UIView *row = [[UIView alloc] init];
    UIImageView *icon = [self iconView:symbol];
    UILabel *label = [self titleLabel:title];
    [row addSubview:icon];
    [row addSubview:label];
    [row addSubview:main];

    [icon mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(row).offset(kSpace4);
        make.centerY.equalTo(row);
    }];
    [label mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(icon.mas_right).offset(kSpace3);
        make.centerY.equalTo(row);
    }];
    [main mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.greaterThanOrEqualTo(label.mas_right).offset(kSpace2);
        make.right.equalTo(row).offset(-kSpace4);
        make.centerY.equalTo(row);
    }];
    return row;
}

- (UIImageView *)iconView:(NSString *)symbol {
    UIImageView *v = [[UIImageView alloc] init];
    v.image = [UIImage systemImageNamed:symbol];
    v.tintColor = [ABTheme textSecondary];
    v.contentMode = UIViewContentModeScaleAspectFit;
    [v mas_makeConstraints:^(MASConstraintMaker *make) {
        make.width.height.mas_equalTo(20);
    }];
    return v;
}

- (UILabel *)titleLabel:(NSString *)title {
    UILabel *l = [[UILabel alloc] init];
    l.text = title;
    l.font = [ABTheme fontBody];
    l.textColor = [ABTheme textPrimary];
    return l;
}

- (UITextField *)amountField:(NSString *)placeholder {
    UITextField *f = [[UITextField alloc] init];
    f.placeholder = placeholder;
    f.font = [ABTheme fontBodySm];
    f.textColor = [ABTheme textPrimary];
    f.textAlignment = NSTextAlignmentCenter;
    f.backgroundColor = [ABTheme bgInset];
    f.layer.cornerRadius = kRadiusSm;
    f.keyboardType = UIKeyboardTypeDecimalPad;
    f.delegate = self;
    return f;
}

#pragma mark - 取值 / 回填

- (void)refreshValues {
    self.timeValueLabel.text = self.draft.timeLabel.length ? self.draft.timeLabel : @"全部时间";
    if (self.draft.start.length && self.draft.end.length) {
        self.timeSubLabel.text = [NSString stringWithFormat:@"%@ - %@",
                                  [self cnDate:self.draft.start], [self cnDate:self.draft.end]];
    } else {
        self.timeSubLabel.text = @"";
    }
    self.categoryValueLabel.text = [self categoryLabelText];
    self.typeValueLabel.text = [self typeLabelText];
    self.minField.text = self.draft.minAmount ?: @"";
    self.maxField.text = self.draft.maxAmount ?: @"";
    self.keywordField.text = self.draft.keyword ?: @"";
}

/// 类型文案。
/// ⚠️ 「全部」对应 type == nil —— 前端把「全选」与「全不选」都归到"不过滤"，
///    所以对外只有三种可观测状态：全部 / 支出 / 收入。
- (NSString *)typeLabelText {
    if ([self.draft.type isEqualToString:@"expense"]) return @"支出";
    if ([self.draft.type isEqualToString:@"income"]) return @"收入";
    return @"全部";
}

/// 分类文案（对齐前端 categoryLabel）。
/// ⚠️ N 按**用户视角的大类数**算，不是选中节点数：
///    勾一级「食品酒水」（连带 8 个二级 = 9 个节点）显示「食品酒水」；
///    散勾 3 个二级则显示「已选 3 项」（这 3 个可能分属不同大类）。
- (NSString *)categoryLabelText {
    NSArray<NSString *> *ids = self.draft.categoryIds ?: @[];
    if (ids.count == 0) return @"全部";
    if (ids.count == 1) {
        NSString *name = [self fullNameOf:ids.firstObject];
        return name.length ? name : @"全部";
    }
    NSMutableSet *roots = [NSMutableSet set];
    for (NSString *cid in ids) {
        ABCategory *c = [self findCategory:cid];
        if (!c) continue;
        [roots addObject:c.parentId.length ? c.parentId : c.categoryId];
    }
    NSUInteger n = roots.count ? roots.count : ids.count;
    return [NSString stringWithFormat:@"已选 %lu 项", (unsigned long)n];
}

- (NSString *)fullNameOf:(NSString *)categoryId {
    ABCategory *c = [self findCategory:categoryId];
    if (!c) return @"";
    if (c.parentId.length) {
        ABCategory *p = [self findCategory:c.parentId];
        if (p) return [NSString stringWithFormat:@"%@ / %@", p.name, c.name];
    }
    return c.name;
}

- (ABCategory *)findCategory:(NSString *)categoryId {
    for (ABCategory *c in self.categories) {
        if ([c.categoryId isEqualToString:categoryId]) return c;
    }
    return nil;
}

/// YYYY-MM-DD → YYYY年MM月DD日（与前端 formatCnDate 一致）。
/// 手工拼而不用 NSDateFormatter —— 免得时区把 09-01 显示成 08-31。
- (NSString *)cnDate:(NSString *)d {
    NSArray<NSString *> *p = [d componentsSeparatedByString:@"-"];
    if (p.count < 3) return d;
    return [NSString stringWithFormat:@"%@年%@月%@日", p[0], p[1], p[2]];
}

- (void)loadCategoriesForLabel {
    __weak typeof(self) weakSelf = self;
    [ABCategoryService getCategories:self.accountId
                                type:nil
                            parentId:nil
                          visibility:nil
                             success:^(NSArray<ABCategory *> *list) {
        __strong typeof(weakSelf) self = weakSelf;
        self.categories = list ?: @[];
        [self refreshValues];
    } failure:^(NSError *error) {
        // 拿不到名字不影响筛选本身，降级成"已选 N 项"即可 —— 不弹窗打扰
        NSLog(@"[flow-filter] 分类名加载失败: %@", error.localizedDescription);
    }];
}

#pragma mark - 交互

- (void)onTime {
    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:@"时间"
                                                                  message:nil
                                                           preferredStyle:UIAlertControllerStyleActionSheet];
    __weak typeof(self) weakSelf = self;

    // token："" 全部 / "month0" 本月 / "month-1" 上月 / "year0" 本年 / "year-1" 去年
    NSArray<NSArray<NSString *> *> *presets = @[
        @[@"全部时间", @""],
        @[@"本月", @"month0"],
        @[@"上月", @"month-1"],
        @[@"本年", @"year0"],
        @[@"去年", @"year-1"],
    ];
    for (NSArray<NSString *> *p in presets) {
        [sheet addAction:[UIAlertAction actionWithTitle:p[0] style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
            __strong typeof(weakSelf) self = weakSelf;
            [self applyPreset:p[0] token:p[1]];
        }]];
    }
    [sheet addAction:[UIAlertAction actionWithTitle:@"自定义" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        [self pickCustomRange];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    [ABAlert prepareSheet:sheet anchor:self.navBar in:self];
    [self presentViewController:sheet animated:YES completion:nil];
}

- (void)applyPreset:(NSString *)label token:(NSString *)token {
    if (!token.length) {
        self.draft.timeLabel = label;
        self.draft.start = nil;
        self.draft.end = nil;
        [self refreshValues];
        return;
    }
    BOOL isMonth = [token hasPrefix:@"month"];
    NSInteger offset = [[token substringFromIndex:5] integerValue];
    NSDictionary *r = [self presetRangeIsMonth:isMonth offset:offset];
    if (!r) return;
    self.draft.timeLabel = label;
    self.draft.start = r[@"start"];
    self.draft.end = r[@"end"];
    [self refreshValues];
}

/// 复用 ABDateUtil 而不是自己拼 —— 月末天数（2 月 / 闰年）它已经算好了
- (NSDictionary *)presetRangeIsMonth:(BOOL)isMonth offset:(NSInteger)offset {
    NSArray<NSString *> *p = [[ABDateUtil today] componentsSeparatedByString:@"-"];
    if (p.count < 3) return nil;
    NSInteger y = [p[0] integerValue];
    NSInteger m = [p[1] integerValue];

    if (!isMonth) {
        NSString *key = [NSString stringWithFormat:@"%04ld", (long)(y + offset)];
        return [ABDateUtil periodRange:key unit:@"year"];
    }
    NSInteger total = y * 12 + (m - 1) + offset;
    NSInteger ny = total / 12;
    NSInteger nm = total % 12 + 1;
    NSString *key = [NSString stringWithFormat:@"%04ld-%02ld", (long)ny, (long)nm];
    return [ABDateUtil periodRange:key unit:@"month"];
}

- (void)pickCustomRange {
    UIViewController *content = [[UIViewController alloc] init];
    content.preferredContentSize = CGSizeMake(280, 116);

    self.customStartPicker = [self datePicker];
    self.customEndPicker = [self datePicker];
    UILabel *sl = [self formLabel:@"起始"];
    UILabel *el = [self formLabel:@"结束"];
    [content.view addSubview:sl];
    [content.view addSubview:self.customStartPicker];
    [content.view addSubview:el];
    [content.view addSubview:self.customEndPicker];

    [sl mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(content.view).offset(kSpace4);
        make.centerY.equalTo(self.customStartPicker);
    }];
    [self.customStartPicker mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(content.view).offset(-kSpace4);
        make.top.equalTo(content.view);
    }];
    [el mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(content.view).offset(kSpace4);
        make.centerY.equalTo(self.customEndPicker);
    }];
    [self.customEndPicker mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(content.view).offset(-kSpace4);
        make.top.equalTo(self.customStartPicker.mas_bottom).offset(kSpace2);
    }];

    // 初值：已选区间，否则今天
    self.customStartPicker.date = [self dateFromString:self.draft.start] ?: [NSDate date];
    self.customEndPicker.date = [self dateFromString:self.draft.end] ?: [NSDate date];

    UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"自定义区间"
                                                                  message:nil
                                                           preferredStyle:UIAlertControllerStyleAlert];
    [alert setValue:content forKey:@"contentViewController"];
    [alert addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];

    __weak typeof(self) weakSelf = self;
    [alert addAction:[UIAlertAction actionWithTitle:@"确定" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        NSString *s = [ABDateUtil formatDate:self.customStartPicker.date];
        NSString *e = [ABDateUtil formatDate:self.customEndPicker.date];
        // 起止颠倒自动交换（对齐前端 TimeRangePicker）
        if ([s compare:e] == NSOrderedDescending) { NSString *t = s; s = e; e = t; }
        self.draft.timeLabel = @"自定义";
        self.draft.start = s;
        self.draft.end = e;
        [self refreshValues];
    }]];
    [self presentViewController:alert animated:YES completion:nil];
}

- (UIDatePicker *)datePicker {
    UIDatePicker *p = [[UIDatePicker alloc] init];
    p.datePickerMode = UIDatePickerModeDate;
    p.preferredDatePickerStyle = UIDatePickerStyleCompact;
    p.locale = [NSLocale localeWithLocaleIdentifier:@"zh_CN"];
    return p;
}

- (UILabel *)formLabel:(NSString *)text {
    UILabel *l = [[UILabel alloc] init];
    l.text = text;
    l.font = [ABTheme fontBody];
    l.textColor = [ABTheme textPrimary];
    return l;
}

- (NSDate *)dateFromString:(NSString *)s {
    if (!s.length) return nil;
    NSArray<NSString *> *p = [s componentsSeparatedByString:@"-"];
    if (p.count < 3) return nil;
    NSDateComponents *c = [[NSDateComponents alloc] init];
    c.year = [p[0] integerValue];
    c.month = [p[1] integerValue];
    c.day = [p[2] integerValue];
    return [[NSCalendar currentCalendar] dateFromComponents:c];
}

- (void)onCategory {
    ABCategoryMultiSelectViewController *vc =
        [[ABCategoryMultiSelectViewController alloc] initWithAccountId:self.accountId
                                                           selectedIds:self.draft.categoryIds ?: @[]];
    __weak typeof(self) weakSelf = self;
    vc.onDone = ^(NSArray<NSString *> *ids) {
        __strong typeof(weakSelf) self = weakSelf;
        self.draft.categoryIds = ids ?: @[];
        [self refreshValues];
    };
    [self.navigationController pushViewController:vc animated:YES];
}

/// 类型：**单选三态**，不是多选。
///
/// 前端的 `types` 虽是数组，但语义上「全选（2 项）」与「全不选（0 项）」**都等于不过滤**，
/// 只有"恰好选中 1 种"才真的缩小结果集 —— 对外只有三种可观测状态。
/// 用三选一的 ActionSheet 表达与多选弹层**等价**，也更符合 iOS 习惯。
- (void)onType {
    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:@"流水类型"
                                                                  message:nil
                                                           preferredStyle:UIAlertControllerStyleActionSheet];
    __weak typeof(self) weakSelf = self;
    NSArray<NSArray<NSString *> *> *opts = @[@[@"全部", @""], @[@"只看支出", @"expense"], @[@"只看收入", @"income"]];
    for (NSArray<NSString *> *o in opts) {
        [sheet addAction:[UIAlertAction actionWithTitle:o[0] style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
            __strong typeof(weakSelf) self = weakSelf;
            self.draft.type = o[1].length ? o[1] : nil;
            [self refreshValues];
        }]];
    }
    [sheet addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    [ABAlert prepareSheet:sheet anchor:self.navBar in:self];
    [self presentViewController:sheet animated:YES completion:nil];
}

/// 重置 = 回到什么都没筛（草稿），**点确定才生效**
- (void)resetDraft {
    self.draft = [ABFlowFilterValue empty];
    [self refreshValues];
}

- (void)onConfirm {
    // 输入框当前文本最后收一遍（用户可能没 endEditing 就点了确定）
    self.draft.minAmount = [ABFlowFilterValue normalizedAmount:self.minField.text];
    self.draft.maxAmount = [ABFlowFilterValue normalizedAmount:self.maxField.text];
    NSString *kw = [self.keywordField.text stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
    self.draft.keyword = kw.length ? kw : nil;

    if (self.onApply) self.onApply([self.draft copy]);
    [self.navigationController popViewControllerAnimated:YES];
}

#pragma mark - UITextFieldDelegate

- (BOOL)textField:(UITextField *)textField
    shouldChangeCharactersInRange:(NSRange)range
                replacementString:(NSString *)string {
    // 金额框：只允许数字与一个小数点、最多两位小数（与后端 AMOUNT_PATTERN 同口径，提前拦掉）
    if (textField != self.minField && textField != self.maxField) return YES;
    if (!string.length) return YES;

    static NSCharacterSet *allowed = nil;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ allowed = [NSCharacterSet characterSetWithCharactersInString:@"0123456789."]; });
    if ([string rangeOfCharacterFromSet:allowed.invertedSet].location != NSNotFound) return NO;

    NSString *next = [textField.text stringByReplacingCharactersInRange:range withString:string];
    NSArray<NSString *> *parts = [next componentsSeparatedByString:@"."];
    if (parts.count > 2) return NO;
    if (parts.count == 2 && [(NSString *)parts[1] length] > 2) return NO;
    return YES;
}

@end
