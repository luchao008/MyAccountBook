//
//  ABHomeViewController.m
//  MyAccountBook
//

#import "ABHomeViewController.h"
#import "ABTheme.h"
#import "ABStatisticsService.h"
#import "ABAccountStore.h"
#import "ABFormat.h"
#import "ABIconView.h"
#import "ABEmptyView.h"
#import "ABFlowViewController.h"
#import "ABReportViewController.h"
#import "ABRecordViewController.h"
#import "ABDateUtil.h"
#import <Masonry/Masonry.h>

@interface ABHomeViewController ()

@property (nonatomic, strong) UIScrollView *scrollView;
@property (nonatomic, strong) UIView *contentView;

@property (nonatomic, strong) UIView *banner;
@property (nonatomic, strong) CAGradientLayer *bannerGradient;
@property (nonatomic, strong) UILabel *accountNameLabel;
@property (nonatomic, strong) UILabel *expenseLabel;
@property (nonatomic, strong) UILabel *incomeValueLabel;
@property (nonatomic, strong) UILabel *balanceValueLabel;

@property (nonatomic, strong) UIView *rangeCard;
@property (nonatomic, strong) UIView *rankCard;
@property (nonatomic, strong) NSArray<ABRangeStat *> *ranges;
@property (nonatomic, strong) NSArray<ABReportCategory *> *ranking;

@property (nonatomic, strong) UIView *navBar;
@property (nonatomic, strong) UIView *tabBar;

@end

@implementation ABHomeViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    [self setupViews];
}

- (void)viewWillAppear:(BOOL)animated {
    [super viewWillAppear:animated];
    [self loadData];
}

- (void)setupViews {
    self.scrollView = [[UIScrollView alloc] init];
    self.scrollView.backgroundColor = [ABTheme bgPage];
    self.scrollView.alwaysBounceVertical = YES;
    [self.view addSubview:self.scrollView];

    self.contentView = [[UIView alloc] init];
    [self.scrollView addSubview:self.contentView];

    [self setupNavBar];
    [self setupBanner];
    [self setupRangeCard];
    [self setupRankCard];
    [self setupTabBar];

    [self.tabBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.right.bottom.equalTo(self.view);
        make.height.mas_equalTo(76);  // 安全区在 viewSafeAreaInsetsDidChange 里补
    }];
    [self.scrollView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.navBar.mas_bottom);
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.tabBar.mas_top);
    }];
    [self.contentView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(self.scrollView);
        make.width.equalTo(self.scrollView);
    }];
}

#pragma mark - 顶部导航栏（返回 + 居中标题）

- (void)setupNavBar {
    self.navBar = [[UIView alloc] init];
    self.navBar.backgroundColor = [ABTheme bgPage];
    [self.view addSubview:self.navBar];

    UIButton *backBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    [backBtn setImage:[UIImage systemImageNamed:@"chevron.left"] forState:UIControlStateNormal];
    backBtn.tintColor = [ABTheme textPrimary];
    [backBtn addTarget:self action:@selector(onBack) forControlEvents:UIControlEventTouchUpInside];
    [self.navBar addSubview:backBtn];

    UILabel *title = [[UILabel alloc] init];
    title.text = @"记账";
    title.font = [ABTheme fontH2];
    title.textColor = [ABTheme textPrimary];
    title.textAlignment = NSTextAlignmentCenter;
    [self.navBar addSubview:title];

    [self.navBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.view.mas_safeAreaLayoutGuideTop);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(44);
    }];
    [backBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.navBar).offset(8);
        make.centerY.equalTo(self.navBar);
        make.width.height.mas_equalTo(44);
    }];
    [title mas_makeConstraints:^(MASConstraintMaker *make) {
        make.center.equalTo(self.navBar);
    }];
}

- (void)onBack {
    [self.navigationController popViewControllerAnimated:YES];
}

#pragma mark - 底部栏（流水 / 记一笔 / 报表）

