//
//  ABAccountSelectViewController.m
//  MyAccountBook
//
//  账本选择页（启动页）—— 对齐 frontend/src/pages/account-select/index.vue
//  居中标题 + 账本列表（图标/名称/默认徽标/创建日期）+ 新建按钮 + 底栏（首页/我的）。
//

#import "ABAccountSelectViewController.h"
#import "ABTheme.h"
#import "ABAccountStore.h"
#import "ABHomeViewController.h"
#import "ABMineViewController.h"
#import "ABAccountNewViewController.h"
#import "ABIconView.h"
#import <Masonry/Masonry.h>

@interface ABAccountSelectViewController () <UITableViewDataSource, UITableViewDelegate>

@property (nonatomic, strong) UILabel *navTitle;
@property (nonatomic, strong) UITableView *tableView;
@property (nonatomic, strong) UIButton *createButton;
@property (nonatomic, strong) UIView *tabBar;
@property (nonatomic, strong) UIButton *homeTab;
@property (nonatomic, strong) UIButton *mineTab;
@property (nonatomic, assign) NSInteger currentTab;  // 0=首页 1=我的
@property (nonatomic, strong) UIView *mineContainer;

@end

@implementation ABAccountSelectViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    self.currentTab = 0;
    [self setupViews];
    [self loadAccounts];
}

- (void)setupViews {
    self.navTitle = [[UILabel alloc] init];
    self.navTitle.text = @"选择账本";
    self.navTitle.font = [ABTheme fontH2];
    self.navTitle.textColor = [ABTheme textPrimary];
    self.navTitle.textAlignment = NSTextAlignmentCenter;
    [self.view addSubview:self.navTitle];

    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
    self.tableView.backgroundColor = [ABTheme bgCard];
    self.tableView.dataSource = self;
    self.tableView.delegate = self;
    self.tableView.rowHeight = 72;
    self.tableView.separatorColor = [ABTheme line];
    self.tableView.separatorInset = UIEdgeInsetsMake(0, 68, 0, 0);
    self.tableView.tableFooterView = [[UIView alloc] init];
    [self.tableView registerClass:UITableViewCell.class forCellReuseIdentifier:@"acc"];
    [self.view addSubview:self.tableView];

    self.createButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.createButton setTitle:@"+  新建 / 管理账本" forState:UIControlStateNormal];
    [self.createButton setTitleColor:[ABTheme gold] forState:UIControlStateNormal];
    self.createButton.titleLabel.font = [ABTheme fontBody];
    self.createButton.layer.borderWidth = 1;
    self.createButton.layer.borderColor = [ABTheme gold].CGColor;
    self.createButton.layer.cornerRadius = kRadiusMd;
    [self.createButton addTarget:self action:@selector(onManage) forControlEvents:UIControlEventTouchUpInside];
    [self.view addSubview:self.createButton];

    // 底栏
    self.tabBar = [[UIView alloc] init];
    self.tabBar.backgroundColor = [ABTheme bgCard];
    [self.view addSubview:self.tabBar];

    UIView *tabTopLine = [[UIView alloc] init];
    tabTopLine.backgroundColor = [ABTheme line];
    [self.tabBar addSubview:tabTopLine];

    self.homeTab = [self makeTabButton:@"首页" icon:@"house" action:@selector(onHomeTab)];
    self.mineTab = [self makeTabButton:@"我的" icon:@"person" action:@selector(onMineTab)];
    [self.tabBar addSubview:self.homeTab];
    [self.tabBar addSubview:self.mineTab];

    // 布局
    [self.navTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.view.mas_safeAreaLayoutGuideTop);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(44);
    }];
    [self.tabBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.right.bottom.equalTo(self.view);
        make.height.mas_equalTo(56);
    }];
    [tabTopLine mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(self.tabBar);
        make.height.mas_equalTo(1);
    }];
    [self.homeTab mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.tabBar);
        make.top.equalTo(self.tabBar).offset(6);
        make.width.equalTo(self.tabBar).multipliedBy(0.5);
        make.height.mas_equalTo(50);
    }];
    [self.mineTab mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(self.tabBar);
        make.top.width.height.equalTo(self.homeTab);
    }];
    [self.createButton mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.view).offset(16);
        make.right.equalTo(self.view).offset(-16);
        make.bottom.equalTo(self.tabBar.mas_top).offset(-16);
        make.height.mas_equalTo(48);
    }];
    [self.tableView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.navTitle.mas_bottom);
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.createButton.mas_top).offset(-16);
    }];

    [self updateTabAppearance];
}

- (UIButton *)makeTabButton:(NSString *)title icon:(NSString *)icon action:(SEL)action {
    UIButton *btn = [UIButton buttonWithType:UIButtonTypeSystem];
    [btn setTitle:title forState:UIControlStateNormal];
    btn.titleLabel.font = [ABTheme fontCaption];
    [btn setImage:[UIImage systemImageNamed:icon] forState:UIControlStateNormal];
    btn.contentHorizontalAlignment = UIControlContentHorizontalAlignmentCenter;
    // 图标在上、文字在下
    btn.imageEdgeInsets = UIEdgeInsetsMake(-16, 0, 0, -btn.titleLabel.intrinsicContentSize.width);
    btn.titleEdgeInsets = UIEdgeInsetsMake(20, -btn.currentImage.size.width, -20, 0);
    [btn addTarget:self action:action forControlEvents:UIControlEventTouchUpInside];
    return btn;
}

