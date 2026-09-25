//
//  ABAccountImportViewController.m
//  MyAccountBook
//
//  从母本（默认账本）导入分类到指定账本 —— 对齐 frontend/src/pages/account-import/index.vue
//
//  · 候选 = 母本全部分类，**先过滤掉目标账本已有的同名分类**
//    （同名会被后端唯一键挡住，不先过滤就会提交无效项）
//  · 默认全选，用户取消掉不要的
//
//  ⚠️ 勾选不变量（照抄 CategoryCheckTree.vue）：
//       `一级 id ∈ picked`  ⟺  该一级的**全部二级**也在 picked 里
//     所以每次变更后都要 normalize 一遍，否则「只勾了二级」的一级会
//     既不算全选也不算未选，提交上去的层级关系会不完整。
//

#import "ABAccountImportViewController.h"
#import "ABTheme.h"
#import "ABAccountService.h"
#import "ABCategoryService.h"
#import "ABAccountStore.h"
#import "ABNavigationBar.h"
#import "ABIconView.h"
#import "ABEmptyView.h"
#import <Masonry/Masonry.h>

@interface ABAccountImportViewController () <UITableViewDataSource, UITableViewDelegate>

@property (nonatomic, copy) NSString *accountId;

@property (nonatomic, strong) ABNavigationBar *navBar;
@property (nonatomic, strong) UIView *headerCard;
@property (nonatomic, strong) UIButton *selectAllBtn;
@property (nonatomic, strong) UITableView *tableView;
@property (nonatomic, strong) ABEmptyView *emptyView;
@property (nonatomic, strong) UIView *footer;
@property (nonatomic, strong) UIButton *submitBtn;

@property (nonatomic, strong) NSArray<ABCategory *> *candidates;   // 过滤后的候选（母本分类）
@property (nonatomic, strong) NSMutableSet<NSString *> *picked;    // 已选 id（含父级补全）
@property (nonatomic, strong) NSMutableSet<NSString *> *collapsed; // 被折叠的一级 id
@property (nonatomic, assign) BOOL loading;

- (void)toast:(NSString *)message;
- (void)toast:(NSString *)message thenPop:(BOOL)pop;

@end

@implementation ABAccountImportViewController

- (instancetype)initWithAccountId:(NSString *)accountId {
    self = [super init];
    if (self) {
        _accountId = [accountId copy];
        _picked = [NSMutableSet set];
        _collapsed = [NSMutableSet set];
        _candidates = @[];
    }
    return self;
}

/// 兜底：没走 initWithAccountId: 时用当前账本。
/// 三个集合必须在这里初始化 —— 为 nil 时 addObject/removeObject 是静默 no-op，
/// 勾选会「点了没反应」而完全不报错
- (instancetype)init {
    return [self initWithAccountId:[ABAccountStore shared].currentId ?: @""];
}

- (NSString *)accountIdOrCurrent {
    return self.accountId.length ? self.accountId : ([ABAccountStore shared].currentId ?: @"");
}

#pragma mark - 生命周期

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    [self setupViews];
    [self loadCandidates];
}

#pragma mark - 视图

