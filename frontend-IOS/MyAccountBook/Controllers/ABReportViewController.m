//
//  ABReportViewController.m
//  MyAccountBook
//
//  报表页 —— 对齐 frontend/src/pages/statistics/index.vue + ReportView
//  汇总卡 + 环形图（支出分布）+ 趋势图（12 个月）+ 分类排行。
//

#import "ABReportViewController.h"
#import "ABTheme.h"
#import "ABStatisticsService.h"
#import "ABRingChart.h"
#import "ABTrendChart.h"
#import "ABFormat.h"
#import "ABDateUtil.h"
#import "ABAccountStore.h"
#import <Masonry/Masonry.h>

@interface ABReportViewController () <UITableViewDataSource, UITableViewDelegate>

@property (nonatomic, strong) UIScrollView *scrollView;
@property (nonatomic, strong) UIView *contentView;

@property (nonatomic, strong) UISegmentedControl *granularitySegment;
@property (nonatomic, strong) UIButton *periodPickerButton;
@property (nonatomic, strong) UILabel *periodLabel;
@property (nonatomic, strong) UIView *summaryCard;
@property (nonatomic, strong) UILabel *incomeValue;
@property (nonatomic, strong) UILabel *expenseValue;
@property (nonatomic, strong) UILabel *balanceValue;
@property (nonatomic, strong) ABRingChart *ringChart;
@property (nonatomic, strong) ABTrendChart *trendChart;
@property (nonatomic, strong) UITableView *categoryTable;

@property (nonatomic, strong) NSArray<ABReportCategory *> *topCategories;
@property (nonatomic, copy) NSString *period;

@end

@implementation ABReportViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    self.period = [ABDateUtil currentMonth];
    [self setupViews];
    [self loadData];
}

- (void)onBack {
    [self.navigationController popViewControllerAnimated:YES];
}

- (void)viewWillAppear:(BOOL)animated {
    [super viewWillAppear:animated];
    [self loadData];
}

