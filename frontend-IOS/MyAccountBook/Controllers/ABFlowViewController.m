//
//  ABFlowViewController.m
//  MyAccountBook
//
//  流水页 —— 对齐 frontend/src/pages/flow/index.vue
//  结构：渐变头（结余）+ 分组列表（可展开）+ 筛选 + 排序 + 滑动删除。
//

#import "ABFlowViewController.h"
#import "ABTheme.h"
#import "ABTransactionService.h"
#import "ABTransactionCell.h"
#import "ABEmptyView.h"
#import "ABDateUtil.h"
#import "ABFormat.h"
#import "ABAccountStore.h"
#import "ABDayGroup.h"
#import "ABRecordViewController.h"
#import <Masonry/Masonry.h>

// 分组粒度
typedef NS_ENUM(NSInteger, ABFlowUnit) {
    ABFlowUnitYear,
    ABFlowUnitQuarter,
    ABFlowUnitMonth,
    ABFlowUnitWeek,
    ABFlowUnitDay,
};

@interface ABFlowGroupCell : UITableViewCell
@property (nonatomic, strong) UILabel *titleLabel;
@property (nonatomic, strong) UILabel *subLabel;
@property (nonatomic, strong) UILabel *ioLabel;
@property (nonatomic, strong) UIImageView *arrowView;
- (void)configureWithItem:(ABSummaryItem *)item expanded:(BOOL)expanded;
@end

@implementation ABFlowGroupCell

- (instancetype)initWithStyle:(UITableViewCellStyle)style reuseIdentifier:(NSString *)reuseIdentifier {
    self = [super initWithStyle:style reuseIdentifier:reuseIdentifier];
    if (self) {
        self.selectionStyle = UITableViewCellSelectionStyleNone;
        self.backgroundColor = [ABTheme bgCard];

        _titleLabel = [[UILabel alloc] init];
        _titleLabel.font = [ABTheme fontH2];
        _titleLabel.textColor = [ABTheme textPrimary];
        [self.contentView addSubview:_titleLabel];

        _subLabel = [[UILabel alloc] init];
        _subLabel.font = [ABTheme fontCaption];
        _subLabel.textColor = [ABTheme textSecondary];
        [self.contentView addSubview:_subLabel];

        _ioLabel = [[UILabel alloc] init];
        _ioLabel.font = [ABTheme fontCaption];
        _ioLabel.textColor = [ABTheme textSecondary];
        _ioLabel.textAlignment = NSTextAlignmentRight;
        [self.contentView addSubview:_ioLabel];

        _arrowView = [[UIImageView alloc] init];
        _arrowView.image = [UIImage systemImageNamed:@"chevron.right"];
        _arrowView.tintColor = [ABTheme textTertiary];
        _arrowView.contentMode = UIViewContentModeScaleAspectFit;
        [self.contentView addSubview:_arrowView];

        [_titleLabel mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(self.contentView).offset(16);
            make.top.equalTo(self.contentView).offset(12);
        }];
        [_subLabel mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(self.titleLabel.mas_right).offset(8);
            make.bottom.equalTo(self.titleLabel);
        }];
        [_arrowView mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(self.subLabel.mas_right).offset(6);
            make.centerY.equalTo(self.titleLabel);
            make.width.height.mas_equalTo(12);
        }];
        [_ioLabel mas_makeConstraints:^(MASConstraintMaker *make) {
            make.right.equalTo(self.contentView).offset(-16);
            make.top.equalTo(self.contentView).offset(12);
            make.left.greaterThanOrEqualTo(self.arrowView.mas_right).offset(8);
        }];
    }
    return self;
}

