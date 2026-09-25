//
//  ABEmptyView.m
//  MyAccountBook
//

#import "ABEmptyView.h"
#import "ABTheme.h"

@interface ABEmptyView ()
@property (nonatomic, strong) UILabel *iconLabel;
@property (nonatomic, strong) UILabel *textLabel;
@end

@implementation ABEmptyView

- (instancetype)initWithText:(NSString *)text {
    return [self initWithIcon:nil text:text];
}

- (instancetype)initWithIcon:(NSString *)icon text:(NSString *)text {
    self = [super initWithFrame:CGRectZero];
    if (self) {
        UILabel *iconLabel = [[UILabel alloc] init];
        iconLabel.text = icon.length ? icon : @"📭";
        iconLabel.font = [UIFont systemFontOfSize:48];
        iconLabel.textAlignment = NSTextAlignmentCenter;
        [self addSubview:iconLabel];
        self.iconLabel = iconLabel;

        UILabel *textLabel = [[UILabel alloc] init];
        textLabel.text = text;
        textLabel.font = [ABTheme fontBody];
        textLabel.textColor = [ABTheme textSecondary];
        textLabel.textAlignment = NSTextAlignmentCenter;
        textLabel.numberOfLines = 0;
        [self addSubview:textLabel];
        self.textLabel = textLabel;

        iconLabel.translatesAutoresizingMaskIntoConstraints = NO;
        textLabel.translatesAutoresizingMaskIntoConstraints = NO;
        [NSLayoutConstraint activateConstraints:@[
            [iconLabel.centerXAnchor constraintEqualToAnchor:self.centerXAnchor],
            [iconLabel.topAnchor constraintEqualToAnchor:self.topAnchor],
            [textLabel.topAnchor constraintEqualToAnchor:iconLabel.bottomAnchor constant:12],
            [textLabel.centerXAnchor constraintEqualToAnchor:self.centerXAnchor],
            [textLabel.bottomAnchor constraintEqualToAnchor:self.bottomAnchor],
            [textLabel.widthAnchor constraintLessThanOrEqualToConstant:260],
        ]];
    }
    return self;
}

- (void)setText:(NSString *)text {
    self.textLabel.text = text;
}

@end
