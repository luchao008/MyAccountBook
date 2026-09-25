//
//  ABPlaceholderViewController.m
//  MyAccountBook
//

#import "ABPlaceholderViewController.h"
#import "ABTheme.h"

@interface ABPlaceholderViewController ()
@property (nonatomic, copy) NSString *pageTitle;
@end

@implementation ABPlaceholderViewController

- (instancetype)initWithTitle:(NSString *)title {
    self = [super init];
    if (self) {
        _pageTitle = [title copy];
    }
    return self;
}

- (void)viewDidLoad {
    [super viewDidLoad];
    self.title = self.pageTitle;
    self.view.backgroundColor = [ABTheme bgPage];

    UILabel *label = [[UILabel alloc] init];
    label.text = [NSString stringWithFormat:@"%@\n（地基占位，后续实现）", self.pageTitle];
    label.numberOfLines = 0;
    label.textAlignment = NSTextAlignmentCenter;
    label.font = [ABTheme fontBodyLg];
    label.textColor = [ABTheme textSecondary];
    label.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:label];

    [NSLayoutConstraint activateConstraints:@[
        [label.centerXAnchor constraintEqualToAnchor:self.view.centerXAnchor],
        [label.centerYAnchor constraintEqualToAnchor:self.view.centerYAnchor],
    ]];
}

@end
