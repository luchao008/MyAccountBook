//
//  ABCalendarViewController.m
//  MyAccountBook
//
//  日历页 —— 对齐 frontend/src/pages/calendar/index.vue
//  顶栏（返回 + 年月选择）+ 周日~周六表头 + 日历网格（每日金额）+ 当日明细 + 右下角 FAB。
//

#import "ABCalendarViewController.h"
#import "ABTheme.h"
#import "ABTransactionService.h"
#import "ABTransactionCell.h"
#import "ABDateUtil.h"
#import "ABFormat.h"
#import "ABAccountStore.h"
#import "ABRecordViewController.h"
#import <Masonry/Masonry.h>

@interface ABCalendarDayCell : UICollectionViewCell
@property (nonatomic, strong) UILabel *dayLabel;
@property (nonatomic, strong) UILabel *amountLabel;
@end

@implementation ABCalendarDayCell
- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        _dayLabel = [[UILabel alloc] init];
        _dayLabel.font = [ABTheme fontBody];
        _dayLabel.textAlignment = NSTextAlignmentCenter;
        [self.contentView addSubview:_dayLabel];

        _amountLabel = [[UILabel alloc] init];
        _amountLabel.font = [UIFont systemFontOfSize:11];
        _amountLabel.textAlignment = NSTextAlignmentCenter;
        [self.contentView addSubview:_amountLabel];

        [_dayLabel mas_makeConstraints:^(MASConstraintMaker *make) {
            make.top.equalTo(self.contentView).offset(6);
            make.centerX.equalTo(self.contentView);
        }];
        [_amountLabel mas_makeConstraints:^(MASConstraintMaker *make) {
            make.top.equalTo(self.dayLabel.mas_bottom).offset(2);
            make.centerX.equalTo(self.contentView);
        }];
    }
    return self;
}
@end

@interface ABCalendarViewController () <UICollectionViewDataSource, UICollectionViewDelegate, UITableViewDataSource, UITableViewDelegate>

@property (nonatomic, strong) UILabel *navTitle;
@property (nonatomic, strong) UICollectionView *grid;
@property (nonatomic, strong) UITableView *dayTable;
@property (nonatomic, strong) UILabel *daySummary;
@property (nonatomic, strong) UIButton *fab;

@property (nonatomic, strong) NSArray<NSString *> *weekdays;
@property (nonatomic, strong) NSMutableArray<NSNumber *> *days;  // 0 = 空白
@property (nonatomic, assign) NSInteger selectedDay;
@property (nonatomic, copy) NSString *currentMonth;
@property (nonatomic, strong) NSArray<ABTransaction *> *dayTransactions;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSNumber *> *dayExpenseMap;
@property (nonatomic, strong) NSMutableArray<ABTransaction *> *allMonthTxns;

@end

@implementation ABCalendarViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    self.weekdays = @[@"日", @"一", @"二", @"三", @"四", @"五", @"六"];
    self.currentMonth = [ABDateUtil currentMonth];
    self.dayTransactions = @[];
    self.allMonthTxns = [NSMutableArray array];
    self.dayExpenseMap = [NSMutableDictionary dictionary];
    self.days = [NSMutableArray array];

    NSInteger today = [[NSCalendar currentCalendar] component:NSCalendarUnitDay fromDate:[NSDate date]];
    self.selectedDay = today;

    [self buildDays];
    [self setupViews];
    [self loadMonthData];
}

- (void)buildDays {
    [self.days removeAllObjects];
    NSArray *p = [self.currentMonth componentsSeparatedByString:@"-"];
    NSInteger year = [p[0] integerValue];
    NSInteger month = [p[1] integerValue];

    NSDateComponents *c = [[NSDateComponents alloc] init];
    c.year = year; c.month = month; c.day = 1;
    NSDate *first = [[NSCalendar currentCalendar] dateFromComponents:c];

    NSInteger weekDay = [[NSCalendar currentCalendar] component:NSCalendarUnitWeekday fromDate:first];
    // 周日起点（对齐前端：日 一 二 三 四 五 六）
    NSInteger offset = weekDay - 1;

    NSRange range = [[NSCalendar currentCalendar] rangeOfUnit:NSCalendarUnitDay inUnit:NSCalendarUnitMonth forDate:first];
    for (NSInteger i = 0; i < offset; i++) [self.days addObject:@(0)];
    for (NSInteger d = 1; d <= range.length; d++) [self.days addObject:@(d)];
}

