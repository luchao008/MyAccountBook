//
//  ABLoginViewController.m
//  MyAccountBook
//

#import "ABLoginViewController.h"
#import "ABTheme.h"
#import "ABAuthService.h"
#import "ABStorage.h"
#import <Masonry/Masonry.h>

@interface ABLoginViewController () <UITextFieldDelegate>

@property (nonatomic, strong) UIScrollView *scrollView;
@property (nonatomic, strong) UIView *formCard;
@property (nonatomic, strong) UITextField *usernameField;
@property (nonatomic, strong) UITextField *passwordField;
@property (nonatomic, strong) UIButton *submitButton;
@property (nonatomic, strong) UIButton *switchButton;
@property (nonatomic, assign) BOOL isRegister;
@property (nonatomic, assign) BOOL loading;

@end

@implementation ABLoginViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    [self setupGradient];
    [self setupViews];
}

- (void)viewDidAppear:(BOOL)animated {
    [super viewDidAppear:animated];
    // 不自动聚焦输入框：进入登录页时收起键盘（对齐前端登录页不自动弹键盘）
    [self.view endEditing:YES];
}

#pragma mark - UI

- (void)setupGradient {
    // 顶部浅金渐变，对齐 $v11-gold-soft -> $v11-bg-page
    CAGradientLayer *gradient = [CAGradientLayer layer];
    gradient.frame = self.view.bounds;
    gradient.colors = @[(__bridge id)[ABTheme goldSoft].CGColor,
                        (__bridge id)[ABTheme bgPage].CGColor];
    gradient.locations = @[@0.0, @0.4];
    gradient.startPoint = CGPointMake(0.5, 0.0);
    gradient.endPoint = CGPointMake(0.5, 1.0);
    [self.view.layer insertSublayer:gradient atIndex:0];
}

- (void)setupViews {
    // 顶部导航栏（对齐前端 uni-app 默认导航栏：居中标题「登录」）
    UIView *navBar = [[UIView alloc] init];
    navBar.backgroundColor = [ABTheme bgPage];
    [self.view addSubview:navBar];

    UILabel *navTitle = [[UILabel alloc] init];
    navTitle.text = @"登录";
    navTitle.font = [ABTheme fontH2];
    navTitle.textColor = [ABTheme textPrimary];
    navTitle.textAlignment = NSTextAlignmentCenter;
    [navBar addSubview:navTitle];

    [navBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(self.view);
        make.bottom.equalTo(self.view.mas_safeAreaLayoutGuideTop).offset(44);
    }];
    [navTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.centerX.equalTo(navBar);
        make.bottom.equalTo(navBar).offset(-8);
    }];

    self.scrollView = [[UIScrollView alloc] init];
    self.scrollView.alwaysBounceVertical = YES;
    [self.view addSubview:self.scrollView];
    [self.scrollView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.view.mas_safeAreaLayoutGuideTop).offset(44);
        make.left.right.bottom.equalTo(self.view);
    }];

    // —— 头部：图标 + 标题 + 副标题 ——
    UIImageView *logo = [[UIImageView alloc] init];
    logo.image = [UIImage imageNamed:@"logo"];
    logo.contentMode = UIViewContentModeScaleAspectFit;
    logo.layer.cornerRadius = 14;
    logo.layer.masksToBounds = YES;
    [self.scrollView addSubview:logo];

    UILabel *title = [[UILabel alloc] init];
    title.text = @"记账本";
    title.font = [ABTheme fontDisplay];
    title.textColor = [ABTheme textPrimary];
    [self.scrollView addSubview:title];

    UILabel *subtitle = [[UILabel alloc] init];
    subtitle.text = @"简单记录每一笔收支";
    subtitle.font = [ABTheme fontBodySm];
    subtitle.textColor = [ABTheme textSecondary];
    [self.scrollView addSubview:subtitle];

    [logo mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.scrollView).offset(76);
        make.centerX.equalTo(self.view);
        make.width.height.mas_equalTo(64);
    }];
    [title mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(logo.mas_bottom).offset(12);
        make.centerX.equalTo(self.view);
    }];
    [subtitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(title.mas_bottom).offset(8);
        make.centerX.equalTo(self.view);
    }];

    // —— 表单卡片 ——
    self.formCard = [[UIView alloc] init];
    self.formCard.backgroundColor = [ABTheme bgCard];
    self.formCard.layer.cornerRadius = kRadiusCard;
    self.formCard.layer.shadowColor = UIColor.blackColor.CGColor;
    self.formCard.layer.shadowOpacity = 0.05;
    self.formCard.layer.shadowRadius = 16;
    self.formCard.layer.shadowOffset = CGSizeMake(0, 4);
    [self.scrollView addSubview:self.formCard];

    self.usernameField = [self makeFieldWithPlaceholder:@"用户名（3-64 位）" secure:NO];
    self.passwordField = [self makeFieldWithPlaceholder:@"密码（至少 6 位）" secure:YES];
    [self.formCard addSubview:self.usernameField];
    [self.formCard addSubview:self.passwordField];

    self.submitButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.submitButton setTitle:@"登录" forState:UIControlStateNormal];
    [self.submitButton setTitleColor:[ABTheme textInverse] forState:UIControlStateNormal];
    self.submitButton.titleLabel.font = [ABTheme fontBodyLg];
    self.submitButton.backgroundColor = [ABTheme gold];
    self.submitButton.layer.cornerRadius = 24;
    [self.submitButton addTarget:self action:@selector(onSubmit) forControlEvents:UIControlEventTouchUpInside];
    [self.formCard addSubview:self.submitButton];

    self.switchButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.switchButton setTitle:@"没有账号？去注册" forState:UIControlStateNormal];
    [self.switchButton setTitleColor:[ABTheme info] forState:UIControlStateNormal];
    self.switchButton.titleLabel.font = [ABTheme fontBodySm];
    [self.switchButton addTarget:self action:@selector(onToggleMode) forControlEvents:UIControlEventTouchUpInside];
    [self.formCard addSubview:self.switchButton];

    UILabel *tip = [[UILabel alloc] init];
    tip.text = @"测试账号：demo / 123456";
    tip.font = [ABTheme fontCaption];
    tip.textColor = [ABTheme textSecondary];
    tip.textAlignment = NSTextAlignmentCenter;
    [self.formCard addSubview:tip];

    [self.formCard mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(subtitle.mas_bottom).offset(60);
        make.left.equalTo(self.view).offset(32);
        make.right.equalTo(self.view).offset(-32);
    }];
    [self.usernameField mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.formCard).offset(24);
        make.left.equalTo(self.formCard).offset(20);
        make.right.equalTo(self.formCard).offset(-20);
        make.height.mas_equalTo(44);
    }];
    [self.passwordField mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.usernameField.mas_bottom).offset(16);
        make.left.right.height.equalTo(self.usernameField);
    }];
    [self.submitButton mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.passwordField.mas_bottom).offset(28);
        make.left.right.equalTo(self.usernameField);
        make.height.mas_equalTo(48);
    }];
    [self.switchButton mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.submitButton.mas_bottom).offset(16);
        make.centerX.equalTo(self.formCard);
        make.height.mas_equalTo(44);
    }];
    [tip mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.switchButton.mas_bottom).offset(16);
        make.centerX.equalTo(self.formCard);
        make.bottom.equalTo(self.formCard).offset(-24);
    }];
}