- (void)configureWithItem:(ABSummaryItem *)item expanded:(BOOL)expanded {
    if (item.isCategoryGroup) {
        self.titleLabel.text = [NSString stringWithFormat:@"%@ %@", item.icon.length ? item.icon : @"", item.name ?: @"未分类"];
        self.subLabel.text = [NSString stringWithFormat:@"%ld笔", (long)item.count];
    } else {
        NSDictionary *label = [ABDateUtil periodLabel:item.key unit:item.unit];
        self.titleLabel.text = label[@"title"];
        self.subLabel.text = label[@"sub"];
    }

    self.ioLabel.text = [NSString stringWithFormat:@"收 %@  支 %@",
                         [ABFormat money:item.income], [ABFormat money:item.expense]];
    self.arrowView.transform = expanded ? CGAffineTransformMakeRotation(M_PI_2) : CGAffineTransformIdentity;
}

@end

@interface ABFlowViewController () <UITableViewDataSource, UITableViewDelegate>

@property (nonatomic, strong) UIView *header;
@property (nonatomic, strong) CAGradientLayer *headerGradient;
@property (nonatomic, strong) UILabel *balanceLabel;
@property (nonatomic, strong) UILabel *ioLabel;
@property (nonatomic, strong) UIButton *filterButton;
@property (nonatomic, strong) UIButton *sortButton;
@property (nonatomic, strong) UITableView *tableView;
@property (nonatomic, strong) ABEmptyView *emptyView;

@property (nonatomic, strong) NSMutableArray<ABSummaryItem *> *groups;
@property (nonatomic, strong) NSMutableSet<NSString *> *expandedKeys;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSArray<ABDayGroup *> *> *details;

// 筛选状态
@property (nonatomic, copy) NSString *filterStart;
@property (nonatomic, copy) NSString *filterEnd;
@property (nonatomic, copy) NSString *filterType;      // income / expense / nil
@property (nonatomic, copy) NSString *filterKeyword;
@property (nonatomic, copy) NSString *order;           // time / amountDesc / amountAsc
@property (nonatomic, assign) ABFlowUnit unit;

@end

@implementation ABFlowViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    self.groups = [NSMutableArray array];
    self.expandedKeys = [NSMutableSet set];
    self.details = [NSMutableDictionary dictionary];
    self.order = @"time";
    self.unit = ABFlowUnitMonth;

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(onOfflineFlushed)
                                                 name:@"ABOfflineFlushedNotification"
                                               object:nil];

    [self setupViews];
}

- (void)viewWillAppear:(BOOL)animated {
    [super viewWillAppear:animated];
    [self loadGroups];
}

- (void)onOfflineFlushed {
    [self loadGroups];
}

