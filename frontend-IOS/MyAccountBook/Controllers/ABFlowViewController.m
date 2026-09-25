//
//  ABFlowViewController.m
//  MyAccountBook
//
//  流水页 —— 对齐 frontend/src/pages/flow/index.vue
//  结构：渐变头（结余）+ 分组列表（可展开）+ 筛选 + 排序 + 滑动删除。
//

#import "ABFlowViewController.h"
#import "ABTheme.h"
#import "ABAlert.h"
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

@interface ABFlowViewController () <UITableViewDataSource, UITableViewDelegate, UITextFieldDelegate>

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

// —— 搜索态（顶栏放大镜进入的整页搜索，对齐前端 searchVisible）——
// 与筛选面板里的 filterKeyword 是**两条独立路径**：
// 筛选关键词受当前时间/金额条件约束；搜索是「在全部流水里找」，
// 只带账本，不带任何其它筛选条件。
@property (nonatomic, strong) UIButton *searchBtn;
@property (nonatomic, strong) UIView *searchOverlay;      // 覆盖整页
@property (nonatomic, strong) UITextField *searchField;
@property (nonatomic, strong) UIView *searchSummary;
@property (nonatomic, strong) UILabel *searchCountLabel;
@property (nonatomic, strong) UILabel *searchBalanceLabel;
@property (nonatomic, strong) UILabel *searchIOLabel;
@property (nonatomic, strong) UITableView *searchTableView;
@property (nonatomic, strong) ABEmptyView *searchEmptyView;
@property (nonatomic, copy) NSString *searchCommitted;     // 已提交的关键词
@property (nonatomic, strong) NSArray<ABTransaction *> *searchResults;

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
    self.searchResults = @[];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(onOfflineFlushed)
                                                 name:@"ABOfflineFlushedNotification"
                                               object:nil];

    [self setupViews];
}

- (void)viewWillAppear:(BOOL)animated {
    [super viewWillAppear:animated];
    [self loadGroups];
    // 从编辑页返回时搜索态也要刷新 —— 否则改完金额，搜索结果还是旧的
    if (!self.searchOverlay.hidden && self.searchCommitted.length) {
        [self doSearch];
    }
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

    // header 右上角放大镜 → 进入整页搜索态
    self.searchBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.searchBtn setImage:[UIImage systemImageNamed:@"magnifyingglass"] forState:UIControlStateNormal];
    self.searchBtn.tintColor = [ABTheme heroInk];
    [self.searchBtn addTarget:self action:@selector(onOpenSearch) forControlEvents:UIControlEventTouchUpInside];
    [self.header addSubview:self.searchBtn];
    [self.searchBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(self.header).offset(-8);
        make.centerY.equalTo(title);
        make.width.height.mas_equalTo(44);
    }];

    [self setupSearchOverlay];

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

