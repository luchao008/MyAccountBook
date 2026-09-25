//
//  ABStatisticsService.h
//  MyAccountBook
//
//  统计 API —— 对齐 frontend/src/api/statistics.ts
//

#import <Foundation/Foundation.h>
#import "ABStatistics.h"

NS_ASSUME_NONNULL_BEGIN

typedef void (^ABReportSuccess)(ABReportData *data);
typedef void (^ABOverviewSuccess)(ABOverview *overview);
typedef void (^ABServiceFailure)(NSError *error);

@interface ABStatisticsService : NSObject

/// 报表聚合：period 为 'YYYY'（年）或 'YYYY-MM'（年月）
+ (void)getReport:(NSString *)period accountId:(nullable NSString *)accountId success:(ABReportSuccess)success failure:(ABServiceFailure)failure;

/// 首页总览：历年累计 + 今天/本周/本月/本年/去年
+ (void)getOverview:(nullable NSString *)accountId success:(ABOverviewSuccess)success failure:(ABServiceFailure)failure;

@end

NS_ASSUME_NONNULL_END
