//
//  ABCategoryMultiSelectViewController.m
//  MyAccountBook
//

#import "ABCategoryMultiSelectViewController.h"
#import "ABCategoryService.h"
#import "ABCategorySelection.h"
#import "ABAccountStore.h"
#import "ABNavigationBar.h"
#import "ABIconView.h"
#import "ABTheme.h"
#import <Masonry/Masonry.h>

#pragma mark - 勾选框

/// 圆形勾选框 —— 对齐前端 `.checkbox`（20pt 圆，1.5pt 边框）
///   · 未选：透明底 + 灰描边
///   · 选中：金色实底 + 白色对勾
///   · 半选：浅金底 + 金描边 + 金横线
@interface ABCheckboxView : UIView
@property (nonatomic, assign) NSInteger state;   // 0 未选 / 1 选中 / 2 半选
@end

@implementation ABCheckboxView {
    UIImageView *_mark;
    UIView *_dash;
}

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        self.layer.cornerRadius = 10;
        self.layer.borderWidth = 1.5;
        self.userInteractionEnabled = NO;

        UIImageSymbolConfiguration *cfg = [UIImageSymbolConfiguration configurationWithPointSize:11
                                                                                        weight:UIFontWeightBold];
        _mark = [[UIImageView alloc] init];
        _mark.contentMode = UIViewContentModeScaleAspectFit;
        _mark.image = [UIImage systemImageNamed:@"checkmark" withConfiguration:cfg];
        _mark.tintColor = [ABTheme textInverse];
        [self addSubview:_mark];
        [_mark mas_makeConstraints:^(MASConstraintMaker *make) {
            make.center.equalTo(self);
            make.width.height.mas_equalTo(12);
        }];

        _dash = [[UIView alloc] init];
        _dash.layer.cornerRadius = 1;
        _dash.backgroundColor = [ABTheme gold];
        [self addSubview:_dash];
        [_dash mas_makeConstraints:^(MASConstraintMaker *make) {
            make.center.equalTo(self);
            make.width.mas_equalTo(10);
            make.height.mas_equalTo(2);
        }];

        [self mas_makeConstraints:^(MASConstraintMaker *make) {
            make.width.height.mas_equalTo(20);
        }];

        self.state = 0;
    }
    return self;
}

- (void)setState:(NSInteger)state {
    _state = state;
    switch (state) {
        case 1:
            self.backgroundColor = [ABTheme gold];
            self.layer.borderColor = [ABTheme gold].CGColor;
            _mark.hidden = NO;
            _dash.hidden = YES;
            break;
        case 2:
            self.backgroundColor = [ABTheme goldSoft];
            self.layer.borderColor = [ABTheme gold].CGColor;
            _mark.hidden = YES;
            _dash.hidden = NO;
            break;
        default:
            self.backgroundColor = [UIColor clearColor];
            self.layer.borderColor = [ABTheme lineStrong].CGColor;
            _mark.hidden = YES;
            _dash.hidden = YES;
            break;
    }
}

@end

#pragma mark - 行模型

@interface ABMSRow : NSObject
@property (nonatomic, strong) ABCategory *cat;
@property (nonatomic, assign) BOOL isChild;
@property (nonatomic, strong) ABCategory *root;   // 二级所属一级（一级行 = 自身）
@end

@implementation ABMSRow
@end

#pragma mark -

@interface ABCategoryMultiSelectViewController () <UITableViewDataSource, UITableViewDelegate>

@property (nonatomic, copy, nullable) NSString *accountId;
@property (nonatomic, strong) ABNavigationBar *navBar;
@property (nonatomic, strong) UITableView *tableView;

@property (nonatomic, strong) NSArray<ABCategory *> *allCategories;
/// 一级分类：收入在前、支出在后（由 ABCategorySelection 保证）
@property (nonatomic, strong) NSArray<ABCategory *> *roots;
/// 已选 id 集合。勾选规则全部委托给 `ABCategorySelection`（纯逻辑、有单测）
@property (nonatomic, strong) NSMutableSet<NSString *> *draft;
/// 被**折叠**的一级 id（未记录 = 展开，这样将来新增分类会自动展开）
@property (nonatomic, strong) NSMutableSet<NSString *> *collapsed;
/// 扁平化后的行（一级 + 展开的二级），每次状态变化重建
@property (nonatomic, strong) NSArray<ABMSRow *> *rows;

