//
//  ABAccountCategoryViewController.m
//  MyAccountBook
//
//  账本分类设置页 —— 对齐 frontend/src/pages/account-category/index.vue
//
//    · 展示本账本的分类（一级 + 二级）
//    · 「从母本导入」进入 ABAccountImportViewController（复用勾选树）
//    · 「移除」调用删除接口；默认账本是分类母本，禁删（只能改名 / 隐藏）
//
//  ⚠️ 分类接口按 accountId 取数，不依赖「当前账本」——
//     所以本页不需要像前端那样临时切换 currentId，
//     看 A 账本的分类设置不会把当前账本改成 A。
//

#import "ABAccountCategoryViewController.h"
#import "ABTheme.h"
#import "ABCategoryService.h"
#import "ABAccountStore.h"
#import "ABAccountImportViewController.h"
#import "ABNavigationBar.h"
#import "ABIconView.h"
#import "ABEmptyView.h"
#import <Masonry/Masonry.h>

@interface ABAccountCategoryViewController () <UITableViewDataSource, UITableViewDelegate>

@property (nonatomic, copy) NSString *accountId;

@property (nonatomic, strong) ABNavigationBar *navBar;
@property (nonatomic, strong) UIView *headerCard;
@property (nonatomic, strong) UILabel *headerHint;
@property (nonatomic, strong) UIButton *importBtn;
@property (nonatomic, strong) UITableView *tableView;
@property (nonatomic, strong) ABEmptyView *emptyView;
@property (nonatomic, strong) UIView *noticeBar;

@property (nonatomic, strong) NSArray<ABCategory *> *list;
@property (nonatomic, strong) NSMutableArray<ABCategory *> *roots;
@property (nonatomic, assign) NSInteger childRowCount;

@end

@implementation ABAccountCategoryViewController

- (instancetype)initWithAccountId:(NSString *)accountId {
    self = [super init];
    if (self) {
        _accountId = [accountId copy];
        _roots = [NSMutableArray array];
    }
    return self;
}

/// 兜底：没走 initWithAccountId: 时（例如 `[[X alloc] init]`）用当前账本，
/// 并且**必须把 roots 初始化**——否则它是 nil，addObject 变成静默 no-op，
/// 页面会一直显示空状态，而列表数据其实早就回来了
- (instancetype)init {
    return [self initWithAccountId:[ABAccountStore shared].currentId ?: @""];
}

- (NSString *)accountIdOrCurrent {
    return self.accountId.length ? self.accountId : ([ABAccountStore shared].currentId ?: @"");
}

/// 默认账本是分类母本 —— 它的分类不能移除（对齐前端 isDefaultAccount）
- (BOOL)isDefaultAccount {
    NSString *aid = [self accountIdOrCurrent];
    for (ABAccount *a in [ABAccountStore shared].list) {
        if ([a.accountId isEqualToString:aid]) return a.isDefault;
    }
    return NO;
}

#pragma mark - 生命周期

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    [self setupViews];
    [self loadData];
}

- (void)viewWillAppear:(BOOL)animated {
    [super viewWillAppear:animated];
    // 从导入页返回后要刷新（导入会改变本账本的分类）
    [self loadData];
}

#pragma mark - 视图

