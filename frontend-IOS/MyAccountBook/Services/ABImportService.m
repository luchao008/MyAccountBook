//
//  ABImportService.m
//  MyAccountBook
//

#import "ABImportService.h"
#import "ABHttpClient.h"

@implementation ABImportService

+ (void)previewImport:(NSString *)filename
        contentBase64:(NSString *)base64
            accountId:(NSString *)accountId
       skipDuplicates:(BOOL)skipDuplicates
              success:(ABImportPreviewSuccess)success
              failure:(ABServiceFailure)failure {
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    params[@"filename"] = filename ?: @"";
    params[@"contentBase64"] = base64 ?: @"";
    params[@"skipDuplicates"] = @(skipDuplicates);
    if (accountId.length) params[@"accountId"] = accountId;

    [[ABHttpClient sharedClient] POST:@"/transactions/import/preview" params:params success:^(id data) {
        if (success) success([data isKindOfClass:NSDictionary.class] ? data : @{});
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

+ (void)commitImport:(NSString *)filename
       contentBase64:(NSString *)base64
           accountId:(NSString *)accountId
      skipDuplicates:(BOOL)skipDuplicates
             success:(ABImportCommitSuccess)success
             failure:(ABServiceFailure)failure {
    NSMutableDictionary *params = [NSMutableDictionary dictionary];
    params[@"filename"] = filename ?: @"";
    params[@"contentBase64"] = base64 ?: @"";
    params[@"skipDuplicates"] = @(skipDuplicates);
    if (accountId.length) params[@"accountId"] = accountId;

    [[ABHttpClient sharedClient] POST:@"/transactions/import/commit" params:params success:^(id data) {
        if (success) success([data isKindOfClass:NSDictionary.class] ? data : @{});
    } failure:^(NSError *error) {
        if (failure) failure(error);
    }];
}

@end