- (void)setupViews {
    UIView *navBar = [[UIView alloc] init];
    navBar.backgroundColor = [ABTheme bgPage];
    [self.view addSubview:navBar];

    UIButton *back = [UIButton buttonWithType:UIButtonTypeSystem];
    [back setImage:[UIImage systemImageNamed:@"chevron.left"] forState:UIControlStateNormal];
    back.tintColor = [ABTheme textPrimary];
    [back addTarget:self action:@selector(onBack) forControlEvents:UIControlEventTouchUpInside];
    [navBar addSubview:back];

    self.navTitle = [[UILabel alloc] init];
    self.navTitle.font = [ABTheme fontH2];
    self.navTitle.textColor = [ABTheme textPrimary];
    self.navTitle.textAlignment = NSTextAlignmentCenter;
    [self updateNavTitle];
    [navBar addSubview:self.navTitle];

    // 星期表头
    UIView *weekHeader = [[UIView alloc] init];
    [self.view addSubview:weekHeader];
    UILabel *last = nil;
    for (NSString *s in self.weekdays) {
        UILabel *l = [[UILabel alloc] init];
        l.text = s;
        l.font = [ABTheme fontCaption];
        l.textColor = [ABTheme textSecondary];
        l.textAlignment = NSTextAlignmentCenter;
        [weekHeader addSubview:l];
        [l mas_makeConstraints:^(MASConstraintMaker *make) {
            make.top.bottom.equalTo(weekHeader);
            if (last) make.left.equalTo(last.mas_right);
            else make.left.equalTo(weekHeader);
            make.width.equalTo(weekHeader).dividedBy(7);
        }];
        last = l;
    }

    // 日历网格
    UICollectionViewFlowLayout *layout = [[UICollectionViewFlowLayout alloc] init];
    layout.minimumInteritemSpacing = 0;
    layout.minimumLineSpacing = 0;
    CGFloat w = (UIScreen.mainScreen.bounds.size.width - 32) / 7.0;
    layout.itemSize = CGSizeMake(w, 62);

    self.grid = [[UICollectionView alloc] initWithFrame:CGRectZero collectionViewLayout:layout];
    self.grid.backgroundColor = [ABTheme bgPage];
    self.grid.dataSource = self;
    self.grid.delegate = self;
    self.grid.scrollEnabled = NO;
    [self.grid registerClass:ABCalendarDayCell.class forCellWithReuseIdentifier:@"day"];
    [self.view addSubview:self.grid];

    // 当日汇总
    UIView *summaryBar = [[UIView alloc] init];
    summaryBar.backgroundColor = [ABTheme bgCard];
    [self.view addSubview:summaryBar];

    self.daySummary = [[UILabel alloc] init];
    self.daySummary.font = [ABTheme fontH2];
    self.daySummary.textColor = [ABTheme textPrimary];
    [summaryBar addSubview:self.daySummary];

    // 当日流水
    self.dayTable = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
    self.dayTable.backgroundColor = [ABTheme bgCard];
    self.dayTable.dataSource = self;
    self.dayTable.delegate = self;
    self.dayTable.rowHeight = [ABTransactionCell height];
    self.dayTable.tableFooterView = [[UIView alloc] init];
    self.dayTable.separatorColor = [ABTheme line];
    [self.dayTable registerClass:ABTransactionCell.class forCellReuseIdentifier:@"txn"];
    [self.view addSubview:self.dayTable];

    // FAB
    self.fab = [UIButton buttonWithType:UIButtonTypeSystem];
    self.fab.backgroundColor = [ABTheme gold];
    self.fab.layer.cornerRadius = 28;
    [self.fab setImage:[UIImage systemImageNamed:@"plus"] forState:UIControlStateNormal];
    self.fab.tintColor = UIColor.whiteColor;
    [self.fab addTarget:self action:@selector(onRecord) forControlEvents:UIControlEventTouchUpInside];
    [self.view addSubview:self.fab];

    [navBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(self.view);
        make.bottom.equalTo(self.view.mas_safeAreaLayoutGuideTop).offset(44);
    }];
    [back mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(navBar).offset(8);
        make.bottom.equalTo(navBar).offset(-4);
        make.width.height.mas_equalTo(40);
    }];
    [self.navTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.centerX.equalTo(navBar);
        make.centerY.equalTo(back);
    }];
    [weekHeader mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(navBar.mas_bottom);
        make.left.equalTo(self.view).offset(16);
        make.right.equalTo(self.view).offset(-16);
        make.height.mas_equalTo(28);
    }];
    [self.grid mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(weekHeader.mas_bottom).offset(4);
        make.left.equalTo(self.view).offset(16);
        make.right.equalTo(self.view).offset(-16);
        make.height.mas_equalTo(310);
    }];
    [summaryBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.grid.mas_bottom).offset(8);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(48);
    }];
    [self.daySummary mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(summaryBar).offset(16);
        make.centerY.equalTo(summaryBar);
    }];
    [self.dayTable mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(summaryBar.mas_bottom);
        make.left.right.bottom.equalTo(self.view);
    }];
    [self.fab mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(self.view).offset(-20);
        make.bottom.equalTo(self.view.mas_safeAreaLayoutGuideBottom).offset(-20);
        make.width.height.mas_equalTo(56);
    }];
}