- (void)setupTabBar {
    self.tabBar = [[UIView alloc] init];
    self.tabBar.backgroundColor = [ABTheme bgCard];
    [self.view addSubview:self.tabBar];

    UIView *topLine = [[UIView alloc] init];
    topLine.backgroundColor = [ABTheme line];
    [self.tabBar addSubview:topLine];

    UIButton *flowTab = [self makeTabButton:@"流水" icon:@"list.bullet.rectangle" action:@selector(onFlow)];
    UIButton *reportTab = [self makeTabButton:@"报表" icon:@"chart.bar" action:@selector(onReport)];
    [self.tabBar addSubview:flowTab];
    [self.tabBar addSubview:reportTab];

    // 中间凸起的「记一笔」
    UIButton *recordBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    recordBtn.backgroundColor = [ABTheme gold];
    recordBtn.layer.cornerRadius = 25;
    [recordBtn setImage:[UIImage systemImageNamed:@"plus"] forState:UIControlStateNormal];
    recordBtn.tintColor = UIColor.whiteColor;
    [recordBtn addTarget:self action:@selector(onRecord) forControlEvents:UIControlEventTouchUpInside];
    [self.tabBar addSubview:recordBtn];

    UILabel *recordLabel = [[UILabel alloc] init];
    recordLabel.text = @"记一笔";
    recordLabel.font = [ABTheme fontCaption];
    recordLabel.textColor = [ABTheme textSecondary];
    recordLabel.textAlignment = NSTextAlignmentCenter;
    [self.tabBar addSubview:recordLabel];

    [topLine mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(self.tabBar);
        make.height.mas_equalTo(1);
    }];
    [flowTab mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.tabBar);
        make.top.equalTo(self.tabBar).offset(10);
        make.width.equalTo(self.tabBar).multipliedBy(0.333);
        make.height.mas_equalTo(48);
    }];
    [reportTab mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(self.tabBar);
        make.top.width.height.equalTo(flowTab);
    }];
    [recordBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.centerX.equalTo(self.tabBar);
        make.top.equalTo(self.tabBar).offset(0);
        make.width.height.mas_equalTo(50);
    }];
    [recordLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.centerX.equalTo(self.tabBar);
        make.top.equalTo(recordBtn.mas_bottom).offset(0);
    }];
}

- (UIButton *)makeTabButton:(NSString *)title icon:(NSString *)icon action:(SEL)action {
    UIButton *btn = [UIButton buttonWithType:UIButtonTypeSystem];
    [btn setTitle:title forState:UIControlStateNormal];
    [btn setImage:[UIImage systemImageNamed:icon] forState:UIControlStateNormal];
    btn.tintColor = [ABTheme textSecondary];
    btn.titleLabel.font = [ABTheme fontCaption];
    [btn setTitleColor:[ABTheme textSecondary] forState:UIControlStateNormal];
    btn.imageEdgeInsets = UIEdgeInsetsMake(-16, 0, 0, -btn.titleLabel.intrinsicContentSize.width);
    btn.titleEdgeInsets = UIEdgeInsetsMake(22, -btn.currentImage.size.width, -22, 0);
    [btn addTarget:self action:action forControlEvents:UIControlEventTouchUpInside];
    return btn;
}

- (void)onFlow {
    ABFlowViewController *flow = [[ABFlowViewController alloc] init];
    [self.navigationController pushViewController:flow animated:YES];
}

- (void)onReport {
    ABReportViewController *report = [[ABReportViewController alloc] init];
    [self.navigationController pushViewController:report animated:YES];
}

- (void)onRecord {
    ABRecordViewController *record = [[ABRecordViewController alloc] initWithTransaction:nil];
    UINavigationController *nav = [[UINavigationController alloc] initWithRootViewController:record];
    nav.modalPresentationStyle = UIModalPresentationPageSheet;
    record.title = @"记一笔";
    record.navigationItem.leftBarButtonItem = [[UIBarButtonItem alloc] initWithTitle:@"取消" style:UIBarButtonItemStylePlain target:self action:@selector(dismissRecord)];
    __weak typeof(self) weakSelf = self;
    record.onSaved = ^{
        __strong typeof(weakSelf) self = weakSelf;
        [self loadData];
    };
    [self presentViewController:nav animated:YES completion:nil];
}

- (void)dismissRecord {
    [self dismissViewControllerAnimated:YES completion:nil];
}