- (void)setupViews {
    self.scrollView = [[UIScrollView alloc] init];
    self.scrollView.alwaysBounceVertical = YES;
    [self.view addSubview:self.scrollView];

    self.contentView = [[UIView alloc] init];
    [self.scrollView addSubview:self.contentView];

    UIButton *backBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    [backBtn setImage:[UIImage systemImageNamed:@"chevron.left"] forState:UIControlStateNormal];
    backBtn.tintColor = [ABTheme textPrimary];
    [backBtn addTarget:self action:@selector(onBack) forControlEvents:UIControlEventTouchUpInside];
    [self.contentView addSubview:backBtn];

    UILabel *title = [[UILabel alloc] init];
    title.text = @"报表";
    title.font = [ABTheme fontDisplay];
    title.textColor = [ABTheme textPrimary];
    [self.contentView addSubview:title];

    // 周期切换：粒度（月/年）+ 上/下一期
    self.granularitySegment = [[UISegmentedControl alloc] initWithItems:@[@"月", @"年"]];
    self.granularitySegment.selectedSegmentIndex = 0;
    [self.granularitySegment addTarget:self action:@selector(onGranularityChanged) forControlEvents:UIControlEventValueChanged];
    [self.contentView addSubview:self.granularitySegment];

    self.periodPickerButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.periodPickerButton setTitleColor:[ABTheme gold] forState:UIControlStateNormal];
    self.periodPickerButton.titleLabel.font = [ABTheme fontBody];
    [self.periodPickerButton addTarget:self action:@selector(onPickPeriod) forControlEvents:UIControlEventTouchUpInside];
    [self.contentView addSubview:self.periodPickerButton];

    self.periodLabel = [[UILabel alloc] init];
    self.periodLabel.font = [ABTheme fontBodySm];
    self.periodLabel.textColor = [ABTheme textSecondary];
    self.periodLabel.text = self.period;
    self.periodLabel.hidden = YES;
    [self.contentView addSubview:self.periodLabel];
    [self updatePeriodButtonTitle];

    // 汇总卡
    self.summaryCard = [[UIView alloc] init];
    self.summaryCard.backgroundColor = [ABTheme bgCard];
    self.summaryCard.layer.cornerRadius = kRadiusCard;
    [self.contentView addSubview:self.summaryCard];

    self.incomeValue = [self makeStatValue:[ABTheme income]];
    self.expenseValue = [self makeStatValue:[ABTheme expense]];
    self.balanceValue = [self makeStatValue:[ABTheme textPrimary]];
    UILabel *it = [self makeStatTitle:@"收入"];
    UILabel *et = [self makeStatTitle:@"支出"];
    UILabel *bt = [self makeStatTitle:@"结余"];
    [self.summaryCard addSubview:it];
    [self.summaryCard addSubview:self.incomeValue];
    [self.summaryCard addSubview:et];
    [self.summaryCard addSubview:self.expenseValue];
    [self.summaryCard addSubview:bt];
    [self.summaryCard addSubview:self.balanceValue];

    // 环形图
    UILabel *ringTitle = [self makeSectionTitle:@"支出分布"];
    [self.contentView addSubview:ringTitle];
    self.ringChart = [[ABRingChart alloc] init];
    self.ringChart.layer.cornerRadius = kRadiusCard;
    [self.contentView addSubview:self.ringChart];

    // 趋势图
    UILabel *trendTitle = [self makeSectionTitle:@"收支趋势"];
    [self.contentView addSubview:trendTitle];
    self.trendChart = [[ABTrendChart alloc] init];
    self.trendChart.layer.cornerRadius = kRadiusCard;
    [self.contentView addSubview:self.trendChart];

    // 分类排行
    UILabel *rankTitle = [self makeSectionTitle:@"支出排行"];
    [self.contentView addSubview:rankTitle];
    self.categoryTable = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
    self.categoryTable.backgroundColor = [ABTheme bgCard];
    self.categoryTable.layer.cornerRadius = kRadiusCard;
    self.categoryTable.scrollEnabled = NO;
    self.categoryTable.separatorColor = [ABTheme line];
    self.categoryTable.dataSource = self;
    self.categoryTable.delegate = self;
    self.categoryTable.rowHeight = 56;
    self.categoryTable.tableFooterView = [[UIView alloc] init];
    [self.categoryTable registerClass:UITableViewCell.class forCellReuseIdentifier:@"cat"];
    [self.contentView addSubview:self.categoryTable];

    // 布局
    [self.scrollView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(self.view);
    }];
    [self.contentView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(self.scrollView);
        make.width.equalTo(self.scrollView);
    }];

    [backBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.contentView).offset(8);
        make.centerY.equalTo(title);
        make.width.height.mas_equalTo(44);
    }];
    [title mas_makeConstraints:^(MASConstraintMaker *make) {
        make.centerX.equalTo(self.contentView);
        make.top.equalTo(self.contentView).offset(16);
    }];
    [self.granularitySegment mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(self.contentView).offset(-16);
        make.centerY.equalTo(title);
        make.width.mas_equalTo(100);
    }];
    [self.periodPickerButton mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(title);
        make.top.equalTo(title.mas_bottom).offset(4);
    }];
    [self.periodLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(title);
        make.top.equalTo(title.mas_bottom).offset(4);
    }];
    [self.summaryCard mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.periodLabel.mas_bottom).offset(16);
        make.left.equalTo(self.contentView).offset(16);
        make.right.equalTo(self.contentView).offset(-16);
        make.height.mas_equalTo(96);
    }];

    CGFloat colW = (UIScreen.mainScreen.bounds.size.width - 32) / 3.0;
    [it mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.summaryCard);
        make.top.equalTo(self.summaryCard).offset(20);
        make.width.mas_equalTo(colW);
    }];
    [self.incomeValue mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.width.equalTo(it);
        make.top.equalTo(it.mas_bottom).offset(8);
    }];
    [et mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(it.mas_right);
        make.top.equalTo(it);
        make.width.mas_equalTo(colW);
    }];
    [self.expenseValue mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.width.equalTo(et);
        make.top.equalTo(self.incomeValue);
    }];
    [bt mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(et.mas_right);
        make.top.equalTo(it);
        make.width.mas_equalTo(colW);
    }];
    [self.balanceValue mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.width.equalTo(bt);
        make.top.equalTo(self.incomeValue);
    }];

    [ringTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.contentView).offset(20);
        make.top.equalTo(self.summaryCard.mas_bottom).offset(24);
    }];
    [self.ringChart mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(ringTitle.mas_bottom).offset(12);
        make.left.equalTo(self.contentView).offset(16);
        make.right.equalTo(self.contentView).offset(-16);
        make.height.mas_equalTo(430);
    }];
    [trendTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.contentView).offset(20);
        make.top.equalTo(self.ringChart.mas_bottom).offset(24);
    }];
    [self.trendChart mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(trendTitle.mas_bottom).offset(12);
        make.left.equalTo(self.contentView).offset(16);
        make.right.equalTo(self.contentView).offset(-16);
        make.height.mas_equalTo(180);
    }];
    [rankTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.contentView).offset(20);
        make.top.equalTo(self.trendChart.mas_bottom).offset(24);
    }];
    [self.categoryTable mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(rankTitle.mas_bottom).offset(12);
        make.left.equalTo(self.contentView).offset(16);
        make.right.equalTo(self.contentView).offset(-16);
        make.height.mas_equalTo(500);
        make.bottom.equalTo(self.contentView).offset(-16);
    }];
}

#pragma mark - 周期切换

- (BOOL)isYearMode {
    return self.granularitySegment.selectedSegmentIndex == 1;
}

- (void)updatePeriodButtonTitle {
    NSString *title;
    if ([self isYearMode]) {
        title = [NSString stringWithFormat:@"%@ 年  ▾", [self.period substringToIndex:4]];
    } else {
        NSArray *p = [self.period componentsSeparatedByString:@"-"];
        title = [NSString stringWithFormat:@"%@年%@月  ▾", p[0], @([p[1] integerValue])];
    }
    [self.periodPickerButton setTitle:title forState:UIControlStateNormal];
}

- (void)onGranularityChanged {
    self.period = [self isYearMode] ? [ABDateUtil currentYear] : [ABDateUtil currentMonth];
    [self updatePeriodButtonTitle];
    [self loadData];
}

