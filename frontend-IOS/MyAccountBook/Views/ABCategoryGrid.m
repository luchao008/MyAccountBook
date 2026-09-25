//
//  ABCategoryGrid.m
//  MyAccountBook
//
//  纯 frame 布局（简单可靠）：4 列，图标 48 圆形，名称最多两行。
//

#import "ABCategoryGrid.h"
#import "ABTheme.h"
#import "ABIconView.h"

static const CGFloat kItemHeight = 90;
static const CGFloat kIconSize = 48;

@interface ABCategoryGridItem : UIControl
@property (nonatomic, strong) UIView *iconBox;
@property (nonatomic, strong) ABIconView *iconView;
@property (nonatomic, strong) UILabel *nameLabel;
@property (nonatomic, strong) ABCategory *category;
@end

@implementation ABCategoryGridItem
@end

@interface ABCategoryGrid ()
@property (nonatomic, strong) NSMutableArray<ABCategoryGridItem *> *items;
@end

@implementation ABCategoryGrid

- (instancetype)initWithFrame:(CGRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        _items = [NSMutableArray array];
    }
    return self;
}

- (void)setCategories:(NSArray<ABCategory *> *)categories {
    _categories = categories;
    [self rebuild];
    [self invalidateIntrinsicContentSize];
}

- (void)setSelectedId:(NSString *)selectedId {
    _selectedId = selectedId;
    [self updateSelection];
}

- (void)rebuild {
    for (UIView *v in self.subviews) { [v removeFromSuperview]; }
    [self.items removeAllObjects];

    if (!self.categories.count) {
        UILabel *empty = [[UILabel alloc] init];
        empty.text = @"暂无分类，请先到「我的 - 分类管理」添加";
        empty.font = [ABTheme fontBodySm];
        empty.textColor = [ABTheme textSecondary];
        empty.textAlignment = NSTextAlignmentCenter;
        empty.numberOfLines = 0;
        empty.frame = CGRectMake(0, 0, self.bounds.size.width, 80);
        empty.autoresizingMask = UIViewAutoresizingFlexibleWidth;
        [self addSubview:empty];
        return;
    }

    for (ABCategory *cat in self.categories) {
        ABCategoryGridItem *item = [[ABCategoryGridItem alloc] init];
        item.category = cat;

        item.iconBox = [[UIView alloc] initWithFrame:CGRectMake(0, 0, kIconSize, kIconSize)];
        item.iconBox.backgroundColor = [ABTheme bgInset];
        item.iconBox.layer.cornerRadius = kIconSize / 2.0;
        item.iconBox.userInteractionEnabled = NO;
        [item addSubview:item.iconBox];

        item.iconView = [[ABIconView alloc] initWithSize:32];
        item.iconView.iconKey = cat.icon;
        item.iconView.frame = CGRectMake(8, 8, 32, 32);
        item.iconView.autoresizingMask = UIViewAutoresizingFlexibleLeftMargin | UIViewAutoresizingFlexibleRightMargin | UIViewAutoresizingFlexibleTopMargin | UIViewAutoresizingFlexibleBottomMargin;
        [item.iconBox addSubview:item.iconView];

        item.nameLabel = [[UILabel alloc] init];
        item.nameLabel.text = cat.name;
        item.nameLabel.font = [ABTheme fontCaption];
        item.nameLabel.textColor = [ABTheme textSecondary];
        item.nameLabel.textAlignment = NSTextAlignmentCenter;
        item.nameLabel.numberOfLines = 2;
        [item addSubview:item.nameLabel];

        [item addTarget:self action:@selector(onItemTap:) forControlEvents:UIControlEventTouchUpInside];
        [self addSubview:item];
        [self.items addObject:item];
    }

    [self updateSelection];
    [self setNeedsLayout];
}

- (void)layoutSubviews {
    [super layoutSubviews];
    CGFloat W = self.bounds.size.width;
    if (W <= 0 || !self.items.count) return;

    CGFloat colW = W / 4.0;
    for (NSInteger i = 0; i < self.items.count; i++) {
        ABCategoryGridItem *item = self.items[i];
        NSInteger row = i / 4;
        NSInteger col = i % 4;

        item.frame = CGRectMake(col * colW, row * kItemHeight, colW, kItemHeight);
        item.iconBox.frame = CGRectMake((colW - kIconSize) / 2.0, 0, kIconSize, kIconSize);

        CGFloat nameTop = kIconSize + 6;
        item.nameLabel.frame = CGRectMake(2, nameTop, colW - 4, kItemHeight - nameTop);
        [item.nameLabel sizeToFit];
        CGRect f = item.nameLabel.frame;
        f.origin.x = 2;
        f.size.width = colW - 4;
        f.origin.y = nameTop;
        item.nameLabel.frame = f;
    }
}

- (CGSize)intrinsicContentSize {
    if (!self.items.count) return CGSizeMake(UIViewNoIntrinsicMetric, 80);
    NSInteger rows = (self.items.count + 3) / 4;
    return CGSizeMake(UIViewNoIntrinsicMetric, rows * kItemHeight);
}

- (void)updateSelection {
    for (ABCategoryGridItem *item in self.items) {
        BOOL selected = [item.category.categoryId isEqualToString:self.selectedId ?: @""];
        if (selected) {
            item.iconBox.backgroundColor = [ABTheme goldSoft];
            item.iconBox.layer.borderWidth = 2;
            item.iconBox.layer.borderColor = [ABTheme gold].CGColor;
            item.nameLabel.textColor = [ABTheme gold];
            item.nameLabel.font = [UIFont systemFontOfSize:12 weight:UIFontWeightMedium];
        } else {
            item.iconBox.backgroundColor = [ABTheme bgInset];
            item.iconBox.layer.borderWidth = 0;
            item.nameLabel.textColor = [ABTheme textSecondary];
            item.nameLabel.font = [ABTheme fontCaption];
        }
    }
}

- (void)onItemTap:(ABCategoryGridItem *)sender {
    if (self.onPick) self.onPick(sender.category);
}

@end
