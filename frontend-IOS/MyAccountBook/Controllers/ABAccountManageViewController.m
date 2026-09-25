//
//  ABAccountManageViewController.m
//  MyAccountBook
//
//  账本管理 —— 对齐 frontend/src/pages/account/index.vue
//
//    · 列表：账本名 + 默认徽标 + 创建日期
//    · 点行 → 操作列表：分类设置 / 改名 / 设为默认 / 合并到其他账本 / 删除
//      iOS 用 ActionSheet 承载 —— 前端是把这五个按钮**平铺在每一行里**，
//      手机上那一排文字会挤成一团，而且「删除」和「分类设置」视觉上一样重。
//    · 删除是**两道确认**：先预检「会连带删多少笔交易」，再要求**原样输入账本名**
//    · 合并先出预检报告（共几笔 / 迁入几笔 / 去重几笔），确认后才执行
//
//  ⚠️ 这些接口的失败原因大多**只有后端知道**（账本重名、只剩一个账本不能删、
//     分类下有交易不能移除……）。所以每个 failure 分支都必须把后端原话显示出来，
//     不能吞掉换成一句"操作失败"。
//

#import "ABAccountManageViewController.h"
#import "ABTheme.h"
#import "ABAccountStore.h"
#import "ABAccountService.h"
#import "ABAccountNewViewController.h"
#import "ABAccountCategoryViewController.h"
#import "ABNavigationBar.h"
#import "ABEmptyView.h"
#import <Masonry/Masonry.h>

@interface ABAccountManageViewController () <UITableViewDataSource, UITableViewDelegate>

@property (nonatomic, strong) ABNavigationBar *navBar;
@property (nonatomic, strong) UITableView *tableView;
@property (nonatomic, strong) ABEmptyView *emptyView;

@end

@implementation ABAccountManageViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    [self setupViews];
    [self loadAccounts];
}

- (void)viewWillAppear:(BOOL)animated {
    [super viewWillAppear:animated];
    // 分类设置页里可能改过账本，回来重新拉一次
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
            [self loadAccounts];
        };
        [self.navigationController pushViewController:vc animated:YES];
    };
    [self.view addSubview:self.navBar];

    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStyleInsetGrouped];
    self.tableView.backgroundColor = [ABTheme bgPage];
    self.tableView.dataSource = self;
    self.tableView.delegate = self;
    self.tableView.rowHeight = 60;
    self.tableView.tableFooterView = [self makeRulesFooter];
    [self.view addSubview:self.tableView];

    self.emptyView = [[ABEmptyView alloc] initWithIcon:@"📒" text:@"还没有账本"];
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
        make.top.equalTo(self.navBar.mas_bottom).offset(80);
        make.left.right.equalTo(self.view);
        make.bottom.equalTo(self.view.mas_safeAreaLayoutGuideBottom);
    }];
}

/// 底部规则说明（对齐前端 .rules）—— 这四条不是装饰，是"删除/合并不可逆"的唯一告知处
- (UIView *)makeRulesFooter {
    UIView *footer = [[UIView alloc] initWithFrame:CGRectMake(0, 0, self.view.bounds.size.width, 200)];
    footer.backgroundColor = [ABTheme bgPage];

    UILabel *title = [[UILabel alloc] init];
    title.text = @"关于删除与合并";
    title.font = [UIFont systemFontOfSize:13 weight:UIFontWeightMedium];
    title.textColor = [ABTheme textSecondary];
    [footer addSubview:title];

    UILabel *rules = [[UILabel alloc] init];
    rules.text = @"· 删除账本会一并删除其中的全部交易，且不可恢复；需输入账本名确认。\n"
                  "· 至少保留一个账本，最后一个不能被删除。\n"
                  "· 合并会把源账本的数据并入目标账本，然后删除源账本。\n"
                  "· 合并去重口径：金额、日期、收支类型、分类、备注全部相同才算重复，重复时保留目标账本那条。";
    rules.font = [ABTheme fontCaption];
    rules.textColor = [ABTheme textSecondary];
    rules.numberOfLines = 0;
    rules.lineBreakMode = NSLineBreakByCharWrapping;
    [footer addSubview:rules];

    [title mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(footer).offset(kSpace4);
        make.top.equalTo(footer).offset(kSpace3);
    }];
    [rules mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(footer).offset(kSpace4);
        make.right.equalTo(footer).offset(-kSpace4);
        make.top.equalTo(title.mas_bottom).offset(kSpace2);
    }];
    return footer;
}

