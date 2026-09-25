//
//  ABExportViewController.m
//  MyAccountBook
//
//  数据导出页 —— 对齐 frontend/src/pages/export/index.vue
//  「选择流水导出周期」+ 日期 / 支出分类 / 收入分类 三行 + 底部「导出」按钮。
//

#import "ABExportViewController.h"
#import "ABTheme.h"
#import "ABAlert.h"
#import "ABNavigationBar.h"
#import "ABTransactionService.h"
#import "ABAccountStore.h"
#import "ABCategoryService.h"
#import "ABDateUtil.h"
#import "ABFormat.h"
#import <Masonry/Masonry.h>

@interface ABExportViewController ()

@property (nonatomic, strong) ABNavigationBar *navBar;
@property (nonatomic, strong) UILabel *dateRangeLabel;
@property (nonatomic, strong) UILabel *expenseCatLabel;
@property (nonatomic, strong) UILabel *incomeCatLabel;
@property (nonatomic, strong) UIButton *exportButton;

@property (nonatomic, copy) NSString *rangeLabel;
@property (nonatomic, copy) NSString *startDate;
@property (nonatomic, copy) NSString *endDate;

@end

@implementation ABExportViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    self.rangeLabel = @"本月";
    NSDictionary *r = [ABDateUtil periodRange:[ABDateUtil currentMonth] unit:@"month"];
    self.startDate = r[@"start"];
    self.endDate = r[@"end"];
    [self setupViews];
}