- (void)setupBanner {
    self.banner = [[UIView alloc] init];
    self.banner.layer.cornerRadius = kRadiusCard;
    self.banner.clipsToBounds = YES;
    CAGradientLayer *gradient = [CAGradientLayer layer];
    gradient.colors = @[(__bridge id)[ABTheme goldSoft].CGColor,
                        (__bridge id)ABColorHex(0xFBF0E4).CGColor];
    gradient.startPoint = CGPointMake(0.5, 0);
    gradient.endPoint = CGPointMake(0.5, 1);
    [self.banner.layer insertSublayer:gradient atIndex:0];
    self.bannerGradient = gradient;
    [self.contentView addSubview:self.banner];

    // 账本切换胶囊
    UIView *switchBg = [[UIView alloc] init];
    switchBg.backgroundColor = [UIColor colorWithWhite:1.0 alpha:0.72];
    switchBg.layer.cornerRadius = 14;
    [self.banner addSubview:switchBg];

    self.accountNameLabel = [[UILabel alloc] init];
    self.accountNameLabel.font = [UIFont systemFontOfSize:14 weight:UIFontWeightMedium];
    self.accountNameLabel.textColor = [ABTheme heroInk];
    [switchBg addSubview:self.accountNameLabel];

    UIImageView *arrow = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"chevron.down"]];
    arrow.tintColor = [ABTheme heroInk];
    arrow.contentMode = UIViewContentModeScaleAspectFit;
    [switchBg addSubview:arrow];

    // 装饰图标（右上角柱状图）
    UIImageView *deco = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"chart.bar"]];
    deco.tintColor = [ABTheme heroInk];
    deco.alpha = 0.85;
    deco.contentMode = UIViewContentModeScaleAspectFit;
    [self.banner addSubview:deco];

    // 总支出
    UILabel *expenseTitle = [[UILabel alloc] init];
    expenseTitle.text = @"总支出";
    expenseTitle.font = [ABTheme fontBodySm];
    expenseTitle.textColor = [ABTheme heroInk];
    [self.banner addSubview:expenseTitle];

    self.expenseLabel = [[UILabel alloc] init];
    self.expenseLabel.font = [ABTheme fontDisplayLg];
    self.expenseLabel.textColor = [ABTheme heroInk];
    self.expenseLabel.text = @"¥0.00";
    [self.banner addSubview:self.expenseLabel];

    // 分隔线
    UIView *divider = [[UIView alloc] init];
    divider.backgroundColor = [UIColor colorWithRed:143/255.0 green:83/255.0 blue:18/255.0 alpha:0.18];
    [self.banner addSubview:divider];

    // 总收入 / 结余
    UILabel *incomeTitle = [[UILabel alloc] init];
    incomeTitle.text = @"总收入";
    incomeTitle.font = [ABTheme fontCaption];
    incomeTitle.textColor = [ABTheme heroInk];
    [self.banner addSubview:incomeTitle];

    self.incomeValueLabel = [[UILabel alloc] init];
    self.incomeValueLabel.font = [ABTheme fontBody];
    self.incomeValueLabel.textColor = [ABTheme heroInk];
    self.incomeValueLabel.text = @"0.00";
    [self.banner addSubview:self.incomeValueLabel];

    UILabel *balanceTitle = [[UILabel alloc] init];
    balanceTitle.text = @"结余";
    balanceTitle.font = [ABTheme fontCaption];
    balanceTitle.textColor = [ABTheme heroInk];
    [self.banner addSubview:balanceTitle];

    self.balanceValueLabel = [[UILabel alloc] init];
    self.balanceValueLabel.font = [ABTheme fontBody];
    self.balanceValueLabel.textColor = [ABTheme heroInk];
    self.balanceValueLabel.text = @"0.00";
    [self.banner addSubview:self.balanceValueLabel];

    // 布局
    [self.banner mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.contentView).offset(12);
        make.left.equalTo(self.contentView).offset(12);
        make.right.equalTo(self.contentView).offset(-12);
    }];
    [switchBg mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.banner).offset(18);
        make.top.equalTo(self.banner).offset(16);
        make.height.mas_equalTo(38);
    }];
    [self.accountNameLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(switchBg).offset(12);
        make.centerY.equalTo(switchBg);
    }];
    [arrow mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.accountNameLabel.mas_right).offset(4);
        make.right.equalTo(switchBg).offset(-12);
        make.centerY.equalTo(switchBg);
        make.width.height.mas_equalTo(12);
    }];
    [deco mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(self.banner).offset(-18);
        make.centerY.equalTo(switchBg);
        make.width.height.mas_equalTo(28);
    }];
    [expenseTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.banner).offset(18);
        make.top.equalTo(switchBg.mas_bottom).offset(18);
    }];
    [self.expenseLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.banner).offset(18);
        make.right.equalTo(self.banner).offset(-18);
        make.top.equalTo(expenseTitle.mas_bottom).offset(2);
    }];
    [divider mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.banner).offset(18);
        make.right.equalTo(self.banner).offset(-18);
        make.top.equalTo(self.expenseLabel.mas_bottom).offset(14);
        make.height.mas_equalTo(1);
    }];
    [incomeTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.banner).offset(18);
        make.top.equalTo(divider).offset(12);
        make.bottom.equalTo(self.banner).offset(-18);
    }];
    [self.incomeValueLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(incomeTitle.mas_right).offset(6);
        make.centerY.equalTo(incomeTitle);
    }];
    [balanceTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.banner.mas_centerX).offset(0);
        make.centerY.equalTo(incomeTitle);
    }];
    [self.balanceValueLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(balanceTitle.mas_right).offset(6);
        make.centerY.equalTo(incomeTitle);
    }];
}