- (UITextField *)makeFieldWithPlaceholder:(NSString *)placeholder secure:(BOOL)secure {
    UITextField *field = [[UITextField alloc] init];
    field.placeholder = placeholder;
    field.secureTextEntry = secure;
    field.font = [ABTheme fontBody];
    field.textColor = [ABTheme textPrimary];
    // 对齐前端 uni-easyinput：白底 + 灰描边 + 小圆角（不是灰底填充）
    field.backgroundColor = [ABTheme bgCard];
    field.layer.cornerRadius = kRadiusSm;
    field.layer.borderWidth = 1;
    field.layer.borderColor = [ABTheme lineStrong].CGColor;
    field.leftView = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 12, 0)];
    field.leftViewMode = UITextFieldViewModeAlways;
    field.clearButtonMode = UITextFieldViewModeWhileEditing;
    field.autocapitalizationType = UITextAutocapitalizationTypeNone;
    field.autocorrectionType = UITextAutocorrectionTypeNo;
    return field;
}

#pragma mark - Actions

- (void)onToggleMode {
    self.isRegister = !self.isRegister;
    [self.submitButton setTitle:(self.isRegister ? @"注册并登录" : @"登录") forState:UIControlStateNormal];
    [self.switchButton setTitle:(self.isRegister ? @"已有账号？去登录" : @"没有账号？去注册") forState:UIControlStateNormal];
}

- (void)onSubmit {
    NSString *username = [self.usernameField.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
    NSString *password = self.passwordField.text ?: @"";

    if (!username.length) { [self toast:@"请输入用户名"]; return; }
    if (password.length < 6) { [self toast:@"密码至少 6 位"]; return; }

    [self updateLoading:YES];
    __weak typeof(self) weakSelf = self;
    if (self.isRegister) {
        [ABAuthService registerWithUsername:username password:password success:^(NSString *message, ABUser *user) {
            __strong typeof(weakSelf) self = weakSelf;
            [self updateLoading:NO];
            [self toast:message];
            self.isRegister = NO;
            [self onToggleMode]; // 切回登录态文案
        } failure:^(NSError *error) {
            __strong typeof(weakSelf) self = weakSelf;
            [self updateLoading:NO];
            [self toast:error.localizedDescription];
        }];
    } else {
        [ABAuthService loginWithUsername:username password:password success:^(NSString *token, ABUser *user) {
            __strong typeof(weakSelf) self = weakSelf;
            [self updateLoading:NO];
            [ABStorage setToken:token];
            [ABStorage setUserInfo:[user toDictionary]];
            [[NSNotificationCenter defaultCenter] postNotificationName:@"ABDidLoginNotification" object:nil];
        } failure:^(NSError *error) {
            __strong typeof(weakSelf) self = weakSelf;
            [self updateLoading:NO];
            [self toast:error.localizedDescription];
        }];
    }
}

#pragma mark - Helpers

- (void)updateLoading:(BOOL)loading {
    self.loading = loading;
    self.submitButton.enabled = !loading;
    self.submitButton.alpha = loading ? 0.6 : 1.0;
}

- (void)toast:(NSString *)message {
    if (!message.length) { return; }
    UIAlertController *alert = [UIAlertController alertControllerWithTitle:nil message:message preferredStyle:UIAlertControllerStyleAlert];
    [self presentViewController:alert animated:YES completion:nil];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [alert dismissViewControllerAnimated:YES completion:nil];
    });
}

@end