- (void)setupViews {
    self.navBar = [[ABNavigationBar alloc] init];
    [self.navBar setTitle:@"数据导出"];
    __weak typeof(self) weakSelf = self;
    self.navBar.onBack = ^{
        [weakSelf.navigationController popViewControllerAnimated:YES];
    };
    [self.view addSubview:self.navBar];

    // 顶部提示条
    UILabel *tip = [[UILabel alloc] init];
    tip.text = @"选择流水导出周期";
    tip.font = [ABTheme fontCaption];
    tip.textColor = [ABTheme textSecondary];
    tip.backgroundColor = [ABTheme bgInset];
    tip.textAlignment = NSTextAlignmentLeft;
    tip.userInteractionEnabled = NO;
    [self.view addSubview:tip];
    // 用 inset 左对齐
    UILabel *tipText = [[UILabel alloc] init];
    tipText.text = @"选择流水导出周期";
    tipText.font = [ABTheme fontCaption];
    tipText.textColor = [ABTheme textSecondary];
    [self.view addSubview:tipText];
    tip.hidden = YES;

    // 信息卡
    UIView *card = [[UIView alloc] init];
    card.backgroundColor = [ABTheme bgCard];
    [self.view addSubview:card];

    // 日期行
    UIView *dateRow = [[UIView alloc] init];
    dateRow.userInteractionEnabled = YES;
    [dateRow addGestureRecognizer:[[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(onPickDate)]];
    [card addSubview:dateRow];

    UIImageView *dateIcon = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"calendar"]];
    dateIcon.tintColor = [ABTheme textSecondary];
    dateIcon.contentMode = UIViewContentModeScaleAspectFit;
    [dateRow addSubview:dateIcon];

    UILabel *dateTitle = [[UILabel alloc] init];
    dateTitle.text = @"日期";
    dateTitle.font = [ABTheme fontBody];
    dateTitle.textColor = [ABTheme textPrimary];
    [dateRow addSubview:dateTitle];

    self.dateRangeLabel = [[UILabel alloc] init];
    self.dateRangeLabel.font = [ABTheme fontBodySm];
    self.dateRangeLabel.textColor = [ABTheme textSecondary];
    self.dateRangeLabel.textAlignment = NSTextAlignmentRight;
    [self updateDateLabel];
    [dateRow addSubview:self.dateRangeLabel];

    UIImageView *dateChev = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"chevron.right"]];
    dateChev.tintColor = [ABTheme textTertiary];
    [dateRow addSubview:dateChev];

    UIView *sep1 = [[UIView alloc] init];
    sep1.backgroundColor = [ABTheme line];
    [card addSubview:sep1];

    // 支出分类行
    UIView *expenseRow = [self makeInfoRow:@"tag" title:@"支出分类" valueLabel:&_expenseCatLabel value:@"全选" action:@selector(onPickExpenseCat)];
    [card addSubview:expenseRow];

    UIView *sep2 = [[UIView alloc] init];
    sep2.backgroundColor = [ABTheme line];
    [card addSubview:sep2];

    // 收入分类行
    UIView *incomeRow = [self makeInfoRow:@"tag" title:@"收入分类" valueLabel:&_incomeCatLabel value:@"全选" action:@selector(onPickIncomeCat)];
    [card addSubview:incomeRow];

    // 导出按钮
    self.exportButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.exportButton setTitle:@"导出" forState:UIControlStateNormal];
    [self.exportButton setTitleColor:[ABTheme textInverse] forState:UIControlStateNormal];
    self.exportButton.titleLabel.font = [ABTheme fontBodyLg];
    self.exportButton.backgroundColor = [ABTheme gold];
    self.exportButton.layer.cornerRadius = 24;
    [self.exportButton addTarget:self action:@selector(onExport) forControlEvents:UIControlEventTouchUpInside];
    [self.view addSubview:self.exportButton];

    // 布局
    [self.navBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.view.mas_safeAreaLayoutGuideTop);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(52);
    }];
    [tipText mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.navBar.mas_bottom).offset(12);
        make.left.equalTo(self.view).offset(16);
    }];
    [card mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(tipText.mas_bottom).offset(12);
        make.left.right.equalTo(self.view);
    }];
    [dateRow mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(card);
        make.height.mas_equalTo(64);
    }];
    [dateIcon mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(dateRow).offset(16);
        make.centerY.equalTo(dateRow);
        make.width.height.mas_equalTo(24);
    }];
    [dateTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(dateIcon.mas_right).offset(12);
        make.centerY.equalTo(dateRow);
    }];
    [dateChev mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(dateRow).offset(-16);
        make.centerY.equalTo(dateRow);
        make.width.height.mas_equalTo(14);
    }];
    [self.dateRangeLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(dateChev.mas_left).offset(-8);
        make.centerY.equalTo(dateRow);
    }];
    [sep1 mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(dateRow.mas_bottom);
        make.left.equalTo(card).offset(16);
        make.right.equalTo(card);
        make.height.mas_equalTo(1);
    }];
    [expenseRow mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(sep1.mas_bottom);
        make.left.right.equalTo(card);
        make.height.mas_equalTo(56);
    }];
    [sep2 mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(expenseRow.mas_bottom);
        make.left.equalTo(card).offset(16);
        make.right.equalTo(card);
        make.height.mas_equalTo(1);
    }];
    [incomeRow mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(sep2.mas_bottom);
        make.left.right.equalTo(card);
        make.height.mas_equalTo(56);
        make.bottom.equalTo(card);
    }];
    [self.exportButton mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.view).offset(16);
        make.right.equalTo(self.view).offset(-16);
        make.bottom.equalTo(self.view.mas_safeAreaLayoutGuideBottom).offset(-16);
        make.height.mas_equalTo(48);
    }];
}