- (void)setupRangeCard {
    self.rangeCard = [[UIView alloc] init];
    self.rangeCard.backgroundColor = [ABTheme bgCard];
    self.rangeCard.layer.cornerRadius = kRadiusCard;
    [self.contentView addSubview:self.rangeCard];

    [self.rangeCard mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.banner.mas_bottom).offset(12);
        make.left.equalTo(self.contentView).offset(12);
        make.right.equalTo(self.contentView).offset(-12);
        make.height.mas_equalTo(0);  // 动态填充后更新
    }];
}

- (void)setupRankCard {
    self.rankCard = [[UIView alloc] init];
    self.rankCard.backgroundColor = [ABTheme bgCard];
    self.rankCard.layer.cornerRadius = kRadiusCard;
    [self.contentView addSubview:self.rankCard];

    [self.rankCard mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.rangeCard.mas_bottom).offset(12);
        make.left.equalTo(self.contentView).offset(12);
        make.right.equalTo(self.contentView).offset(-12);
        make.height.mas_equalTo(0);
        make.bottom.equalTo(self.contentView).offset(-12);
    }];
}

- (void)viewDidLayoutSubviews {
    [super viewDidLayoutSubviews];
    self.bannerGradient.frame = self.banner.bounds;
}

- (void)viewSafeAreaInsetsDidChange {
    [super viewSafeAreaInsetsDidChange];
    CGFloat bottom = self.view.safeAreaInsets.bottom;
    [self.tabBar mas_updateConstraints:^(MASConstraintMaker *make) {
        make.height.mas_equalTo(76 + bottom);
    }];
}

#pragma mark - 数据

- (void)loadData {
    NSString *accountId = [ABAccountStore shared].currentId;
    self.accountNameLabel.text = [[ABAccountStore shared] currentName];

    __weak typeof(self) weakSelf = self;
    [ABStatisticsService getOverview:accountId success:^(ABOverview *overview) {
        __strong typeof(weakSelf) self = weakSelf;
        self.expenseLabel.text = [NSString stringWithFormat:@"¥%@", [ABFormat money:overview.totalExpense]];
        self.incomeValueLabel.text = [ABFormat money:overview.totalIncome];
        self.balanceValueLabel.text = [ABFormat money:overview.totalBalance];
        self.ranges = overview.ranges;
        [self rebuildRangeCard];
    } failure:^(NSError *error) {
        NSLog(@"[home] overview 失败: %@", error.localizedDescription);
    }];

    NSString *month = [[ABDateUtil currentMonth] copy];
    [ABStatisticsService getReport:month accountId:accountId success:^(ABReportData *data) {
        __strong typeof(weakSelf) self = weakSelf;
        self.ranking = data.expenseCategories;
        [self rebuildRankCard];
    } failure:^(NSError *error) {
        NSLog(@"[home] report 失败: %@", error.localizedDescription);
    }];
}