@end

@implementation ABCategoryMultiSelectViewController

- (instancetype)initWithAccountId:(NSString *)accountId selectedIds:(NSArray<NSString *> *)selectedIds {
    self = [super init];
    if (self) {
        _accountId = [accountId copy];
        _draft = [NSMutableSet setWithArray:selectedIds ?: @[]];
        _collapsed = [NSMutableSet set];
        _allCategories = @[];
        _roots = @[];
        _rows = @[];
    }
    return self;
}

/// 兜底：不传 accountId 时用当前账本 —— 避免"推出来是空页"这种静默失败
- (instancetype)init {
    return [self initWithAccountId:[ABAccountStore shared].currentId selectedIds:@[]];
}

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    [self setupNavBar];
    [self setupTableView];
    [self loadCategories];
}

#pragma mark - 视图

- (void)setupNavBar {
    self.navBar = [[ABNavigationBar alloc] init];
    [self.navBar setTitle:@"选择分类"];
    __weak typeof(self) weakSelf = self;
    self.navBar.onBack = ^{ [weakSelf.navigationController popViewControllerAnimated:YES]; };
    self.navBar.onRight = ^{ [weakSelf toggleAll]; };
    [self.view addSubview:self.navBar];
    [self.navBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(self.view);
        make.height.mas_equalTo(88);
    }];
}

- (void)setupTableView {
    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
    self.tableView.backgroundColor = [ABTheme bgCard];
    self.tableView.separatorColor = [ABTheme line];
    self.tableView.separatorInset = UIEdgeInsetsMake(0, kSpace4, 0, 0);
    self.tableView.dataSource = self;
    self.tableView.delegate = self;
    self.tableView.rowHeight = 48;
    self.tableView.tableFooterView = [[UIView alloc] init];
    [self.tableView registerClass:UITableViewCell.class forCellReuseIdentifier:@"cat"];
    [self.view addSubview:self.tableView];

    // 底部「确定」（前端 footer 的同款：全宽金色按钮）
    UIView *footer = [[UIView alloc] init];
    footer.backgroundColor = [ABTheme bgPage];
    [self.view addSubview:footer];

    UIButton *done = [UIButton buttonWithType:UIButtonTypeSystem];
    [done setTitle:@"确定" forState:UIControlStateNormal];
    [done setTitleColor:[ABTheme textInverse] forState:UIControlStateNormal];
    done.titleLabel.font = [ABTheme fontBodyLg];
    done.backgroundColor = [ABTheme gold];
    done.layer.cornerRadius = kRadiusMd;
    [done addTarget:self action:@selector(confirm) forControlEvents:UIControlEventTouchUpInside];
    [footer addSubview:done];

    [footer mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.right.bottom.equalTo(self.view);
        make.height.mas_equalTo(64);           // 与分类页 kBottomBarHeight 一致
    }];
    [done mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(footer).offset(kSpace4);
        make.right.equalTo(footer).offset(-kSpace4);
        make.top.equalTo(footer).offset(kSpace2);
        make.height.mas_equalTo(44);
    }];

    [self.tableView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.navBar.mas_bottom);
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(footer.mas_top);
    }];
}

#pragma mark - 数据

- (void)loadCategories {
    // visibility 不传 → 后端默认 'all'（含被隐藏的分类）。
    // ⚠️ 前端 FlowCategoryPicker 用的是 store 的 incomeRoots / expenseRoots / childrenOf，
    //    那三个 getter **都不过滤 isHidden**（过滤版是 selectableRoots）——
    //    所以这里必须取全量，否则筛选面板里的分类会比前端少。
    __weak typeof(self) weakSelf = self;
    [ABCategoryService getCategories:self.accountId
                                type:nil
                            parentId:nil
                          visibility:nil
                             success:^(NSArray<ABCategory *> *list) {
        __strong typeof(weakSelf) self = weakSelf;
        self.allCategories = list ?: @[];
        self.roots = [ABCategorySelection rootsOfCategories:self.allCategories];

        if (self.draft.count == 0) {
            // 空选中集 = 不过滤 = 全选：进来就把所有节点勾上
            [self.draft addObjectsFromArray:[ABCategorySelection allIdsInCategories:self.allCategories]];
        } else {
            // 把「含一级 id」的选中集展开成「一级 + 其全部二级」，让勾选态与后端语义一致
            NSSet *expanded = [ABCategorySelection expandSelection:self.draft
                                                     allCategories:self.allCategories];
            [self.draft removeAllObjects];
            [self.draft unionSet:expanded];
        }

        [self rebuildRows];
        [self refreshRightTitle];
        [self.tableView reloadData];
    } failure:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        // 如实报出后端原话，不伪装成"没有分类"
        [self alert:[NSString stringWithFormat:@"分类加载失败：%@", error.localizedDescription ?: @"未知错误"]];
    }];
}