- (void)updateNavTitle {
    NSArray *p = [self.currentMonth componentsSeparatedByString:@"-"];
    self.navTitle.text = [NSString stringWithFormat:@"%ld年%ld月%ld日",
                          (long)[p[0] integerValue], (long)[p[1] integerValue], (long)self.selectedDay];
}

#pragma mark - 数据

- (void)loadMonthData {
    NSDictionary *range = [ABDateUtil periodRange:self.currentMonth unit:@"month"];
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    params[@"start"] = range[@"start"];
    params[@"end"] = range[@"end"];
    NSString *aid = [ABAccountStore shared].currentId;
    if (aid.length) params[@"accountId"] = aid;

    __weak typeof(self) weakSelf = self;
    // ⚠️ 不要自己传 size：列表接口上限 100，写 500 会被参数校验整条拒掉，
    //    症状是「日历上什么数据都没有」。走循环分页拉全量。
    [ABTransactionService getAllTransactions:params success:^(NSArray<ABTransaction *> *list) {
        __strong typeof(weakSelf) self = weakSelf;
        [self.allMonthTxns removeAllObjects];
        [self.dayExpenseMap removeAllObjects];
        for (ABTransaction *t in list) {
            [self.allMonthTxns addObject:t];
            if ([t.type isEqualToString:@"expense"]) {
                NSArray *dp = [t.recordDate componentsSeparatedByString:@"-"];
                NSString *dayKey = dp.count >= 3 ? dp[2] : @"";
                double cur = [self.dayExpenseMap[dayKey] doubleValue];
                self.dayExpenseMap[dayKey] = @(cur + [t.amount doubleValue]);
            }
        }
        [self.grid reloadData];
        [self loadDayTransactions];
    } failure:^(NSError *error) {
        NSLog(@"[calendar] 加载失败: %@", error.localizedDescription);
    }];
}

