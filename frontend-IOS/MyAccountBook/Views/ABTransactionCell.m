//
//  ABTransactionCell.m
//  MyAccountBook
//

#import "ABTransactionCell.h"
#import "ABTheme.h"
#import "ABFormat.h"
#import "ABIconView.h"
#import <Masonry/Masonry.h>

@interface ABTransactionCell ()
@property (nonatomic, strong) UIView *iconBg;
@property (nonatomic, strong) ABIconView *iconView;
@property (nonatomic, strong) UILabel *nameLabel;
@property (nonatomic, strong) UILabel *noteLabel;
@property (nonatomic, strong) UILabel *amountLabel;
@property (nonatomic, strong) ABTransaction *txn;
@end

@implementation ABTransactionCell

- (instancetype)initWithStyle:(UITableViewCellStyle)style reuseIdentifier:(NSString *)reuseIdentifier {
    self = [super initWithStyle:style reuseIdentifier:reuseIdentifier];
    if (self) {
        self.selectionStyle = UITableViewCellSelectionStyleNone;
        self.backgroundColor = [ABTheme bgCard];

        _iconBg = [[UIView alloc] init];
        _iconBg.backgroundColor = [ABTheme bgInset];
        _iconBg.layer.cornerRadius = 20;
        [self.contentView addSubview:_iconBg];

        _iconView = [[ABIconView alloc] initWithSize:26];
        [_iconBg addSubview:_iconView];

        _nameLabel = [[UILabel alloc] init];
        _nameLabel.font = [ABTheme fontBody];
        _nameLabel.textColor = [ABTheme textPrimary];
        [self.contentView addSubview:_nameLabel];

        _noteLabel = [[UILabel alloc] init];
        _noteLabel.font = [ABTheme fontCaption];
        _noteLabel.textColor = [ABTheme textSecondary];
        [self.contentView addSubview:_noteLabel];

        _amountLabel = [[UILabel alloc] init];
        _amountLabel.font = [ABTheme fontBodyLg];
        _amountLabel.textAlignment = NSTextAlignmentRight;
        [self.contentView addSubview:_amountLabel];

        [_iconBg mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(self.contentView).offset(16);
            make.centerY.equalTo(self.contentView);
            make.width.height.mas_equalTo(40);
        }];
        [_iconView mas_makeConstraints:^(MASConstraintMaker *make) {
            make.center.equalTo(self.iconBg);
            make.width.height.mas_equalTo(26);
        }];
        [_nameLabel mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(self.iconBg.mas_right).offset(12);
            make.top.equalTo(self.contentView).offset(12);
            make.right.lessThanOrEqualTo(self.amountLabel.mas_left).offset(-8);
        }];
        [_noteLabel mas_makeConstraints:^(MASConstraintMaker *make) {
            make.left.equalTo(self.nameLabel);
            make.top.equalTo(self.nameLabel.mas_bottom).offset(2);
            make.right.lessThanOrEqualTo(self.amountLabel.mas_left).offset(-8);
        }];
        [_amountLabel mas_makeConstraints:^(MASConstraintMaker *make) {
            make.right.equalTo(self.contentView).offset(-16);
            make.centerY.equalTo(self.contentView);
        }];
    }
    return self;
}

- (void)configureWithTransaction:(ABTransaction *)txn {
    [self configureWithTransaction:txn metaOverride:nil];
}

- (void)configureWithTransaction:(ABTransaction *)txn metaOverride:(NSString *)metaOverride {
    self.txn = txn;
    self.iconView.iconKey = txn.categoryIcon;
    self.nameLabel.text = [txn categoryName];
    // 搜索场景（前端 searchMeta）：账本名 · 备注 · 日期 时刻
    self.noteLabel.text = metaOverride.length ? metaOverride : (txn.note.length ? txn.note : @"");

    BOOL isIncome = [txn.type isEqualToString:@"income"];
    NSString *sign = isIncome ? @"+" : @"-";
    self.amountLabel.text = [NSString stringWithFormat:@"%@%@", sign, [ABFormat money:txn.amount]];
    self.amountLabel.textColor = isIncome ? [ABTheme income] : [ABTheme expense];
}

+ (CGFloat)height {
    return 64;
}

@end