- (void)rebuildRangeCard {
    for (UIView *v in self.rangeCard.subviews) { [v removeFromSuperview]; }

    NSArray *iconTexts = @[@"日", @"周", @"月", @"¥", @"年"];
    NSArray *colors = @[ABColorHex(0x0E7C86), ABColorHex(0x7c3aed), ABColorHex(0x0e7c42),
                        ABColorHex(0xc2185b), ABColorHex(0x1d63b8)];

    UIView *lastRow = nil;
    for (NSInteger i = 0; i < self.ranges.count; i++) {
        ABRangeStat *item = self.ranges[i];
        UIView *row = [[UIView alloc] init];
        [self.rangeCard addSubview:row];

        UIView *iconBox = [[UIView alloc] init];
        iconBox.backgroundColor = colors[i % colors.count];
        iconBox.layer.cornerRadius = 9;
        [row addSubview:iconBox];

        UILabel *iconText = [[UILabel alloc] init];
        iconText.text = iconTexts[i % iconTexts.count];
        iconText.font = [ABTheme fontBodySm];
        iconText.textColor = UIColor.whiteColor;
        iconText.textAlignment = NSTextAlignmentCenter;
        [iconBox addSubview:iconText];

        UILabel *label = [[UILabel alloc] init];
        label.text = item.label;
        label.font = [UIFont systemFontOfSize:15 weight:UIFontWeightMedium];
        label.textColor = [ABTheme textPrimary];
        [row addSubview:label];

        UILabel *period = [[UILabel alloc] init];
        period.text = item.period;
        period.font = [ABTheme fontCaption];
        period.textColor = [ABTheme textSecondary];
        [row addSubview:period];

        UILabel *incomeLabel = [[UILabel alloc] init];
        incomeLabel.text = [NSString stringWithFormat:@"总收入  %@", [ABFormat money:item.income]];
        incomeLabel.font = [ABTheme fontCaption];
        incomeLabel.textColor = [ABTheme income];
        incomeLabel.textAlignment = NSTextAlignmentRight;
        [row addSubview:incomeLabel];

        UILabel *expenseLabel = [[UILabel alloc] init];
        expenseLabel.text = [NSString stringWithFormat:@"总支出  %@", [ABFormat money:item.expense]];
        expenseLabel.font = [ABTheme fontCaption];
        expenseLabel.textColor = [ABTheme expense];
        expenseLabel.textAlignment = NSTextAlignmentRight;
        [row addSubview:expenseLabel];

        // 分隔线
        if (i < self.ranges.count - 1) {
            UIView *sep = [[UIView alloc] init];
            sep.backgroundColor = [ABTheme line];
            [row addSubview:sep];
            [sep mas_makeConstraints:^(MASConstraintMaker *make) {
                make.left.equalTo(row).offset(16);
                make.right.equalTo(row);
                make.bottom.equalTo(row);
                make.height.mas_equalTo(1);
            }];
        }

        [row mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.right.equalTo(self.rangeCard);
            make.height.mas_equalTo(72);
            if (lastRow) make.top.equalTo(lastRow.mas_bottom);
            else make.top.equalTo(self.rangeCard);
        }];
        [iconBox mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(row).offset(16);
            make.centerY.equalTo(row);
            make.width.height.mas_equalTo(32);
        }];
        [iconText mas_makeConstraints:^(MASConstraintMaker *make) {
            make.edges.equalTo(iconBox);
        }];
        [label mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(iconBox.mas_right).offset(12);
            make.top.equalTo(row).offset(14);
        }];
        [period mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(label);
            make.top.equalTo(label.mas_bottom).offset(2);
        }];
        [incomeLabel mas_makeConstraints:^(MASConstraintMaker *make) {
            make.right.equalTo(row).offset(-16);
            make.top.equalTo(label);
        }];
        [expenseLabel mas_makeConstraints:^(MASConstraintMaker *make) {
            make.right.equalTo(row).offset(-16);
            make.top.equalTo(period);
        }];

        lastRow = row;
    }

    CGFloat h = self.ranges.count * 72;
    [self.rangeCard mas_updateConstraints:^(MASConstraintMaker *make) {
        make.height.mas_equalTo(h);
    }];
}