/// 整页搜索态（对齐前端 searchVisible）：搜索框 + 结果概览 + 平铺结果列表。
/// 用**覆盖层**而不是 push 新页面 —— 前端就是「页内展开，不跳页」。
- (void)setupSearchOverlay {
    self.searchOverlay = [[UIView alloc] init];
    self.searchOverlay.backgroundColor = [ABTheme bgPage];
    self.searchOverlay.hidden = YES;
    [self.view addSubview:self.searchOverlay];

    // —— 搜索条 ——
    UIView *bar = [[UIView alloc] init];
    bar.backgroundColor = [ABTheme bgCard];
    [self.searchOverlay addSubview:bar];

    UIView *barLine = [[UIView alloc] init];
    barLine.backgroundColor = [ABTheme line];
    [bar addSubview:barLine];

    UIImageView *icon = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"magnifyingglass"]];
    icon.tintColor = [ABTheme textSecondary];
    [bar addSubview:icon];

    self.searchField = [[UITextField alloc] init];
    self.searchField.placeholder = @"搜索备注、分类名或金额";
    self.searchField.font = [ABTheme fontBody];
    self.searchField.textColor = [ABTheme textPrimary];
    self.searchField.returnKeyType = UIReturnKeySearch;
    self.searchField.clearButtonMode = UITextFieldViewModeWhileEditing;
    self.searchField.delegate = self;
    [self.searchField addTarget:self action:@selector(onSearchInputChanged) forControlEvents:UIControlEventEditingChanged];
    [bar addSubview:self.searchField];

    UIButton *cancel = [UIButton buttonWithType:UIButtonTypeSystem];
    [cancel setTitle:@"取消" forState:UIControlStateNormal];
    [cancel setTitleColor:[ABTheme gold] forState:UIControlStateNormal];
    cancel.titleLabel.font = [ABTheme fontBody];
    [cancel addTarget:self action:@selector(onCloseSearch) forControlEvents:UIControlEventTouchUpInside];
    [bar addSubview:cancel];

    // —— 结果概览：笔数 + 结余 / 收支 ——
    self.searchSummary = [[UIView alloc] init];
    self.searchSummary.backgroundColor = [ABTheme bgCard];
    [self.searchOverlay addSubview:self.searchSummary];

    self.searchCountLabel = [[UILabel alloc] init];
    self.searchCountLabel.font = [ABTheme fontBody];
    self.searchCountLabel.textColor = [ABTheme textPrimary];
    [self.searchSummary addSubview:self.searchCountLabel];

    self.searchBalanceLabel = [[UILabel alloc] init];
    self.searchBalanceLabel.font = [ABTheme fontCaption];
    self.searchBalanceLabel.textAlignment = NSTextAlignmentRight;
    [self.searchSummary addSubview:self.searchBalanceLabel];

    self.searchIOLabel = [[UILabel alloc] init];
    self.searchIOLabel.font = [ABTheme fontCaption];
    self.searchIOLabel.textColor = [ABTheme textSecondary];
    self.searchIOLabel.textAlignment = NSTextAlignmentRight;
    [self.searchSummary addSubview:self.searchIOLabel];

    // —— 结果列表（平铺，不分组）——
    self.searchTableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
    self.searchTableView.backgroundColor = [ABTheme bgPage];
    self.searchTableView.separatorColor = [ABTheme line];
    self.searchTableView.dataSource = self;
    self.searchTableView.delegate = self;
    self.searchTableView.rowHeight = [ABTransactionCell height];
    self.searchTableView.tableFooterView = [[UIView alloc] init];
    self.searchTableView.keyboardDismissMode = UIScrollViewKeyboardDismissModeOnDrag;
    [self.searchTableView registerClass:ABTransactionCell.class forCellReuseIdentifier:@"searchTxn"];
    [self.searchOverlay addSubview:self.searchTableView];

    self.searchEmptyView = [[ABEmptyView alloc] initWithIcon:@"📭" text:@"搜索备注、分类名或金额"];
    [self.searchOverlay addSubview:self.searchEmptyView];

    // —— 约束 ——
    [self.searchOverlay mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(self.view);
    }];
    [bar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.view.mas_safeAreaLayoutGuideTop);
        make.left.right.equalTo(self.searchOverlay);
        make.height.mas_equalTo(52);
    }];
    [barLine mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.right.bottom.equalTo(bar);
        make.height.mas_equalTo(1);
    }];
    [icon mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(bar).offset(16);
        make.centerY.equalTo(bar);
        make.width.height.mas_equalTo(16);
    }];
    [cancel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(bar).offset(-16);
        make.centerY.equalTo(bar);
        make.height.mas_equalTo(44);
        make.width.mas_equalTo(48);
    }];
    [self.searchField mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(icon.mas_right).offset(8);
        make.right.equalTo(cancel.mas_left).offset(-8);
        make.centerY.equalTo(bar);
        make.height.mas_equalTo(40);
    }];

    // 概览的高度在 0 / 64 之间切换 —— 用改高度而不是 hidden，
    // 因为下面两个视图的 top 挂在它的 bottom 上（hidden 不改布局会留空洞）
    [self.searchSummary mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(bar.mas_bottom);
        make.left.right.equalTo(self.searchOverlay);
        make.height.mas_equalTo(0);
    }];
    [self.searchCountLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.searchSummary).offset(16);
        make.centerY.equalTo(self.searchSummary);
    }];
    [self.searchBalanceLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(self.searchSummary).offset(-16);
        make.top.equalTo(self.searchSummary).offset(16);
        make.left.greaterThanOrEqualTo(self.searchCountLabel.mas_right).offset(8);
    }];
    [self.searchIOLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(self.searchSummary).offset(-16);
        make.top.equalTo(self.searchBalanceLabel.mas_bottom).offset(4);
        make.left.greaterThanOrEqualTo(self.searchCountLabel.mas_right).offset(8);
    }];

    [self.searchTableView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.searchSummary.mas_bottom);
        make.left.right.bottom.equalTo(self.searchOverlay);
    }];
    [self.searchEmptyView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.searchSummary.mas_bottom).offset(80);
        make.left.right.bottom.equalTo(self.searchOverlay);
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
    //
    // ⚠️ 这里的 size **不能自己定**：列表接口上限是 100，传 500 会被后端参数校验直接拒掉
    //    （不是截断，是整条请求失败，返回「输入有误，请检查后重试」）。
    //    症状是「点开分组永远空白，且不细看日志根本不知道」——
    //    所以统一走 getAllTransactions: 循环分页拉全量。
    NSDictionary *range = [ABDateUtil periodRange:g.key unit:g.unit];
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    params[@"start"] = range[@"start"];
    params[@"end"] = range[@"end"];
    if (self.filterType.length) params[@"type"] = self.filterType;
    if (self.filterKeyword.length) params[@"keyword"] = self.filterKeyword;
    NSString *aid = [ABAccountStore shared].currentId;
    if (aid.length) params[@"accountId"] = aid;

    __weak typeof(self) weakSelf = self;
    [ABTransactionService getAllTransactions:params success:^(NSArray<ABTransaction *> *list) {
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
    [ABAlert prepareSheet:sheet anchor:self.filterButton in:self];
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
    [ABAlert prepareSheet:sheet anchor:self.sortButton in:self];
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
    [ABAlert prepareSheet:sheet anchor:self.view in:self];
    [self presentViewController:sheet animated:YES completion:nil];
}

#pragma mark - 搜索态

- (void)onOpenSearch {
    self.searchOverlay.hidden = NO;
    [self.searchField becomeFirstResponder];
}

- (void)onCloseSearch {
    [self.searchField resignFirstResponder];
    self.searchOverlay.hidden = YES;
    self.searchField.text = @"";
    self.searchCommitted = @"";
    self.searchResults = @[];
    [self reloadSearchUI];
}

- (void)onSearchInputChanged {
    // 清空输入时同时清掉结果，避免「框里没字下面还有一堆」
    if (!self.searchField.text.length && self.searchCommitted.length) {
        self.searchCommitted = @"";
        self.searchResults = @[];
        [self reloadSearchUI];
    }
}

- (BOOL)textFieldShouldReturn:(UITextField *)textField {
    [self doSearch];
    return YES;
}

- (void)doSearch {
    NSString *kw = [self.searchField.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
    if (!kw.length) return;
    self.searchCommitted = kw;
    [self.searchField resignFirstResponder];

    // ⚠️ 搜索**不带任何其它筛选条件**（除了账本）—— 它是「在全部流水里找」，
    //    带上时间范围 / 金额区间会让用户困惑「我明明有这笔却搜不到」。
    //    账本必须带：那是数据隔离的边界，不该跨账本搜。
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    params[@"keyword"] = kw;
    params[@"size"] = @100;
    NSString *aid = [ABAccountStore shared].currentId;
    if (aid.length) params[@"accountId"] = aid;

    __weak typeof(self) weakSelf = self;
    [ABTransactionService getTransactions:params success:^(NSArray<ABTransaction *> *list, NSInteger total, NSInteger page, NSInteger size) {
        __strong typeof(weakSelf) self = weakSelf;
        self.searchResults = list ?: @[];
        [self reloadSearchUI];
    } failure:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        NSLog(@"[flow] 搜索失败: %@", error.localizedDescription);
        self.searchResults = @[];
        [self reloadSearchUI];
    }];
}

- (void)reloadSearchUI {
    BOOL committed = self.searchCommitted.length > 0;

    // 概览高度 0 / 64 切换 —— 下面的列表 top 挂在它的 bottom 上，不能用 hidden
    [self.searchSummary mas_updateConstraints:^(MASConstraintMaker *make) {
        make.height.mas_equalTo(committed ? 64 : 0);
    }];

    if (committed) {
        double income = 0, expense = 0;
        for (ABTransaction *t in self.searchResults) {
            if ([t.type isEqualToString:@"income"]) income += [t.amount doubleValue];
            else expense += [t.amount doubleValue];
        }
        double balance = income - expense;
        self.searchCountLabel.text = [NSString stringWithFormat:@"流水 %lu 笔",
                                      (unsigned long)self.searchResults.count];
        // 结余为负用支出色（青绿）—— 与全站红涨绿跌一致
        self.searchBalanceLabel.text = [NSString stringWithFormat:@"结余 %@", [ABFormat money:@(balance)]];
        self.searchBalanceLabel.textColor = balance < 0 ? [ABTheme expense] : [ABTheme textPrimary];
        self.searchIOLabel.text = [NSString stringWithFormat:@"收入 %@   支出 %@",
                                   [ABFormat money:@(income)], [ABFormat money:@(expense)]];
    }

    [self.searchTableView reloadData];
    BOOL empty = (self.searchResults.count == 0);
    self.searchTableView.hidden = empty;
    self.searchEmptyView.hidden = !empty;
    // 没搜过 → 提示怎么用；搜过没结果 → 提示没找到。两者不是一回事
    [self.searchEmptyView setText:(committed ? @"没有找到相关流水" : @"搜索备注、分类名或金额")];
}

/// 搜索结果行的副标题：账本名 · 备注 · 日期 时刻（结果跨多天，日期必须带上）
- (NSString *)searchMetaFor:(ABTransaction *)t {
    NSMutableArray<NSString *> *parts = [NSMutableArray array];
    if (t.account.name.length) [parts addObject:t.account.name];
    if (t.note.length) [parts addObject:t.note];
    NSString *d = [t.recordDate stringByReplacingOccurrencesOfString:@"-" withString:@"."];
    NSString *time = (t.recordTime.length >= 5) ? [t.recordTime substringToIndex:5] : @"";
    if (d.length) [parts addObject:(time.length ? [NSString stringWithFormat:@"%@ %@", d, time] : d)];
    return [parts componentsJoinedByString:@" · "];
}

#pragma mark - UITableView

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView {
    if (tableView == self.searchTableView) return 1;   // 搜索结果平铺，不分组
    return self.groups.count;
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    if (tableView == self.searchTableView) return (NSInteger)self.searchResults.count;

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
    if (tableView == self.searchTableView) {
        ABTransactionCell *cell = [tableView dequeueReusableCellWithIdentifier:@"searchTxn" forIndexPath:indexPath];
        if (indexPath.row < (NSInteger)self.searchResults.count) {
            ABTransaction *t = self.searchResults[indexPath.row];
            [cell configureWithTransaction:t metaOverride:[self searchMetaFor:t]];
        }
        return cell;
    }

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
    if (tableView == self.searchTableView) return [ABTransactionCell height];
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

    if (tableView == self.searchTableView) {
        if (indexPath.row >= (NSInteger)self.searchResults.count) return;
        // 点结果 → 编辑该笔（对齐前端 editTransaction）
        ABRecordViewController *vc = [[ABRecordViewController alloc] initWithTransaction:self.searchResults[indexPath.row]];
        [self.navigationController pushViewController:vc animated:YES];
        return;
    }

    if (indexPath.row == 0) {
        [self toggleGroupAtIndex:indexPath.section];
    }
}

// 滑动删除
- (UISwipeActionsConfiguration *)tableView:(UITableView *)tableView trailingSwipeActionsConfigurationForRowAtIndexPath:(NSIndexPath *)indexPath {
    ABTransaction *target = nil;

    if (tableView == self.searchTableView) {
        if (indexPath.row >= (NSInteger)self.searchResults.count) return nil;
        target = self.searchResults[indexPath.row];
    } else {
        if (indexPath.row == 0) return nil;
        ABSummaryItem *g = self.groups[indexPath.section];
        NSArray<ABDayGroup *> *days = self.details[g.key];
        NSInteger idx = 1;
        for (ABDayGroup *d in days) {
            idx++;
            for (NSInteger i = 0; i < d.items.count; i++) {
                if (indexPath.row == idx) { target = d.items[i]; break; }
                idx++;
            }
            if (target) break;
        }
    }
    if (!target) return nil;

    BOOL fromSearch = (tableView == self.searchTableView);
    __weak typeof(self) weakSelf = self;
    UIContextualAction *del = [UIContextualAction contextualActionWithStyle:UIContextualActionStyleDestructive title:@"删除" handler:^(UIContextualAction *action, UIView *sourceView, void (^completionHandler)(BOOL)) {
        __strong typeof(weakSelf) strongSelf = weakSelf;
        [ABTransactionService deleteTransaction:target.txnId success:^(NSDictionary *dict) {
            // 搜索态删完要**重搜**（结果集变了）；主列表重载即可
            if (fromSearch) [strongSelf doSearch];
            else [strongSelf loadGroups];
        } failure:^(NSError *error) {
            NSLog(@"[flow] 删除失败: %@", error.localizedDescription);
        }];
        completionHandler(YES);
    }];
    return [UISwipeActionsConfiguration configurationWithActions:@[del]];
}

@end