/// 某一级下的二级（返回**对象**，用于构建行；判定逻辑走 ABCategorySelection）
- (NSArray<ABCategory *> *)childrenOfRoot:(ABCategory *)root {
    NSMutableArray *out = [NSMutableArray array];
    for (ABCategory *c in self.allCategories) {
        if (c.parentId.length && [c.parentId isEqualToString:root.categoryId]) [out addObject:c];
    }
    return out;
}

- (BOOL)isExpanded:(ABCategory *)root {
    return ![self.collapsed containsObject:root.categoryId];
}

- (void)rebuildRows {
    NSMutableArray *out = [NSMutableArray array];
    for (ABCategory *r in self.roots) {
        ABMSRow *row = [[ABMSRow alloc] init];
        row.cat = r;
        row.isChild = NO;
        row.root = r;
        [out addObject:row];

        if (![self isExpanded:r]) continue;
        for (ABCategory *c in [self childrenOfRoot:r]) {
            ABMSRow *cr = [[ABMSRow alloc] init];
            cr.cat = c;
            cr.isChild = YES;
            cr.root = r;
            [out addObject:cr];
        }
    }
    self.rows = out;
}

- (void)refreshRightTitle {
    BOOL all = [ABCategorySelection isAllSelectedWithSelection:self.draft
                                                  allCategories:self.allCategories];
    [self.navBar setRightTitle:all ? @"取消全选" : @"全选"];
}

#pragma mark - 勾选（规则全在 ABCategorySelection，有单测）

/// 勾 / 取消一级：**连带其下全部二级**
- (void)toggleRoot:(ABCategory *)root {
    NSArray<NSString *> *ids = [ABCategorySelection idsAffectedByTogglingRoot:root
                                                               allCategories:self.allCategories];
    if ([self.draft containsObject:root.categoryId]) {
        [self.draft minusSet:[NSSet setWithArray:ids]];
    } else {
        [self.draft unionSet:[NSSet setWithArray:ids]];
    }
}

/// 勾 / 取消二级，随后**重算一级 id 是否该留在选中集里**（维护不变量）
- (void)toggleChild:(ABCategory *)child root:(ABCategory *)root {
    if ([self.draft containsObject:child.categoryId]) {
        [self.draft removeObject:child.categoryId];
    } else {
        [self.draft addObject:child.categoryId];
    }

    if ([ABCategorySelection shouldSelectRoot:root
                                withSelection:self.draft
                                allCategories:self.allCategories]) {
        [self.draft addObject:root.categoryId];
    } else {
        [self.draft removeObject:root.categoryId];
    }
}

- (void)toggleAll {
    // ⚠️ 判据必须在清空**之前**取 —— 先清空再问"是否全选"永远是 NO，
    //    「取消全选」会变成「重新全选」（点了没反应）。
    BOOL wasAll = [ABCategorySelection isAllSelectedWithSelection:self.draft
                                                    allCategories:self.allCategories];
    [self.draft removeAllObjects];
    if (!wasAll) {
        [self.draft addObjectsFromArray:[ABCategorySelection allIdsInCategories:self.allCategories]];
    }
}

- (void)confirm {
    if (!self.onDone) { [self.navigationController popViewControllerAnimated:YES]; return; }
    // 全选 → 空数组（不过滤）；全不选同理（防止用户清空后看到一片空白）
    BOOL all = [ABCategorySelection isAllSelectedWithSelection:self.draft
                                                 allCategories:self.allCategories];
    BOOL none = self.draft.count == 0;
    self.onDone((all || none) ? @[]
                             : [ABCategorySelection compressSelection:self.draft
                                                        allCategories:self.allCategories]);
    [self.navigationController popViewControllerAnimated:YES];
}

#pragma mark - 折叠

