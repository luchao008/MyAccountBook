//
//  ABCategoryViewController.m
//  MyAccountBook
//
//  分类管理页 —— 对齐 frontend/src/pages/category/index.vue
//
//  ────────────────────────────────────────────────────────────────────────
//  三种模式在**同一页内切换**，不做弹层（前端如此，之前 iOS 用 ActionSheet
//  是错的：模式会改变顶栏、底栏、每行尾部控件三处形状，弹层表达不了）。
//
//    · 普通态  顶栏[返回 / 标题 / 搜索]  底栏[排序 / 批量操作 / 新建分类]
//    · 批量态  顶栏[取消 / 选择X分类 / 全选]  底栏[删除 / 隐藏 / 恢复显示]
//    · 排序态  顶栏[取消 / X分类排序 / 空]  底栏[完成]
//
//  对齐前端的九条排序设计决定（D1–D9，原文见 index.vue 顶部注释）。
//  其中三条**由系统提供**，不需要自己实现：
//    · D3 拖到列表边缘自动滚动   → UITableView 原生行为
//    · D6 拖动中不重排、用提示线 → 系统就是"松手即落位"的模型
//    · D1 按住把手立刻进入拖动   → ⚠️ **系统是长按 (~0.5s) 才进入**，这点与前端不同。
//      不自己造手势是因为系统拖拽与重排动画、自动滚动、无障碍都已打通，
//      为了 0.3 秒的手感差距重写一套不划算。差异记在此处，不假装已对齐。
//  ────────────────────────────────────────────────────────────────────────
//

#import "ABCategoryViewController.h"
#import "ABTheme.h"
#import "ABCategoryService.h"
#import "ABAccountStore.h"
#import "ABCategoryNewViewController.h"
#import "ABIconView.h"
#import "ABEmptyView.h"
#import <Masonry/Masonry.h>

typedef NS_ENUM(NSInteger, ABCategoryMode) {
    ABCategoryModeNormal = 0,
    ABCategoryModeBatch,
    ABCategoryModeSort,
};

/// 排序态的层级 key：一级层用固定串，二级层用它父的 id（对齐前端 levelKey()）
static NSString * const kRootLevelKey = @"__root__";

static const CGFloat kNavBarHeight = 44.0;
static const CGFloat kSearchBarHeight = 44.0;
static const CGFloat kSortHintHeight = 32.0;
static const CGFloat kBottomBarHeight = 64.0;
static const CGFloat kRowHeight = 56.0;

@interface ABCategoryViewController () <UITableViewDataSource, UITableViewDelegate, UITextFieldDelegate>

// —— 顶栏 ——
@property (nonatomic, strong) UIView *navBar;
@property (nonatomic, strong) UILabel *navTitle;
@property (nonatomic, strong) UIButton *backBtn;
@property (nonatomic, strong) UIButton *searchBtn;
@property (nonatomic, strong) UIButton *cancelBtn;      // 批量 / 排序态的「取消」
@property (nonatomic, strong) UIButton *selectAllBtn;   // 批量态的「全选 / 取消全选」

// —— 搜索条（仅普通态可见）——
@property (nonatomic, strong) UIView *searchBar;
@property (nonatomic, strong) UITextField *searchField;

// —— 排序态说明条 ——
@property (nonatomic, strong) UIView *sortHint;

// —— 列表 ——
@property (nonatomic, strong) UITableView *tableView;
@property (nonatomic, strong) ABEmptyView *emptyView;

// —— 底栏三态 ——
@property (nonatomic, strong) UIView *bottomBar;
@property (nonatomic, strong) UIView *normalBar;
@property (nonatomic, strong) UIView *batchBar;
@property (nonatomic, strong) UIView *sortBar;
@property (nonatomic, strong) UIButton *batchDeleteBtn;
@property (nonatomic, strong) UIButton *batchHideBtn;
@property (nonatomic, strong) UIButton *batchUnhideBtn;

// —— 状态 ——
@property (nonatomic, assign) ABCategoryMode mode;
@property (nonatomic, copy) NSString *currentType;
@property (nonatomic, copy) NSString *keyword;

@property (nonatomic, strong) NSArray<ABCategory *> *list;      // 全量（含已隐藏）
@property (nonatomic, strong) NSMutableArray<ABCategory *> *roots;
@property (nonatomic, strong) NSMutableSet<NSString *> *expanded;

// 批量态
@property (nonatomic, strong) NSMutableSet<NSString *> *selected;

// 排序态：层级 key → 目标 id 顺序。拖拽只改这里，点「完成」才逐层提交，
// 点「取消」直接丢掉 —— 绝不往 roots 里写还没落库的顺序。
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSArray<NSString *> *> *pendingOrders;
@property (nonatomic, assign) BOOL saving;

@end

@implementation ABCategoryViewController

- (instancetype)initWithType:(NSString *)type {
    self = [super init];
    if (self) {
        _currentType = [type copy] ?: @"expense";
        _mode = ABCategoryModeNormal;
        _expanded = [NSMutableSet set];
        _selected = [NSMutableSet set];
        _pendingOrders = [NSMutableDictionary dictionary];
        _keyword = @"";
    }
    return self;
}

- (instancetype)init {
    return [self initWithType:@"expense"];
}

- (NSString *)typeLabel {
    return [self.currentType isEqualToString:@"income"] ? @"收入" : @"支出";
}

- (NSString *)accountId {
    return [ABAccountStore shared].currentId ?: @"";
}

#pragma mark - 生命周期

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    [self setupViews];
    [self updateChrome];
    [self loadData];
}

#pragma mark - 视图搭建

- (void)setupViews {
    [self setupNavBar];
    [self setupSearchBar];
    [self setupSortHint];
    [self setupTableView];
    [self setupBottomBar];
    [self setupConstraints];

    // 搜索条 / 说明条靠「高度归零」隐藏 —— **必须裁剪子视图**。
    // 否则里面的 label / 输入框按 centerY 居中，高度为 0 时它们会溢出到容器上下两侧，
    // 在顶栏下面露出一条被裁掉一半的残影（实测三个模式都会露）。
    self.searchBar.clipsToBounds = YES;
    self.sortHint.clipsToBounds = YES;
}

