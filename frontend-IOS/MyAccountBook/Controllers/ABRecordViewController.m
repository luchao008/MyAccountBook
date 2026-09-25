//
//  ABRecordViewController.m
//  MyAccountBook
//
//  记一笔页 —— 对齐 frontend/src/pages/record/index.vue
//  顶栏（返回 + 记一笔·账本名）+ 收支 Tab + 金额卡 + 分类/日期/备注行 + 底部金额键盘。
//

#import "ABRecordViewController.h"
#import "ABTheme.h"
#import "ABCategoryService.h"
#import "ABTransactionService.h"
#import "ABAccountStore.h"
#import "ABDateUtil.h"
#import "ABFormat.h"
#import "ABAmountKeyboard.h"
#import "ABCategoryPicker.h"
#import "ABTimePicker.h"
#import "ABOfflineQueue.h"
#import "ABNetworkMonitor.h"
#import <Masonry/Masonry.h>

@interface ABRecordViewController ()

@property (nonatomic, strong) ABTransaction *editingTxn;

@property (nonatomic, strong) UILabel *navTitleLabel;
@property (nonatomic, strong) UILabel *typeExpenseLabel;
@property (nonatomic, strong) UILabel *typeIncomeLabel;
@property (nonatomic, strong) UIView *typeUnderline;
@property (nonatomic, strong) UILabel *amountLabel;

@property (nonatomic, strong) UILabel *categoryValueLabel;
@property (nonatomic, strong) UILabel *dateValueLabel;
@property (nonatomic, strong) UILabel *timeValueLabel;
@property (nonatomic, strong) UITextField *noteField;

@property (nonatomic, strong) ABAmountKeyboard *keyboard;
@property (nonatomic, strong) ABCategoryPicker *categoryPicker;

@property (nonatomic, strong) NSArray<ABCategory *> *categories;
@property (nonatomic, copy, nullable) NSString *selectedCategoryId;
@property (nonatomic, copy) NSString *selectedDate;
@property (nonatomic, copy, nullable) NSString *selectedTime;
@property (nonatomic, copy) NSString *currentType;
@property (nonatomic, copy) NSString *amount;

@end

@implementation ABRecordViewController

- (instancetype)initWithTransaction:(ABTransaction *)txn {
    self = [super init];
    if (self) {
        _editingTxn = txn;
    }
    return self;
}

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    self.currentType = self.editingTxn ? self.editingTxn.type : @"expense";
    self.selectedDate = self.editingTxn ? self.editingTxn.recordDate : [ABDateUtil today];
    self.selectedCategoryId = self.editingTxn.categoryId;
    self.amount = self.editingTxn ? [ABFormat fixed2:self.editingTxn.amount] : @"";
    self.selectedTime = self.editingTxn.recordTime.length ? [self.editingTxn.recordTime substringToIndex:5] : nil;

    [self setupViews];
    [self updateTypeAppearance];
    [self loadCategories];
}

