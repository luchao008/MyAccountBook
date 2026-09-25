//
//  ABAccountManageViewController.m
//  MyAccountBook
//

#import "ABAccountManageViewController.h"
#import "ABTheme.h"
#import "ABAccountStore.h"
#import "ABAccountNewViewController.h"
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
    [self.tableView registerClass:UITableViewCell.class forCellReuseIdentifier:@"acc"];
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
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"acc" forIndexPath:indexPath];
    ABAccount *acc = [ABAccountStore shared].list[indexPath.row];
    cell.textLabel.text = [NSString stringWithFormat:@"%@ %@", acc.icon.length ? acc.icon : @"📒", acc.name];
    cell.textLabel.font = [ABTheme fontBody];
    cell.detailTextLabel.text = acc.isDefault ? @"默认" : @"";
    return cell;
}

@end
