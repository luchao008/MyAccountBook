//
//  ABCategoryViewController.m
//  MyAccountBook
//
//  分类管理页 —— 对齐 frontend/src/pages/category/index.vue
//  分组树（一级可展开/收起 + 二级 + 每行编辑铅笔 + 新建二级分类）+ 底部操作栏。
//

#import "ABCategoryViewController.h"
#import "ABTheme.h"
#import "ABCategoryService.h"
#import "ABAccountStore.h"
#import "ABCategoryNewViewController.h"
#import "ABIconView.h"
#import "ABEmptyView.h"
#import <Masonry/Masonry.h>

@interface ABCategoryViewController () <UITableViewDataSource, UITableViewDelegate>

@property (nonatomic, strong) UILabel *navTitle;
@property (nonatomic, strong) UIButton *backBtn;
@property (nonatomic, strong) UIButton *searchBtn;
@property (nonatomic, strong) UITableView *tableView;
@property (nonatomic, strong) UIView *toolbar;
@property (nonatomic, strong) ABEmptyView *emptyView;

@property (nonatomic, strong) NSArray<ABCategory *> *list;      // 全量分类
@property (nonatomic, strong) NSMutableArray<ABCategory *> *roots;   // 一级分类
@property (nonatomic, strong) NSMutableSet<NSString *> *expanded;    // 展开的一级 id
@property (nonatomic, copy) NSString *currentType;

@end

@implementation ABCategoryViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    self.currentType = @"expense";
    self.expanded = [NSMutableSet set];
    [self setupViews];
    [self loadData];
}

- (void)setupViews {
    UIView *navBar = [[UIView alloc] init];
    navBar.backgroundColor = [ABTheme bgPage];
    [self.view addSubview:navBar];

    self.backBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.backBtn setImage:[UIImage systemImageNamed:@"chevron.left"] forState:UIControlStateNormal];
    self.backBtn.tintColor = [ABTheme textPrimary];
    [self.backBtn addTarget:self action:@selector(onBack) forControlEvents:UIControlEventTouchUpInside];
    [navBar addSubview:self.backBtn];

    self.navTitle = [[UILabel alloc] init];
    self.navTitle.text = @"支出分类管理";
    self.navTitle.font = [ABTheme fontH2];
    self.navTitle.textColor = [ABTheme textPrimary];
    self.navTitle.textAlignment = NSTextAlignmentCenter;
    [navBar addSubview:self.navTitle];

    self.searchBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.searchBtn setImage:[UIImage systemImageNamed:@"magnifyingglass"] forState:UIControlStateNormal];
    self.searchBtn.tintColor = [ABTheme textPrimary];
    [self.searchBtn addTarget:self action:@selector(onSearch) forControlEvents:UIControlEventTouchUpInside];
    [navBar addSubview:self.searchBtn];

    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
    self.tableView.backgroundColor = [ABTheme bgPage];
    self.tableView.dataSource = self;
    self.tableView.delegate = self;
    self.tableView.separatorColor = [ABTheme line];
    self.tableView.tableFooterView = [[UIView alloc] init];
    [self.tableView registerClass:UITableViewCell.class forCellReuseIdentifier:@"cat"];
    [self.view addSubview:self.tableView];

    // 底部操作栏
    self.toolbar = [[UIView alloc] init];
    self.toolbar.backgroundColor = [ABTheme bgCard];
    [self.view addSubview:self.toolbar];

    UIView *topLine = [[UIView alloc] init];
    topLine.backgroundColor = [ABTheme line];
    [self.toolbar addSubview:topLine];

    UIButton *sortBtn = [self makeToolButton:@"排序" icon:@"arrow.up.arrow.down" action:@selector(onSort)];
    UIButton *batchBtn = [self makeToolButton:@"批量操作" icon:@"checklist" action:@selector(onBatch)];
    UIButton *newBtn = [self makeToolButton:@"新建分类" icon:@"plus" action:@selector(onNewRoot)];
    [self.toolbar addSubview:sortBtn];
    [self.toolbar addSubview:batchBtn];
    [self.toolbar addSubview:newBtn];

    [navBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(self.view);
        make.bottom.equalTo(self.view.mas_safeAreaLayoutGuideTop).offset(44);
    }];
    [self.backBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(navBar).offset(8);
        make.bottom.equalTo(navBar).offset(-4);
        make.width.height.mas_equalTo(40);
    }];
    [self.navTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.centerX.equalTo(navBar);
        make.centerY.equalTo(self.backBtn);
    }];
    [self.searchBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(navBar).offset(-8);
        make.centerY.equalTo(self.backBtn);
        make.width.height.mas_equalTo(40);
    }];

    [self.toolbar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.right.bottom.equalTo(self.view);
        make.height.mas_equalTo(64);
    }];
    [topLine mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(self.toolbar);
        make.height.mas_equalTo(1);
    }];
    [sortBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.toolbar);
        make.top.equalTo(self.toolbar).offset(6);
        make.width.equalTo(self.toolbar).multipliedBy(0.333);
        make.height.mas_equalTo(52);
    }];
    [batchBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(sortBtn.mas_right);
        make.top.width.height.equalTo(sortBtn);
    }];
    [newBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(batchBtn.mas_right);
        make.top.width.height.equalTo(sortBtn);
    }];

    [self.tableView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(navBar.mas_bottom);
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.toolbar.mas_top);
    }];
}

