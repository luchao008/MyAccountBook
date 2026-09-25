//
//  ABImportViewController.m
//  MyAccountBook
//

#import "ABImportViewController.h"
#import "ABTheme.h"
#import "ABNavigationBar.h"
#import "ABImportService.h"
#import "ABAccountStore.h"
#import <Masonry/Masonry.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

@interface ABImportViewController () <UIDocumentPickerDelegate>

@property (nonatomic, strong) ABNavigationBar *navBar;
@property (nonatomic, strong) UIButton *pickButton;
@property (nonatomic, strong) UISwitch *skipSwitch;
@property (nonatomic, strong) UILabel *fileLabel;
@property (nonatomic, strong) UITextView *reportView;
@property (nonatomic, strong) UIButton *commitButton;

@property (nonatomic, copy, nullable) NSString *pickedFilename;
@property (nonatomic, copy, nullable) NSString *pickedBase64;

@end

@implementation ABImportViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [ABTheme bgPage];
    [self setupViews];
}

- (void)setupViews {
    self.navBar = [[ABNavigationBar alloc] init];
    [self.navBar setTitle:@"流水导入"];
    __weak typeof(self) weakSelf = self;
    self.navBar.onBack = ^{
        [weakSelf.navigationController popViewControllerAnimated:YES];
    };
    [self.view addSubview:self.navBar];

    UIView *card = [[UIView alloc] init];
    card.backgroundColor = [ABTheme bgCard];
    card.layer.cornerRadius = kRadiusCard;
    [self.view addSubview:card];

    self.pickButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.pickButton setTitle:@"选择 xlsx 文件" forState:UIControlStateNormal];
    [self.pickButton setTitleColor:[ABTheme gold] forState:UIControlStateNormal];
    self.pickButton.titleLabel.font = [ABTheme fontBodyLg];
    self.pickButton.layer.borderWidth = 1;
    self.pickButton.layer.borderColor = [ABTheme gold].CGColor;
    self.pickButton.layer.cornerRadius = kRadiusMd;
    [self.pickButton addTarget:self action:@selector(onPickFile) forControlEvents:UIControlEventTouchUpInside];
    [card addSubview:self.pickButton];

    self.fileLabel = [[UILabel alloc] init];
    self.fileLabel.font = [ABTheme fontCaption];
    self.fileLabel.textColor = [ABTheme textSecondary];
    self.fileLabel.text = @"支持随手记导出的 .xlsx，最大 2MB";
    self.fileLabel.numberOfLines = 0;
    [card addSubview:self.fileLabel];

    UILabel *skipLabel = [[UILabel alloc] init];
    skipLabel.text = @"跳过重复流水";
    skipLabel.font = [ABTheme fontBody];
    skipLabel.textColor = [ABTheme textPrimary];
    [card addSubview:skipLabel];

    self.skipSwitch = [[UISwitch alloc] init];
    self.skipSwitch.on = YES;
    self.skipSwitch.onTintColor = [ABTheme gold];
    [card addSubview:self.skipSwitch];

    // 报告区
    UILabel *reportTitle = [[UILabel alloc] init];
    reportTitle.text = @"解析报告";
    reportTitle.font = [ABTheme fontH2];
    reportTitle.textColor = [ABTheme textPrimary];
    [self.view addSubview:reportTitle];

    self.reportView = [[UITextView alloc] init];
    self.reportView.backgroundColor = [ABTheme bgCard];
    self.reportView.font = [UIFont monospacedSystemFontOfSize:12 weight:UIFontWeightRegular];
    self.reportView.textColor = [ABTheme textPrimary];
    self.reportView.editable = NO;
    self.reportView.layer.cornerRadius = kRadiusCard;
    self.reportView.textContainerInset = UIEdgeInsetsMake(12, 12, 12, 12);
    [self.view addSubview:self.reportView];

    self.commitButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.commitButton setTitle:@"确认导入" forState:UIControlStateNormal];
    [self.commitButton setTitleColor:[ABTheme textInverse] forState:UIControlStateNormal];
    self.commitButton.titleLabel.font = [ABTheme fontBodyLg];
    self.commitButton.backgroundColor = [ABTheme gold];
    self.commitButton.layer.cornerRadius = 24;
    self.commitButton.enabled = NO;
    self.commitButton.alpha = 0.5;
    [self.commitButton addTarget:self action:@selector(onCommit) forControlEvents:UIControlEventTouchUpInside];
    [self.view addSubview:self.commitButton];

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
    [self.pickButton mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(card).offset(16);
        make.left.equalTo(card).offset(16);
        make.right.equalTo(card).offset(-16);
        make.height.mas_equalTo(48);
    }];
    [self.fileLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(self.pickButton.mas_bottom).offset(8);
        make.left.equalTo(card).offset(16);
        make.right.equalTo(card).offset(-16);
    }];
    [skipLabel mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(card).offset(16);
        make.top.equalTo(self.fileLabel.mas_bottom).offset(16);
        make.bottom.equalTo(card).offset(-16);
    }];
    [self.skipSwitch mas_makeConstraints:^(MASConstraintMaker *make) {
        make.right.equalTo(card).offset(-16);
        make.centerY.equalTo(skipLabel);
    }];
    [reportTitle mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.view).offset(20);
        make.top.equalTo(card.mas_bottom).offset(24);
    }];
    [self.reportView mas_makeConstraints:^(MASConstraintMaker *make) {
        make.top.equalTo(reportTitle.mas_bottom).offset(12);
        make.left.equalTo(self.view).offset(16);
        make.right.equalTo(self.view).offset(-16);
        make.bottom.equalTo(self.commitButton.mas_top).offset(-16);
    }];
    [self.commitButton mas_makeConstraints:^(MASConstraintMaker *make) {
        make.left.equalTo(self.view).offset(16);
        make.right.equalTo(self.view).offset(-16);
        make.bottom.equalTo(self.view.mas_safeAreaLayoutGuideBottom).offset(-16);
        make.height.mas_equalTo(48);
    }];
}