- (void)setupViews {
    self.navBar = [[ABNavigationBar alloc] init];
    [self.navBar setTitle:@"账本分类"];
    __weak typeof(self) weakSelf = self;
    self.navBar.onBack = ^{
        [weakSelf.navigationController popViewControllerAnimated:YES];
    };
    [self.view addSubview:self.navBar];

    // —— 头部卡片：标题 + 「从母本导入」+ 数量说明 ——
    self.headerCard = [[UIView alloc] init];
    self.headerCard.backgroundColor = [ABTheme bgCard];
    [self.view addSubview:self.headerCard];

    UILabel *title = [[UILabel alloc] init];
    title.text = @"本账本的分类";
    title.font = [UIFont systemFontOfSize:15 weight:UIFontWeightMedium];
    title.textColor = [ABTheme textPrimary];
    [self.headerCard addSubview:title];

    self.importBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.importBtn setTitle:@"从母本导入" forState:UIControlStateNormal];
    [self.importBtn setTitleColor:[ABTheme gold] forState:UIControlStateNormal];
    self.importBtn.titleLabel.font = [ABTheme fontBodySm];
    [self.importBtn addTarget:self action:@selector(onImport) forControlEvents:UIControlEventTouchUpInside];
    [self.headerCard addSubview:self.importBtn];

    self.headerHint = [[UILabel alloc] init];
    self.headerHint.font = [ABTheme fontCaption];
    self.headerHint.textColor = [ABTheme textSecondary];
    self.headerHint.numberOfLines = 0;
    [self.headerCard addSubview:self.headerHint];

    [title mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.headerCard).offset(kSpace4);
        make.top.equalTo(self.headerCard).offset(kSpace4);
    }];
    [self.importBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(self.headerCard).offset(-kSpace4);
        make.centerY.equalTo(title);
        make.height.mas_equalTo(44);
        make.width.mas_equalTo(96);
    }];
    [self.headerHint mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.headerCard).offset(kSpace4);
        make.right.equalTo(self.headerCard).offset(-kSpace4);
        make.top.equalTo(title.mas_bottom).offset(kSpace1);
        make.bottom.equalTo(self.headerCard).offset(-kSpace3);
    }];

    // ⚠️ 必须把 title / hint 的**垂直** hugging 提到 required。
    // 否则 headerCard 的高度是「歧义」的：约束链只给出了上下界，求解器仍有自由度
    // （UILabel 的 intrinsic 高度只是 251 优先级的软约束），
    // 实测它会把 headerCard 拉成 582pt 去吸收空间，把 tableView 挤到只剩 79pt。
    // 判据：`_autolayoutTrace` 报 "AMBIGUOUS LAYOUT for UIView.Height"。
    [title setContentHuggingPriority:UILayoutPriorityRequired forAxis:UILayoutConstraintAxisVertical];
    [self.headerHint setContentHuggingPriority:UILayoutPriorityRequired forAxis:UILayoutConstraintAxisVertical];

    // —— 列表 ——
    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
    self.tableView.backgroundColor = [ABTheme bgPage];
    self.tableView.dataSource = self;
    self.tableView.delegate = self;
    self.tableView.rowHeight = 52;
    self.tableView.separatorColor = [ABTheme line];
    self.tableView.tableFooterView = [[UIView alloc] init];
    [self.tableView registerClass:UITableViewCell.class forCellReuseIdentifier:@"accCat"];
    [self.view addSubview:self.tableView];

    self.emptyView = [[ABEmptyView alloc] initWithText:@"本账本还没有分类"];
    self.emptyView.hidden = YES;
    [self.view addSubview:self.emptyView];

    // —— 底部提示条：仅默认账本显示 ——
    self.noticeBar = [[UIView alloc] init];
    self.noticeBar.backgroundColor = [ABTheme bgInset];
    self.noticeBar.hidden = YES;
    [self.view addSubview:self.noticeBar];

    UILabel *notice = [[UILabel alloc] init];
    notice.text = @"默认账本是分类母本，其分类不可移除（只可改名 / 隐藏）。";
    notice.font = [ABTheme fontCaption];
    notice.textColor = [ABTheme textSecondary];
    notice.numberOfLines = 0;
    [self.noticeBar addSubview:notice];
    [notice mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.noticeBar).offset(kSpace4);
        make.right.equalTo(self.noticeBar).offset(-kSpace4);
        make.top.equalTo(self.noticeBar).offset(kSpace3);
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
        make.top.equalTo(self.headerCard.mas_bottom).offset(kSpace2);
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.noticeBar.mas_top);
    }];
    [self.emptyView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.headerCard.mas_bottom);
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.noticeBar.mas_top);
    }];
    [self.noticeBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.view.mas_safeAreaLayoutGuideBottom);
    }];
}