- (void)viewSafeAreaInsetsDidChange {
    [super viewSafeAreaInsetsDidChange];
    CGFloat bottom = self.view.safeAreaInsets.bottom;
    [self.toolbar mas_updateConstraints:^(MASConstraintMaker *make) {
        make.height.mas_equalTo(64 + bottom);
    }];
}

- (UIButton *)makeToolButton:(NSString *)title icon:(NSString *)icon action:(SEL)action {
    UIButton *btn = [UIButton buttonWithType:UIButtonTypeSystem];
    [btn setTitle:title forState:UIControlStateNormal];
    [btn setImage:[UIImage systemImageNamed:icon] forState:UIControlStateNormal];
    btn.tintColor = [ABTheme textPrimary];
    [btn setTitleColor:[ABTheme textSecondary] forState:UIControlStateNormal];
    btn.titleLabel.font = [ABTheme fontCaption];
    btn.imageEdgeInsets = UIEdgeInsetsMake(-14, 0, 0, -btn.titleLabel.intrinsicContentSize.width);
    btn.titleEdgeInsets = UIEdgeInsetsMake(20, -btn.currentImage.size.width, -20, 0);
    [btn addTarget:self action:action forControlEvents:UIControlEventTouchUpInside];
    return btn;
}

#pragma mark - 数据

- (void)loadData {
    NSString *accountId = [ABAccountStore shared].currentId ?: @"";
    __weak typeof(self) weakSelf = self;
    [ABCategoryService getCategories:accountId type:self.currentType parentId:nil visibility:@"all"
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
        if (c.isRoot) [self.roots addObject:c];
    }
    // 默认展开全部一级（对齐前端）
    for (ABCategory *r in self.roots) {
        [self.expanded addObject:r.categoryId];
    }
    [self.tableView reloadData];
}

- (NSArray<ABCategory *> *)childrenOf:(NSString *)parentId {
    NSMutableArray *arr = [NSMutableArray array];
    for (ABCategory *c in self.list) {
        if ([c.parentId isEqualToString:parentId]) [arr addObject:c];
    }
    return arr;
}

#pragma mark - Actions

- (void)onBack { [self.navigationController popViewControllerAnimated:YES]; }

- (void)onSearch {
    UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"搜索分类" message:nil preferredStyle:UIAlertControllerStyleAlert];
    [alert addTextFieldWithConfigurationHandler:^(UITextField *tf) { tf.placeholder = @"分类名"; }];
    [alert addAction:[UIAlertAction actionWithTitle:@"确定" style:UIAlertActionStyleDefault handler:nil]];
    [self presentViewController:alert animated:YES completion:nil];
}