- (void)setupNavBar {
    self.navBar = [[UIView alloc] init];
    self.navBar.backgroundColor = [ABTheme bgPage];
    [self.view addSubview:self.navBar];

    UIView *line = [[UIView alloc] init];
    line.backgroundColor = [ABTheme line];
    [self.navBar addSubview:line];
    [line mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.right.bottom.equalTo(self.navBar);
        make.height.mas_equalTo(1);
    }];

    // 左：普通态是返回，批量 / 排序态是「取消」文字按钮
    self.backBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.backBtn setImage:[UIImage systemImageNamed:@"chevron.left"] forState:UIControlStateNormal];
    self.backBtn.tintColor = [ABTheme textPrimary];
    [self.backBtn addTarget:self action:@selector(onBack) forControlEvents:UIControlEventTouchUpInside];
    [self.navBar addSubview:self.backBtn];

    self.cancelBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.cancelBtn setTitle:@"取消" forState:UIControlStateNormal];
    [self.cancelBtn setTitleColor:[ABTheme gold] forState:UIControlStateNormal];
    self.cancelBtn.titleLabel.font = [ABTheme fontBody];
    [self.cancelBtn addTarget:self action:@selector(onCancelMode) forControlEvents:UIControlEventTouchUpInside];
    [self.navBar addSubview:self.cancelBtn];

    self.navTitle = [[UILabel alloc] init];
    self.navTitle.font = [ABTheme fontH2];
    self.navTitle.textColor = [ABTheme textPrimary];
    self.navTitle.textAlignment = NSTextAlignmentCenter;
    [self.navBar addSubview:self.navTitle];

    // 右：普通态是放大镜，批量态是「全选 / 取消全选」
    self.searchBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.searchBtn setImage:[UIImage systemImageNamed:@"magnifyingglass"] forState:UIControlStateNormal];
    self.searchBtn.tintColor = [ABTheme textPrimary];
    [self.searchBtn addTarget:self action:@selector(onToggleSearch) forControlEvents:UIControlEventTouchUpInside];
    [self.navBar addSubview:self.searchBtn];

    self.selectAllBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.selectAllBtn setTitle:@"全选" forState:UIControlStateNormal];
    [self.selectAllBtn setTitleColor:[ABTheme gold] forState:UIControlStateNormal];
    self.selectAllBtn.titleLabel.font = [ABTheme fontBody];
    [self.selectAllBtn addTarget:self action:@selector(onToggleAll) forControlEvents:UIControlEventTouchUpInside];
    [self.navBar addSubview:self.selectAllBtn];
}

- (void)setupSearchBar {
    self.searchBar = [[UIView alloc] init];
    self.searchBar.backgroundColor = [ABTheme bgPage];
    [self.view addSubview:self.searchBar];

    UIImageView *icon = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"magnifyingglass"]];
    icon.tintColor = [ABTheme textSecondary];
    [self.searchBar addSubview:icon];

    self.searchField = [[UITextField alloc] init];
    self.searchField.placeholder = @"搜索分类名称";
    self.searchField.font = [ABTheme fontBody];
    self.searchField.textColor = [ABTheme textPrimary];
    self.searchField.returnKeyType = UIReturnKeySearch;
    self.searchField.delegate = self;
    self.searchField.clearButtonMode = UITextFieldViewModeWhileEditing;
    [self.searchField addTarget:self action:@selector(onKeywordChanged) forControlEvents:UIControlEventEditingChanged];
    [self.searchBar addSubview:self.searchField];

    UIView *line = [[UIView alloc] init];
    line.backgroundColor = [ABTheme line];
    [self.searchBar addSubview:line];

    [icon mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.searchBar).offset(kSpace4);
        make.centerY.equalTo(self.searchBar);
        make.width.height.mas_equalTo(16);
    }];
    [self.searchField mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(icon.mas_right).offset(kSpace2);
        make.right.equalTo(self.searchBar).offset(-kSpace4);
        make.centerY.equalTo(self.searchBar);
        make.height.mas_equalTo(36);
    }];
    [line mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.right.bottom.equalTo(self.searchBar);
        make.height.mas_equalTo(1);
    }];
}

- (void)setupSortHint {
    self.sortHint = [[UIView alloc] init];
    self.sortHint.backgroundColor = [ABTheme bgInset];
    [self.view addSubview:self.sortHint];

    UILabel *label = [[UILabel alloc] init];
    label.text = @"按住右侧把手上下拖动排序；点「完成」保存，点「取消」放弃";
    label.font = [ABTheme fontCaption];
    label.textColor = [ABTheme textSecondary];
    label.numberOfLines = 0;
    [self.sortHint addSubview:label];
    [label mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.sortHint).offset(kSpace4);
        make.right.equalTo(self.sortHint).offset(-kSpace4);
        make.centerY.equalTo(self.sortHint);
    }];
}

- (void)setupTableView {
    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
    self.tableView.backgroundColor = [ABTheme bgPage];
    self.tableView.dataSource = self;
    self.tableView.delegate = self;
    self.tableView.separatorColor = [ABTheme line];
    self.tableView.tableFooterView = [[UIView alloc] init];
    self.tableView.rowHeight = kRowHeight;
    self.tableView.keyboardDismissMode = UIScrollViewKeyboardDismissModeOnDrag;
    [self.tableView registerClass:UITableViewCell.class forCellReuseIdentifier:@"cat"];
    [self.view addSubview:self.tableView];

    self.emptyView = [[ABEmptyView alloc] initWithText:@"还没有分类，在下面新建一个吧"];
    self.emptyView.hidden = YES;
    [self.view addSubview:self.emptyView];
}

