//
//  ABIconView.m
//  MyAccountBook
//

#import "ABIconView.h"
#import "ABIconMap.h"
#import "ABColorIconMap.h"
#import "ABTheme.h"

@interface ABIconView ()
@property (nonatomic, strong) UIImageView *imageView;
@property (nonatomic, strong) UILabel *textLabel;
@end

@implementation ABIconView

- (instancetype)initWithSize:(CGFloat)size {
    self = [super initWithFrame:CGRectZero];
    if (self) {
        _size = size;

        _imageView = [[UIImageView alloc] init];
        _imageView.contentMode = UIViewContentModeScaleAspectFit;
        _imageView.hidden = YES;
        [self addSubview:_imageView];

        _textLabel = [[UILabel alloc] init];
        _textLabel.font = [UIFont systemFontOfSize:size * 0.8];
        _textLabel.textAlignment = NSTextAlignmentCenter;
        [self addSubview:_textLabel];
    }
    return self;
}

- (void)setIconKey:(NSString *)iconKey {
    _iconKey = iconKey;

    // ① 图片图标（img:<中文名>）
    NSString *imgName = [self resolveImageName:iconKey];
    // ② 彩色图标（colorful: / life:）
    if (!imgName) {
        imgName = [self resolveColorImageName:iconKey];
    }

    if (imgName) {
        UIImage *image = [UIImage imageNamed:imgName];
        if (image) {
            self.imageView.image = image;
            self.imageView.hidden = NO;
            self.textLabel.hidden = YES;
            return;
        }
    }

    // 退化为文字（emoji 或原始值）
    self.imageView.hidden = YES;
    self.textLabel.hidden = NO;
    self.textLabel.text = iconKey.length ? iconKey : @"📁";
}

/// 解析 img:<中文名> → bundle 内图片名
- (NSString *)resolveImageName:(NSString *)iconKey {
    if (![iconKey isKindOfClass:NSString.class]) return nil;
    if (![iconKey hasPrefix:@"img:"]) return nil;
    NSString *categoryName = [iconKey substringFromIndex:4];
    return [ABIconMap imageNameForCategory:categoryName];
}

/// 解析 colorful:<名> / life:<名> → bundle 内图片名
- (NSString *)resolveColorImageName:(NSString *)iconKey {
    if (![ABColorIconMap isColorIconKey:iconKey]) return nil;
    return [ABColorIconMap imageNameForKey:iconKey];
}

- (void)layoutSubviews {
    [super layoutSubviews];
    self.imageView.frame = self.bounds;
    self.textLabel.frame = self.bounds;
}

- (CGSize)intrinsicContentSize {
    return CGSizeMake(self.size, self.size);
}

@end