- (void)setupViews {
    // ── 顶栏：返回 + 标题 ──
    UIView *navBar = [[UIView alloc] init];
    navBar.backgroundColor = [ABTheme bgPage];
    [self.view addSubview:navBar];

    UIButton *backBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    [backBtn setImage:[UIImage systemImageNamed:@"chevron.left"] forState:UIControlStateNormal];
    backBtn.tintColor = [ABTheme textPrimary];
    [backBtn addTarget:self action:@selector(onClose) forControlEvents:UIControlEventTouchUpInside];
    [navBar addSubview:backBtn];

    self.navTitleLabel = [[UILabel alloc] init];
    self.navTitleLabel.text = [NSString stringWithFormat:@"记一笔·%@", [[ABAccountStore shared] currentName]];
    self.navTitleLabel.font = [ABTheme fontH2];
    self.navTitleLabel.textColor = [ABTheme textPrimary];
    self.navTitleLabel.textAlignment = NSTextAlignmentCenter;
    [navBar addSubview:self.navTitleLabel];

    // ── 收支 Tab（文字 + 下划线）──
    self.typeExpenseLabel = [self makeTypeLabel:@"支出" action:@selector(onExpense)];
    self.typeIncomeLabel = [self makeTypeLabel:@"收入" action:@selector(onIncome)];
    [self.view addSubview:self.typeExpenseLabel];
    [self.view addSubview:self.typeIncomeLabel];

    self.typeUnderline = [[UIView alloc] init];
    self.typeUnderline.backgroundColor = [ABTheme gold];
    [self.view addSubview:self.typeUnderline];

    // ── 金额卡 ──
    UIView *amountCard = [[UIView alloc] init];
    amountCard.backgroundColor = [ABTheme bgCard];
    amountCard.layer.cornerRadius = kRadiusCard;
    [self.view addSubview:amountCard];

    UILabel *yen = [[UILabel alloc] init];
    yen.text = @"¥";
    yen.font = [ABTheme fontDisplay];
    yen.textColor = [ABTheme expense];
    [amountCard addSubview:yen];

    self.amountLabel = [[UILabel alloc] init];
    self.amountLabel.font = [ABTheme fontDisplayLg];
    self.amountLabel.textColor = [ABTheme expense];
    self.amountLabel.textAlignment = NSTextAlignmentRight;
    self.amountLabel.text = self.amount.length ? self.amount : @"0.00";
    [amountCard addSubview:self.amountLabel];

    // ── 分类/日期/备注 卡 ──
    UIView *infoCard = [[UIView alloc] init];
    infoCard.backgroundColor = [ABTheme bgCard];
    infoCard.layer.cornerRadius = kRadiusCard;
    [self.view addSubview:infoCard];

    // 分类行
    UIView *catRow = [self makeRowWithTitle:@"分类" valueLabel:&_categoryValueLabel value:@"请选择二级分类" action:@selector(onPickCategory)];
    [infoCard addSubview:catRow];

    UIView *catSep = [[UIView alloc] init];
    catSep.backgroundColor = [ABTheme line];
    [infoCard addSubview:catSep];

    // 日期行
    UIView *dateRow = [self makeRowWithTitle:@"日期" valueLabel:&_dateValueLabel value:self.selectedDate action:@selector(onPickDate)];
    [infoCard addSubview:dateRow];

    UIView *dateSep = [[UIView alloc] init];
    dateSep.backgroundColor = [ABTheme line];
    [infoCard addSubview:dateSep];

    // 备注行
    UIView *noteRow = [[UIView alloc] init];
    [infoCard addSubview:noteRow];
    UILabel *noteTitle = [[UILabel alloc] init];
    noteTitle.text = @"备注";
    noteTitle.font = [ABTheme fontBody];
    noteTitle.textColor = [ABTheme textPrimary];
    [noteRow addSubview:noteTitle];

    self.noteField = [[UITextField alloc] init];
    self.noteField.placeholder = @"写点什么（选填）";
    self.noteField.font = [ABTheme fontBody];
    self.noteField.textColor = [ABTheme textPrimary];
    if (self.editingTxn) self.noteField.text = self.editingTxn.note;
    [noteRow addSubview:self.noteField];

    // ── 金额键盘 ──
    self.keyboard = [[ABAmountKeyboard alloc] init];
    self.keyboard.value = self.amount;
    __weak typeof(self) weakSelf = self;
    self.keyboard.onChange = ^(NSString *value) {
        __strong typeof(weakSelf) self = weakSelf;
        self.amount = value;
        self.amountLabel.text = value.length ? value : @"0.00";
    };
    self.keyboard.onConfirm = ^{
        __strong typeof(weakSelf) self = weakSelf;
        [self onSave];
    };
    [self.view addSubview:self.keyboard];

    // ── 布局 ──
    [navBar mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(self.view);
        make.bottom.equalTo(self.view.mas_safeAreaLayoutGuideTop).offset(44);
    }];
    [backBtn mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(navBar).offset(8);
        make.bottom.equalTo(navBar).offset(-4);
        make.width.height.mas_equalTo(40);
    }];
    [self.navTitleLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.centerX.equalTo(navBar);
        make.centerY.equalTo(backBtn);
    }];

    [self.typeExpenseLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(navBar.mas_bottom).offset(12);
        make.centerX.equalTo(self.view).multipliedBy(0.5);
    }];
    [self.typeIncomeLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.typeExpenseLabel);
        make.centerX.equalTo(self.view).multipliedBy(1.5);
    }];
    [self.typeUnderline mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.typeExpenseLabel.mas_bottom).offset(6);
        make.centerX.equalTo(self.typeExpenseLabel);
        make.width.mas_equalTo(40);
        make.height.mas_equalTo(3);
    }];

    [amountCard mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.typeUnderline.mas_bottom).offset(16);
        make.left.equalTo(self.view).offset(16);
        make.right.equalTo(self.view).offset(-16);
        make.height.mas_equalTo(80);
    }];
    [yen mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(amountCard).offset(16);
        make.centerY.equalTo(amountCard);
    }];
    [self.amountLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(amountCard).offset(-16);
        make.centerY.equalTo(amountCard);
        make.left.greaterThanOrEqualTo(yen.mas_right).offset(8);
    }];

    [infoCard mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(amountCard.mas_bottom).offset(12);
        make.left.equalTo(self.view).offset(16);
        make.right.equalTo(self.view).offset(-16);
    }];
    [catRow mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.left.right.equalTo(infoCard);
        make.height.mas_equalTo(52);
    }];
    [catSep mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(catRow.mas_bottom);
        make.left.equalTo(infoCard).offset(16);
        make.right.equalTo(infoCard);
        make.height.mas_equalTo(1);
    }];
    [dateRow mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(catSep.mas_bottom);
        make.left.right.equalTo(infoCard);
        make.height.mas_equalTo(52);
    }];
    [dateSep mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(dateRow.mas_bottom);
        make.left.equalTo(infoCard).offset(16);
        make.right.equalTo(infoCard);
        make.height.mas_equalTo(1);
    }];
    [noteRow mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(dateSep.mas_bottom);
        make.left.right.equalTo(infoCard);
        make.height.mas_equalTo(52);
        make.bottom.equalTo(infoCard);
    }];
    [noteTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(noteRow).offset(16);
        make.centerY.equalTo(noteRow);
        make.width.mas_equalTo(48);
    }];
    [self.noteField mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(noteTitle.mas_right).offset(12);
        make.right.equalTo(noteRow).offset(-16);
        make.centerY.equalTo(noteRow);
    }];

    [self.keyboard mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.right.bottom.equalTo(self.view);
        make.height.mas_equalTo(48 * 4 + 3);  // 安全区在 viewSafeAreaInsetsDidChange 里补
    }];
}

