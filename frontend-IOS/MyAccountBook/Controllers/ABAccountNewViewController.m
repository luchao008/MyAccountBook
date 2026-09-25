//
//  ABAccountNewViewController.m
//  MyAccountBook
//

#import "ABAccountNewViewController.h"
#import "ABTheme.h"
#import "ABAccountService.h"
#import "ABAccountStore.h"
#import "ABNavigationBar.h"
#import <Masonry/Masonry.h>

@interface ABAccountNewViewController ()

@property (nonatomic, strong) ABNavigationBar *navBar;
@property (nonatomic, strong) UITextField *nameField;
@property (nonatomic, strong) UISwitch *inheritCategoriesSwitch;
@property (nonatomic, strong) UIButton *saveButton;

@end

@implementation ABAccountNewViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    [self setupViews];
}

- (void)setupViews {
    self.navBar = [[ABNavigationBar alloc] init];
    [self.navBar setTitle:@"新建账本"];
    __weak typeof(self) weakSelf = self;
    self.navBar.onBack = ^{
        [weakSelf.navigationController popViewControllerAnimated:YES];
    };
    [self.view addSubview:self.navBar];

    UIView *card = [[UIView alloc] init];
    card.backgroundColor = [ABTheme bgCard];
    card.layer.cornerRadius = kRadiusCard;
    [self.view addSubview:card];

    self.nameField = [[UITextField alloc] init];
    self.nameField.placeholder = @"账本名称";
    self.nameField.font = [ABTheme fontBody];
    self.nameField.backgroundColor = [ABTheme bgInset];
    self.nameField.layer.cornerRadius = kRadiusMd;
    self.nameField.leftView = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 12, 0)];
    self.nameField.leftViewMode = UITextFieldViewModeAlways;
    [card addSubview:self.nameField];

    UILabel *copyLabel = [[UILabel alloc] init];
    copyLabel.text = @"复制默认账本的分类";
    copyLabel.font = [ABTheme fontBody];
    copyLabel.textColor = [ABTheme textPrimary];
    [card addSubview:copyLabel];

    self.inheritCategoriesSwitch = [[UISwitch alloc] init];
    self.inheritCategoriesSwitch.on = YES;
    self.inheritCategoriesSwitch.onTintColor = [ABTheme gold];
    [card addSubview:self.inheritCategoriesSwitch];

    self.saveButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.saveButton setTitle:@"创建" forState:UIControlStateNormal];
    [self.saveButton setTitleColor:[ABTheme textInverse] forState:UIControlStateNormal];
    self.saveButton.titleLabel.font = [ABTheme fontBodyLg];
    self.saveButton.backgroundColor = [ABTheme gold];
    self.saveButton.layer.cornerRadius = 24;
    [self.saveButton addTarget:self action:@selector(onSave) forControlEvents:UIControlEventTouchUpInside];
    [self.view addSubview:self.saveButton];

    [self.navBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.view.mas_safeAreaLayoutGuideTop);
        make.left.right.equalTo(self.view);
        make.height.mas_equalTo(52);
    }];
    [card mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.navBar.mas_bottom).offset(16);
        make.left.equalTo(self.view).offset(16);
        make.right.equalTo(self.view).offset(-16);
    }];
    [self.nameField mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(card).offset(16);
        make.left.equalTo(card).offset(16);
        make.right.equalTo(card).offset(-16);
        make.height.mas_equalTo(44);
    }];
    [copyLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(card).offset(16);
        make.top.equalTo(self.nameField.mas_bottom).offset(20);
        make.bottom.equalTo(card).offset(-16);
    }];
    [self.inheritCategoriesSwitch mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(card).offset(-16);
        make.centerY.equalTo(copyLabel);
    }];
    [self.saveButton mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(card.mas_bottom).offset(24);
        make.left.equalTo(self.view).offset(16);
        make.right.equalTo(self.view).offset(-16);
        make.height.mas_equalTo(48);
    }];
}

- (void)onSave {
    NSString *name = [self.nameField.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
    if (!name.length) {
        UIAlertController *alert = [UIAlertController alertControllerWithTitle:nil message:@"请输入账本名称" preferredStyle:UIAlertControllerStyleAlert];
        [self presentViewController:alert animated:YES completion:nil];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.2 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [alert dismissViewControllerAnimated:YES completion:nil];
        });
        return;
    }

    self.saveButton.enabled = NO;
    __weak typeof(self) weakSelf = self;
    [ABAccountService createAccountWithName:name icon:nil copyAll:self.inheritCategoriesSwitch.isOn categoryIds:nil
        success:^(ABAccount *account) {
            __strong typeof(weakSelf) self = weakSelf;
            self.saveButton.enabled = YES;
            [[ABAccountStore shared] refreshWithCompletion:^(NSError *error) {
                if (self.onCreated) self.onCreated();
                [self.navigationController popViewControllerAnimated:YES];
            }];
        } failure:^(NSError *error) {
            __strong typeof(weakSelf) self = weakSelf;
            self.saveButton.enabled = YES;
            NSLog(@"[account-new] 创建失败: %@", error.localizedDescription);
        }];
}

@end