- (void)viewDidLayoutSubviews {
    [super viewDidLayoutSubviews];
    // tableFooterView 的宽度**不会**自动跟随表格宽度 —— 不修正的话
    // 窄屏上那四条规则说明会被压成一列竖字
    UIView *footer = self.tableView.tableFooterView;
    if (footer && footer.frame.size.width != self.tableView.bounds.size.width) {
        CGRect f = footer.frame;
        f.size.width = self.tableView.bounds.size.width;
        footer.frame = f;
        self.tableView.tableFooterView = footer;   // 重新赋值才触发重排
    }
}

#pragma mark - 数据

- (void)loadAccounts {
    __weak typeof(self) weakSelf = self;
    // ⚠️ 必须用 loadWithCompletion: 而不是 refreshWithCompletion: ——
    // 前者在「currentId 指向的账本已不存在」时会**回退**到默认账本（并写回 NSUserDefaults），
    // 后者只更新 list、完全不动 currentId。
    // 删除账本后若 currentId 悬空，后续所有按账本取数的请求都会失败，
    // 而且症状是"页面一片空白"，很难联想到这里。
    [[ABAccountStore shared] loadWithCompletion:^(BOOL changed, NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        if (error) {
            [self toast:[NSString stringWithFormat:@"账本加载失败：%@", error.localizedDescription ?: @"未知错误"]];
        }
        [self.tableView reloadData];
        BOOL empty = [ABAccountStore shared].list.count == 0;
        self.emptyView.hidden = !empty;
        self.tableView.hidden = empty;
    }];
}

- (NSString *)formatCreatedAt:(NSString *)iso {
    if (iso.length < 10) return iso ?: @"";
    NSString *d = [iso substringToIndex:10];
    return [d stringByReplacingOccurrencesOfString:@"-" withString:@"."];
}

#pragma mark - UITableView

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return (NSInteger)[ABAccountStore shared].list.count;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    // ⚠️ 不能用 registerClass: + dequeueForIndexPath: ——
    // 那样拿到的是 Default 样式，detailTextLabel 恒为 nil，副标题永远不显示（静默失效）
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"acc"];
    if (!cell) cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleSubtitle reuseIdentifier:@"acc"];

    NSArray<ABAccount *> *list = [ABAccountStore shared].list;
    if (indexPath.row >= (NSInteger)list.count) return cell;
    ABAccount *acc = list[indexPath.row];

    // 前端账本列表**不显示图标**（只有名字 + 默认徽标 + 创建日期），这里跟着对齐。
    // 早先照 icon 字段拼了前缀，结果把内部 key（"wallet"）当图标显示了出来。
    cell.textLabel.text = acc.name;
    cell.textLabel.font = [ABTheme fontBody];
    cell.textLabel.textColor = [ABTheme textPrimary];

    // 默认徽标并进副标题 —— 比塞一个 accessoryView 简单，也不和右侧箭头打架
    NSString *created = [self formatCreatedAt:acc.createdAt];
    cell.detailTextLabel.text = acc.isDefault
        ? [NSString stringWithFormat:@"默认账本 · 创建于 %@", created]
        : [NSString stringWithFormat:@"创建于 %@", created];
    cell.detailTextLabel.font = [ABTheme fontCaption];
    cell.detailTextLabel.textColor = [ABTheme textSecondary];
    cell.accessoryType = UITableViewCellAccessoryDisclosureIndicator;
    return cell;
}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
    [tableView deselectRowAtIndexPath:indexPath animated:YES];
    NSArray<ABAccount *> *list = [ABAccountStore shared].list;
    if (indexPath.row >= (NSInteger)list.count) return;
    [self showActionsForAccount:list[indexPath.row]];
}

