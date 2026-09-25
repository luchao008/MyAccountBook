//
//  ABRecordViewController.h
//  MyAccountBook
//
//  记一笔页（对齐 frontend/src/pages/record/index.vue）
//

#import <UIKit/UIKit.h>
#import "ABTransaction.h"

NS_ASSUME_NONNULL_BEGIN

@interface ABRecordViewController : UIViewController

/// 编辑模式：传入已有流水
- (instancetype)initWithTransaction:(nullable ABTransaction *)txn;

/// 保存成功回调
@property (nonatomic, copy, nullable) void (^onSaved)(void);

@end

NS_ASSUME_NONNULL_END