- (void)onSort {
    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:@"排序" message:nil preferredStyle:UIAlertControllerStyleActionSheet];
    [sheet addAction:[UIAlertAction actionWithTitle:@"进入排序模式" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        [self.tableView setEditing:YES animated:YES];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    sheet.popoverPresentationController.sourceView = self.view;
    sheet.popoverPresentationController.sourceRect = self.view.bounds;
    [self presentViewController:sheet animated:YES completion:nil];
}

- (void)onBatch {
    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:@"批量操作" message:nil preferredStyle:UIAlertControllerStyleActionSheet];
    [sheet addAction:[UIAlertAction actionWithTitle:@"批量隐藏" style:UIAlertActionStyleDefault handler:nil]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"批量删除" style:UIAlertActionStyleDestructive handler:nil]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    sheet.popoverPresentationController.sourceView = self.view;
    sheet.popoverPresentationController.sourceRect = self.view.bounds;
    [self presentViewController:sheet animated:YES completion:nil];
}

- (void)onNewRoot {
    ABCategoryNewViewController *vc = [[ABCategoryNewViewController alloc] initWithCategory:nil type:self.currentType parentId:nil];
    __weak typeof(self) weakSelf = self;
    vc.onSaved = ^{
        __strong typeof(weakSelf) self = weakSelf;
        [self loadData];
    };
    [self.navigationController pushViewController:vc animated:YES];
}

- (void)onNewChild:(UIButton *)sender {
    ABCategory *parent = self.roots[sender.tag];
    ABCategoryNewViewController *vc = [[ABCategoryNewViewController alloc] initWithCategory:nil type:self.currentType parentId:parent.categoryId];
    __weak typeof(self) weakSelf = self;
    vc.onSaved = ^{
        __strong typeof(weakSelf) self = weakSelf;
        [self loadData];
    };
    [self.navigationController pushViewController:vc animated:YES];
}

- (void)onEditCategory:(UIButton *)sender {
    ABCategory *cat = self.list[sender.tag];
    ABCategoryNewViewController *vc = [[ABCategoryNewViewController alloc] initWithCategory:cat type:self.currentType parentId:cat.parentId];
    __weak typeof(self) weakSelf = self;
    vc.onSaved = ^{
        __strong typeof(weakSelf) self = weakSelf;
        [self loadData];
    };
    [self.navigationController pushViewController:vc animated:YES];
}

#pragma mark - UITableView

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView {
    return self.roots.count;
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    ABCategory *root = self.roots[section];
    if (![self.expanded containsObject:root.categoryId]) return 1;

    NSArray *children = [self childrenOf:root.categoryId];
    return 1 + children.count + 1;  // 一级 + 二级们 + 「新建二级分类」
}