- (void)viewSafeAreaInsetsDidChange {
    [super viewSafeAreaInsetsDidChange];
    CGFloat bottom = self.view.safeAreaInsets.bottom;
    self.keyboard.bottomInset = bottom;
    [self.keyboard mas_updateConstraints:^(MASConstraintMaker *make) {
        make.height.mas_equalTo(48 * 4 + 3 + bottom);
    }];
    [self.keyboard setNeedsLayout];
}

- (UILabel *)makeTypeLabel:(NSString *)title action:(SEL)action {
    UILabel *label = [[UILabel alloc] init];
    label.text = title;
    label.font = [ABTheme fontH2];
    label.textColor = [ABTheme textSecondary];
    label.userInteractionEnabled = YES;
    UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] initWithTarget:self action:action];
    [label addGestureRecognizer:tap];
    return label;
}

- (UIView *)makeRowWithTitle:(NSString *)title valueLabel:(UILabel * __strong *)outLabel value:(NSString *)value action:(SEL)action {
    UIView *row = [[UIView alloc] init];
    row.userInteractionEnabled = YES;
    UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] initWithTarget:self action:action];
    [row addGestureRecognizer:tap];

    UILabel *titleLabel = [[UILabel alloc] init];
    titleLabel.text = title;
    titleLabel.font = [ABTheme fontBody];
    titleLabel.textColor = [ABTheme textPrimary];
    [row addSubview:titleLabel];

    UILabel *valueLabel = [[UILabel alloc] init];
    valueLabel.text = value;
    valueLabel.font = [ABTheme fontBody];
    valueLabel.textColor = [ABTheme textSecondary];
    [row addSubview:valueLabel];
    if (outLabel) *outLabel = valueLabel;

    UIImageView *chevron = [[UIImageView alloc] initWithImage:[UIImage systemImageNamed:@"chevron.right"]];
    chevron.tintColor = [ABTheme textTertiary];
    chevron.contentMode = UIViewContentModeScaleAspectFit;
    [row addSubview:chevron];

    [titleLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(row).offset(16);
        make.centerY.equalTo(row);
        make.width.mas_equalTo(48);
    }];
    [valueLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(titleLabel.mas_right).offset(12);
        make.centerY.equalTo(row);
    }];
    [chevron mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(row).offset(-16);
        make.centerY.equalTo(row);
        make.width.height.mas_equalTo(14);
    }];

    return row;
}

