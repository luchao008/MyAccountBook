//
//  ABCategoryPicker.m
//  MyAccountBook
//

#import "ABCategoryPicker.h"
#import "ABTheme.h"
#import "ABIconView.h"
#import <Masonry/Masonry.h>

static const CGFloat kSidebarWidth = 100;

@interface ABCategoryPicker ()

@property (nonatomic, copy) NSString *type;
@property (nonatomic, strong) UIView *mask;
@property (nonatomic, strong) UIView *panel;
@property (nonatomic, strong) UITableView *sidebar;
@property (nonatomic, strong) UICollectionView *grid;
@property (nonatomic, strong) NSArray<ABCategory *> *allCategories;  // 全量（含二级）
@property (nonatomic, strong) NSArray<ABCategory *> *roots;      // 一级分类
@property (nonatomic, strong) NSArray<ABCategory *> *children;   // 当前一级下的二级
@property (nonatomic, assign) NSInteger selectedRootIndex;
@property (nonatomic, copy, nullable) NSString *selectedId;

@end

@implementation ABCategoryPicker

- (instancetype)initWithType:(NSString *)type accountId:(NSString *)accountId {
    self = [super initWithFrame:CGRectZero];
    if (self) {
        _type = type ?: @"expense";
        _selectedRootIndex = 0;
        [self setupViews];
    }
    return self;
}

- (void)setupViews {
    self.mask = [[UIView alloc] init];
    self.mask.backgroundColor = [ABTheme bgMask];
    self.mask.alpha = 0;
    UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(hide)];
    [self.mask addGestureRecognizer:tap];
    [self addSubview:self.mask];

    self.panel = [[UIView alloc] init];
    self.panel.backgroundColor = [ABTheme bgCard];
    self.panel.layer.cornerRadius = 16;
    self.panel.layer.maskedCorners = kCALayerMinXMinYCorner | kCALayerMaxXMinYCorner;
    [self addSubview:self.panel];

    UILabel *title = [[UILabel alloc] init];
    title.text = @"选择分类";
    title.font = [ABTheme fontH2];
    title.textColor = [ABTheme textPrimary];
    [self.panel addSubview:title];

    self.sidebar = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
    self.sidebar.backgroundColor = [ABTheme bgInset];
    self.sidebar.dataSource = self;
    self.sidebar.delegate = self;
    self.sidebar.rowHeight = 52;
    self.sidebar.separatorStyle = UITableViewCellSeparatorStyleNone;
    [self.sidebar registerClass:UITableViewCell.class forCellReuseIdentifier:@"root"];
    [self.panel addSubview:self.sidebar];

    UICollectionViewFlowLayout *layout = [[UICollectionViewFlowLayout alloc] init];
    layout.minimumInteritemSpacing = 0;
    layout.minimumLineSpacing = 8;
    self.grid = [[UICollectionView alloc] initWithFrame:CGRectZero collectionViewLayout:layout];
    self.grid.backgroundColor = [ABTheme bgCard];
    self.grid.dataSource = self;
    self.grid.delegate = self;
    [self.grid registerClass:UICollectionViewCell.class forCellWithReuseIdentifier:@"child"];
    [self.panel addSubview:self.grid];

    [self.mask mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(self);
    }];
    [self.panel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.right.bottom.equalTo(self);
        make.height.mas_equalTo(420);
    }];
    [title mas_makeConstraints:^(MASConstraintMaker *make) {
        make.centerX.equalTo(self.panel);
        make.top.equalTo(self.panel).offset(16);
    }];
    [self.sidebar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.bottom.equalTo(self.panel);
        make.top.equalTo(title.mas_bottom).offset(12);
        make.width.mas_equalTo(kSidebarWidth);
    }];
    [self.grid mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.sidebar.mas_right);
        make.right.bottom.equalTo(self.panel);
        make.top.equalTo(self.sidebar);
    }];
}

- (void)setCategories:(NSArray<ABCategory *> *)categories {
    self.allCategories = categories;
    // 只保留一级分类
    NSMutableArray *roots = [NSMutableArray array];
    for (ABCategory *c in categories) {
        if (c.isRoot) [roots addObject:c];
    }
    self.roots = roots;
    self.selectedRootIndex = 0;
    [self.sidebar reloadData];
    [self updateChildren];
}

- (void)setSelectedId:(NSString *)selectedId {
    _selectedId = selectedId;
    [self.grid reloadData];
}