- (void)rebuildRankCard {
    for (UIView *v in self.rankCard.subviews) { [v removeFromSuperview]; }

    // 标题行
    UILabel *title = [[UILabel alloc] init];
    title.text = @"本月各分类支出排行";
    title.font = [UIFont systemFontOfSize:17 weight:UIFontWeightMedium];
    title.textColor = [ABTheme textPrimary];
    [self.rankCard addSubview:title];

    [title mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.rankCard).offset(16);
        make.top.equalTo(self.rankCard).offset(16);
    }];

    if (!self.ranking.count) {
        UILabel *empty = [[UILabel alloc] init];
        empty.text = @"本月还没有支出记录";
        empty.font = [ABTheme fontBodySm];
        empty.textColor = [ABTheme textSecondary];
        empty.textAlignment = NSTextAlignmentCenter;
        [self.rankCard addSubview:empty];
        [empty mas_makeConstraints:^(MASConstraintMaker *make) {
            make.top.equalTo(title.mas_bottom).offset(24);
            make.left.right.equalTo(self.rankCard);
            make.bottom.equalTo(self.rankCard).offset(-24);
        }];
        [self.rankCard mas_updateConstraints:^(MASConstraintMaker *make) {
            make.height.mas_equalTo(120);
        }];
        return;
    }

    NSInteger shown = MIN(self.ranking.count, 5);
    UIView *lastItem = nil;
    for (NSInteger i = 0; i < shown; i++) {
        ABReportCategory *item = self.ranking[i];
        UIView *row = [[UIView alloc] init];
        [self.rankCard addSubview:row];

        UILabel *no = [[UILabel alloc] init];
        no.text = [NSString stringWithFormat:@"%ld", (long)(i + 1)];
        no.font = [ABTheme fontCaption];
        no.textColor = [ABTheme textSecondary];
        [row addSubview:no];

        ABIconView *icon = [[ABIconView alloc] initWithSize:28];
        icon.iconKey = item.icon;
        [row addSubview:icon];

        UILabel *name = [[UILabel alloc] init];
        name.text = item.name;
        name.font = [ABTheme fontBody];
        name.textColor = [ABTheme textPrimary];
        [row addSubview:name];

        UILabel *right = [[UILabel alloc] init];
        right.text = [NSString stringWithFormat:@"%.2f%%  •  %@", item.ratio, [ABFormat money:item.sum]];
        right.font = [ABTheme fontCaption];
        right.textColor = [ABTheme textSecondary];
        right.textAlignment = NSTextAlignmentRight;
        [row addSubview:right];

        // 进度条
        UIView *barBg = [[UIView alloc] init];
        barBg.backgroundColor = [ABTheme bgInset];
        barBg.layer.cornerRadius = 3;
        [row addSubview:barBg];

        UIView *barFill = [[UIView alloc] init];
        barFill.backgroundColor = [ABTheme gold];
        barFill.layer.cornerRadius = 3;
        [barBg addSubview:barFill];

        [row mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.right.equalTo(self.rankCard);
            make.height.mas_equalTo(62);
            if (lastItem) make.top.equalTo(lastItem.mas_bottom);
            else make.top.equalTo(title.mas_bottom).offset(12);
        }];
        [no mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(row).offset(16);
            make.top.equalTo(row).offset(4);
            make.width.mas_equalTo(16);
        }];
        [icon mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(no.mas_right).offset(4);
            make.centerY.equalTo(no);
            make.width.height.mas_equalTo(28);
        }];
        [name mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(icon.mas_right).offset(8);
            make.centerY.equalTo(no);
        }];
        [right mas_makeConstraints:^(MASConstraintMaker *make) {
            make.right.equalTo(row).offset(-16);
            make.centerY.equalTo(no);
        }];
        [barBg mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(icon);
            make.right.equalTo(row).offset(-16);
            make.top.equalTo(no.mas_bottom).offset(8);
            make.height.mas_equalTo(6);
        }];
        [barFill mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.top.bottom.equalTo(barBg);
            CGFloat w = MAX(item.ratio, 2);
            make.width.equalTo(barBg).multipliedBy(w / 100.0);
        }];

        lastItem = row;
    }

    [self.rankCard mas_updateConstraints:^(MASConstraintMaker *make) {
        make.height.mas_equalTo(60 + shown * 62);
    }];
}

@end