- (void)setupBottomBar {
    self.bottomBar = [[UIView alloc] init];
    self.bottomBar.backgroundColor = [ABTheme bgPage];
    [self.view addSubview:self.bottomBar];

    UIView *topLine = [[UIView alloc] init];
    topLine.backgroundColor = [ABTheme line];
    [self.bottomBar addSubview:topLine];
    [topLine mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(self.bottomBar);
        make.height.mas_equalTo(1);
    }];

    // —— 普通态：三格（排序 / 批量操作 / 新建分类）——
    self.normalBar = [self makeBarContainer];
    [self.bottomBar addSubview:self.normalBar];
    UIStackView *normalStack = [self makeRowStack];
    [self.normalBar addSubview:normalStack];
    [normalStack mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(self.normalBar);
    }];
    [normalStack addArrangedSubview:[self makeGridButton:@"排序" icon:@"arrow.up.arrow.down" action:@selector(onEnterSort)]];
    [normalStack addArrangedSubview:[self makeGridButton:@"批量操作" icon:@"checklist" action:@selector(onEnterBatch)]];
    [normalStack addArrangedSubview:[self makeGridButton:@"新建分类" icon:@"plus" action:@selector(onNewRoot)]];

    // —— 批量态：三格（删除 / 隐藏 / 恢复显示）——
    self.batchBar = [self makeBarContainer];
    [self.bottomBar addSubview:self.batchBar];
    UIStackView *batchStack = [self makeRowStack];
    [self.batchBar addSubview:batchStack];
    [batchStack mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(self.batchBar);
    }];
    self.batchDeleteBtn = [self makeGridButton:@"删除" icon:@"trash" action:@selector(onBatchDelete)];
    self.batchHideBtn = [self makeGridButton:@"隐藏" icon:@"eye.slash" action:@selector(onBatchHide)];
    self.batchUnhideBtn = [self makeGridButton:@"恢复显示" icon:@"eye" action:@selector(onBatchUnhide)];
    [batchStack addArrangedSubview:self.batchDeleteBtn];
    [batchStack addArrangedSubview:self.batchHideBtn];
    [batchStack addArrangedSubview:self.batchUnhideBtn];

    // —— 排序态：单个「完成」——
    self.sortBar = [self makeBarContainer];
    [self.bottomBar addSubview:self.sortBar];
    UIButton *doneBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    [doneBtn setTitle:@"完成" forState:UIControlStateNormal];
    [doneBtn setTitleColor:[ABTheme gold] forState:UIControlStateNormal];
    doneBtn.titleLabel.font = [ABTheme fontBodyLg];
    [doneBtn addTarget:self action:@selector(onSortDone) forControlEvents:UIControlEventTouchUpInside];
    [self.sortBar addSubview:doneBtn];
    [doneBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(self.sortBar);
    }];
}

- (UIView *)makeBarContainer {
    UIView *v = [[UIView alloc] init];
    v.hidden = YES;
    return v;
}

- (UIStackView *)makeRowStack {
    UIStackView *stack = [[UIStackView alloc] init];
    stack.axis = UILayoutConstraintAxisHorizontal;
    stack.distribution = UIStackViewDistributionFillEqually;
    stack.alignment = UIStackViewAlignmentFill;
    return stack;
}

/// 底栏的一格：图标 + 文案（对齐前端 .batch-act）
- (UIButton *)makeGridButton:(NSString *)title icon:(NSString *)icon action:(SEL)action {
    UIButton *btn = [UIButton buttonWithType:UIButtonTypeSystem];
    [btn setTitle:title forState:UIControlStateNormal];
    [btn setImage:[UIImage systemImageNamed:icon] forState:UIControlStateNormal];
    [btn setTitleColor:[ABTheme textSecondary] forState:UIControlStateNormal];
    btn.titleLabel.font = [ABTheme fontCaption];
    btn.imageView.contentMode = UIViewContentModeScaleAspectFit;
    [btn addTarget:self action:action forControlEvents:UIControlEventTouchUpInside];
    // 图标在上、文案在下（与前端 .batch-act 一致）
    btn.imageEdgeInsets = UIEdgeInsetsMake(-16, 0, 0, -btn.titleLabel.intrinsicContentSize.width);
    btn.titleEdgeInsets = UIEdgeInsetsMake(22, -btn.currentImage.size.width, 0, 0);
    btn.contentVerticalAlignment = UIControlContentVerticalAlignmentCenter;
    return btn;
}

- (void)setupConstraints {
    [self.navBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(self.view);
        make.bottom.equalTo(self.view.mas_safeAreaLayoutGuideTop).offset(kNavBarHeight);
    }];
    [self.backBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.navBar).offset(kSpace1);
        make.centerY.equalTo(self.navBar.mas_bottom).offset(-kNavBarHeight / 2);
        make.width.height.mas_equalTo(44);
    }];
    [self.cancelBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.navBar).offset(kSpace4);
        make.centerY.equalTo(self.backBtn);
        make.height.mas_equalTo(44);
    }];
    [self.navTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.centerX.equalTo(self.navBar);
        make.centerY.equalTo(self.backBtn);
    }];
    [self.searchBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(self.navBar).offset(-kSpace1);
        make.centerY.equalTo(self.backBtn);
        make.width.height.mas_equalTo(44);
    }];
    [self.selectAllBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(self.navBar).offset(-kSpace4);
        make.centerY.equalTo(self.backBtn);
        make.height.mas_equalTo(44);
    }];

    [self.searchBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.navBar.mas_bottom);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(0);
    }];

    [self.sortHint mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.searchBar.mas_bottom);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(0);
    }];

    [self.tableView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.sortHint.mas_bottom);
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.bottomBar.mas_top);
    }];
    [self.emptyView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.sortHint.mas_bottom);
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.bottomBar.mas_top);
    }];

    [self.bottomBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.right.bottom.equalTo(self.view);
        make.height.mas_equalTo(kBottomBarHeight);
    }];
    for (UIView *bar in @[self.normalBar, self.batchBar, self.sortBar]) {
        [bar mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.right.equalTo(self.bottomBar);
            make.top.equalTo(self.bottomBar).offset(1);
            make.height.mas_equalTo(kBottomBarHeight - 1);
        }];
    }
}

- (void)viewSafeAreaInsetsDidChange {
    [super viewSafeAreaInsetsDidChange];
    CGFloat bottom = self.view.safeAreaInsets.bottom;
    [self.bottomBar mas_updateConstraints:^(MASConstraintMaker *make) {
        make.height.mas_equalTo(kBottomBarHeight + bottom);
    }];
    for (UIView *bar in @[self.normalBar, self.batchBar, self.sortBar]) {
        [bar mas_updateConstraints:^(MASConstraintMaker *make) {
            make.height.mas_equalTo(kBottomBarHeight - 1);
        }];
    }
}

#pragma mark - 模式切换

/// 顶栏 / 底栏 / 搜索条 / 说明条的形状统一在这里改 —— 新增模式时只动这一处
- (void)updateChrome {
    BOOL isNormal = (self.mode == ABCategoryModeNormal);
    BOOL isBatch = (self.mode == ABCategoryModeBatch);
    BOOL isSort = (self.mode == ABCategoryModeSort);

    self.backBtn.hidden = !isNormal;
    self.searchBtn.hidden = !isNormal;
    self.cancelBtn.hidden = isNormal;
    self.selectAllBtn.hidden = !isBatch;

    if (isNormal) {
        self.navTitle.text = [NSString stringWithFormat:@"%@分类管理", [self typeLabel]];
    } else if (isBatch) {
        self.navTitle.text = [NSString stringWithFormat:@"选择%@分类", [self typeLabel]];
        [self.selectAllBtn setTitle:(self.isAllSelected ? @"取消全选" : @"全选") forState:UIControlStateNormal];
    } else {
        self.navTitle.text = [NSString stringWithFormat:@"%@分类排序", [self typeLabel]];
    }

    self.normalBar.hidden = !isNormal;
    self.batchBar.hidden = !isBatch;
    self.sortBar.hidden = !isSort;

    // 搜索条只在普通态、且输入框获得焦点时展开；说明条只在排序态出现。
    // 两者用改高度而不是 hidden —— 高度参与 AutoLayout，hidden 不改布局会留下空洞。
    BOOL showSearch = (isNormal && self.searchField.isFirstResponder);
    [self.searchBar mas_updateConstraints:^(MASConstraintMaker *make) {
        make.height.mas_equalTo(showSearch ? kSearchBarHeight : 0);
    }];
    [self.sortHint mas_updateConstraints:^(MASConstraintMaker *make) {
        make.height.mas_equalTo(isSort ? kSortHintHeight : 0);
    }];

    [self updateBatchButtons];

    // 排序态开启拖动；其余态关闭（否则每行都会长出系统把手）
    [self.tableView setEditing:isSort animated:NO];
}