/// 折叠箭头 —— 用 **UIControl** 而不是手势：UIControl 会吃掉触摸，
/// 单元格的 didSelect 不会跟着触发（加手势的话两者会同时响应，
/// 点一下箭头既折叠又勾选）。
- (void)onCaretTap:(UIButton *)sender {
    NSInteger idx = sender.tag;
    if (idx < 0 || idx >= (NSInteger)self.rows.count) return;
    ABMSRow *row = self.rows[idx];
    if (row.isChild) return;

    NSString *rid = row.root.categoryId;
    if ([self.collapsed containsObject:rid]) [self.collapsed removeObject:rid];
    else [self.collapsed addObject:rid];

    [self rebuildRows];
    [self.tableView reloadData];
}

#pragma mark - UITableView

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return (NSInteger)self.rows.count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"cat" forIndexPath:indexPath];
    for (UIView *v in cell.contentView.subviews) { [v removeFromSuperview]; }
    cell.selectionStyle = UITableViewCellSelectionStyleNone;
    cell.backgroundColor = [ABTheme bgCard];

    ABMSRow *row = self.rows[indexPath.row];
    ABCategory *cat = row.cat;

    ABIconView *icon = [[ABIconView alloc] initWithSize:row.isChild ? 24 : 28];
    icon.iconKey = cat.icon;

    UILabel *name = [[UILabel alloc] init];
    name.text = cat.name;
    name.font = [ABTheme fontBody];
    name.textColor = [ABTheme textPrimary];

    ABCheckboxView *box = [[ABCheckboxView alloc] init];
    if (row.isChild) {
        box.state = [self.draft containsObject:cat.categoryId] ? 1 : 0;
    } else {
        box.state = [ABCategorySelection rootState:cat
                                     withSelection:self.draft
                                     allCategories:self.allCategories];
    }

    [cell.contentView addSubview:icon];
    [cell.contentView addSubview:name];
    [cell.contentView addSubview:box];

    // 一级行左侧是折叠箭头（点箭头折叠、点整行勾选）
    // ⚠️ 箭头与分类图标**不能重叠** —— 图标是后加的、会盖住箭头，症状是"箭头根本看不见"。
    //    所以一级的图标要右移让位（前端也是这个层级：箭头 → 图标 → 名字）。
    CGFloat leftPad = row.isChild ? 48 : 30;
    if (!row.isChild) {
        UIButton *caret = [UIButton buttonWithType:UIButtonTypeSystem];
        [caret setImage:[UIImage systemImageNamed:[self isExpanded:cat] ? @"chevron.down" : @"chevron.right"]
               forState:UIControlStateNormal];
        caret.tintColor = [ABTheme textDisabled];
        caret.tag = indexPath.row;
        [caret addTarget:self action:@selector(onCaretTap:) forControlEvents:UIControlEventTouchUpInside];
        [cell.contentView addSubview:caret];
        [caret mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(cell.contentView).offset(kSpace2);
            make.centerY.equalTo(cell.contentView);
            make.width.mas_equalTo(20);
            make.height.mas_equalTo(44);
        }];
    }

    [icon mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(cell.contentView).offset(leftPad);
        make.centerY.equalTo(cell.contentView);
    }];
    [box mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(cell.contentView).offset(-kSpace4);
        make.centerY.equalTo(cell.contentView);
    }];
    [name mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(icon.mas_right).offset(kSpace3);
        make.centerY.equalTo(cell.contentView);
        make.right.lessThanOrEqualTo(box.mas_left).offset(-kSpace2);
    }];
    return cell;
}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
    [tableView deselectRowAtIndexPath:indexPath animated:YES];
    ABMSRow *row = self.rows[indexPath.row];

    if (row.isChild) {
        [self toggleChild:row.cat root:row.root];
    } else {
        [self toggleRoot:row.cat];
    }
    [self rebuildRows];
    [self refreshRightTitle];
    [self.tableView reloadData];
}

#pragma mark - 工具

- (void)alert:(NSString *)message {
    UIAlertController *a = [UIAlertController alertControllerWithTitle:nil
                                                              message:message
                                                       preferredStyle:UIAlertControllerStyleAlert];
    [a addAction:[UIAlertAction actionWithTitle:@"知道了" style:UIAlertActionStyleDefault handler:nil]];
    [self presentViewController:a animated:YES completion:nil];
}

@end