- (void)updateNoticeBar {
    BOOL isDefault = [self isDefaultAccount];
    self.noticeBar.hidden = !isDefault;
    if (isDefault) {
        [self.noticeBar mas_updateConstraints:^(MASConstraintMaker *make) {
            make.height.mas_equalTo(56);
        }];
    } else {
        [self.noticeBar mas_updateConstraints:^(MASConstraintMaker *make) {
            make.height.mas_equalTo(0);
        }];
    }
}

#pragma mark - 数据

- (void)loadData {
    NSString *aid = [self accountIdOrCurrent];
    if (!aid.length) return;

    __weak typeof(self) weakSelf = self;
    // type 传 nil = 不按收支过滤（本页展示这个账本的全部分类）
    [ABCategoryService getCategories:aid
                                type:nil
                            parentId:nil
                          visibility:@"all"
                             success:^(NSArray<ABCategory *> *list) {
        __strong typeof(weakSelf) self = weakSelf;
        self.list = list;
        [self rebuildTree];
    } failure:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        NSLog(@"[account-category] 加载失败: %@", error.localizedDescription);
        [self toast:[NSString stringWithFormat:@"分类加载失败：%@", error.localizedDescription ?: @"未知错误"]];
    }];
}

- (void)rebuildTree {
    [self.roots removeAllObjects];
    for (ABCategory *c in self.list) {
        if ([c isRoot]) [self.roots addObject:c];
    }
    self.headerHint.text = [NSString stringWithFormat:@"共 %lu 个分类。移除的分类若已有交易会被拒绝。",
                            (unsigned long)self.list.count];
    [self updateNoticeBar];
    [self.tableView reloadData];
    self.emptyView.hidden = (self.roots.count > 0);
}

- (NSArray<ABCategory *> *)childrenOf:(NSString *)parentId {
    NSMutableArray *arr = [NSMutableArray array];
    for (ABCategory *c in self.list) {
        if (c.parentId && [c.parentId isEqualToString:parentId]) [arr addObject:c];
    }
    return arr;
}

#pragma mark - Actions

- (void)onImport {
    ABAccountImportViewController *vc = [[ABAccountImportViewController alloc] initWithAccountId:[self accountIdOrCurrent]];
    [self.navigationController pushViewController:vc animated:YES];
}

- (void)onRemove:(ABCategory *)cat {
    __weak typeof(self) weakSelf = self;
    UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"移除分类"
                                                                  message:[NSString stringWithFormat:@"确定要从本账本移除「%@」吗？", cat.name]
                                                           preferredStyle:UIAlertControllerStyleAlert];
    [alert addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    [alert addAction:[UIAlertAction actionWithTitle:@"移除" style:UIAlertActionStyleDestructive handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        [self performRemove:cat];
    }]];
    [self presentViewController:alert animated:YES completion:nil];
}

- (void)performRemove:(ABCategory *)cat {
    __weak typeof(self) weakSelf = self;
    [ABCategoryService deleteCategory:[self accountIdOrCurrent]
                                   id:cat.categoryId
                              success:^(NSDictionary *dict) {
        __strong typeof(weakSelf) self = weakSelf;
        [self toast:@"已移除"];
        [self loadData];
    } failure:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        // 后端会因为「该分类下已有交易」拒绝 —— 必须把真实原因说出来，
        // 不能用一句笼统的「移除失败」把 40010 之类的具体原因盖掉
        NSString *reason = error.localizedDescription.length ? error.localizedDescription : @"未知错误";
        [self toast:[NSString stringWithFormat:@"移除失败：%@", reason]];
    }];
}

- (void)toast:(NSString *)message {
    UIAlertController *alert = [UIAlertController alertControllerWithTitle:nil
                                                                   message:message
                                                            preferredStyle:UIAlertControllerStyleAlert];
    [alert addAction:[UIAlertAction actionWithTitle:@"好" style:UIAlertActionStyleDefault handler:nil]];
    [self presentViewController:alert animated:YES completion:nil];
}

#pragma mark - UITableView

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView {
    return (NSInteger)self.roots.count;
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    if (section >= (NSInteger)self.roots.count) return 0;
    ABCategory *root = self.roots[section];
    return 1 + (NSInteger)[self childrenOf:root.categoryId].count;
}