- (void)dealloc {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)setupViews {
    // 渐变头
    self.header = [[UIView alloc] init];
    CAGradientLayer *gradient = [CAGradientLayer layer];
    gradient.colors = @[(__bridge id)[ABTheme goldSoft].CGColor, (__bridge id)ABColorHex(0xFBF0E4).CGColor];
    gradient.startPoint = CGPointMake(0.5, 0);
    gradient.endPoint = CGPointMake(0.5, 1);
    [self.header.layer addSublayer:gradient];
    self.headerGradient = gradient;
    [self.view addSubview:self.header];

    UIButton *backBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    [backBtn setImage:[UIImage systemImageNamed:@"chevron.left"] forState:UIControlStateNormal];
    backBtn.tintColor = [ABTheme heroInk];
    [backBtn addTarget:self action:@selector(onBack) forControlEvents:UIControlEventTouchUpInside];
    [self.header addSubview:backBtn];

    UILabel *title = [[UILabel alloc] init];
    title.text = @"全部流水";
    title.font = [ABTheme fontH2];
    title.textColor = [ABTheme heroInk];
    [self.header addSubview:title];

    self.balanceLabel = [[UILabel alloc] init];
    self.balanceLabel.font = [ABTheme fontDisplay];
    self.balanceLabel.textColor = [ABTheme heroInk];
    self.balanceLabel.text = @"0.00";
    [self.header addSubview:self.balanceLabel];

    UILabel *balanceUnit = [[UILabel alloc] init];
    balanceUnit.text = @"结余";
    balanceUnit.font = [ABTheme fontCaption];
    balanceUnit.textColor = [ABTheme heroInk];
    [self.header addSubview:balanceUnit];

    self.ioLabel = [[UILabel alloc] init];
    self.ioLabel.font = [ABTheme fontCaption];
    self.ioLabel.textColor = [ABTheme heroInk];
    [self.header addSubview:self.ioLabel];

    // 工具栏
    UIView *toolbar = [[UIView alloc] init];
    toolbar.backgroundColor = [ABTheme bgPage];
    [self.view addSubview:toolbar];

    self.filterButton = [self makeToolButton:@"筛选" action:@selector(onFilter)];
    self.sortButton = [self makeToolButton:@"排序" action:@selector(onSort)];
    UIButton *unitButton = [self makeToolButton:@"粒度" action:@selector(onUnit)];
    [toolbar addSubview:self.filterButton];
    [toolbar addSubview:self.sortButton];
    [toolbar addSubview:unitButton];

    // 列表
    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
    self.tableView.backgroundColor = [ABTheme bgPage];
    self.tableView.separatorColor = [ABTheme line];
    self.tableView.dataSource = self;
    self.tableView.delegate = self;
    self.tableView.tableFooterView = [[UIView alloc] init];
    [self.tableView registerClass:ABFlowGroupCell.class forCellReuseIdentifier:@"group"];
    [self.tableView registerClass:ABTransactionCell.class forCellReuseIdentifier:@"txn"];
    [self.view addSubview:self.tableView];

    self.emptyView = [[ABEmptyView alloc] initWithIcon:@"📭" text:@"还没有流水"];
    self.emptyView.hidden = YES;
    [self.view addSubview:self.emptyView];

    [self.header mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(self.view);
        make.height.mas_equalTo(180);
    }];
    [backBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.header).offset(8);
        make.centerY.equalTo(title);
        make.width.height.mas_equalTo(44);
    }];
    [title mas_makeConstraints:^(MASConstraintMaker *make) {
        make.centerX.equalTo(self.header);
        make.top.equalTo(self.view.mas_safeAreaLayoutGuideTop).offset(8);
    }];
    [self.balanceLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.header).offset(24);
        make.top.equalTo(title.mas_bottom).offset(16);
    }];
    [balanceUnit mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.balanceLabel.mas_right).offset(6);
        make.bottom.equalTo(self.balanceLabel).offset(-4);
    }];
    [self.ioLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.header).offset(24);
        make.top.equalTo(self.balanceLabel.mas_bottom).offset(6);
    }];

    [toolbar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.header.mas_bottom);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(44);
    }];
    [self.filterButton mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(toolbar).offset(16);
        make.centerY.equalTo(toolbar);
    }];
    [self.sortButton mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.filterButton.mas_right).offset(16);
        make.centerY.equalTo(toolbar);
    }];
    [unitButton mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.sortButton.mas_right).offset(16);
        make.centerY.equalTo(toolbar);
    }];

    [self.tableView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(toolbar.mas_bottom);
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.view.mas_safeAreaLayoutGuideBottom);
    }];
    [self.emptyView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.centerX.equalTo(self.view);
        make.centerY.equalTo(self.view).offset(-40);
    }];
}

- (void)viewDidLayoutSubviews {
    [super viewDidLayoutSubviews];
    self.headerGradient.frame = self.header.bounds;
}

- (UIButton *)makeToolButton:(NSString *)title action:(SEL)action {
    UIButton *btn = [UIButton buttonWithType:UIButtonTypeSystem];
    [btn setTitle:title forState:UIControlStateNormal];
    [btn setTitleColor:[ABTheme textPrimary] forState:UIControlStateNormal];
    btn.titleLabel.font = [ABTheme fontBodySm];
    [btn addTarget:self action:action forControlEvents:UIControlEventTouchUpInside];
    return btn;
}