- (UIView *)makeInfoRow:(NSString *)iconName title:(NSString *)title valueLabel:(UILabel * __strong *)outLabel value:(NSString *)value action:(SEL)action {
    UIView *row = [[UIView alloc] init];
    row.userInteractionEnabled = YES;
    [row addGestureRecognizer:[[UITapGestureRecognizer alloc] initWithTarget:self action:action]];

    UIImageView *icon = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:iconName]];
    icon.tintColor = [ABTheme textSecondary];
    icon.contentMode = UIViewContentModeScaleAspectFit;
    [row addSubview:icon];

    UILabel *titleLabel = [[UILabel alloc] init];
    titleLabel.text = title;
    titleLabel.font = [ABTheme fontBody];
    titleLabel.textColor = [ABTheme textPrimary];
    [row addSubview:titleLabel];

    UILabel *valueLabel = [[UILabel alloc] init];
    valueLabel.text = value;
    valueLabel.font = [ABTheme fontBody];
    valueLabel.textColor = [ABTheme textSecondary];
    [row addSubview:valueLabel];
    if (outLabel) *outLabel = valueLabel;

    UIImageView *chev = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"chevron.right"]];
    chev.tintColor = [ABTheme textTertiary];
    [row addSubview:chev];

    [icon mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(row).offset(16);
        make.centerY.equalTo(row);
        make.width.height.mas_equalTo(24);
    }];
    [titleLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(icon.mas_right).offset(12);
        make.centerY.equalTo(row);
    }];
    [chev mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(row).offset(-16);
        make.centerY.equalTo(row);
        make.width.height.mas_equalTo(14);
    }];
    [valueLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(chev.mas_left).offset(-8);
        make.centerY.equalTo(row);
    }];

    return row;
}

- (void)updateDateLabel {
    NSString *s = [self.startDate stringByReplacingOccurrencesOfString:@"-" withString:@"."];
    NSString *e = [self.endDate stringByReplacingOccurrencesOfString:@"-" withString:@"."];
    self.dateRangeLabel.text = [NSString stringWithFormat:@"%@\n%@-%@", self.rangeLabel, s, e];
    self.dateRangeLabel.numberOfLines = 2;
    self.dateRangeLabel.textAlignment = NSTextAlignmentRight;
}

#pragma mark - Actions

- (void)onPickDate {
    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:@"选择周期" message:nil preferredStyle:UIAlertControllerStyleActionSheet];
    __weak typeof(self) weakSelf = self;
    NSArray *options = @[@"本月", @"上月", @"本年", @"去年"];
    for (NSString *opt in options) {
        [sheet addAction:[UIAlertAction actionWithTitle:opt style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
            __strong typeof(weakSelf) self = weakSelf;
            [self applyPreset:opt];
        }]];
    }
    [sheet addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    [ABAlert prepareSheet:sheet anchor:self.view in:self];
    [self presentViewController:sheet animated:YES completion:nil];
}

- (void)applyPreset:(NSString *)preset {
    NSDictionary *r;
    if ([preset isEqualToString:@"本月"]) {
        r = [ABDateUtil periodRange:[ABDateUtil currentMonth] unit:@"month"];
    } else if ([preset isEqualToString:@"上月"]) {
        NSArray *p = [[ABDateUtil currentMonth] componentsSeparatedByString:@"-"];
        NSInteger y = [p[0] integerValue], m = [p[1] integerValue] - 1;
        if (m < 1) { m = 12; y -= 1; }
        r = [ABDateUtil periodRange:[NSString stringWithFormat:@"%04ld-%02ld", (long)y, (long)m] unit:@"month"];
    } else if ([preset isEqualToString:@"本年"]) {
        r = [ABDateUtil periodRange:[ABDateUtil currentYear] unit:@"year"];
    } else {
        NSInteger y = [[ABDateUtil currentYear] integerValue] - 1;
        r = [ABDateUtil periodRange:[NSString stringWithFormat:@"%ld", (long)y] unit:@"year"];
    }
    self.rangeLabel = preset;
    self.startDate = r[@"start"];
    self.endDate = r[@"end"];
    [self updateDateLabel];
}

- (void)onPickExpenseCat { [self pickCategoryWithType:@"expense" label:self.expenseCatLabel]; }
- (void)onPickIncomeCat { [self pickCategoryWithType:@"income" label:self.incomeCatLabel]; }