- (void)setupViews {
    self.navBar = [[ABNavigationBar alloc] init];
    [self.navBar setTitle:@"从母本导入"];
    __weak typeof(self) weakSelf = self;
    self.navBar.onBack = ^{
        [weakSelf.navigationController popViewControllerAnimated:YES];
    };
    [self.view addSubview:self.navBar];

    self.headerCard = [[UIView alloc] init];
    self.headerCard.backgroundColor = [ABTheme bgCard];
    [self.view addSubview:self.headerCard];

    UILabel *title = [[UILabel alloc] init];
    title.text = @"从母本导入分类";
    title.font = [UIFont systemFontOfSize:15 weight:UIFontWeightMedium];
    title.textColor = [ABTheme textPrimary];
    [self.headerCard addSubview:title];

    self.selectAllBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.selectAllBtn setTitle:@"全选" forState:UIControlStateNormal];
    [self.selectAllBtn setTitleColor:[ABTheme gold] forState:UIControlStateNormal];
    self.selectAllBtn.titleLabel.font = [ABTheme fontBodySm];
    [self.selectAllBtn addTarget:self action:@selector(onToggleAll) forControlEvents:UIControlEventTouchUpInside];
    [self.headerCard addSubview:self.selectAllBtn];

    UILabel *hint = [[UILabel alloc] init];
    hint.text = @"勾选要加入本账本的分类（已在本账本中的不会重复）";
    hint.font = [ABTheme fontCaption];
    hint.textColor = [ABTheme textSecondary];
    hint.numberOfLines = 0;
    [self.headerCard addSubview:hint];

    [title mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.headerCard).offset(kSpace4);
        make.top.equalTo(self.headerCard).offset(kSpace4);
    }];
    [self.selectAllBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(self.headerCard).offset(-kSpace4);
        make.centerY.equalTo(title);
        make.height.mas_equalTo(44);
        make.width.mas_equalTo(72);
    }];
    [hint mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.headerCard).offset(kSpace4);
        make.right.equalTo(self.headerCard).offset(-kSpace4);
        make.top.equalTo(title.mas_bottom).offset(kSpace1);
        make.bottom.equalTo(self.headerCard).offset(-kSpace3);
    }];

    // ⚠️ 同 ABAccountCategoryViewController：label 的垂直 hugging 必须提到 required，
    // 否则 headerCard 高度歧义，会被拉伸去吸收剩余空间，把列表挤成一条。
    [title setContentHuggingPriority:UILayoutPriorityRequired forAxis:UILayoutConstraintAxisVertical];
    [hint setContentHuggingPriority:UILayoutPriorityRequired forAxis:UILayoutConstraintAxisVertical];

    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
    self.tableView.backgroundColor = [ABTheme bgCard];
    self.tableView.dataSource = self;
    self.tableView.delegate = self;
    self.tableView.rowHeight = 52;
    self.tableView.separatorColor = [ABTheme line];
    self.tableView.tableFooterView = [[UIView alloc] init];
    [self.tableView registerClass:UITableViewCell.class forCellReuseIdentifier:@"impCat"];
    [self.view addSubview:self.tableView];

    self.emptyView = [[ABEmptyView alloc] initWithText:@"没有可导入的分类"];
    self.emptyView.hidden = YES;
    [self.view addSubview:self.emptyView];

    // —— 底部提交栏 ——
    self.footer = [[UIView alloc] init];
    self.footer.backgroundColor = [ABTheme bgCard];
    [self.view addSubview:self.footer];

    UIView *footerLine = [[UIView alloc] init];
    footerLine.backgroundColor = [ABTheme line];
    [self.footer addSubview:footerLine];

    self.submitBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    self.submitBtn.backgroundColor = [ABTheme gold];
    self.submitBtn.layer.cornerRadius = kRadiusMd;
    [self.submitBtn setTitleColor:[ABTheme textInverse] forState:UIControlStateNormal];
    self.submitBtn.titleLabel.font = [UIFont systemFontOfSize:16 weight:UIFontWeightMedium];
    [self.submitBtn addTarget:self action:@selector(onSubmit) forControlEvents:UIControlEventTouchUpInside];
    [self.footer addSubview:self.submitBtn];

    [footerLine mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(self.footer);
        make.height.mas_equalTo(1);
    }];
    [self.submitBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.footer).offset(kSpace4);
        make.right.equalTo(self.footer).offset(-kSpace4);
        make.top.equalTo(self.footer).offset(kSpace3);
        make.height.mas_equalTo(48);
    }];

    [self.navBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.view.mas_safeAreaLayoutGuideTop);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(52);
    }];
    [self.headerCard mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.navBar.mas_bottom);
        make.left.right.equalTo(self.view);
    }];
    [self.tableView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.headerCard.mas_bottom);
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.footer.mas_top);
    }];
    [self.emptyView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.headerCard.mas_bottom);
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.footer.mas_top);
    }];
    [self.footer mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.view.mas_safeAreaLayoutGuideBottom);
        make.height.mas_equalTo(72);
    }];
}

- (void)updateFooter {
    NSInteger n = (NSInteger)self.picked.count;
    [self.submitBtn setTitle:[NSString stringWithFormat:@"导入 %ld 个分类", (long)n] forState:UIControlStateNormal];
    // 禁用态用**换色**而不是 opacity —— 白字压半透明金色会静默掉对比度
    self.submitBtn.enabled = (n > 0);
    self.submitBtn.backgroundColor = (n > 0) ? [ABTheme gold] : [ABTheme bgInset];
    [self.submitBtn setTitleColor:(n > 0 ? [ABTheme textInverse] : [ABTheme textDisabled]) forState:UIControlStateNormal];

    BOOL all = [self isAllSelected];
    [self.selectAllBtn setTitle:(all ? @"取消全选" : @"全选") forState:UIControlStateNormal];
}

#pragma mark - 数据