/// 批量态三个操作**按选中项的实际状态自动禁用**，而不是点了没反应
- (void)updateBatchButtons {
    NSArray<ABCategory *> *items = [self selectedItems];
    BOOL hasAny = items.count > 0;
    BOOL canHide = NO, canUnhide = NO;
    for (ABCategory *c in items) {
        if (c.isHidden) canUnhide = YES; else canHide = YES;
    }
    [self setButton:self.batchDeleteBtn enabled:hasAny];
    [self setButton:self.batchHideBtn enabled:canHide];
    [self setButton:self.batchUnhideBtn enabled:canUnhide];
}

/// 禁用用**换色**表达，不用 opacity（文字加透明度会静默吃掉对比度）
- (void)setButton:(UIButton *)btn enabled:(BOOL)enabled {
    btn.enabled = enabled;
    UIColor *color = enabled ? [ABTheme textSecondary] : [ABTheme textDisabled];
    [btn setTitleColor:color forState:UIControlStateNormal];
    [btn setTitleColor:color forState:UIControlStateDisabled];
    btn.tintColor = enabled ? [ABTheme textPrimary] : [ABTheme textDisabled];
}

- (void)applyMode:(ABCategoryMode)mode {
    self.mode = mode;
    [self.pendingOrders removeAllObjects];
    [self.selected removeAllObjects];
    [self.searchField resignFirstResponder];

    if (mode == ABCategoryModeNormal || mode == ABCategoryModeBatch) {
        // 普通 / 批量态默认展开全部一级（对齐前端 expandAll）
        [self.expanded removeAllObjects];
        for (ABCategory *r in self.roots) [self.expanded addObject:r.categoryId];
    } else {
        // 排序态（D2）：全部折叠，让「屏幕上只有正在排的那一层」成为不变式
        [self.expanded removeAllObjects];
    }

    [self updateChrome];
    [self reloadList];
}

- (void)reloadList {
    [self.tableView reloadData];
    self.emptyView.hidden = (self.displayRoots.count > 0);
}

#pragma mark - 数据

- (void)loadData {
    __weak typeof(self) weakSelf = self;
    [ABCategoryService getCategories:[self accountId]
                                type:self.currentType
                            parentId:nil
                          visibility:@"all"   // 必须拿全量（含已隐藏），否则没有入口把隐藏的恢复回来
                             success:^(NSArray<ABCategory *> *list) {
        __strong typeof(weakSelf) self = weakSelf;
        self.list = list;
        [self rebuildTree];
    } failure:^(NSError *error) {
        NSLog(@"[category] 加载失败: %@", error.localizedDescription);
    }];
}

- (void)rebuildTree {
    self.roots = [NSMutableArray array];
    for (ABCategory *c in self.list) {
        if ([c isRoot]) [self.roots addObject:c];
    }
    [self.expanded removeAllObjects];
    for (ABCategory *r in self.roots) [self.expanded addObject:r.categoryId];
    [self updateChrome];
    [self reloadList];
}

- (NSArray<ABCategory *> *)childrenOf:(NSString *)parentId {
    NSMutableArray *arr = [NSMutableArray array];
    for (ABCategory *c in self.list) {
        if (c.parentId && [c.parentId isEqualToString:parentId]) [arr addObject:c];
    }
    return arr;
}

- (nullable ABCategory *)categoryById:(NSString *)categoryId {
    for (ABCategory *c in self.list) {
        if ([c.categoryId isEqualToString:categoryId]) return c;
    }
    return nil;
}

/* ══════════════════════════════════════════════════════════════════════
 * 待提交的排序（D4）
 *
 * 显示顺序 = 原始顺序经 pendingOrders 重排。拖拽只改 pendingOrders，
 * 点「完成」才逐层提交、点「取消」直接丢 —— 绝不把还没落库的顺序
 * 写进 roots（roots 是服务端数据的映射，往里面写脏顺序会污染别处）。
 * ══════════════════════════════════════════════════════════════════════ */

- (NSArray<ABCategory *> *)applyPending:(NSArray<ABCategory *> *)list parentId:(nullable NSString *)parentId {
    NSArray<NSString *> *order = self.pendingOrders[parentId ?: kRootLevelKey];
    if (!order.count) return list;

    NSMutableDictionary<NSString *, NSNumber *> *pos = [NSMutableDictionary dictionary];
    [order enumerateObjectsUsingBlock:^(NSString *cid, NSUInteger i, BOOL *stop) {
        pos[cid] = @(i);
    }];
    return [list sortedArrayUsingComparator:^NSComparisonResult(ABCategory *a, ABCategory *b) {
        NSInteger pa = pos[a.categoryId] ? pos[a.categoryId].integerValue : NSIntegerMax;
        NSInteger pb = pos[b.categoryId] ? pos[b.categoryId].integerValue : NSIntegerMax;
        if (pa < pb) return NSOrderedAscending;
        if (pa > pb) return NSOrderedDescending;
        return NSOrderedSame;
    }];
}