- (void)pickCategoryWithType:(NSString *)type label:(UILabel *)label {
    NSString *accountId = [ABAccountStore shared].currentId ?: @"";
    __weak typeof(self) weakSelf = self;
    [ABCategoryService getCategories:accountId type:type parentId:nil visibility:@"all"
        success:^(NSArray<ABCategory *> *list) {
            __strong typeof(weakSelf) self = weakSelf;
            UIAlertController *sheet = [UIAlertController alertControllerWithTitle:@"选择分类" message:nil preferredStyle:UIAlertControllerStyleActionSheet];
            [sheet addAction:[UIAlertAction actionWithTitle:@"全选" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
                label.text = @"全选";
            }]];
            for (ABCategory *cat in list) {
                if (!cat.isRoot) continue;
                [sheet addAction:[UIAlertAction actionWithTitle:cat.name style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
                    label.text = cat.name;
                }]];
            }
            [sheet addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
            [ABAlert prepareSheet:sheet anchor:self.view in:self];
            [self presentViewController:sheet animated:YES completion:nil];
        } failure:^(NSError *error) {
            NSLog(@"[export] 分类加载失败: %@", error.localizedDescription);
        }];
}

- (void)onExport {
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    params[@"start"] = self.startDate;
    params[@"end"] = self.endDate;
    NSString *accountId = [ABAccountStore shared].currentId;
    if (accountId.length) params[@"accountId"] = accountId;

    self.exportButton.enabled = NO;
    __weak typeof(self) weakSelf = self;
    // ⚠️ 原来这里写 size = 10000 —— 上限是 100，请求会被参数校验整条拒掉，
    //    也就是说**导出功能一直是坏的**。改走循环分页拉全量。
    [ABTransactionService getAllTransactions:params success:^(NSArray<ABTransaction *> *list) {
        __strong typeof(weakSelf) self = weakSelf;
        self.exportButton.enabled = YES;
        [self shareCSVWithTransactions:list];
    } failure:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        self.exportButton.enabled = YES;
        NSLog(@"[export] 导出失败: %@", error.localizedDescription);
    }];
}

- (void)shareCSVWithTransactions:(NSArray<ABTransaction *> *)list {
    NSMutableString *csv = [NSMutableString string];
    [csv appendString:@"日期,时间,类型,分类,金额,备注\n"];
    for (ABTransaction *t in list) {
        NSString *type = [t.type isEqualToString:@"income"] ? @"收入" : @"支出";
        NSString *line = [NSString stringWithFormat:@"%@,%@,%@,%@,%@,%@\n",
                          t.recordDate, t.recordTime ?: @"", type,
                          [self csvEscape:[t categoryName]], t.amount, [self csvEscape:t.note]];
        [csv appendString:line];
    }

    NSString *filename = [NSString stringWithFormat:@"流水_%@_%@.csv", self.startDate, self.endDate];
    NSString *tmpPath = [NSTemporaryDirectory() stringByAppendingPathComponent:filename];
    NSString *content = [@"\uFEFF" stringByAppendingString:csv];
    [content writeToFile:tmpPath atomically:YES encoding:NSUTF8StringEncoding error:nil];

    NSURL *url = [NSURL fileURLWithPath:tmpPath];
    UIActivityViewController *activity = [[UIActivityViewController alloc] initWithActivityItems:@[url] applicationActivities:nil];
    activity.popoverPresentationController.sourceView = self.exportButton;
    activity.popoverPresentationController.sourceRect = self.exportButton.bounds;
    [self presentViewController:activity animated:YES completion:nil];
}

- (NSString *)csvEscape:(NSString *)s {
    if (!s.length) return @"";
    if ([s rangeOfString:@","].location != NSNotFound ||
        [s rangeOfString:@"\""].location != NSNotFound ||
        [s rangeOfString:@"\n"].location != NSNotFound) {
        NSString *escaped = [s stringByReplacingOccurrencesOfString:@"\"" withString:@"\"\""];
        return [NSString stringWithFormat:@"\"%@\"", escaped];
    }
    return s;
}

@end
