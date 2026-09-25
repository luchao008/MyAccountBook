//
//  ABIconMap.h
//  MyAccountBook
//
//  分类图片图标（img:<中文分类名>）→ bundle 内 PNG 文件名（拼音）映射。
//  由 scripts/gen_icon_map.js 从 frontend/src/constants/cat-icons.ts 生成，请勿手改。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ABIconMap : NSObject

/// 中文分类名 → PNG 文件名（不含扩展名）。不存在返回 nil。
+ (nullable NSString *)imageNameForCategory:(NSString *)categoryName;

/// 全部图标名（中文分类名），按名称排序。图标选择页用。
+ (NSArray<NSString *> *)allCategoryNames;

@end

NS_ASSUME_NONNULL_END