- (void)loadDayTransactions {
    NSArray *p = [self.currentMonth componentsSeparatedByString:@"-"];
    NSString *dateStr = [NSString stringWithFormat:@"%@-%@-%02ld", p[0], p[1], (long)self.selectedDay];

    NSMutableArray *filtered = [NSMutableArray array];
    double income = 0, expense = 0;
    for (ABTransaction *t in self.allMonthTxns) {
        if ([t.recordDate isEqualToString:dateStr]) {
            [filtered addObject:t];
            if ([t.type isEqualToString:@"income"]) income += [t.amount doubleValue];
            else expense += [t.amount doubleValue];
        }
    }
    self.dayTransactions = filtered;

    NSArray *mp = [dateStr componentsSeparatedByString:@"-"];
    NSString *summary = [NSString stringWithFormat:@"%ld月%ld日", (long)[mp[1] integerValue], (long)[mp[2] integerValue]];
    self.daySummary.text = summary;
    [self.dayTable reloadData];
    [self updateNavTitle];
}

#pragma mark - Actions

- (void)onBack { [self.navigationController popViewControllerAnimated:YES]; }

- (void)onRecord {
    ABRecordViewController *rec = [[ABRecordViewController alloc] initWithTransaction:nil];
    UINavigationController *nav = [[UINavigationController alloc] initWithRootViewController:rec];
    nav.modalPresentationStyle = UIModalPresentationPageSheet;
    rec.title = @"记一笔";
    rec.navigationItem.leftBarButtonItem = [[UIBarButtonItem alloc] initWithTitle:@"取消" style:UIBarButtonItemStylePlain target:self action:@selector(dismissModal)];
    __weak typeof(self) weakSelf = self;
    rec.onSaved = ^{
        __strong typeof(weakSelf) self = weakSelf;
        [self loadMonthData];
    };
    [self presentViewController:nav animated:YES completion:nil];
}

- (void)dismissModal { [self dismissViewControllerAnimated:YES completion:nil]; }

#pragma mark - UICollectionView

- (NSInteger)collectionView:(UICollectionView *)collectionView numberOfItemsInSection:(NSInteger)section {
    return self.days.count;
}

- (UICollectionViewCell *)collectionView:(UICollectionView *)collectionView cellForItemAtIndexPath:(NSIndexPath *)indexPath {
    ABCalendarDayCell *cell = [collectionView dequeueReusableCellWithReuseIdentifier:@"day" forIndexPath:indexPath];
    NSInteger day = [self.days[indexPath.item] integerValue];

    if (day == 0) {
        cell.dayLabel.text = @"";
        cell.amountLabel.text = @"";
        cell.contentView.backgroundColor = UIColor.clearColor;
        cell.contentView.layer.cornerRadius = 0;
        return cell;
    }

    cell.dayLabel.text = [NSString stringWithFormat:@"%ld", (long)day];
    NSString *dayKey = [NSString stringWithFormat:@"%02ld", (long)day];
    NSNumber *amt = self.dayExpenseMap[dayKey];
    cell.amountLabel.text = amt ? [ABFormat money:amt] : @"";

    BOOL isSelected = (day == self.selectedDay);

    if (isSelected) {
        cell.contentView.backgroundColor = [ABTheme gold];
        cell.dayLabel.textColor = UIColor.whiteColor;
        cell.amountLabel.textColor = UIColor.whiteColor;
    } else if (amt) {
        cell.contentView.backgroundColor = [ABTheme goldFill];
        cell.dayLabel.textColor = [ABTheme textPrimary];
        cell.amountLabel.textColor = [ABTheme textPrimary];
    } else {
        cell.contentView.backgroundColor = UIColor.clearColor;
        cell.dayLabel.textColor = [ABTheme textPrimary];
        cell.amountLabel.textColor = [ABTheme textSecondary];
    }
    cell.contentView.layer.cornerRadius = 10;

    return cell;
}

- (void)collectionView:(UICollectionView *)collectionView didSelectItemAtIndexPath:(NSIndexPath *)indexPath {
    NSInteger day = [self.days[indexPath.item] integerValue];
    if (day == 0) return;
    self.selectedDay = day;
    [self.grid reloadData];
    [self loadDayTransactions];
}

#pragma mark - UITableView

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return self.dayTransactions.count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    ABTransactionCell *cell = [tableView dequeueReusableCellWithIdentifier:@"txn" forIndexPath:indexPath];
    [cell configureWithTransaction:self.dayTransactions[indexPath.row]];
    return cell;
}

@end
