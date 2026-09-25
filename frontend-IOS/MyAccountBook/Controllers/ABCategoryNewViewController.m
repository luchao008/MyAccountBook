//
//  ABCategoryNewViewController.m
//  MyAccountBook
//

#import "ABCategoryNewViewController.h"
#import "ABTheme.h"
#import "ABCategoryService.h"
#import "ABAccountStore.h"
#import "ABNavigationBar.h"
#import "ABIconView.h"
#import "ABIconPickerViewController.h"
#import <Masonry/Masonry.h>

@interface ABCategoryNewViewController ()

@property (nonatomic, strong) ABCategory *editingCategory;
@property (nonatomic, copy) NSString *type;
@property (nonatomic, copy, nullable) NSString *parentId;

@property (nonatomic, strong) ABNavigationBar *navBar;
@property (nonatomic, strong) UITextField *nameField;
@property (nonatomic, strong) UIView *iconBox;
@property (nonatomic, strong) ABIconView *iconView;
@property (nonatomic, copy) NSString *iconKey;
@property (nonatomic, strong) UIButton *saveButton;

@end

@implementation ABCategoryNewViewController

- (instancetype)initWithCategory:(ABCategory *)category type:(NSString *)type parentId:(NSString *)parentId {
    self = [super init];
    if (self) {
        _editingCategory = category;
        _type = type ?: @"expense";
        _parentId = parentId;
        _iconKey = category.icon ?: @"";
    }
    return self;
}

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    [self setupViews];
}

- (void)setupViews {
    self.navBar = [[ABNavigationBar alloc] init];
    [self.navBar setTitle:self.editingCategory ? @"编辑分类" : @"新建分类"];
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
    self.nameField.placeholder = @"分类名称";
    self.nameField.font = [ABTheme fontBody];
    self.nameField.textColor = [ABTheme textPrimary];
    self.nameField.text = self.editingCategory.name;
    [card addSubview:self.nameField];

    UILabel *iconLabel = [[UILabel alloc] init];
    iconLabel.text = @"图标";
    iconLabel.font = [ABTheme fontBody];
    iconLabel.textColor = [ABTheme textPrimary];
    [card addSubview:iconLabel];

    self.iconBox = [[UIView alloc] init];
    self.iconBox.backgroundColor = [ABTheme bgInset];
    self.iconBox.layer.cornerRadius = 12;
    self.iconBox.userInteractionEnabled = YES;
    UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(onPickIcon)];
    [self.iconBox addGestureRecognizer:tap];
    [card addSubview:self.iconBox];

    self.iconView = [[ABIconView alloc] initWithSize:32];
    self.iconView.iconKey = self.iconKey;
    [self.iconBox addSubview:self.iconView];

    self.saveButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.saveButton setTitle:@"保存" forState:UIControlStateNormal];
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
    [iconLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(card).offset(16);
        make.top.equalTo(self.nameField.mas_bottom).offset(20);
        make.bottom.equalTo(card).offset(-20);
    }];
    [self.iconBox mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(card).offset(-16);
        make.centerY.equalTo(iconLabel);
        make.width.height.mas_equalTo(48);
    }];
    [self.iconView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.center.equalTo(self.iconBox);
        make.width.height.mas_equalTo(32);
    }];
    [self.saveButton mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(card.mas_bottom).offset(24);
        make.left.equalTo(self.view).offset(16);
        make.right.equalTo(self.view).offset(-16);
        make.height.mas_equalTo(48);
    }];
}

- (void)onPickIcon {
    ABIconPickerViewController *picker = [[ABIconPickerViewController alloc] init];
    __weak typeof(self) weakSelf = self;
    picker.onPicked = ^(NSString *iconKey) {
        __strong typeof(weakSelf) self = weakSelf;
        self.iconKey = iconKey;
        self.iconView.iconKey = iconKey;
    };
    [self.navigationController pushViewController:picker animated:YES];
}

- (void)onSave {
    NSString *name = [self.nameField.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
    if (!name.length) {
        [self toast:@"请输入分类名称"];
        return;
    }

    NSString *accountId = [ABAccountStore shared].currentId ?: @"";
    __weak typeof(self) weakSelf = self;

    if (self.editingCategory) {
        [ABCategoryService updateCategory:accountId id:self.editingCategory.categoryId
            data:@{ @"name": name, @"icon": self.iconKey ?: @"" }
            success:^(ABCategory *cat) {
                __strong typeof(weakSelf) self = weakSelf;
                if (self.onSaved) self.onSaved();
                [self.navigationController popViewControllerAnimated:YES];
            } failure:^(NSError *error) {
                __strong typeof(weakSelf) self = weakSelf;
                [self toast:error.localizedDescription];
            }];
    } else {
        NSMutableDictionary *params = [NSMutableDictionary dictionary];
        params[@"accountId"] = accountId;
        params[@"name"] = name;
        params[@"type"] = self.type;
        if (self.iconKey.length) params[@"icon"] = self.iconKey;
        if (self.parentId.length) params[@"parentId"] = self.parentId;

        [ABCategoryService createCategory:params success:^(ABCategory *cat) {
            __strong typeof(weakSelf) self = weakSelf;
            if (self.onSaved) self.onSaved();
            [self.navigationController popViewControllerAnimated:YES];
        } failure:^(NSError *error) {
            __strong typeof(weakSelf) self = weakSelf;
            [self toast:error.localizedDescription];
        }];
    }
}

- (void)toast:(NSString *)message {
    UIAlertController *alert = [UIAlertController alertControllerWithTitle:nil message:message preferredStyle:UIAlertControllerStyleAlert];
    [self presentViewController:alert animated:YES completion:nil];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [alert dismissViewControllerAnimated:YES completion:nil];
    });
}

@end
