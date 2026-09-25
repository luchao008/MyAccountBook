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

+ (CGFloat)height;

@end

NS_ASSUME_NONNULL_END
