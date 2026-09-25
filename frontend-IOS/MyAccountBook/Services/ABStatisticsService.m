//
//  ABStatisticsService.m
//  MyAccountBook
//

#import "ABStatisticsService.h"
#import "ABHttpClient.h"

@implementation ABStatisticsService

+ (void)getReport:(NSString *)period accountId:(NSString *)accountId success:(ABReportSuccess)success failure:(ABServiceFailure)failure {
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    params[@"period"] = period ?: @"";
    if (accountId) params[@"accountId"] = accountId;

    [[ABHttpClient sharedClient] GET:@"/statistics/report" params:params success:^(id data) {
        if (success && [data isKindOfClass:NSDictionary.class]) {
            success([[ABReportData alloc] initWithDictionary:data]);
        }
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)getOverview:(NSString *)accountId success:(ABOverviewSuccess)success failure:(ABServiceFailure)failure {
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    if (accountId) params[@"accountId"] = accountId;

    [[ABHttpClient sharedClient] GET:@"/statistics/overview" params:params success:^(id data) {
        if (success && [data isKindOfClass:NSDictionary.class]) {
            success([[ABOverview alloc] initWithDictionary:data]);
        }
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

@end
