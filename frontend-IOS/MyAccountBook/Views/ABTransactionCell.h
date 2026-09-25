//
//  ABTransactionCell.h
//  MyAccountBook
//
//  流水列表行（对齐 flow 页的条目样式）
//

#import <UIKit/UIKit.h>
#import "ABTransaction.h"

NS_ASSUME_NONNULL_BEGIN

@interface ABTransactionCell : UITableViewCell

@property (nonatomic, copy, nullable) void (^onDelete)(void);

- (void)configureWithTransaction:(ABTransaction *)txn;

/// 搜索场景用：用 metaOverride 替换副标题（如「账本名 · 备注 · 日期 时刻」）。
/// 传 nil 等同于 configureWithTransaction:（副标题走备注）。
- (void)configureWithTransaction:(ABTransaction *)txn metaOverride:(nullable NSString *)metaOverride;

+ (CGFloat)height;

@end

NS_ASSUME_NONNULL_END