- (void)updateTabAppearance {
    [self.homeTab setTintColor:(self.currentTab == 0) ? [ABTheme gold] : [ABTheme textSecondary]];
    [self.mineTab setTintColor:(self.currentTab == 1) ? [ABTheme gold] : [ABTheme textSecondary]];
}

- (void)onHomeTab {
    self.currentTab = 0;
    [self updateTabAppearance];
    self.navTitle.text = @"选择账本";
    self.tableView.hidden = NO;
    self.createButton.hidden = NO;
    [self.mineContainer removeFromSuperview];
    self.mineContainer = nil;
}

- (void)onMineTab {
    self.currentTab = 1;
    [self updateTabAppearance];
    self.navTitle.text = @"我的";
    self.tableView.hidden = YES;
    self.createButton.hidden = YES;

    // 关键：把「我的」包进一个内嵌导航控制器，这样它内部的 push 才能生效
    ABMineViewController *mine = [[ABMineViewController alloc] init];
    mine.view.backgroundColor = [ABTheme bgPage];
    UINavigationController *innerNav = [[UINavigationController alloc] initWithRootViewController:mine];
    innerNav.navigationBarHidden = YES;

    [self addChildViewController:innerNav];
    self.mineContainer = innerNav.view;
    [self.view insertSubview:self.mineContainer belowSubview:self.tabBar];
    [self.mineContainer mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.navTitle.mas_bottom);
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.tabBar.mas_top);
    }];
    [innerNav didMoveToParentViewController:self];
}

- (void)viewSafeAreaInsetsDidChange {
    [super viewSafeAreaInsetsDidChange];
    CGFloat bottom = self.view.safeAreaInsets.bottom;
    [self.tabBar mas_updateConstraints:^(MASConstraintMaker *make) {
        make.height.mas_equalTo(56 + bottom);
    }];
}

- (void)loadAccounts {
    __weak typeof(self) weakSelf = self;
    [[ABAccountStore shared] loadWithCompletion:^(BOOL changed, NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        if (error) NSLog(@"[account-select] 加载失败: %@", error.localizedDescription);
        [self.tableView reloadData];
    }];
}

- (void)onManage {
    ABAccountNewViewController *vc = [[ABAccountNewViewController alloc] init];
    vc.onCreated = ^{
        [self loadAccounts];
    };
    [self.navigationController pushViewController:vc animated:YES];
}

#pragma mark - UITableView

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return [ABAccountStore shared].list.count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"acc" forIndexPath:indexPath];
    for (UIView *v in cell.contentView.subviews) { [v removeFromSuperview]; }

    ABAccount *acc = [ABAccountStore shared].list[indexPath.row];

    // 图标方块
    UIView *iconBox = [[UIView alloc] init];
    iconBox.backgroundColor = [ABTheme bgInset];
    iconBox.layer.cornerRadius = 10;
    [cell.contentView addSubview:iconBox];

    UIImageView *icon = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"wallet.pass"]];
    icon.tintColor = [ABTheme textPrimary];
    icon.contentMode = UIViewContentModeScaleAspectFit;
    [iconBox addSubview:icon];

    // 名称
    UILabel *name = [[UILabel alloc] init];
    name.text = acc.name;
    name.font = [UIFont systemFontOfSize:17 weight:UIFontWeightMedium];
    name.textColor = [ABTheme textPrimary];
    [cell.contentView addSubview:name];

    // 「默认」徽标
    if (acc.isDefault) {
        UILabel *badge = [[UILabel alloc] init];
        badge.text = @"默认";
        badge.font = [ABTheme fontCaption];
        badge.textColor = [ABTheme gold];
        badge.backgroundColor = [ABTheme goldSoft];
        badge.textAlignment = NSTextAlignmentCenter;
        badge.layer.cornerRadius = 4;
        badge.clipsToBounds = YES;
        [cell.contentView addSubview:badge];
        [badge mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(name.mas_right).offset(8);
            make.centerY.equalTo(name);
            make.width.mas_equalTo(38);
            make.height.mas_equalTo(20);
        }];
    }

    // 创建日期
    UILabel *date = [[UILabel alloc] init];
    NSString *created = acc.createdAt.length >= 10 ? [acc.createdAt substringToIndex:10] : @"";
    date.text = [NSString stringWithFormat:@"创建于 %@", created];
    date.font = [ABTheme fontCaption];
    date.textColor = [ABTheme textSecondary];
    [cell.contentView addSubview:date];

    [iconBox mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(cell.contentView).offset(16);
        make.centerY.equalTo(cell.contentView);
        make.width.height.mas_equalTo(40);
    }];
    [icon mas_makeConstraints:^(MASConstraintMaker *make) {
        make.center.equalTo(iconBox);
        make.width.height.mas_equalTo(22);
    }];
    [name mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(iconBox.mas_right).offset(12);
        make.top.equalTo(cell.contentView).offset(14);
    }];
    [date mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(name);
        make.top.equalTo(name.mas_bottom).offset(2);
    }];

    return cell;
}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
    [tableView deselectRowAtIndexPath:indexPath animated:YES];
    ABAccount *acc = [ABAccountStore shared].list[indexPath.row];
    [[ABAccountStore shared] switchTo:acc.accountId];

    ABHomeViewController *homeVC = [[ABHomeViewController alloc] init];
    [self.navigationController pushViewController:homeVC animated:YES];
}

@end