#pragma mark - 收支切换

- (void)onExpense { self.currentType = @"expense"; [self updateTypeAppearance]; self.selectedCategoryId = nil; self.categoryValueLabel.text = @"请选择二级分类"; [self loadCategories]; }
- (void)onIncome { self.currentType = @"income"; [self updateTypeAppearance]; self.selectedCategoryId = nil; self.categoryValueLabel.text = @"请选择二级分类"; [self loadCategories]; }

- (void)updateTypeAppearance {
    BOOL isExpense = [self.currentType isEqualToString:@"expense"];
    self.typeExpenseLabel.textColor = isExpense ? [ABTheme gold] : [ABTheme textSecondary];
    self.typeIncomeLabel.textColor = isExpense ? [ABTheme textSecondary] : [ABTheme gold];
    [self.typeUnderline mas_remakeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.typeExpenseLabel.mas_bottom).offset(6);
        make.centerX.equalTo(isExpense ? self.typeExpenseLabel : self.typeIncomeLabel);
        make.width.mas_equalTo(40);
        make.height.mas_equalTo(3);
    }];
    // 金额颜色跟随收支（对齐前端：支出青绿 / 收入红）
    UIColor *c = isExpense ? [ABTheme expense] : [ABTheme income];
    self.amountLabel.textColor = c;
}

#pragma mark - 数据

- (void)loadCategories {
    NSString *accountId = [ABAccountStore shared].currentId ?: @"";
    __weak typeof(self) weakSelf = self;
    [ABCategoryService getCategories:accountId type:self.currentType parentId:nil visibility:@"visible"
        success:^(NSArray<ABCategory *> *list) {
            __strong typeof(weakSelf) self = weakSelf;
            self.categories = list;
        } failure:^(NSError *error) {
            NSLog(@"[record] 分类加载失败: %@", error.localizedDescription);
        }];
}

- (void)onPickCategory {
    if (!self.categories.count) {
        [self toast:@"暂无可用分类"];
        return;
    }
    ABCategoryPicker *picker = [[ABCategoryPicker alloc] initWithType:self.currentType accountId:@""];
    [picker setCategories:self.categories];
    [picker setSelectedId:self.selectedCategoryId];
    __weak typeof(self) weakSelf = self;
    picker.onPicked = ^(ABCategory *category) {
        __strong typeof(weakSelf) self = weakSelf;
        self.selectedCategoryId = category.categoryId;
        self.categoryValueLabel.text = [NSString stringWithFormat:@"%@ %@", category.icon.length ? category.icon : @"", category.name];
        self.categoryValueLabel.textColor = [ABTheme textPrimary];
    };
    [self.view addSubview:picker];
    [picker mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(self.view);
    }];
    [picker show];
}