/// 一级分类：搜索过滤 + 待提交顺序
- (NSArray<ABCategory *> *)displayRoots {
    NSString *kw = [self.keyword stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
    NSArray<ABCategory *> *filtered = self.roots;
    if (kw.length) {
        NSMutableArray *arr = [NSMutableArray array];
        for (ABCategory *r in self.roots) {
            if ([r.name containsString:kw]) [arr addObject:r];
        }
        filtered = arr;
    }
    return [self applyPending:filtered parentId:nil];
}

/// 二级分类：**不做搜索过滤**（命中一级就展示整组，避免「搜到一级却看不到内容」）
- (NSArray<ABCategory *> *)displayChildrenOf:(NSString *)parentId {
    return [self applyPending:[self childrenOf:parentId] parentId:parentId];
}

/// 排序态：单 section 的扁平列表（一级 + 已展开组的二级）
- (NSArray<ABCategory *> *)sortFlatList {
    NSMutableArray *arr = [NSMutableArray array];
    for (ABCategory *root in [self displayRoots]) {
        [arr addObject:root];
        if ([self.expanded containsObject:root.categoryId]) {
            [arr addObjectsFromArray:[self displayChildrenOf:root.categoryId]];
        }
    }
    return arr;
}

/// 指定 section 是否显示「+ 新建二级分类」（批量态 / 排序态 / 搜索中都不显示）
- (BOOL)showsAddChildInSection:(NSInteger)section {
    if (self.mode != ABCategoryModeNormal) return NO;
    if ([self.keyword stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet].length) return NO;
    return YES;
}

- (void)reloadSection:(NSInteger)section {
    [self.tableView reloadSections:[NSIndexSet indexSetWithIndex:section]
                  withRowAnimation:UITableViewRowAnimationAutomatic];
}

#pragma mark - 普通态 Actions

- (void)onBack {
    [self.navigationController popViewControllerAnimated:YES];
}

- (void)onToggleSearch {
    if (self.searchField.isFirstResponder) {
        self.searchField.text = @"";
        self.keyword = @"";
        [self.searchField resignFirstResponder];
        [self reloadList];
    } else {
        [self.searchField becomeFirstResponder];
    }
    [self updateChrome];
}

- (void)onKeywordChanged {
    self.keyword = self.searchField.text ?: @"";
    [self reloadList];
}

- (BOOL)textFieldShouldReturn:(UITextField *)textField {
    [textField resignFirstResponder];
    [self updateChrome];
    return YES;
}

- (void)onNewRoot {
    ABCategoryNewViewController *vc = [[ABCategoryNewViewController alloc] initWithCategory:nil
                                                                                      type:self.currentType
                                                                                  parentId:nil];
    __weak typeof(self) weakSelf = self;
    vc.onSaved = ^{
        __strong typeof(weakSelf) self = weakSelf;
        [self loadData];
    };
    [self.navigationController pushViewController:vc animated:YES];
}

- (void)onNewChildAtSection:(NSInteger)section {
    NSArray<ABCategory *> *roots = [self displayRoots];
    if (section >= (NSInteger)roots.count) return;
    ABCategory *parent = roots[section];
    ABCategoryNewViewController *vc = [[ABCategoryNewViewController alloc] initWithCategory:nil
                                                                                      type:self.currentType
                                                                                  parentId:parent.categoryId];
    __weak typeof(self) weakSelf = self;
    vc.onSaved = ^{
        __strong typeof(weakSelf) self = weakSelf;
        [self loadData];
    };
    [self.navigationController pushViewController:vc animated:YES];
}

- (void)onEditCategory:(ABCategory *)cat {
    ABCategoryNewViewController *vc = [[ABCategoryNewViewController alloc] initWithCategory:cat
                                                                                      type:self.currentType
                                                                                  parentId:cat.parentId];
    __weak typeof(self) weakSelf = self;
    vc.onSaved = ^{
        __strong typeof(weakSelf) self = weakSelf;
        [self loadData];
    };
    [self.navigationController pushViewController:vc animated:YES];
}

#pragma mark - 批量态

- (void)onEnterBatch {
    [self applyMode:ABCategoryModeBatch];
}

- (void)onCancelMode {
    [self applyMode:ABCategoryModeNormal];
}

- (NSArray<ABCategory *> *)selectedItems {
    NSMutableArray *arr = [NSMutableArray array];
    for (ABCategory *c in self.list) {
        if ([self.selected containsObject:c.categoryId]) [arr addObject:c];
    }
    return arr;
}

/// 当前列表里全部分类的 id（用于「全选」）—— 只统计屏幕上看得见的
- (NSArray<NSString *> *)visibleIds {
    NSMutableArray *ids = [NSMutableArray array];
    for (ABCategory *r in [self displayRoots]) {
        [ids addObject:r.categoryId];
        for (ABCategory *c in [self displayChildrenOf:r.categoryId]) [ids addObject:c.categoryId];
    }
    return ids;
}

- (BOOL)isAllSelected {
    NSArray<NSString *> *ids = [self visibleIds];
    if (!ids.count) return NO;
    for (NSString *i in ids) {
        if (![self.selected containsObject:i]) return NO;
    }
    return YES;
}

- (void)onToggleAll {
    if (self.isAllSelected) {
        [self.selected removeAllObjects];
    } else {
        [self.selected addObjectsFromArray:[self visibleIds]];
    }
    [self updateChrome];
    [self.tableView reloadData];
}

- (void)togglePick:(NSString *)categoryId {
    if ([self.selected containsObject:categoryId]) {
        [self.selected removeObject:categoryId];
    } else {
        [self.selected addObject:categoryId];
    }
    [self updateChrome];
}

/// 批量删除：提示里区分「直接删的」和「被级联删掉的」（对齐前端算法）
- (void)onBatchDelete {
    if (![self selectedItems].count) return;

    NSArray<ABCategory *> *items = [self selectedItems];
    NSMutableSet<NSString *> *pickedIds = [NSMutableSet set];
    for (ABCategory *c in items) [pickedIds addObject:c.categoryId];

    NSInteger direct = 0, cascaded = 0;
    for (ABCategory *c in items) {
        if ([c isRoot]) {
            direct += 1;
            cascaded += (NSInteger)[self childrenOf:c.categoryId].count;
        } else if (![pickedIds containsObject:c.parentId]) {
            // 二级被单独选中（父没选）→ 直接删；父也选了 → 已算在级联里
            direct += 1;
        }
    }

    NSMutableString *msg = [NSMutableString stringWithFormat:@"将删除 %ld 个分类", (long)direct];
    if (cascaded) [msg appendFormat:@"，并连同其下 %ld 个二级分类一并删除", (long)cascaded];
    [msg appendString:@"。相关账单会变为「未分类」，且无法撤销。"];

    UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"删除分类"
                                                                   message:msg
                                                            preferredStyle:UIAlertControllerStyleAlert];
    [alert addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    __weak typeof(self) weakSelf = self;
    [alert addAction:[UIAlertAction actionWithTitle:@"删除" style:UIAlertActionStyleDestructive handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        [self performBatchDelete];
    }]];
    [self presentViewController:alert animated:YES completion:nil];
}

