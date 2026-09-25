//
//  ABRecycleViewController.m
//  MyAccountBook
//

#import "ABRecycleViewController.h"
#import "ABTheme.h"
#import "ABTransactionService.h"
#import "ABTransactionCell.h"
#import "ABNavigationBar.h"
#import "ABEmptyView.h"
#import "ABFormat.h"
#import <Masonry/Masonry.h>

@interface ABRecycleViewController () <UITableViewDataSource, UITableViewDelegate>

@property (nonatomic, strong) ABNavigationBar *navBar;
@property (nonatomic, strong) UITableView *tableView;
@property (nonatomic, strong) ABEmptyView *emptyView;
@property (nonatomic, strong) NSArray<ABTransaction *> *list;

@end

@implementation ABRecycleViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    [self setupViews];
    [self loadData];
}

- (void)setupViews {
    self.navBar = [[ABNavigationBar alloc] init];
    [self.navBar setTitle:@"流水回收站"];
    // 顶部提示条
    UILabel *tip = [[UILabel alloc] init];
    tip.text = @"删除的流水会保留 7 天，超期自动清除";
    tip.font = [ABTheme fontCaption];
    tip.textColor = [ABTheme textSecondary];
    tip.textAlignment = NSTextAlignmentCenter;
    tip.backgroundColor = [ABTheme bgInset];
    [self.view addSubview:tip];
    [tip mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.navBar.mas_bottom);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(40);
    }];
    __weak typeof(self) weakSelf = self;
    self.navBar.onBack = ^{
        [weakSelf.navigationController popViewControllerAnimated:YES];
    };
    [self.view addSubview:self.navBar];

    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStyleInsetGrouped];
    self.tableView.backgroundColor = [ABTheme bgPage];
    self.tableView.dataSource = self;
    self.tableView.delegate = self;
    self.tableView.rowHeight = [ABTransactionCell height];
    [self.tableView registerClass:ABTransactionCell.class forCellReuseIdentifier:@"txn"];
    [self.view addSubview:self.tableView];

    self.emptyView = [[ABEmptyView alloc] initWithIcon:@"🗑️" text:@"回收站是空的"];
    self.emptyView.hidden = YES;
    [self.view addSubview:self.emptyView];

    [self.navBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.view.mas_safeAreaLayoutGuideTop);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(52);
    }];
    [self.tableView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.navBar.mas_bottom);
        make.left.right.bottom.equalTo(self.view);
    }];
    [self.emptyView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.centerX.equalTo(self.view);
        make.centerY.equalTo(self.view).offset(-40);
    }];
}

- (void)loadData {
    __weak typeof(self) weakSelf = self;
    [ABTransactionService getDeletedTransactions:^(NSArray<ABTransaction *> *list) {
        __strong typeof(weakSelf) self = weakSelf;
        self.list = list;
        self.emptyView.hidden = list.count > 0;
        self.tableView.hidden = list.count == 0;
        [self.tableView reloadData];
    } failure:^(NSError *error) {
        NSLog(@"[recycle] 加载失败: %@", error.localizedDescription);
    }];
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return self.list.count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    ABTransactionCell *cell = [tableView dequeueReusableCellWithIdentifier:@"txn" forIndexPath:indexPath];
    [cell configureWithTransaction:self.list[indexPath.row]];
    return cell;
}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
    [tableView deselectRowAtIndexPath:indexPath animated:YES];
    ABTransaction *txn = self.list[indexPath.row];

    UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"恢复这条流水？" message:nil preferredStyle:UIAlertControllerStyleAlert];
    __weak typeof(self) weakSelf = self;
    [alert addAction:[UIAlertAction actionWithTitle:@"恢复" style:UIAlertActionStyleDefault handler:^(UIAlertAction *action) {
        [ABTransactionService restoreTransaction:txn.txnId success:^(ABTransaction *t) {
            __strong typeof(weakSelf) self = weakSelf;
            [self loadData];
        } failure:^(NSError *error) {
            NSLog(@"[recycle] 恢复失败: %@", error.localizedDescription);
        }];
    }]];
    [alert addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    [self presentViewController:alert animated:YES completion:nil];
}

@end