#pragma mark - 操作列表

/// ActionSheet 的 popover 配置**只在 iPad 上设**。
///
/// ⚠️ 在 iPhone 上也设 sourceView / sourceRect，会让 iOS 26 按 popover 呈现 ——
/// 表现成「居中小卡片」而且**自动省略取消按钮**
/// （实测：`actions` 里明明有「取消」，界面上就是不画）。
/// 但 iPad 上不设 source 会直接崩，所以按 idiom 分流。
- (void)configureActionSheet:(UIAlertController *)sheet {
    if (self.traitCollection.userInterfaceIdiom == UIUserInterfaceIdiomPad) {
        sheet.popoverPresentationController.sourceView = self.view;
        sheet.popoverPresentationController.sourceRect =
            CGRectMake(CGRectGetMidX(self.view.bounds), CGRectGetMidY(self.view.bounds), 1, 1);
    }
}

- (void)showActionsForAccount:(ABAccount *)acc {
    NSArray<ABAccount *> *all = [ABAccountStore shared].list;
    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:acc.name
                                                                  message:nil
                                                           preferredStyle:UIAlertControllerStyleActionSheet];
    __weak typeof(self) weakSelf = self;

    [sheet addAction:[UIAlertAction actionWithTitle:@"分类设置" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        [self onCategorySettings:acc];
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"改名" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        [self onRename:acc];
    }]];

    // 已经是默认账本就不给这个选项 —— 而不是给了再点了没反应
    if (!acc.isDefault) {
        [sheet addAction:[UIAlertAction actionWithTitle:@"设为默认" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
            __strong typeof(weakSelf) self = weakSelf;
            [self onSetDefault:acc];
        }]];
    }

    // 只剩一个账本时，合并和删除都无从谈起（对齐前端 v-if="list.length > 1"）
    if (all.count > 1) {
        [sheet addAction:[UIAlertAction actionWithTitle:@"合并到其他账本" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
            __strong typeof(weakSelf) self = weakSelf;
            [self onMerge:acc];
        }]];
        [sheet addAction:[UIAlertAction actionWithTitle:@"删除" style:UIAlertActionStyleDestructive handler:^(UIAlertAction *a) {
            __strong typeof(weakSelf) self = weakSelf;
            [self onDelete:acc];
        }]];
    }

    [sheet addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    [self configureActionSheet:sheet];
    [self presentViewController:sheet animated:YES completion:nil];
}

- (void)onCategorySettings:(ABAccount *)acc {
    ABAccountCategoryViewController *vc = [[ABAccountCategoryViewController alloc] initWithAccountId:acc.accountId];
    [self.navigationController pushViewController:vc animated:YES];
}

#pragma mark - 改名 / 设为默认

- (void)onRename:(ABAccount *)acc {
    UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"重命名账本"
                                                                  message:nil
                                                           preferredStyle:UIAlertControllerStyleAlert];
    [alert addTextFieldWithConfigurationHandler:^(UITextField *tf) {
        tf.text = acc.name;
        tf.placeholder = @"输入新的账本名";
        tf.clearButtonMode = UITextFieldViewModeWhileEditing;
    }];
    __weak typeof(self) weakSelf = self;
    [alert addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    [alert addAction:[UIAlertAction actionWithTitle:@"确定" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        NSString *raw = alert.textFields.firstObject.text ?: @"";
        NSString *name = [raw stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
        if (!name.length || [name isEqualToString:acc.name]) return;
        [self updateAccount:acc data:@{ @"name": name } successMessage:@"已改名"];
    }]];
    [self presentViewController:alert animated:YES completion:nil];
}