- (void)performBatchDelete {
    NSArray<NSString *> *ids = [self.selected allObjects];
    if (!ids.count) return;
    __weak typeof(self) weakSelf = self;
    [ABCategoryService batchDeleteCategories:[self accountId]
                                         ids:ids
                                     success:^(NSDictionary *dict) {
        __strong typeof(weakSelf) self = weakSelf;
        NSInteger deleted = [dict[@"deleted"] integerValue];
        NSInteger deletedChildren = [dict[@"deletedChildren"] integerValue];
        NSString *msg = deletedChildren
            ? [NSString stringWithFormat:@"已删除 %ld 个（含 %ld 个二级）", (long)deleted, (long)deletedChildren]
            : [NSString stringWithFormat:@"已删除 %ld 个", (long)deleted];
        [self toast:msg];
        [self applyMode:ABCategoryModeNormal];
        [self loadData];
    } failure:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        [self toast:[NSString stringWithFormat:@"删除失败：%@", error.localizedDescription]];
    }];
}

- (void)onBatchHide {
    [self performBatchHide:YES];
}

- (void)onBatchUnhide {
    [self performBatchHide:NO];
}

- (void)performBatchHide:(BOOL)hidden {
    NSArray<NSString *> *ids = [self.selected allObjects];
    if (!ids.count) return;
    __weak typeof(self) weakSelf = self;
    [ABCategoryService batchHideCategories:[self accountId]
                                       ids:ids
                                    hidden:hidden
                                   success:^(NSDictionary *dict) {
        __strong typeof(weakSelf) self = weakSelf;
        NSInteger updated = [dict[@"updated"] integerValue];
        [self toast:hidden
            ? [NSString stringWithFormat:@"已隐藏 %ld 个分类", (long)updated]
            : [NSString stringWithFormat:@"已恢复 %ld 个分类", (long)updated]];
        [self applyMode:ABCategoryModeNormal];
        [self loadData];
    } failure:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        [self toast:[NSString stringWithFormat:@"操作失败：%@", error.localizedDescription]];
    }];
}

#pragma mark - 排序态

- (void)onEnterSort {
    [self applyMode:ABCategoryModeSort];
}

/// 点「完成」：逐层串行提交（D5：遇错即停、已成功的保留，且要说清哪一层没存）
- (void)onSortDone {
    if (self.saving) return;

    NSArray<NSString *> *keys = self.pendingOrders.allKeys;
    if (!keys.count) {
        [self applyMode:ABCategoryModeNormal];
        return;
    }
    self.saving = YES;
    [self commitOrders:[keys mutableCopy] done:0 failedLabel:nil];
}

- (void)commitOrders:(NSMutableArray<NSString *> *)keys done:(NSInteger)done failedLabel:(nullable NSString *)failedLabel {
    if (!keys.count || failedLabel) {
        [self finishSortCommit:done failedLabel:failedLabel];
        return;
    }
    NSString *key = keys.firstObject;
    [keys removeObjectAtIndex:0];
    NSArray<NSString *> *ids = self.pendingOrders[key];
    NSString *parentId = [key isEqualToString:kRootLevelKey] ? nil : key;

    __weak typeof(self) weakSelf = self;
    [ABCategoryService reorderCategories:[self accountId]
                                    type:self.currentType
                                parentId:parentId
                                     ids:ids
                                 success:^(NSDictionary *dict) {
        __strong typeof(weakSelf) self = weakSelf;
        [self commitOrders:keys done:done + 1 failedLabel:nil];
    } failure:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        NSLog(@"[category] 排序保存失败 key=%@: %@", key, error.localizedDescription);
        NSString *label = parentId
            ? ([self categoryById:parentId].name ?: @"某组二级分类")
            : [NSString stringWithFormat:@"%@一级分类", [self typeLabel]];
        [self commitOrders:keys done:done failedLabel:label];
    }];
}

- (void)finishSortCommit:(NSInteger)done failedLabel:(nullable NSString *)failedLabel {
    self.saving = NO;
    [self applyMode:ABCategoryModeNormal];
    [self loadData];

    if (failedLabel) {
        NSString *msg = done
            ? [NSString stringWithFormat:@"已保存 %ld 层；「%@」保存失败，该层仍是原顺序。", (long)done, failedLabel]
            : [NSString stringWithFormat:@"「%@」保存失败，排序未生效。", failedLabel];
        UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"部分排序未保存"
                                                                       message:msg
                                                                preferredStyle:UIAlertControllerStyleAlert];
        [alert addAction:[UIAlertAction actionWithTitle:@"好" style:UIAlertActionStyleDefault handler:nil]];
        [self presentViewController:alert animated:YES completion:nil];
        return;
    }
    [self toast:[NSString stringWithFormat:@"已保存 %ld 层排序", (long)done]];
}

- (void)toast:(NSString *)message {
    UIAlertController *alert = [UIAlertController alertControllerWithTitle:nil
                                                                   message:message
                                                            preferredStyle:UIAlertControllerStyleAlert];
    [alert addAction:[UIAlertAction actionWithTitle:@"好" style:UIAlertActionStyleDefault handler:nil]];
    [self presentViewController:alert animated:YES completion:nil];
}

#pragma mark - UITableViewDataSource

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView {
    if (self.mode == ABCategoryModeSort) return 1;
    return (NSInteger)[self displayRoots].count;
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    if (self.mode == ABCategoryModeSort) return (NSInteger)[self sortFlatList].count;

    NSArray<ABCategory *> *roots = [self displayRoots];
    ABCategory *root = roots[section];
    if (![self.expanded containsObject:root.categoryId]) return 1;

    NSInteger rows = 1 + (NSInteger)[self displayChildrenOf:root.categoryId].count;
    if ([self showsAddChildInSection:section]) rows += 1;
    return rows;
}

- (CGFloat)tableView:(UITableView *)tableView heightForHeaderInSection:(NSInteger)section {
    if (self.mode == ABCategoryModeSort) return 0;
    return section == 0 ? 0 : 8;   // 组间 8px 槽（对齐前端 .group + .group）
}

- (UIView *)tableView:(UITableView *)tableView viewForHeaderInSection:(NSInteger)section {
    UIView *v = [[UIView alloc] init];
    v.backgroundColor = [ABTheme bgInset];
    return v;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"cat"];
    if (!cell) cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleDefault reuseIdentifier:@"cat"];
    for (UIView *v in cell.contentView.subviews) [v removeFromSuperview];
    cell.selectionStyle = UITableViewCellSelectionStyleNone;
    cell.backgroundColor = [ABTheme bgCard];
    cell.accessoryType = UITableViewCellAccessoryNone;
    cell.accessoryView = nil;

    if (self.mode == ABCategoryModeSort) {
        [self configureSortCell:cell atRow:indexPath.row];
    } else {
        [self configureNormalCell:cell atIndexPath:indexPath];
    }
    return cell;
}