#pragma mark - 数据

- (NSString *)unitString {
    switch (self.unit) {
        case ABFlowUnitYear: return @"year";
        case ABFlowUnitQuarter: return @"quarter";
        case ABFlowUnitMonth: return @"month";
        case ABFlowUnitWeek: return @"week";
        case ABFlowUnitDay: return @"day";
    }
    return @"month";
}

- (NSDictionary *)baseParams {
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    params[@"groupBy"] = @"time";
    params[@"unit"] = [self unitString];
    if (self.filterStart.length) params[@"start"] = self.filterStart;
    if (self.filterEnd.length) params[@"end"] = self.filterEnd;
    if (self.filterType.length) params[@"type"] = self.filterType;
    if (self.filterKeyword.length) params[@"keyword"] = self.filterKeyword;
    NSString *aid = [ABAccountStore shared].currentId;
    if (aid.length) params[@"accountId"] = aid;
    return params;
}

- (void)refresh {
    [self loadGroups];
}

- (void)loadGroups {
    __weak typeof(self) weakSelf = self;
    [ABTransactionService getTransactionSummary:[self baseParams] success:^(NSArray<ABSummaryItem *> *list) {
        __strong typeof(weakSelf) self = weakSelf;
        [self.groups removeAllObjects];
        [self.groups addObjectsFromArray:list];
        [self.expandedKeys removeAllObjects];
        [self.details removeAllObjects];
        [self updateHeader];
        [self.tableView reloadData];
        self.emptyView.hidden = self.groups.count > 0;
        self.tableView.hidden = self.groups.count == 0;

        // 默认展开第一组
        if (self.groups.count) {
            [self toggleGroupAtIndex:0];
        }
    } failure:^(NSError *error) {
        NSLog(@"[flow] 加载失败: %@", error.localizedDescription);
    }];
}

- (void)updateHeader {
    double income = 0, expense = 0;
    for (ABSummaryItem *g in self.groups) {
        income += [g.income doubleValue];
        expense += [g.expense doubleValue];
    }
    self.balanceLabel.text = [ABFormat money:@(income - expense)];
    self.ioLabel.text = [NSString stringWithFormat:@"收入 %@   |   支出 %@",
                         [ABFormat money:@(income)], [ABFormat money:@(expense)]];
}

- (void)toggleGroupAtIndex:(NSInteger)index {
    ABSummaryItem *g = self.groups[index];
    if ([self.expandedKeys containsObject:g.key]) {
        [self.expandedKeys removeObject:g.key];
        [self.tableView reloadData];
        return;
    }
    [self.expandedKeys addObject:g.key];

    if (self.details[g.key]) {
        [self.tableView reloadData];
        return;
    }

    // 拉取该组明细
    NSDictionary *range = [ABDateUtil periodRange:g.key unit:g.unit];
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    params[@"start"] = range[@"start"];
    params[@"end"] = range[@"end"];
    params[@"size"] = @(500);
    if (self.filterType.length) params[@"type"] = self.filterType;
    if (self.filterKeyword.length) params[@"keyword"] = self.filterKeyword;
    NSString *aid = [ABAccountStore shared].currentId;
    if (aid.length) params[@"accountId"] = aid;

    __weak typeof(self) weakSelf = self;
    [ABTransactionService getTransactions:params success:^(NSArray<ABTransaction *> *list, NSInteger total, NSInteger page, NSInteger size) {
        __strong typeof(weakSelf) self = weakSelf;
        self.details[g.key] = [self groupByDay:list];
        [self.tableView reloadData];
    } failure:^(NSError *error) {
        NSLog(@"[flow] 明细加载失败: %@", error.localizedDescription);
    }];
}

