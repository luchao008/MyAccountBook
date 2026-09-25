//
//  ABMineViewController.m
//  MyAccountBook
//
//  我的页 —— 对齐 frontend/src/components/views/MineView.vue
//  圆形头像 + 用户名/ID + 分组列表（账本与分类 / 其他）+ 退出登录。
//

#import "ABMineViewController.h"
#import "ABTheme.h"
#import "ABStorage.h"
#import "ABAccountStore.h"
#import "ABCategoryViewController.h"
#import "ABRecycleViewController.h"
#import "ABAccountManageViewController.h"
#import "ABCalendarViewController.h"
#import "ABExportViewController.h"
#import "ABImportViewController.h"
#import <Masonry/Masonry.h>

@interface ABMineViewController () <UITableViewDataSource, UITableViewDelegate>

@property (nonatomic, strong) UITableView *tableView;
@property (nonatomic, strong) NSArray<NSArray *> *sections;

@end

@implementation ABMineViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];

    self.sections = @[
        @[
            @{ @"icon": @"wallet.pass", @"title": @"账本管理", @"action": @"account" },
            @{ @"icon": @"tag", @"title": @"支出分类管理", @"action": @"cat-expense" },
            @{ @"icon": @"shippingbox", @"title": @"收入分类管理", @"action": @"cat-income" },
            @{ @"icon": @"tray", @"title": @"流水回收站", @"action": @"recycle" },
            @{ @"icon": @"square.and.arrow.up", @"title": @"数据导出", @"action": @"export" },
            @{ @"icon": @"square.and.arrow.down", @"title": @"流水导入", @"action": @"import" },
        ],
    ];

    [self setupViews];
}

- (void)setupViews {
    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStyleInsetGrouped];
    self.tableView.backgroundColor = [ABTheme bgPage];
    self.tableView.dataSource = self;
    self.tableView.delegate = self;
    self.tableView.rowHeight = 56;
    [self.tableView registerClass:UITableViewCell.class forCellReuseIdentifier:@"item"];
    [self.view addSubview:self.tableView];

    // 顶部标题「我的」
    UILabel *navTitle = [[UILabel alloc] init];
    navTitle.text = @"我的";
    navTitle.font = [ABTheme fontH2];
    navTitle.textColor = [ABTheme textPrimary];
    navTitle.textAlignment = NSTextAlignmentCenter;
    [self.view addSubview:navTitle];

    // 用户头像区（圆形头像 + 用户名 + ID）
    UIView *userCard = [[UIView alloc] init];
    userCard.backgroundColor = [ABTheme bgCard];
    [self.view addSubview:userCard];

    NSDictionary *userInfo = [ABStorage userInfo];
    NSString *username = userInfo[@"username"] ?: @"用户";
    NSString *userId = userInfo[@"id"] ?: @"";

    UIView *avatar = [[UIView alloc] init];
    avatar.backgroundColor = [ABTheme gold];
    avatar.layer.cornerRadius = 28;
    [userCard addSubview:avatar];

    UILabel *avatarText = [[UILabel alloc] init];
    avatarText.text = username.length ? [[username substringToIndex:1] uppercaseString] : @"U";
    avatarText.font = [UIFont systemFontOfSize:24 weight:UIFontWeightMedium];
    avatarText.textColor = UIColor.whiteColor;
    avatarText.textAlignment = NSTextAlignmentCenter;
    [avatar addSubview:avatarText];

    UILabel *nameLabel = [[UILabel alloc] init];
    nameLabel.text = username;
    nameLabel.font = [UIFont systemFontOfSize:20 weight:UIFontWeightSemibold];
    nameLabel.textColor = [ABTheme textPrimary];
    [userCard addSubview:nameLabel];

    UILabel *idLabel = [[UILabel alloc] init];
    idLabel.text = [NSString stringWithFormat:@"ID %@", userId];
    idLabel.font = [ABTheme fontBodySm];
    idLabel.textColor = [ABTheme textSecondary];
    [userCard addSubview:idLabel];

    [navTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.view.mas_safeAreaLayoutGuideTop);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(44);
    }];
    [userCard mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(navTitle.mas_bottom);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(88);
    }];
    [avatar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(userCard).offset(20);
        make.centerY.equalTo(userCard);
        make.width.height.mas_equalTo(56);
    }];
    [avatarText mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(avatar);
    }];
    [nameLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(avatar.mas_right).offset(16);
        make.top.equalTo(avatar).offset(6);
    }];
    [idLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(nameLabel);
        make.top.equalTo(nameLabel.mas_bottom).offset(4);
    }];

    [self.tableView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(userCard.mas_bottom);
        make.left.right.bottom.equalTo(self.view);
    }];
}