/// 普通态 / 批量态的行（section 结构）
- (void)configureNormalCell:(UITableViewCell *)cell atIndexPath:(NSIndexPath *)indexPath {
    NSArray<ABCategory *> *roots = [self displayRoots];
    if (indexPath.section >= (NSInteger)roots.count) return;
    ABCategory *root = roots[indexPath.section];
    NSArray<ABCategory *> *children = [self displayChildrenOf:root.categoryId];

    if (indexPath.row == 0) {
        [self layoutRowInCell:cell
                     category:root
                       isRoot:YES
                     hasCaret:YES
                    caretOpen:[self.expanded containsObject:root.categoryId]
                     iconSize:28
                     leftInset:kSpace3
                        tail:[self tailViewFor:root]];
        return;
    }

    if ([self showsAddChildInSection:indexPath.section] && indexPath.row == (NSInteger)children.count + 1) {
        UILabel *add = [[UILabel alloc] init];
        add.text = @"+  新建二级分类";
        add.font = [ABTheme fontBody];
        add.textColor = [ABTheme gold];
        add.textAlignment = NSTextAlignmentCenter;
        add.userInteractionEnabled = YES;
        UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(onAddChildTapped:)];
        [add addGestureRecognizer:tap];
        cell.tag = indexPath.section;
        [cell.contentView addSubview:add];
        [add mas_makeConstraints:^(MASConstraintMaker *make) {
            make.edges.equalTo(cell.contentView);
        }];
        return;
    }

    if (indexPath.row - 1 < (NSInteger)children.count) {
        ABCategory *child = children[indexPath.row - 1];
        [self layoutRowInCell:cell
                     category:child
                       isRoot:NO
                     hasCaret:NO
                    caretOpen:NO
                     iconSize:26
                     leftInset:46
                        tail:[self tailViewFor:child]];
    }
}

/// 排序态的行（扁平结构，尾部由系统的 reorder 把手接管）
- (void)configureSortCell:(UITableViewCell *)cell atRow:(NSInteger)row {
    NSArray<ABCategory *> *flat = [self sortFlatList];
    if (row >= (NSInteger)flat.count) return;
    ABCategory *cat = flat[row];
    BOOL isRoot = [cat isRoot];
    [self layoutRowInCell:cell
                 category:cat
                   isRoot:isRoot
                 hasCaret:isRoot
                caretOpen:isRoot && [self.expanded containsObject:cat.categoryId]
                 iconSize:isRoot ? 28 : 26
                 leftInset:isRoot ? kSpace3 : 46
                    tail:nil];
}

/// 行内布局（一级 / 二级 / 普通 / 排序共用）。tail 为 nil 时右侧留给系统把手。
- (void)layoutRowInCell:(UITableViewCell *)cell
               category:(ABCategory *)cat
                 isRoot:(BOOL)isRoot
               hasCaret:(BOOL)hasCaret
              caretOpen:(BOOL)caretOpen
               iconSize:(CGFloat)iconSize
              leftInset:(CGFloat)leftInset
                   tail:(nullable UIView *)tail {

    CGFloat cursor = leftInset;

    if (hasCaret) {
        UIImageView *caret = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"chevron.down"]];
        caret.tintColor = [ABTheme textTertiary];
        caret.transform = caretOpen ? CGAffineTransformIdentity : CGAffineTransformMakeRotation(-M_PI_2);
        [cell.contentView addSubview:caret];
        [caret mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(cell.contentView).offset(cursor);
            make.centerY.equalTo(cell.contentView);
            make.width.height.mas_equalTo(16);
        }];
        cursor += 16 + kSpace2;
    }

    ABIconView *icon = [[ABIconView alloc] initWithSize:iconSize];
    icon.iconKey = cat.icon;
    [cell.contentView addSubview:icon];
    [icon mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(cell.contentView).offset(cursor);
        make.centerY.equalTo(cell.contentView);
        make.width.height.mas_equalTo(iconSize);
    }];
    cursor += iconSize + kSpace3;

    UILabel *name = [[UILabel alloc] init];
    name.text = cat.name;
    name.font = isRoot ? [UIFont systemFontOfSize:17 weight:UIFontWeightMedium] : [ABTheme fontBody];
    // 隐藏态用换色而不是 opacity：文字加透明度会静默吃掉对比度
    name.textColor = cat.isHidden ? [ABTheme textSecondary] : [ABTheme textPrimary];
    name.numberOfLines = 0;
    name.lineBreakMode = NSLineBreakByCharWrapping;   // 分类名可折行，不截断
    [cell.contentView addSubview:name];

    // 尾部容器：批量=勾选框 / 普通=铅笔 / 排序=nil（交给系统把手）
    UIView *tailContainer = [[UIView alloc] init];
    [cell.contentView addSubview:tailContainer];

    [name mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(cell.contentView).offset(cursor);
        make.centerY.equalTo(cell.contentView);
        make.right.lessThanOrEqualTo(tailContainer.mas_left).offset(-kSpace2);
    }];
    [tailContainer mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(cell.contentView).offset(-kSpace4);
        make.centerY.equalTo(cell.contentView);
        make.height.mas_equalTo(44);
        make.width.mas_equalTo(tail ? 44 : 0);
    }];
    if (tail) {
        [tailContainer addSubview:tail];
        [tail mas_makeConstraints:^(MASConstraintMaker *make) {
            make.edges.equalTo(tailContainer);
        }];
    }

    // 「已隐藏」徽标，紧跟分类名
    if (cat.isHidden) {
        UILabel *tag = [[UILabel alloc] init];
        tag.text = @"已隐藏";
        tag.font = [ABTheme fontCaption];
        tag.textColor = [ABTheme textSecondary];
        tag.backgroundColor = [ABTheme bgInset];
        tag.layer.cornerRadius = kRadiusSm;
        tag.clipsToBounds = YES;
        [cell.contentView addSubview:tag];
        [tag mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(name.mas_right).offset(kSpace2);
            make.centerY.equalTo(cell.contentView);
            make.height.mas_equalTo(18);
            make.width.mas_equalTo(44);
        }];
    }
}