- (NSArray<ABDayGroup *> *)groupByDay:(NSArray<ABTransaction *> *)list {
    NSMutableArray<ABDayGroup *> *out = [NSMutableArray array];
    NSMutableDictionary<NSString *, NSMutableArray *> *map = [NSMutableDictionary dictionary];
    NSMutableArray<NSString *> *order = [NSMutableArray array];

    for (ABTransaction *t in list) {
        NSString *date = t.recordDate;
        if (!map[date]) {
            map[date] = [NSMutableArray array];
            [order addObject:date];
        }
        [map[date] addObject:t];
    }

    for (NSString *date in order) {
        ABDayGroup *dg = [[ABDayGroup alloc] init];
        dg.date = date;
        dg.items = map[date];
        [out addObject:dg];
    }
    return out;
}

#pragma mark - Actions

- (void)onBack {
    [self.navigationController popViewControllerAnimated:YES];
}

- (void)onFilter {
    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:@"筛选" message:nil preferredStyle:UIAlertControllerStyleActionSheet];
    __weak typeof(self) weakSelf = self;
    [sheet addAction:[UIAlertAction actionWithTitle:@"全部时间" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        self.filterStart = nil; self.filterEnd = nil;
        [self loadGroups];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"本月" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        NSDictionary *r = [ABDateUtil periodRange:[ABDateUtil currentMonth] unit:@"month"];
        self.filterStart = r[@"start"]; self.filterEnd = r[@"end"];
        [self loadGroups];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"本年" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        NSDictionary *r = [ABDateUtil periodRange:[ABDateUtil currentYear] unit:@"year"];
        self.filterStart = r[@"start"]; self.filterEnd = r[@"end"];
        [self loadGroups];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"只看支出" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        self.filterType = @"expense";
        [self loadGroups];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"只看收入" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        self.filterType = @"income";
        [self loadGroups];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"清除筛选" style:UIAlertActionStyleDestructive handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        self.filterStart = nil; self.filterEnd = nil; self.filterType = nil; self.filterKeyword = nil;
        [self loadGroups];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    sheet.popoverPresentationController.sourceView = self.filterButton;
    sheet.popoverPresentationController.sourceRect = self.filterButton.bounds;
    [self presentViewController:sheet animated:YES completion:nil];
}

- (void)onSort {
    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:@"排序" message:nil preferredStyle:UIAlertControllerStyleActionSheet];
    __weak typeof(self) weakSelf = self;
    NSArray *options = @[@"按时间（默认）", @"按金额从高到低", @"按金额从低到高"];
    for (NSInteger i = 0; i < options.count; i++) {
        [sheet addAction:[UIAlertAction actionWithTitle:options[i] style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
            __strong typeof(weakSelf) self = weakSelf;
            self.order = i == 0 ? @"time" : (i == 1 ? @"amountDesc" : @"amountAsc");
            [self loadGroups];
        }]];
    }
    [sheet addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    sheet.popoverPresentationController.sourceView = self.sortButton;
    sheet.popoverPresentationController.sourceRect = self.sortButton.bounds;
    [self presentViewController:sheet animated:YES completion:nil];
}

- (void)onUnit {
    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:@"分组粒度" message:nil preferredStyle:UIAlertControllerStyleActionSheet];
    __weak typeof(self) weakSelf = self;
    NSArray *options = @[@"年", @"季", @"月", @"周", @"天"];
    for (NSInteger i = 0; i < options.count; i++) {
        [sheet addAction:[UIAlertAction actionWithTitle:options[i] style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
            __strong typeof(weakSelf) self = weakSelf;
            self.unit = (ABFlowUnit)i;
            [self loadGroups];
        }]];
    }
    [sheet addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    sheet.popoverPresentationController.sourceView = self.view;
    sheet.popoverPresentationController.sourceRect = self.view.bounds;
    [self presentViewController:sheet animated:YES completion:nil];
}

