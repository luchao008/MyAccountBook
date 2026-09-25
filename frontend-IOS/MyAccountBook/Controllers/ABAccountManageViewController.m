//
//  ABAccountManageViewController.m
//  MyAccountBook
//

#import "ABAccountManageViewController.h"
#import "ABTheme.h"
#import "ABAccountStore.h"
#import "ABAccountNewViewController.h"
#import "ABAccountCategoryViewController.h"
#import "ABNavigationBar.h"
#import <Masonry/Masonry.h>

@interface ABAccountManageViewController () <UITableViewDataSource, UITableViewDelegate>

@property (nonatomic, strong) ABNavigationBar *navBar;
@property (nonatomic, strong) UITableView *tableView;

@end

@implementation ABAccountManageViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    [self setupViews];
    [self loadAccounts];
}

- (void)setupViews {
    self.navBar = [[ABNavigationBar alloc] init];
    [self.navBar setTitle:@"账本管理"];
    [self.navBar setRightTitle:@"新建"];
    __weak typeof(self) weakSelf = self;
    self.navBar.onBack = ^{
        [weakSelf.navigationController popViewControllerAnimated:YES];
    };
    self.navBar.onRight = ^{
        __strong typeof(weakSelf) self = weakSelf;
        ABAccountNewViewController *vc = [[ABAccountNewViewController alloc] init];
        vc.onCreated = ^{
            [self.tableView reloadData];
        };
        [self.navigationController pushViewController:vc animated:YES];
    };
    [self.view addSubview:self.navBar];

    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStyleInsetGrouped];
    self.tableView.backgroundColor = [ABTheme bgPage];
    self.tableView.dataSource = self;
    self.tableView.delegate = self;
    self.tableView.rowHeight = 60;
    [self.view addSubview:self.tableView];

    [self.navBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.view.mas_safeAreaLayoutGuideTop);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(52);
    }];
    [self.tableView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.navBar.mas_bottom);
        make.left.right.bottom.equalTo(self.view);
    }];
}

- (void)loadAccounts {
    __weak typeof(self) weakSelf = self;
    [[ABAccountStore shared] refreshWithCompletion:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        [self.tableView reloadData];
    }];
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return [ABAccountStore shared].list.count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    // ⚠️ 不能用 registerClass: + dequeueForIndexPath: ——
    // 那样拿到的是 Default 样式，detailTextLabel 恒为 nil，「默认」徽标永远不显示（静默失效）
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"acc"];
    if (!cell) cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleSubtitle reuseIdentifier:@"acc"];
    ABAccount *acc = [ABAccountStore shared].list[indexPath.row];
    cell.textLabel.text = [NSString stringWithFormat:@"%@ %@", acc.icon.length ? acc.icon : @"📒", acc.name];
    cell.textLabel.font = [ABTheme fontBody];
    cell.detailTextLabel.text = acc.isDefault ? @"默认账本" : @"";
    cell.detailTextLabel.font = [ABTheme fontCaption];
    cell.detailTextLabel.textColor = [ABTheme textSecondary];
    cell.accessoryType = UITableViewCellAccessoryDisclosureIndicator;
    return cell;
}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
    [tableView deselectRowAtIndexPath:indexPath animated:YES];
    if (indexPath.row >= (NSInteger)[ABAccountStore shared].list.count) return;

    ABAccount *acc = [ABAccountStore shared].list[indexPath.row];
    // 进该账本的分类设置。**不切换「当前账本」** ——
    // 分类接口按 accountId 取数，看 A 账本的分类不该把当前账本改成 A。
    ABAccountCategoryViewController *vc = [[ABAccountCategoryViewController alloc] initWithAccountId:acc.accountId];
    [self.navigationController pushViewController:vc animated:YES];
}

@end