/// 行尾控件：批量态=勾选框，普通态=铅笔，排序态=nil
- (nullable UIView *)tailViewFor:(ABCategory *)cat {
    if (self.mode == ABCategoryModeBatch) {
        BOOL picked = [self.selected containsObject:cat.categoryId];

        UIView *box = [[UIView alloc] init];
        box.layer.cornerRadius = kRadiusSm;
        box.layer.borderWidth = 1.5;
        box.layer.borderColor = (picked ? [ABTheme gold] : [ABTheme textDisabled]).CGColor;
        box.backgroundColor = picked ? [ABTheme gold] : [UIColor clearColor];
        if (picked) {
            UIImageView *check = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"checkmark"]];
            check.tintColor = [ABTheme textInverse];
            [box addSubview:check];
            [check mas_makeConstraints:^(MASConstraintMaker *make) {
                make.center.equalTo(box);
                make.width.height.mas_equalTo(14);
            }];
        }
        return box;
    }

    UIButton *edit = [UIButton buttonWithType:UIButtonTypeSystem];
    [edit setImage:[UIImage systemImageNamed:@"pencil"] forState:UIControlStateNormal];
    edit.tintColor = [ABTheme textTertiary];
    edit.tag = [self.list indexOfObject:cat];
    [edit addTarget:self action:@selector(onEditTapped:) forControlEvents:UIControlEventTouchUpInside];
    return edit;
}

- (void)onEditTapped:(UIButton *)sender {
    if (sender.tag == NSNotFound || sender.tag >= (NSInteger)self.list.count) return;
    [self onEditCategory:self.list[sender.tag]];
}

- (void)onAddChildTapped:(UITapGestureRecognizer *)gesture {
    [self onNewChildAtSection:gesture.view.tag];
}

#pragma mark - UITableViewDelegate

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
    [tableView deselectRowAtIndexPath:indexPath animated:YES];

    ABCategory *cat = nil;
    if (self.mode == ABCategoryModeSort) {
        NSArray<ABCategory *> *flat = [self sortFlatList];
        if (indexPath.row < (NSInteger)flat.count) cat = flat[indexPath.row];
    } else {
        NSArray<ABCategory *> *roots = [self displayRoots];
        if (indexPath.section < (NSInteger)roots.count) {
            ABCategory *root = roots[indexPath.section];
            if (indexPath.row == 0) {
                cat = root;
            } else {
                NSArray<ABCategory *> *children = [self displayChildrenOf:root.categoryId];
                if (indexPath.row - 1 < (NSInteger)children.count) cat = children[indexPath.row - 1];
            }
        }
    }
    if (!cat) return;

    if (self.mode == ABCategoryModeBatch) {
        [self togglePick:cat.categoryId];
        [tableView reloadRowsAtIndexPaths:@[indexPath] withRowAnimation:UITableViewRowAnimationNone];
        return;
    }

    // 普通态 / 排序态：点一级行展开收起。
    // 排序态一次只展开一个组（D8），让「屏幕上只有正在排的那一层」保持清晰。
    if (![cat isRoot]) return;

    if ([self.expanded containsObject:cat.categoryId]) {
        [self.expanded removeObject:cat.categoryId];
    } else {
        if (self.mode == ABCategoryModeSort) [self.expanded removeAllObjects];
        [self.expanded addObject:cat.categoryId];
    }
    if (self.mode == ABCategoryModeSort) {
        [tableView reloadData];
    } else {
        [self reloadSection:indexPath.section];
    }
}

#pragma mark - 拖动排序（D4 / D5 / D7）

- (BOOL)tableView:(UITableView *)tableView canMoveRowAtIndexPath:(NSIndexPath *)indexPath {
    return self.mode == ABCategoryModeSort;
}

- (BOOL)tableView:(UITableView *)tableView canEditRowAtIndexPath:(NSIndexPath *)indexPath {
    return self.mode == ABCategoryModeSort;
}

/// 排序态不需要系统那套「删除」编辑样式，只借拖动
- (UITableViewCellEditingStyle)tableView:(UITableView *)tableView editingStyleForRowAtIndexPath:(NSIndexPath *)indexPath {
    return UITableViewCellEditingStyleNone;
}

- (BOOL)tableView:(UITableView *)tableView shouldIndentWhileEditingRowAtIndexPath:(NSIndexPath *)indexPath {
    return NO;
}

- (void)tableView:(UITableView *)tableView
moveRowAtIndexPath:(NSIndexPath *)sourceIndexPath
      toIndexPath:(NSIndexPath *)destinationIndexPath {

    NSArray<ABCategory *> *flat = [self sortFlatList];
    if (sourceIndexPath.row >= (NSInteger)flat.count || destinationIndexPath.row >= (NSInteger)flat.count) {
        [tableView reloadData];
        return;
    }

    ABCategory *src = flat[sourceIndexPath.row];
    ABCategory *dst = flat[destinationIndexPath.row];

    if ([src isRoot]) {
        // 一级：落点归到「目标位置所属的那一级」，然后在一级序列里搬
        NSString *dstRootId = [dst isRoot] ? dst.categoryId : dst.parentId;
        NSMutableArray<NSString *> *rootIds = [NSMutableArray array];
        for (ABCategory *r in [self displayRoots]) [rootIds addObject:r.categoryId];

        NSInteger from = [rootIds indexOfObject:src.categoryId];
        NSInteger to = [rootIds indexOfObject:dstRootId];
        if (from == NSNotFound || to == NSNotFound || from == to) {
            [tableView reloadData];
            return;
        }
        [rootIds removeObjectAtIndex:from];
        [rootIds insertObject:src.categoryId atIndex:MIN((NSUInteger)to, rootIds.count)];
        self.pendingOrders[kRootLevelKey] = rootIds;

    } else {
        // 二级：只能在同组内移动，跨组一律拒绝并回弹（语义上「换父」不是排序）
        if (dst.parentId == nil || ![dst.parentId isEqualToString:src.parentId]) {
            [tableView reloadData];
            return;
        }
        NSMutableArray<NSString *> *ids = [NSMutableArray array];
        for (ABCategory *c in [self childrenOf:src.parentId]) [ids addObject:c.categoryId];

        NSInteger from = [ids indexOfObject:src.categoryId];
        NSInteger to = [ids indexOfObject:dst.categoryId];
        if (from == NSNotFound || to == NSNotFound || from == to) {
            [tableView reloadData];
            return;
        }
        [ids removeObjectAtIndex:from];
        [ids insertObject:src.categoryId atIndex:MIN((NSUInteger)to, ids.count)];
        self.pendingOrders[src.parentId] = ids;
    }

    // 数据源顺序由 pendingOrders 决定，重载让它与刚拖完的界面一致
    [tableView reloadData];
}

@end