- (void)onPickPeriod {
    // 上一期 / 下一期 / 回到当前
    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:@"选择周期" message:nil preferredStyle:UIAlertControllerStyleActionSheet];
    __weak typeof(self) weakSelf = self;
    [sheet addAction:[UIAlertAction actionWithTitle:@"上一期" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        [self shiftPeriod:-1];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"下一期" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        [self shiftPeriod:1];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"回到当前" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        self.period = [self isYearMode] ? [ABDateUtil currentYear] : [ABDateUtil currentMonth];
        [self updatePeriodButtonTitle];
        [self loadData];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    sheet.popoverPresentationController.sourceView = self.periodPickerButton;
    sheet.popoverPresentationController.sourceRect = self.periodPickerButton.bounds;
    [self presentViewController:sheet animated:YES completion:nil];
}

- (void)shiftPeriod:(NSInteger)delta {
    if ([self isYearMode]) {
        NSInteger year = [self.period integerValue] + delta;
        self.period = [NSString stringWithFormat:@"%ld", (long)year];
    } else {
        NSArray *p = [self.period componentsSeparatedByString:@"-"];
        NSInteger year = [p[0] integerValue];
        NSInteger month = [p[1] integerValue] + delta;
        if (month < 1) { month = 12; year -= 1; }
        if (month > 12) { month = 1; year += 1; }
        self.period = [NSString stringWithFormat:@"%04ld-%02ld", (long)year, (long)month];
    }
    [self updatePeriodButtonTitle];
    [self loadData];
}

- (UILabel *)makeStatValue:(UIColor *)color {
    UILabel *l = [[UILabel alloc] init];
    l.font = [ABTheme fontH1];
    l.textColor = color;
    l.textAlignment = NSTextAlignmentCenter;
    l.text = @"--";
    return l;
}

- (UILabel *)makeStatTitle:(NSString *)title {
    UILabel *l = [[UILabel alloc] init];
    l.text = title;
    l.font = [ABTheme fontCaption];
    l.textColor = [ABTheme textSecondary];
    l.textAlignment = NSTextAlignmentCenter;
    return l;
}

- (UILabel *)makeSectionTitle:(NSString *)title {
    UILabel *l = [[UILabel alloc] init];
    l.text = title;
    l.font = [ABTheme fontH2];
    l.textColor = [ABTheme textPrimary];
    return l;
}

- (void)loadData {
    __weak typeof(self) weakSelf = self;
    NSString *aid = [ABAccountStore shared].currentId;
    [ABStatisticsService getReport:self.period accountId:aid success:^(ABReportData *data) {
        __strong typeof(weakSelf) self = weakSelf;
        self.incomeValue.text = [ABFormat money:data.summary.income];
        self.expenseValue.text = [ABFormat money:data.summary.expense];
        self.balanceValue.text = [ABFormat money:data.summary.balance];
        [self.ringChart setCategories:data.expenseCategories];
        [self.trendChart setTrend:data.trend];
        self.topCategories = data.expenseCategories;
        [self.categoryTable reloadData];
    } failure:^(NSError *error) {
        NSLog(@"[report] 加载失败: %@", error.localizedDescription);
    }];
}

#pragma mark - UITableView

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return self.topCategories.count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"cat" forIndexPath:indexPath];
    cell.selectionStyle = UITableViewCellSelectionStyleNone;
    for (UIView *v in cell.contentView.subviews) { [v removeFromSuperview]; }

    ABReportCategory *cat = self.topCategories[indexPath.row];

    UILabel *icon = [[UILabel alloc] init];
    icon.text = cat.icon.length ? cat.icon : @"📝";
    icon.font = [UIFont systemFontOfSize:22];
    [cell.contentView addSubview:icon];

    UILabel *name = [[UILabel alloc] init];
    name.text = cat.name;
    name.font = [ABTheme fontBody];
    name.textColor = [ABTheme textPrimary];
    [cell.contentView addSubview:name];

    UILabel *ratio = [[UILabel alloc] init];
    ratio.text = [NSString stringWithFormat:@"%.1f%%", cat.ratio];
    ratio.font = [ABTheme fontCaption];
    ratio.textColor = [ABTheme textSecondary];
    [cell.contentView addSubview:ratio];

    UILabel *amount = [[UILabel alloc] init];
    amount.text = [ABFormat money:cat.sum];
    amount.font = [ABTheme fontBody];
    amount.textColor = [ABTheme textPrimary];
    amount.textAlignment = NSTextAlignmentRight;
    [cell.contentView addSubview:amount];

    [icon mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(cell.contentView).offset(16);
        make.centerY.equalTo(cell.contentView);
        make.width.mas_equalTo(32);
    }];
    [name mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(icon.mas_right).offset(8);
        make.centerY.equalTo(cell.contentView);
    }];
    [amount mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(cell.contentView).offset(-16);
        make.centerY.equalTo(cell.contentView);
    }];
    [ratio mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(amount.mas_left).offset(-12);
        make.centerY.equalTo(cell.contentView);
    }];

    return cell;
}

@end
