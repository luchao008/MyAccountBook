//
//  ABNavigationBar.m
//  MyAccountBook
//

#import "ABNavigationBar.h"
#import "ABTheme.h"
#import <Masonry/Masonry.h>

@implementation ABNavigationBar

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        _showsBackButton = YES;
        self.backgroundColor = [ABTheme bgPage];

        _backButton = [UIButton buttonWithType:UIButtonTypeSystem];
        [_backButton setImage:[UIImage systemImageNamed:@"chevron.left"] forState:UIControlStateNormal];
        _backButton.tintColor = [ABTheme textPrimary];
        [_backButton addTarget:self action:@selector(handleBack) forControlEvents:UIControlEventTouchUpInside];
        [self addSubview:_backButton];

        _titleLabel = [[UILabel alloc] init];
        _titleLabel.font = [ABTheme fontH1];
        _titleLabel.textColor = [ABTheme textPrimary];
        _titleLabel.textAlignment = NSTextAlignmentCenter;
        [self addSubview:_titleLabel];

        _rightButton = [UIButton buttonWithType:UIButtonTypeSystem];
        _rightButton.titleLabel.font = [ABTheme fontBody];
        [_rightButton setTitleColor:[ABTheme gold] forState:UIControlStateNormal];
        [_rightButton addTarget:self action:@selector(handleRight) forControlEvents:UIControlEventTouchUpInside];
        _rightButton.hidden = YES;
        [self addSubview:_rightButton];

        [_backButton mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(self).offset(8);
            make.bottom.equalTo(self).offset(-8);
            make.width.height.mas_equalTo(44);
        }];
        [_titleLabel mas_makeConstraints:^(MASConstraintMaker *make) {
            make.centerX.equalTo(self);
            make.bottom.equalTo(self).offset(-8);
            make.height.mas_equalTo(28);
        }];
        [_rightButton mas_makeConstraints:^(MASConstraintMaker *make) {
            make.right.equalTo(self).offset(-16);
            make.centerY.equalTo(_titleLabel);
            make.height.mas_equalTo(44);
        }];
    }
    return self;
}

- (void)setTitle:(NSString *)title {
    self.titleLabel.text = title;
}

- (void)setShowsBackButton:(BOOL)showsBackButton {
    _showsBackButton = showsBackButton;
    self.backButton.hidden = !showsBackButton;
}

- (void)setRightTitle:(NSString *)title {
    if (title.length) {
        [self.rightButton setTitle:title forState:UIControlStateNormal];
        self.rightButton.hidden = NO;
    } else {
        self.rightButton.hidden = YES;
    }
}

- (void)handleBack {
    if (self.onBack) self.onBack();
}

- (void)handleRight {
    if (self.onRight) self.onRight();
}

@end
