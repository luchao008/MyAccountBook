//
//  ABImportService.h
//  MyAccountBook
//
//  流水导入（xlsx）—— 对齐 frontend/src/api/transaction.ts 的导入部分。
//  流程：preview（不写库）→ commit（写库）。文件用 JSON + base64 承载。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^ABImportPreviewSuccess)(NSDictionary *result);
typedef void (^ABImportCommitSuccess)(NSDictionary *result);
typedef void (^ABServiceFailure)(NSError *error);

@interface ABImportService : NSObject

+ (void)previewImport:(NSString *)filename
        contentBase64:(NSString *)base64
            accountId:(nullable NSString *)accountId
       skipDuplicates:(BOOL)skipDuplicates
              success:(ABImportPreviewSuccess)success
              failure:(ABServiceFailure)failure;

+ (void)commitImport:(NSString *)filename
       contentBase64:(NSString *)base64
           accountId:(nullable NSString *)accountId
      skipDuplicates:(BOOL)skipDuplicates
             success:(ABImportCommitSuccess)success
             failure:(ABServiceFailure)failure;

@end

NS_ASSUME_NONNULL_END