- (void)onSetDefault:(ABAccount *)acc {
    [self updateAccount:acc data:@{ @"isDefault": @YES } successMessage:@"已设为默认"];
}

- (void)updateAccount:(ABAccount *)acc data:(NSDictionary *)data successMessage:(NSString *)message {
    __weak typeof(self) weakSelf = self;
    [ABAccountService updateAccount:acc.accountId data:data success:^(ABAccount *updated) {
        __strong typeof(weakSelf) self = weakSelf;
        [self loadAccounts];
        [self toast:message];
    } failure:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        [self toast:[NSString stringWithFormat:@"操作失败：%@", error.localizedDescription ?: @"未知错误"]];
    }];
}

#pragma mark - 删除（两道确认）

- (void)onDelete:(ABAccount *)acc {
    __weak typeof(self) weakSelf = self;
    // 第一道：先向后端要预检，才知道"会连带删掉多少笔"
    [ABAccountService getDeletePreview:acc.accountId success:^(NSDictionary *dict) {
        __strong typeof(weakSelf) self = weakSelf;
        [self confirmDelete:acc transactionCount:[dict[@"transactionCount"] integerValue]];
    } failure:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        // 预检失败通常是「只剩一个账本」这类业务拦截 —— 必须说出真实原因，
        // 否则用户看到的是"点删除没反应"
        [self toast:[NSString stringWithFormat:@"无法删除：%@", error.localizedDescription ?: @"未知错误"]];
    }];
}

- (void)confirmDelete:(ABAccount *)acc transactionCount:(NSInteger)count {
    NSString *warn = count > 0
        ? [NSString stringWithFormat:@"该账本下有 %ld 笔交易，将一并删除且不可恢复。", (long)count]
        : @"该账本下没有交易。";
    NSString *message = [NSString stringWithFormat:@"%@\n\n请输入「%@」以确认。", warn, acc.name];

    UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"删除账本"
                                                                  message:message
                                                           preferredStyle:UIAlertControllerStyleAlert];
    [alert addTextFieldWithConfigurationHandler:^(UITextField *tf) {
        tf.placeholder = [NSString stringWithFormat:@"请输入「%@」", acc.name];
        tf.autocapitalizationType = UITextAutocapitalizationTypeNone;
    }];
    __weak typeof(self) weakSelf = self;
    [alert addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    [alert addAction:[UIAlertAction actionWithTitle:@"删除" style:UIAlertActionStyleDestructive handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        NSString *raw = alert.textFields.firstObject.text ?: @"";
        NSString *input = [raw stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
        if (!input.length) {
            [self toast:@"需要输入账本名确认"];
            return;
        }
        [self performDelete:acc confirmName:input];
    }]];
    [self presentViewController:alert animated:YES completion:nil];
}

- (void)performDelete:(ABAccount *)acc confirmName:(NSString *)confirmName {
    __weak typeof(self) weakSelf = self;
    [ABAccountService deleteAccount:acc.accountId confirmName:confirmName success:^(NSDictionary *dict) {
        __strong typeof(weakSelf) self = weakSelf;
        NSInteger deleted = [dict[@"deletedTransactions"] integerValue];
        [self loadAccounts];   // 可能触发「当前账本回退」，必须重拉而不是就地改
        [self toast:[NSString stringWithFormat:@"已删除（连带 %ld 笔）", (long)deleted]];
    } failure:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        [self toast:[NSString stringWithFormat:@"删除失败：%@", error.localizedDescription ?: @"未知错误"]];
    }];
}

#pragma mark - 合并