#pragma mark - UITableView

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView {
    return self.groups.count;
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    ABSummaryItem *g = self.groups[section];
    if (![self.expandedKeys containsObject:g.key]) return 1;

    NSArray<ABDayGroup *> *days = self.details[g.key];
    if (!days) return 1; // 加载中

    NSInteger count = 1; // 组头
    for (ABDayGroup *d in days) {
        count += 1;              // 日期头
        count += d.items.count;  // 明细
    }
    return count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    ABSummaryItem *g = self.groups[indexPath.section];
    BOOL expanded = [self.expandedKeys containsObject:g.key];

    if (indexPath.row == 0) {
        ABFlowGroupCell *cell = [tableView dequeueReusableCellWithIdentifier:@"group" forIndexPath:indexPath];
        [cell configureWithItem:g expanded:expanded];
        return cell;
    }

    NSArray<ABDayGroup *> *days = self.details[g.key];
    NSInteger idx = 1;
    for (ABDayGroup *d in days) {
        if (indexPath.row == idx) {
            // 日期头
            UITableViewCell *cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleDefault reuseIdentifier:nil];
            cell.selectionStyle = UITableViewCellSelectionStyleNone;
            cell.textLabel.text = [ABDateUtil dayHeader:d.date];
            cell.textLabel.font = [ABTheme fontCaption];
            cell.textLabel.textColor = [ABTheme textSecondary];
            cell.backgroundColor = [ABTheme bgInset];
            return cell;
        }
        idx++;
        for (NSInteger i = 0; i < d.items.count; i++) {
            if (indexPath.row == idx) {
                ABTransactionCell *cell = [tableView dequeueReusableCellWithIdentifier:@"txn" forIndexPath:indexPath];
                [cell configureWithTransaction:d.items[i]];
                return cell;
            }
            idx++;
        }
    }

    return [[UITableViewCell alloc] init];
}

- (CGFloat)tableView:(UITableView *)tableView heightForRowAtIndexPath:(NSIndexPath *)indexPath {
    if (indexPath.row == 0) return 60;
    ABSummaryItem *g = self.groups[indexPath.section];
    NSArray<ABDayGroup *> *days = self.details[g.key];
    NSInteger idx = 1;
    for (ABDayGroup *d in days) {
        if (indexPath.row == idx) return 32;
        idx++;
        for (NSInteger i = 0; i < d.items.count; i++) {
            if (indexPath.row == idx) return [ABTransactionCell height];
            idx++;
        }
    }
    return 44;
}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
    [tableView deselectRowAtIndexPath:indexPath animated:YES];
    if (indexPath.row == 0) {
        [self toggleGroupAtIndex:indexPath.section];
    }
}

// 滑动删除
- (UISwipeActionsConfiguration *)tableView:(UITableView *)tableView trailingSwipeActionsConfigurationForRowAtIndexPath:(NSIndexPath *)indexPath {
    if (indexPath.row == 0) return nil;

    ABSummaryItem *g = self.groups[indexPath.section];
    NSArray<ABDayGroup *> *days = self.details[g.key];
    NSInteger idx = 1;
    ABTransaction *target = nil;
    for (ABDayGroup *d in days) {
        idx++;
        for (NSInteger i = 0; i < d.items.count; i++) {
            if (indexPath.row == idx) { target = d.items[i]; break; }
            idx++;
        }
        if (target) break;
    }
    if (!target) return nil;

    __weak typeof(self) weakSelf = self;
    UIContextualAction *del = [UIContextualAction contextualActionWithStyle:UIContextualActionStyleDestructive title:@"删除" handler:^(UIContextualAction *action, UIView *sourceView, void (^completionHandler)(BOOL)) {
        __strong typeof(weakSelf) self = weakSelf;
        [ABTransactionService deleteTransaction:target.txnId success:^(NSDictionary *dict) {
            [self loadGroups];
        } failure:^(NSError *error) {
            NSLog(@"[flow] 删除失败: %@", error.localizedDescription);
        }];
        completionHandler(YES);
    }];
    return [UISwipeActionsConfiguration configurationWithActions:@[del]];
}

@end
