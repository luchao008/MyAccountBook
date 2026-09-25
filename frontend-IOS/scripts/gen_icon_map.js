const fs = require('fs');
const path = require('path');

const SRC = '/Users/luchao/WorkSpace/MyAccountBook/frontend/src';
const DEST = '/Users/luchao/WorkSpace/MyAccountBook/frontend-IOS/MyAccountBook/Resources/cat-icons';

// 读取 cat-icons.ts 提取 CAT_ICON_FILES
const content = fs.readFileSync(path.join(SRC, 'constants/cat-icons.ts'), 'utf8');
const match = content.match(/CAT_ICON_FILES[^=]*=\s*\{([\s\S]*?)\n\};/);
if (!match) { console.error('未找到 CAT_ICON_FILES'); process.exit(1); }

const map = {};
const re = /"([^"]+)":\s*"([^"]+)"/g;
let m;
while ((m = re.exec(match[1])) !== null) {
  map[m[1]] = m[2];
}
console.log('解析到映射条数:', Object.keys(map).length);

// 拷贝 PNG
if (!fs.existsSync(DEST)) fs.mkdirSync(DEST, { recursive: true });
let copied = 0;
for (const [cn, file] of Object.entries(map)) {
  const src = path.join(SRC, 'static/cat-icons', file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DEST, file));
    copied++;
  }
}
console.log('拷贝图片:', copied);

// 生成 OC 映射文件
const entries = Object.entries(map).map(([cn, file]) => {
  const key = file.replace(/\.png$/, '');
  return `        @"${cn}": @"${key}",`;
}).join('\n');

const header = `//
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

@end

NS_ASSUME_NONNULL_END
`;

const impl = `//
//  ABIconMap.m
//  MyAccountBook
//

#import "ABIconMap.h"

@implementation ABIconMap

+ (NSDictionary<NSString *, NSString *> *)map {
    static NSDictionary *dict = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        dict = @{
${entries}
        };
    });
    return dict;
}

+ (NSString *)imageNameForCategory:(NSString *)categoryName {
    if (!categoryName.length) return nil;
    return [self map][categoryName];
}

@end
`;

fs.writeFileSync('/Users/luchao/WorkSpace/MyAccountBook/frontend-IOS/MyAccountBook/Utils/ABIconMap.h', header);
fs.writeFileSync('/Users/luchao/WorkSpace/MyAccountBook/frontend-IOS/MyAccountBook/Utils/ABIconMap.m', impl);
console.log('生成 ABIconMap.h/.m 完成');