- (void)onPickDate {
    UIDatePicker *picker = [[UIDatePicker alloc] init];
    picker.datePickerMode = UIDatePickerModeDate;
    picker.preferredDatePickerStyle = UIDatePickerStyleWheels;
    picker.maximumDate = [NSDate date];

    UIViewController *vc = [[UIViewController alloc] init];
    vc.view.backgroundColor = [ABTheme bgCard];
    vc.preferredContentSize = CGSizeMake(300, 180);
    [vc.view addSubview:picker];
    [picker mas_makeConstraints:^(MASConstraintMaker *make) {
        make.edges.equalTo(vc.view);
    }];

    UIAlertController *alert = [UIAlertController alertControllerWithTitle:@"选择日期" message:nil preferredStyle:UIAlertControllerStyleActionSheet];
    [alert setValue:vc forKey:@"contentViewController"];
    __weak typeof(self) weakSelf = self;
    [alert addAction:[UIAlertAction actionWithTitle:@"确定" style:UIAlertActionStyleDefault handler:^(UIAlertAction *a) {
        __strong typeof(weakSelf) self = weakSelf;
        self.selectedDate = [ABDateUtil formatDate:picker.date];
        self.dateValueLabel.text = self.selectedDate;
        self.dateValueLabel.textColor = [ABTheme textPrimary];
    }]];
    [alert addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    alert.popoverPresentationController.sourceView = self.view;
    alert.popoverPresentationController.sourceRect = self.view.bounds;
    [self presentViewController:alert animated:YES completion:nil];
}

#pragma mark - 保存

- (void)onClose {
    [self dismissViewControllerAnimated:YES completion:nil];
}

- (void)onSave {
    if (self.amount.length == 0 || [self.amount doubleValue] <= 0) {
        [self toast:@"请输入金额"];
        return;
    }

    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    params[@"type"] = self.currentType;
    params[@"amount"] = [ABFormat fixed2:self.amount];
    params[@"recordDate"] = self.selectedDate;
    if (self.selectedCategoryId) params[@"categoryId"] = self.selectedCategoryId;
    if (self.noteField.text.length) params[@"note"] = self.noteField.text;
    if (self.selectedTime.length) params[@"recordTime"] = self.selectedTime;
    NSString *accountId = [ABAccountStore shared].currentId;
    if (accountId.length) params[@"accountId"] = accountId;

    // 离线新增：直接入队
    if (!self.editingTxn && ![[ABNetworkMonitor shared] isOnline]) {
        [[ABOfflineQueue shared] enqueue:params];
        [self toast:@"离线保存成功，联网后自动补传"];
        if (self.onSaved) self.onSaved();
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.2 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [self dismissViewControllerAnimated:YES completion:nil];
        });
        return;
    }

    __weak typeof(self) weakSelf = self;
    void (^successBlock)(ABTransaction *) = ^(ABTransaction *txn) {
        __strong typeof(weakSelf) self = weakSelf;
        if (self.onSaved) self.onSaved();
        [self dismissViewControllerAnimated:YES completion:nil];
    };
    void (^failureBlock)(NSError *) = ^(NSError *error) {
        __strong typeof(weakSelf) self = weakSelf;
        if (!self.editingTxn) {
            [[ABOfflineQueue shared] enqueue:params];
            [self toast:@"网络异常，已离线保存"];
            if (self.onSaved) self.onSaved();
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.2 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                [self dismissViewControllerAnimated:YES completion:nil];
            });
            return;
        }
        [self toast:error.localizedDescription];
    };

    if (self.editingTxn) {
        [ABTransactionService updateTransaction:self.editingTxn.txnId data:params success:successBlock failure:failureBlock];
    } else {
        [ABTransactionService createTransaction:params success:successBlock failure:failureBlock];
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
