//
//  ABIconPickerViewController.m
//  MyAccountBook
//

#import "ABIconPickerViewController.h"
#import "ABTheme.h"
#import "ABNavigationBar.h"
#import "ABIconView.h"
#import "ABIconMap.h"
#import "ABColorIconMap.h"
#import <Masonry/Masonry.h>

@interface ABIconPickerViewController () <UICollectionViewDataSource, UICollectionViewDelegate>

@property (nonatomic, strong) ABNavigationBar *navBar;
@property (nonatomic, strong) UICollectionView *collectionView;
@property (nonatomic, strong) UISegmentedControl *tabSegment;
@property (nonatomic, strong) NSArray<NSString *> *names;
@property (nonatomic, strong) NSArray<NSString *> *colorKeys;
@property (nonatomic, copy) NSString *selectedKey;
@property (nonatomic, assign) NSInteger currentTab;

@end

@implementation ABIconPickerViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    self.currentTab = self.initialTab;
    self.names = [ABIconMap allCategoryNames];
    self.colorKeys = [ABColorIconMap allKeys];
    [self setupViews];
}

/// 取全部图片图标名（按拼音排序）
- (NSArray<NSString *> *)allIconNames {
    return [ABIconMap allCategoryNames];
}

- (void)setupViews {
    self.navBar = [[ABNavigationBar alloc] init];
    [self.navBar setTitle:@"选择图标"];
    __weak typeof(self) weakSelf = self;
    self.navBar.onBack = ^{
        [weakSelf.navigationController popViewControllerAnimated:YES];
    };
    [self.view addSubview:self.navBar];

    self.tabSegment = [[UISegmentedControl alloc] initWithItems:@[@"图片", @"彩色"]];
    self.tabSegment.selectedSegmentIndex = self.currentTab;
    [self.tabSegment addTarget:self action:@selector(onTabChanged) forControlEvents:UIControlEventValueChanged];
    [self.view addSubview:self.tabSegment];

    UICollectionViewFlowLayout *layout = [[UICollectionViewFlowLayout alloc] init];
    CGFloat w = (UIScreen.mainScreen.bounds.size.width - 32) / 5.0;
    layout.itemSize = CGSizeMake(w, w + 24);
    layout.minimumInteritemSpacing = 0;
    layout.minimumLineSpacing = 12;

    self.collectionView = [[UICollectionView alloc] initWithFrame:CGRectZero collectionViewLayout:layout];
    self.collectionView.backgroundColor = [ABTheme bgPage];
    self.collectionView.dataSource = self;
    self.collectionView.delegate = self;
    [self.collectionView registerClass:UICollectionViewCell.class forCellWithReuseIdentifier:@"icon"];
    [self.view addSubview:self.collectionView];

    [self.navBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.view.mas_safeAreaLayoutGuideTop);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(52);
    }];
    [self.tabSegment mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.navBar.mas_bottom).offset(8);
        make.left.equalTo(self.view).offset(16);
        make.right.equalTo(self.view).offset(-16);
        make.height.mas_equalTo(36);
    }];
    [self.collectionView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.tabSegment.mas_bottom).offset(8);
        make.left.equalTo(self.view).offset(16);
        make.right.equalTo(self.view).offset(-16);
        make.bottom.equalTo(self.view.mas_safeAreaLayoutGuideBottom);
    }];
}

#pragma mark - UICollectionView

- (NSArray<NSString *> *)currentKeys {
    if (self.currentTab == 1) return self.colorKeys;
    // 图片图标：转为 img: 前缀 key
    NSMutableArray *out = [NSMutableArray array];
    for (NSString *name in self.names) {
        [out addObject:[NSString stringWithFormat:@"img:%@", name]];
    }
    return out;
}

- (NSArray<NSString *> *)currentLabels {
    if (self.currentTab == 1) {
        // 去掉 "colorful:" / "life:" 前缀，只留名字
        NSMutableArray *out = [NSMutableArray array];
        for (NSString *key in self.colorKeys) {
            NSRange colon = [key rangeOfString:@":"];
            [out addObject:(colon.location != NSNotFound) ? [key substringFromIndex:colon.location + 1] : key];
        }
        return out;
    }
    return self.names;
}

- (void)onTabChanged {
    self.currentTab = self.tabSegment.selectedSegmentIndex;
    [self.collectionView reloadData];
}

- (NSInteger)collectionView:(UICollectionView *)collectionView numberOfItemsInSection:(NSInteger)section {
    return [self currentKeys].count;
}

- (UICollectionViewCell *)collectionView:(UICollectionView *)collectionView cellForItemAtIndexPath:(NSIndexPath *)indexPath {
    UICollectionViewCell *cell = [collectionView dequeueReusableCellWithReuseIdentifier:@"icon" forIndexPath:indexPath];
    for (UIView *v in cell.contentView.subviews) { [v removeFromSuperview]; }

    NSArray *keys = [self currentKeys];
    NSArray *labels = [self currentLabels];
    NSString *key = keys[indexPath.item];
    NSString *labelText = labels[indexPath.item];
    BOOL selected = [key isEqualToString:self.selectedKey];

    UIView *box = [[UIView alloc] init];
    box.backgroundColor = selected ? [ABTheme goldSoft] : [ABTheme bgInset];
    box.layer.cornerRadius = 12;
    if (selected) {
        box.layer.borderWidth = 2;
        box.layer.borderColor = [ABTheme gold].CGColor;
    }
    [cell.contentView addSubview:box];

    ABIconView *icon = [[ABIconView alloc] initWithSize:36];
    icon.iconKey = key;
    [box addSubview:icon];

    UILabel *label = [[UILabel alloc] init];
    label.text = labelText;
    label.font = [ABTheme fontCaption];
    label.textColor = [ABTheme textSecondary];
    label.textAlignment = NSTextAlignmentCenter;
    label.numberOfLines = 1;
    label.lineBreakMode = NSLineBreakByTruncatingTail;
    [cell.contentView addSubview:label];

    [box mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(cell.contentView);
        make.centerX.equalTo(cell.contentView);
        make.width.height.mas_equalTo(56);
    }];
    [icon mas_makeConstraints:^(MASConstraintMaker *make) {
        make.center.equalTo(box);
        make.width.height.mas_equalTo(36);
    }];
    [label mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(box.mas_bottom).offset(4);
        make.left.right.equalTo(cell.contentView);
    }];

    return cell;
}

- (void)collectionView:(UICollectionView *)collectionView didSelectItemAtIndexPath:(NSIndexPath *)indexPath {
    NSArray *keys = [self currentKeys];
    self.selectedKey = keys[indexPath.item];
    [collectionView reloadData];

    if (self.onPicked) self.onPicked(self.selectedKey);
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.15 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self.navigationController popViewControllerAnimated:YES];
    });
}

@end