- (void)loadCandidates {
    if (self.loading) return;
    self.loading = YES;

    __weak typeof(self) weakSelf = self;
    dispatch_group_t group = dispatch_group_create();
    __block NSArray *rawCandidates = nil;
    __block NSArray<ABCategory *> *existing = nil;
    __block NSError *firstError = nil;

    dispatch_group_enter(group);
    [ABAccountService getCategoryCandidates:^(NSArray *list) {
        rawCandidates = list;
        dispatch_group_leave(group);
    } failure:^(NSError *error) {
        firstError = firstError ?: error;
        dispatch_group_leave(group);
    }];

    dispatch_group_enter(group);
    [ABCategoryService getCategories:[self accountIdOrCurrent]
                                type:nil
                            parentId:nil
                          visibility:nil
                             success:^(NSArray<ABCategory *> *list) {
        existing = list;
        dispatch_group_leave(group);
    } failure:^(NSError *error) {
        firstError = firstError ?: error;
        dispatch_group_leave(group);
    }];

    dispatch_group_notify(group, dispatch_get_main_queue(), ^{
        __strong typeof(weakSelf) self = weakSelf;
        self.loading = NO;

        if (firstError) {
            // 加载失败必须说清楚 —— 否则用户看到的是「没有可导入的分类」，
            // 一个网络错误会被误解成「母本本来就没分类」
            [self toast:[NSString stringWithFormat:@"候选分类加载失败：%@", firstError.localizedDescription ?: @"未知错误"]];
            return;
        }

        NSMutableSet<NSString *> *existingNames = [NSMutableSet set];
        for (ABCategory *c in existing) {
            if (c.name.length) [existingNames addObject:c.name];
        }

        NSMutableArray<ABCategory *> *kept = [NSMutableArray array];
        for (id item in rawCandidates) {
            if (![item isKindOfClass:NSDictionary.class]) continue;
            ABCategory *cat = [[ABCategory alloc] initWithDictionary:item];
            if ([existingNames containsObject:cat.name]) continue;   // 同名会被唯一键挡住
            [kept addObject:cat];
        }
        self.candidates = kept;

        // 默认全选
        [self.picked removeAllObjects];
        for (ABCategory *c in self.candidates) [self.picked addObject:c.categoryId];

        [self.tableView reloadData];
        self.emptyView.hidden = (self.candidates.count > 0);
        [self updateFooter];
    });
}

/// 收入一级在前、支出在后；段内按 sort（对齐 CategoryCheckTree.vue）
- (NSArray<ABCategory *> *)sortedRoots {
    NSMutableArray<ABCategory *> *income = [NSMutableArray array];
    NSMutableArray<ABCategory *> *expense = [NSMutableArray array];
    for (ABCategory *c in self.candidates) {
        if (![c isRoot]) continue;
        if ([c.type isEqualToString:@"income"]) [income addObject:c];
        else [expense addObject:c];
    }
    NSComparator bySort = ^NSComparisonResult(ABCategory *a, ABCategory *b) {
        if (a.sort < b.sort) return NSOrderedAscending;
        if (a.sort > b.sort) return NSOrderedDescending;
        return NSOrderedSame;
    };
    NSArray *inc = [income sortedArrayUsingComparator:bySort];
    NSArray *exp = [expense sortedArrayUsingComparator:bySort];
    return [inc arrayByAddingObjectsFromArray:exp];
}

- (NSArray<ABCategory *> *)childrenOf:(NSString *)parentId {
    NSMutableArray *arr = [NSMutableArray array];
    for (ABCategory *c in self.candidates) {
        if (c.parentId && [c.parentId isEqualToString:parentId]) [arr addObject:c];
    }
    return [arr sortedArrayUsingComparator:^NSComparisonResult(ABCategory *a, ABCategory *b) {
        if (a.sort < b.sort) return NSOrderedAscending;
        if (a.sort > b.sort) return NSOrderedDescending;
        return NSOrderedSame;
    }];
}

/// 屏幕上的行（一级 + 未折叠组的二级）
- (NSArray<ABCategory *> *)flatRows {
    NSMutableArray *arr = [NSMutableArray array];
    for (ABCategory *root in [self sortedRoots]) {
        [arr addObject:root];
        if (![self.collapsed containsObject:root.categoryId]) {
            [arr addObjectsFromArray:[self childrenOf:root.categoryId]];
        }
    }
    return arr;
}

#pragma mark - 勾选

- (BOOL)isAllSelected {
    return self.candidates.count > 0 && self.picked.count == self.candidates.count;
}

- (BOOL)isRootChecked:(ABCategory *)root {
    NSArray<ABCategory *> *kids = [self childrenOf:root.categoryId];
    if (!kids.count) return [self.picked containsObject:root.categoryId];
    for (ABCategory *k in kids) {
        if (![self.picked containsObject:k.categoryId]) return NO;
    }
    return YES;
}

