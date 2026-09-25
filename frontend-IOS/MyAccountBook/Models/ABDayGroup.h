//
//  ABDayGroup.h
//  MyAccountBook
//
//  展开分组后的「按日分组」明细
//

#import <Foundation/Foundation.h>
#import "ABTransaction.h"

NS_ASSUME_NONNULL_BEGIN

@interface ABDayGroup : NSObject
@property (nonatomic, copy) NSString *date;      // YYYY-MM-DD
@property (nonatomic, strong) NSArray<ABTransaction *> *items;
@end

NS_ASSUME_NONNULL_END