- (CGFloat)tableView:(UITableView *)tableView heightForRowAtIndexPath:(NSIndexPath *)indexPath {
    if (indexPath.row == 0) return 56;
    ABCategory *root = self.roots[indexPath.section];
    NSArray *children = [self childrenOf:root.categoryId];
    if (indexPath.row == (NSInteger)children.count + 1) return 48;
    return 56;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"cat"];
    if (!cell) cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleDefault reuseIdentifier:@"cat"];
    for (UIView *v in cell.contentView.subviews) { [v removeFromSuperview]; }
    cell.selectionStyle = UITableViewCellSelectionStyleNone;
    cell.backgroundColor = [ABTheme bgCard];

    ABCategory *root = self.roots[indexPath.section];

    if (indexPath.row == 0) {
        // 一级分类
        UIButton *arrow = [UIButton buttonWithType:UIButtonTypeSystem];
        BOOL expanded = [self.expanded containsObject:root.categoryId];
        [arrow setImage:[UIImage systemImageNamed:(expanded ? @"chevron.up" : @"chevron.down")] forState:UIControlStateNormal];
        arrow.tintColor = [ABTheme textTertiary];
        arrow.tag = indexPath.section;
        [arrow addTarget:self action:@selector(onToggleSection:) forControlEvents:UIControlEventTouchUpInside];
        [cell.contentView addSubview:arrow];

        ABIconView *icon = [[ABIconView alloc] initWithSize:28];
        icon.iconKey = root.icon;
        [cell.contentView addSubview:icon];

        UILabel *name = [[UILabel alloc] init];
        name.text = root.name;
        name.font = [UIFont systemFontOfSize:17 weight:UIFontWeightMedium];
        name.textColor = [ABTheme textPrimary];
        [cell.contentView addSubview:name];

        UIButton *edit = [UIButton buttonWithType:UIButtonTypeSystem];
        [edit setImage:[UIImage systemImageNamed:@"pencil"] forState:UIControlStateNormal];
        edit.tintColor = [ABTheme textTertiary];
        edit.tag = [self.list indexOfObject:root];
        [edit addTarget:self action:@selector(onEditCategory:) forControlEvents:UIControlEventTouchUpInside];
        [cell.contentView addSubview:edit];

        [arrow mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(cell.contentView).offset(12);
            make.centerY.equalTo(cell.contentView);
            make.width.height.mas_equalTo(20);
        }];
        [icon mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(arrow.mas_right).offset(8);
            make.centerY.equalTo(cell.contentView);
            make.width.height.mas_equalTo(28);
        }];
        [name mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(icon.mas_right).offset(12);
            make.centerY.equalTo(cell.contentView);
        }];
        [edit mas_makeConstraints:^(MASConstraintMaker *make) {
            make.right.equalTo(cell.contentView).offset(-16);
            make.centerY.equalTo(cell.contentView);
            make.width.height.mas_equalTo(24);
        }];
    } else {
        NSArray *children = [self childrenOf:root.categoryId];
        if (indexPath.row == (NSInteger)children.count + 1) {
            // 「+ 新建二级分类」
            UILabel *add = [[UILabel alloc] init];
            add.text = @"+  新建二级分类";
            add.font = [ABTheme fontBody];
            add.textColor = [ABTheme gold];
            add.textAlignment = NSTextAlignmentCenter;
            add.userInteractionEnabled = YES;
            UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(onNewChildTap:)];
            [add addGestureRecognizer:tap];
            add.tag = indexPath.section;
            [cell.contentView addSubview:add];
            [add mas_makeConstraints:^(MASConstraintMaker *make) {
                make.edges.equalTo(cell.contentView);
            }];
        } else {
            ABCategory *child = children[indexPath.row - 1];
            ABIconView *icon = [[ABIconView alloc] initWithSize:26];
            icon.iconKey = child.icon;
            [cell.contentView addSubview:icon];

            UILabel *name = [[UILabel alloc] init];
            name.text = child.name;
            name.font = [ABTheme fontBody];
            name.textColor = [ABTheme textPrimary];
            [cell.contentView addSubview:name];

            UIButton *edit = [UIButton buttonWithType:UIButtonTypeSystem];
            [edit setImage:[UIImage systemImageNamed:@"pencil"] forState:UIControlStateNormal];
            edit.tintColor = [ABTheme textTertiary];
            edit.tag = [self.list indexOfObject:child];
            [edit addTarget:self action:@selector(onEditCategory:) forControlEvents:UIControlEventTouchUpInside];
            [cell.contentView addSubview:edit];

            [icon mas_makeConstraints:^(MASConstraintMaker *make) {
                make.left.equalTo(cell.contentView).offset(60);
                make.centerY.equalTo(cell.contentView);
                make.width.height.mas_equalTo(26);
            }];
            [name mas_makeConstraints:^(MASConstraintMaker *make) {
                make.left.equalTo(icon.mas_right).offset(12);
                make.centerY.equalTo(cell.contentView);
            }];
            [edit mas_makeConstraints:^(MASConstraintMaker *make) {
                make.right.equalTo(cell.contentView).offset(-16);
                make.centerY.equalTo(cell.contentView);
                make.width.height.mas_equalTo(24);
            }];
        }
    }

    return cell;
}

- (void)onToggleSection:(UIButton *)sender {
    ABCategory *root = self.roots[sender.tag];
    if ([self.expanded containsObject:root.categoryId]) {
        [self.expanded removeObject:root.categoryId];
    } else {
        [self.expanded addObject:root.categoryId];
    }
    [self.tableView reloadSections:[NSIndexSet indexSetWithIndex:sender.tag] withRowAnimation:UITableViewRowAnimationAutomatic];
}

- (void)onNewChildTap:(UITapGestureRecognizer *)gesture {
    NSInteger section = gesture.view.tag;
    ABCategory *parent = self.roots[section];
    ABCategoryNewViewController *vc = [[ABCategoryNewViewController alloc] initWithCategory:nil type:self.currentType parentId:parent.categoryId];
    __weak typeof(self) weakSelf = self;
    vc.onSaved = ^{
        __strong typeof(weakSelf) self = weakSelf;
        [self loadData];
    };
    [self.navigationController pushViewController:vc animated:YES];
}

@end