#pragma mark - Actions

- (void)onPickFile {
    UIDocumentPickerViewController *picker;
    if (@available(iOS 14.0, *)) {
        UTType *xlsx = [UTType typeWithIdentifier:@"org.openxmlformats.spreadsheetml.sheet"];
        picker = [[UIDocumentPickerViewController alloc] initForOpeningContentTypes:@[xlsx ?: UTTypeData]];
    } else {
        picker = [[UIDocumentPickerViewController alloc] initWithDocumentTypes:@[@"org.openxmlformats.spreadsheetml.sheet"] inMode:UIDocumentPickerModeImport];
    }
    picker.delegate = self;
    picker.allowsMultipleSelection = NO;
    [self presentViewController:picker animated:YES completion:nil];
}

- (void)documentPicker:(UIDocumentPickerViewController *)controller didPickDocumentsAtURLs:(NSArray<NSURL *> *)urls {
    NSURL *url = urls.firstObject;
    if (!url) return;

    // 读文件
    BOOL accessed = [url startAccessingSecurityScopedResource];
    NSData *data = [NSData dataWithContentsOfURL:url];
    if (accessed) [url stopAccessingSecurityScopedResource];

    if (!data) {
        [self showReport:@"读取文件失败"];
        return;
    }
    if (data.length > 2 * 1024 * 1024) {
        [self showReport:@"文件超过 2MB 上限"];
        return;
    }

    self.pickedFilename = url.lastPathComponent;
    self.pickedBase64 = [data base64EncodedStringWithOptions:0];
    self.fileLabel.text = [NSString stringWithFormat:@"已选择：%@（%.1f KB）",
                           url.lastPathComponent, data.length / 1024.0];

    [self doPreview];
}

- (void)documentPickerWasCancelled:(UIDocumentPickerViewController *)controller {
    // 用户取消，无操作
}

- (void)doPreview {
    if (!self.pickedBase64) return;
    self.reportView.text = @"解析中…";
    self.commitButton.enabled = NO;
    self.commitButton.alpha = 0.5;

    NSString *accountId = [ABAccountStore shared].currentId;
    __weak typeof(self) weakSelf = self;
    [ABImportService previewImport:self.pickedFilename contentBase64:self.pickedBase64
        accountId:accountId skipDuplicates:self.skipSwitch.isOn
        success:^(NSDictionary *result) {
            __strong typeof(weakSelf) self = weakSelf;
            [self showPreviewReport:result];
            self.commitButton.enabled = YES;
            self.commitButton.alpha = 1.0;
        } failure:^(NSError *error) {
            __strong typeof(weakSelf) self = weakSelf;
            [self showReport:[NSString stringWithFormat:@"解析失败：%@", error.localizedDescription]];
        }];
}

- (void)showPreviewReport:(NSDictionary *)result {
    NSDictionary *summary = [result[@"summary"] isKindOfClass:NSDictionary.class] ? result[@"summary"] : @{};
    NSMutableString *text = [NSMutableString string];
    [text appendFormat:@"文件：%@\n", result[@"filename"] ?: @""];
    [text appendFormat:@"账本：%@\n\n", result[@"accountName"] ?: @""];
    [text appendFormat:@"总行数：%@\n", summary[@"total"] ?: @0];
    [text appendFormat:@"可导入：%@\n", summary[@"importable"] ?: @0];
    [text appendFormat:@"重复跳过：%@\n", summary[@"duplicate"] ?: @0];
    [text appendFormat:@"分类未匹配：%@\n", summary[@"unmatched"] ?: @0];
    [text appendFormat:@"无效行：%@\n", summary[@"invalid"] ?: @0];

    if ([result[@"sheetErrors"] isKindOfClass:NSArray.class] && [result[@"sheetErrors"] count]) {
        [text appendFormat:@"\n⚠️ 读取失败的工作表：\n"];
        for (NSString *err in result[@"sheetErrors"]) {
            [text appendFormat:@"  · %@\n", err];
        }
    }

    [self showReport:text];
}

- (void)onCommit {
    if (!self.pickedBase64) return;
    self.commitButton.enabled = NO;
    self.commitButton.alpha = 0.5;

    NSString *accountId = [ABAccountStore shared].currentId;
    __weak typeof(self) weakSelf = self;
    [ABImportService commitImport:self.pickedFilename contentBase64:self.pickedBase64
        accountId:accountId skipDuplicates:self.skipSwitch.isOn
        success:^(NSDictionary *result) {
            __strong typeof(weakSelf) self = weakSelf;
            NSMutableString *text = [NSMutableString string];
            [text appendFormat:@"✅ 导入完成\n\n"];
            [text appendFormat:@"成功：%@\n", result[@"imported"] ?: @0];
            [text appendFormat:@"跳过：%@\n", result[@"skipped"] ?: @0];
            [text appendFormat:@"失败：%@\n", result[@"failed"] ?: @0];
            [text appendFormat:@"分类降级：%@\n", result[@"unmatched"] ?: @0];
            [self showReport:text];
        } failure:^(NSError *error) {
            __strong typeof(weakSelf) self = weakSelf;
            [self showReport:[NSString stringWithFormat:@"导入失败：%@", error.localizedDescription]];
            self.commitButton.enabled = YES;
            self.commitButton.alpha = 1.0;
        }];
}

- (void)showReport:(NSString *)text {
    self.reportView.text = text;
}

@end