/// 组间 8pt 槽（对齐前端 .group + .group 的分隔）
- (CGFloat)tableView:(UITableView *)tableView heightForHeaderInSection:(NSInteger)section {
    return section == 0 ? 0 : kSpace2;
}

- (UIView *)tableView:(UITableView *)tableView viewForHeaderInSection:(NSInteger)section {
    UIView *v = [[UIView alloc] init];
    v.backgroundColor = [ABTheme bgInset];
    return v;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"accCat"];
    if (!cell) cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleDefault reuseIdentifier:@"accCat"];
    for (UIView *v in cell.contentView.subviews) [v removeFromSuperview];
    cell.selectionStyle = UITableViewCellSelectionStyleNone;
    cell.backgroundColor = [ABTheme bgCard];

    // 分组结构：section = 一级分类，行 0 = 它自己，行 1..n = 它的二级
    if (indexPath.section >= (NSInteger)self.roots.count) return cell;
    ABCategory *cat = nil;
    if (indexPath.row == 0) {
        cat = self.roots[indexPath.section];
    } else {
        NSArray<ABCategory *> *kids = [self childrenOf:self.roots[indexPath.section].categoryId];
        if (indexPath.row - 1 >= (NSInteger)kids.count) return cell;
        cat = kids[indexPath.row - 1];
    }
    BOOL isRoot = [cat isRoot];

    ABIconView *icon = [[ABIconView alloc] initWithSize:isRoot ? 24 : 20];
    icon.iconKey = cat.icon;
    [cell.contentView addSubview:icon];

    UILabel *name = [[UILabel alloc] init];
    name.text = cat.name;
    name.font = [ABTheme fontBody];
    name.textColor = [ABTheme textPrimary];
    name.numberOfLines = 0;
    name.lineBreakMode = NSLineBreakByCharWrapping;
    [cell.contentView addSubview:name];

    UIView *sep = [[UIView alloc] init];
    sep.backgroundColor = [ABTheme line];
    [cell.contentView addSubview:sep];

    [icon mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(cell.contentView).offset(isRoot ? kSpace4 : 44);
        make.centerY.equalTo(cell.contentView);
        make.width.height.mas_equalTo(isRoot ? 24 : 20);
    }];
    [sep mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(cell.contentView).offset(kSpace4);
        make.right.bottom.equalTo(cell.contentView);
        make.height.mas_equalTo(1.0 / UIScreen.mainScreen.scale);
    }];

    // 「移除」：默认账本没有（它是母本，分类只可改名 / 隐藏）
    if (![self isDefaultAccount]) {
        UIButton *remove = [UIButton buttonWithType:UIButtonTypeSystem];
        [remove setTitle:@"移除" forState:UIControlStateNormal];
        [remove setTitleColor:[ABTheme danger] forState:UIControlStateNormal];
        remove.titleLabel.font = [ABTheme fontBodySm];
        remove.tag = [self.list indexOfObject:cat];
        [remove addTarget:self action:@selector(onRemoveTapped:) forControlEvents:UIControlEventTouchUpInside];
        [cell.contentView addSubview:remove];
        [remove mas_makeConstraints:^(MASConstraintMaker *make) {
            make.right.equalTo(cell.contentView).offset(-kSpace4);
            make.centerY.equalTo(cell.contentView);
            make.height.mas_equalTo(44);
            make.width.mas_equalTo(56);
        }];
        [name mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(icon.mas_right).offset(kSpace3);
            make.centerY.equalTo(cell.contentView);
            make.right.lessThanOrEqualTo(remove.mas_left).offset(-kSpace2);
        }];
    } else {
        [name mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(icon.mas_right).offset(kSpace3);
            make.centerY.equalTo(cell.contentView);
            make.right.lessThanOrEqualTo(cell.contentView).offset(-kSpace4);
        }];
    }

    return cell;
}

- (void)onRemoveTapped:(UIButton *)sender {
    if (sender.tag < 0 || sender.tag >= (NSInteger)self.list.count) return;
    [self onRemove:self.list[sender.tag]];
}

@end