- (void)updateChildren {
    if (self.selectedRootIndex >= (NSInteger)self.roots.count) {
        self.children = @[];
    } else {
        ABCategory *root = self.roots[self.selectedRootIndex];
        NSMutableArray *children = [NSMutableArray array];
        for (ABCategory *c in self.allCategories) {
            if ([c.parentId isEqualToString:root.categoryId]) [children addObject:c];
        }
        self.children = children;
    }
    [self.grid reloadData];
}

- (void)show {
    self.hidden = NO;
    [UIView animateWithDuration:0.25 animations:^{
        self.mask.alpha = 1;
    }];
}

- (void)hide {
    [UIView animateWithDuration:0.25 animations:^{
        self.mask.alpha = 0;
    } completion:^(BOOL finished) {
        self.hidden = YES;
        if (self.onDismiss) self.onDismiss();
    }];
}

#pragma mark - UITableView（一级侧栏）

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return self.roots.count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"root" forIndexPath:indexPath];
    ABCategory *root = self.roots[indexPath.row];
    cell.textLabel.text = root.name;
    cell.textLabel.font = [ABTheme fontBodySm];
    cell.textLabel.textAlignment = NSTextAlignmentCenter;
    cell.backgroundColor = (indexPath.row == self.selectedRootIndex) ? [ABTheme bgCard] : [ABTheme bgInset];
    cell.textLabel.textColor = (indexPath.row == self.selectedRootIndex) ? [ABTheme gold] : [ABTheme textPrimary];
    return cell;
}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
    self.selectedRootIndex = indexPath.row;
    [self.sidebar reloadData];
    [self updateChildren];
}

#pragma mark - UICollectionView（二级网格）

- (NSInteger)collectionView:(UICollectionView *)collectionView numberOfItemsInSection:(NSInteger)section {
    return self.children.count;
}

- (UICollectionViewCell *)collectionView:(UICollectionView *)collectionView cellForItemAtIndexPath:(NSIndexPath *)indexPath {
    UICollectionViewCell *cell = [collectionView dequeueReusableCellWithReuseIdentifier:@"child" forIndexPath:indexPath];
    for (UIView *v in cell.contentView.subviews) { [v removeFromSuperview]; }

    ABCategory *child = self.children[indexPath.item];
    BOOL selected = [child.categoryId isEqualToString:self.selectedId ?: @""];

    UIView *box = [[UIView alloc] init];
    box.backgroundColor = selected ? [ABTheme goldSoft] : [ABTheme bgInset];
    box.layer.cornerRadius = 22;
    if (selected) {
        box.layer.borderWidth = 2;
        box.layer.borderColor = [ABTheme gold].CGColor;
    }
    [cell.contentView addSubview:box];

    ABIconView *icon = [[ABIconView alloc] initWithSize:26];
    icon.iconKey = child.icon;
    [box addSubview:icon];

    UILabel *name = [[UILabel alloc] init];
    name.text = child.name;
    name.font = [ABTheme fontCaption];
    name.textColor = selected ? [ABTheme gold] : [ABTheme textSecondary];
    name.textAlignment = NSTextAlignmentCenter;
    name.numberOfLines = 1;
    name.lineBreakMode = NSLineBreakByTruncatingTail;
    [cell.contentView addSubview:name];

    [box mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(cell.contentView);
        make.centerX.equalTo(cell.contentView);
        make.width.height.mas_equalTo(44);
    }];
    [icon mas_makeConstraints:^(MASConstraintMaker *make) {
        make.center.equalTo(box);
        make.width.height.mas_equalTo(26);
    }];
    [name mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(box.mas_bottom).offset(4);
        make.left.right.equalTo(cell.contentView);
    }];

    return cell;
}

- (void)collectionView:(UICollectionView *)collectionView didSelectItemAtIndexPath:(NSIndexPath *)indexPath {
    ABCategory *child = self.children[indexPath.item];
    self.selectedId = child.categoryId;
    [collectionView reloadData];
    if (self.onPicked) self.onPicked(child);
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.15 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self hide];
    });
}

- (CGSize)collectionView:(UICollectionView *)collectionView layout:(UICollectionViewLayout *)collectionViewLayout sizeForItemAtIndexPath:(NSIndexPath *)indexPath {
    CGFloat w = (UIScreen.mainScreen.bounds.size.width - kSidebarWidth) / 4.0;
    return CGSizeMake(w, 76);
}

@end