- (BOOL)isRootIndeterminate:(ABCategory *)root {
    NSArray<ABCategory *> *kids = [self childrenOf:root.categoryId];
    if (!kids.count) return NO;
    NSInteger n = 0;
    for (ABCategory *k in kids) {
        if ([self.picked containsObject:k.categoryId]) n += 1;
    }
    return n > 0 && n < (NSInteger)kids.count;
}

- (void)toggleRoot:(ABCategory *)root {
    NSArray<ABCategory *> *kids = [self childrenOf:root.categoryId];
    NSArray<NSString *> *ids = kids.count ? [kids valueForKey:@"categoryId"] : @[root.categoryId];

    BOOL allIn = YES;
    for (NSString *i in ids) {
        if (![self.picked containsObject:i]) { allIn = NO; break; }
    }
    if (allIn) {
        for (NSString *i in ids) [self.picked removeObject:i];
        [self.picked removeObject:root.categoryId];
    } else {
        for (NSString *i in ids) [self.picked addObject:i];
        [self.picked addObject:root.categoryId];
    }
    [self normalizePicked];
}

- (void)toggleChild:(ABCategory *)child {
    if ([self.picked containsObject:child.categoryId]) {
        [self.picked removeObject:child.categoryId];
    } else {
        [self.picked addObject:child.categoryId];
    }
    [self normalizePicked];
}

/// 维持不变量：一级在 picked 里 ⟺ 它全部二级都在
- (void)normalizePicked {
    for (ABCategory *root in self.candidates) {
        if (![root isRoot]) continue;
        NSArray<ABCategory *> *kids = [self childrenOf:root.categoryId];
        if (!kids.count) continue;

        BOOL allIn = YES;
        for (ABCategory *k in kids) {
            if (![self.picked containsObject:k.categoryId]) { allIn = NO; break; }
        }
        if (allIn) [self.picked addObject:root.categoryId];
        else [self.picked removeObject:root.categoryId];
    }
    [self updateFooter];
    [self.tableView reloadData];
}

- (void)onToggleAll {
    if ([self isAllSelected]) {
        [self.picked removeAllObjects];
    } else {
        [self.picked removeAllObjects];
        for (ABCategory *c in self.candidates) [self.picked addObject:c.categoryId];
    }
    [self updateFooter];
    [self.tableView reloadData];
}

#pragma mark - 提交

- (void)onSubmit {
    if (!self.picked.count) return;
    NSArray<NSString *> *ids = [self.picked allObjects];
    __weak typeof(self) weakSelf = self;
    self.submitBtn.enabled = NO;

    [ABAccountService importCategories:[self accountIdOrCurrent]
                           categoryIds:ids
                               success:^(NSDictionary *dict) {
        __strong typeof(weakSelf) self = weakSelf;
        NSInteger imported = [dict[@"imported"] integerValue];
        [self toast:[NSString stringWithFormat:@"已导入 %ld 个", (long)imported] thenPop:YES];
    } failure:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        [self updateFooter];
        [self toast:[NSString stringWithFormat:@"导入失败：%@", error.localizedDescription ?: @"未知错误"] thenPop:NO];
    }];
}

- (void)toast:(NSString *)message thenPop:(BOOL)pop {
    UIAlertController *alert = [UIAlertController alertControllerWithTitle:nil
                                                                   message:message
                                                            preferredStyle:UIAlertControllerStyleAlert];
    __weak typeof(self) weakSelf = self;
    [alert addAction:[UIAlertAction actionWithTitle:@"好" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        if (pop) [weakSelf.navigationController popViewControllerAnimated:YES];
    }]];
    [self presentViewController:alert animated:YES completion:nil];
}

- (void)toast:(NSString *)message {
    [self toast:message thenPop:NO];
}