#pragma mark - UITableView

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView {
    return self.sections.count + 1;  // +1 是退出登录
}

- (NSString *)tableView:(UITableView *)tableView titleForHeaderInSection:(NSInteger)section {
    return section == 0 ? @"账本与分类" : nil;
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    if (section == 0) return self.sections[0].count;
    return 1;  // 退出登录
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"item" forIndexPath:indexPath];

    if (indexPath.section == 0) {
        NSDictionary *item = self.sections[0][indexPath.row];
        cell.textLabel.text = item[@"title"];
        cell.textLabel.font = [ABTheme fontBody];
        cell.textLabel.textColor = [ABTheme textPrimary];
        cell.imageView.image = [UIImage systemImageNamed:item[@"icon"]];
        cell.imageView.tintColor = [ABTheme textPrimary];
        cell.accessoryType = UITableViewCellAccessoryDisclosureIndicator;

        // 账本管理右侧显示数量
        if ([item[@"action"] isEqualToString:@"account"]) {
            cell.detailTextLabel.text = nil;
        }
    } else {
        cell.textLabel.text = @"退出登录";
        cell.textLabel.font = [ABTheme fontBody];
        cell.textLabel.textColor = [ABTheme danger];
        cell.textLabel.textAlignment = NSTextAlignmentCenter;
        cell.imageView.image = nil;
        cell.accessoryType = UITableViewCellAccessoryNone;
    }

    return cell;
}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
    [tableView deselectRowAtIndexPath:indexPath animated:YES];

    if (indexPath.section == 1) {
        [self onLogout];
        return;
    }

    NSDictionary *item = self.sections[0][indexPath.row];
    NSString *action = item[@"action"];
    UIViewController *vc = nil;

    if ([action isEqualToString:@"account"]) {
        vc = [[ABAccountManageViewController alloc] init];
    } else if ([action isEqualToString:@"cat-expense"] || [action isEqualToString:@"cat-income"]) {
        NSString *type = [action isEqualToString:@"cat-income"] ? @"income" : @"expense";
        vc = [[ABCategoryViewController alloc] initWithType:type];
    } else if ([action isEqualToString:@"recycle"]) {
        vc = [[ABRecycleViewController alloc] init];
    } else if ([action isEqualToString:@"export"]) {
        vc = [[ABExportViewController alloc] init];
    } else if ([action isEqualToString:@"import"]) {
        vc = [[ABImportViewController alloc] init];
    }

    if (vc) {
        // 我的页可能被嵌入为子视图（无 navigationController），统一包一层模态导航
        UINavigationController *nav = self.navigationController;
        if (nav) {
            [nav pushViewController:vc animated:YES];
        } else {
            UINavigationController *modalNav = [[UINavigationController alloc] initWithRootViewController:vc];
            modalNav.modalPresentationStyle = UIModalPresentationFullScreen;
            [self presentViewController:modalNav animated:YES completion:nil];
        }
    }
}

- (void)onLogout {
    UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"退出登录" message:@"确定要退出吗？" preferredStyle:UIAlertControllerStyleAlert];
    [alert addAction:[UIAlertAction actionWithTitle:@"退出" style:UIAlertActionStyleDestructive handler:^(UIAlertAction *action) {
        [ABStorage clearSession];
        [[ABAccountStore shared] reset];
        [[NSNotificationCenter defaultCenter] postNotificationName:@"ABHttpClientUnauthorizedNotification" object:nil];
    }]];
    [alert addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    [self presentViewController:alert animated:YES completion:nil];
}

@end