- (void)onMerge:(ABAccount *)source {
    NSMutableArray<ABAccount *> *candidates = [NSMutableArray array];
    for (ABAccount *a in [ABAccountStore shared].list) {
        if (![a.accountId isEqualToString:source.accountId]) [candidates addObject:a];
    }
    if (!candidates.count) {
        [self toast:@"没有可合并的目标账本"];
        return;
    }

    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:@"合并到…"
                                                                  message:[NSString stringWithFormat:@"「%@」会被并入所选账本，然后删除", source.name]
                                                           preferredStyle:UIAlertControllerStyleActionSheet];
    __weak typeof(self) weakSelf = self;
    for (ABAccount *cand in candidates) {
        NSString *title = [NSString stringWithFormat:@"并入「%@」", cand.name];
        [sheet addAction:[UIAlertAction actionWithTitle:title style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
            __strong typeof(weakSelf) self = weakSelf;
            [self previewMergeFrom:source to:cand];
        }]];
    }
    [sheet addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    [self configureActionSheet:sheet];
    [self presentViewController:sheet animated:YES completion:nil];
}

/// 合并前必须先出报告（共几笔 / 迁入几笔 / 去重几笔），用户确认后才真的动数据
- (void)previewMergeFrom:(ABAccount *)source to:(ABAccount *)target {
    __weak typeof(self) weakSelf = self;
    [ABAccountService previewMerge:target.accountId sourceId:source.accountId success:^(NSDictionary *dict) {
        __strong typeof(weakSelf) self = weakSelf;
        NSInteger sourceTotal = [dict[@"sourceTotal"] integerValue];
        NSInteger willMove = [dict[@"willMove"] integerValue];
        NSInteger willSkip = [dict[@"willSkip"] integerValue];

        NSString *content = (sourceTotal == 0)
            ? [NSString stringWithFormat:@"「%@」里没有交易，合并后该账本会被删除。确定继续吗？", source.name]
            : [NSString stringWithFormat:@"把「%@」并入「%@」：\n· 共 %ld 笔\n· 迁入 %ld 笔\n· 因完全重复丢弃 %ld 笔\n合并后「%@」会被删除。",
               source.name, target.name, (long)sourceTotal, (long)willMove, (long)willSkip, source.name];

        UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"确认合并"
                                                                      message:content
                                                               preferredStyle:UIAlertControllerStyleAlert];
        __weak typeof(weakSelf) strongSelf = self;
        [alert addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
        [alert addAction:[UIAlertAction actionWithTitle:@"确认合并" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
            [strongSelf execMergeFrom:source to:target];
        }]];
        [self presentViewController:alert animated:YES completion:nil];
    } failure:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        [self toast:[NSString stringWithFormat:@"合并预检失败：%@", error.localizedDescription ?: @"未知错误"]];
    }];
}

- (void)execMergeFrom:(ABAccount *)source to:(ABAccount *)target {
    __weak typeof(self) weakSelf = self;
    [ABAccountService mergeAccounts:target.accountId sourceId:source.accountId success:^(NSDictionary *dict) {
        __strong typeof(weakSelf) self = weakSelf;
        NSString *sourceName = dict[@"sourceName"] ?: source.name;
        NSInteger willMove = [dict[@"willMove"] integerValue];
        NSInteger willSkip = [dict[@"willSkip"] integerValue];
        [self loadAccounts];
        [self alertWithTitle:@"合并完成"
                     message:[NSString stringWithFormat:@"已把「%@」并入目标账本：迁入 %ld 笔，去重 %ld 笔。",
                              sourceName, (long)willMove, (long)willSkip]];
    } failure:^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        [self toast:[NSString stringWithFormat:@"合并失败：%@", error.localizedDescription ?: @"未知错误"]];
    }];
}

#pragma mark - 提示

- (void)toast:(NSString *)message {
    [self alertWithTitle:nil message:message];
}

- (void)alertWithTitle:(NSString *)title message:(NSString *)message {
    UIAlertController *alert = [UIAlertController alertControllerWithTitle:title
                                                                  message:message
                                                           preferredStyle:UIAlertControllerStyleAlert];
    [alert addAction:[UIAlertAction actionWithTitle:@"好" style:UIAlertActionStyleDefault handler:nil]];
    [self presentViewController:alert animated:YES completion:nil];
}

@end