#pragma mark - UITableView

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return (NSInteger)[self flatRows].count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"impCat"];
    if (!cell) cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleDefault reuseIdentifier:@"impCat"];
    for (UIView *v in cell.contentView.subviews) [v removeFromSuperview];
    cell.selectionStyle = UITableViewCellSelectionStyleNone;
    cell.backgroundColor = [ABTheme bgCard];

    NSArray<ABCategory *> *rows = [self flatRows];
    if (indexPath.row >= (NSInteger)rows.count) return cell;

    ABCategory *cat = rows[indexPath.row];
    BOOL isRoot = [cat isRoot];
    CGFloat cursor = isRoot ? kSpace4 : 44.0;

    if (isRoot) {
        // 箭头：**只负责折叠**，点行才是勾选（两个动作不能混在一个手势里）
        UIButton *caret = [UIButton buttonWithType:UIButtonTypeSystem];
        BOOL expanded = ![self.collapsed containsObject:cat.categoryId];
        [caret setImage:[UIImage systemImageNamed:(expanded ? @"chevron.down" : @"chevron.right")] forState:UIControlStateNormal];
        caret.tintColor = [ABTheme textTertiary];
        caret.tag = indexPath.row;
        [caret addTarget:self action:@selector(onCaretTapped:) forControlEvents:UIControlEventTouchUpInside];
        [cell.contentView addSubview:caret];
        [caret mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(cell.contentView).offset(kSpace2);
            make.centerY.equalTo(cell.contentView);
            make.width.height.mas_equalTo(32);
        }];
    }

    ABIconView *icon = [[ABIconView alloc] initWithSize:isRoot ? 28 : 24];
    icon.iconKey = cat.icon;
    [cell.contentView addSubview:icon];

    UILabel *name = [[UILabel alloc] init];
    name.text = cat.name;
    name.font = isRoot ? [UIFont systemFontOfSize:16 weight:UIFontWeightMedium] : [ABTheme fontBody];
    name.textColor = [ABTheme textPrimary];
    name.numberOfLines = 0;
    name.lineBreakMode = NSLineBreakByCharWrapping;
    [cell.contentView addSubview:name];

    UIView *box = [self makeCheckboxFor:cat];
    [cell.contentView addSubview:box];

    [icon mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(cell.contentView).offset(cursor);
        make.centerY.equalTo(cell.contentView);
        make.width.height.mas_equalTo(isRoot ? 28 : 24);
    }];
    [box mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(cell.contentView).offset(-kSpace4);
        make.centerY.equalTo(cell.contentView);
        make.width.height.mas_equalTo(24);
    }];
    [name mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(icon.mas_right).offset(kSpace3);
        make.centerY.equalTo(cell.contentView);
        make.right.lessThanOrEqualTo(box.mas_left).offset(-kSpace2);
    }];

    return cell;
}

/// 三态勾选框：未选（空框）/ 半选（浅金底 + 金横线）/ 全选（金底 + 白勾）
- (UIView *)makeCheckboxFor:(ABCategory *)cat {
    BOOL checked = [cat isRoot] ? [self isRootChecked:cat] : [self.picked containsObject:cat.categoryId];
    BOOL indeterminate = [cat isRoot] ? [self isRootIndeterminate:cat] : NO;

    UIView *box = [[UIView alloc] init];
    box.layer.cornerRadius = kRadiusSm;
    box.layer.borderWidth = 1.5;
    box.layer.borderColor = (checked || indeterminate ? [ABTheme gold] : [ABTheme textDisabled]).CGColor;
    box.backgroundColor = checked ? [ABTheme gold] : (indeterminate ? [ABTheme goldSoft] : [UIColor clearColor]);

    if (checked) {
        UIImageView *check = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"checkmark"]];
        check.tintColor = [ABTheme textInverse];
        [box addSubview:check];
        [check mas_makeConstraints:^(MASConstraintMaker *make) {
            make.center.equalTo(box);
            make.width.height.mas_equalTo(14);
        }];
    } else if (indeterminate) {
        UIView *dash = [[UIView alloc] init];
        dash.backgroundColor = [ABTheme gold];
        dash.layer.cornerRadius = 1;
        [box addSubview:dash];
        [dash mas_makeConstraints:^(MASConstraintMaker *make) {
            make.center.equalTo(box);
            make.width.mas_equalTo(12);
            make.height.mas_equalTo(2);
        }];
    }
    return box;
}

- (void)onCaretTapped:(UIButton *)sender {
    NSArray<ABCategory *> *rows = [self flatRows];
    if (sender.tag < 0 || sender.tag >= (NSInteger)rows.count) return;
    ABCategory *root = rows[sender.tag];
    if ([self.collapsed containsObject:root.categoryId]) {
        [self.collapsed removeObject:root.categoryId];
    } else {
        [self.collapsed addObject:root.categoryId];
    }
    [self.tableView reloadData];
}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
    [tableView deselectRowAtIndexPath:indexPath animated:YES];
    NSArray<ABCategory *> *rows = [self flatRows];
    if (indexPath.row >= (NSInteger)rows.count) return;

    ABCategory *cat = rows[indexPath.row];
    if ([cat isRoot]) {
        [self toggleRoot:cat];
    } else {
        [self toggleChild:cat];
    }
}

@end
