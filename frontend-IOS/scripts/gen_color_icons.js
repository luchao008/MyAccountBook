const fs = require('fs');
const path = require('path');
const sharp = require('/tmp/svgconv/node_modules/sharp');

const SRC = '/Users/luchao/WorkSpace/MyAccountBook/frontend/src';
const DEST = '/Users/luchao/WorkSpace/MyAccountBook/frontend-IOS/MyAccountBook/Resources/color-icons';

const content = fs.readFileSync(path.join(SRC, 'constants/color-icons.ts'), 'utf8');

// 解析每个集合的 key / size / icons
// 结构：{ key: "colorful", label: "多彩", size: 48, icons: { "colorful:xxx": "<...>" } }
const sets = [];
const setRe = /key:\s*"([^"]+)",[\s\S]*?size:\s*(\d+),[\s\S]*?icons:\s*\{([\s\S]*?)\n\s*\}/g;
let sm;
while ((sm = setRe.exec(content)) !== null) {
  const key = sm[1];
  const size = parseInt(sm[2], 10);
  const body = sm[3];
  const icons = {};
  const iconRe = /"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g;
  let im;
  while ((im = iconRe.exec(body)) !== null) {
    icons[im[1]] = im[2];
  }
  sets.push({ key, size, icons });
}

console.log('解析到集合:', sets.map(s => s.key + '(' + Object.keys(s.icons).length + ')').join(', '));
const total = sets.reduce((n, s) => n + Object.keys(s.icons).length, 0);
console.log('图标总数:', total);

if (!fs.existsSync(DEST)) fs.mkdirSync(DEST, { recursive: true });

(async () => {
  let done = 0, failed = 0;
  const mapping = {};  // key -> filename (无扩展名)

  for (const set of sets) {
    for (const [iconKey, body] of Object.entries(set.icons)) {
      // 把转义还原（JSON 字符串里的 \" -> "）
      let raw = body.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + set.size + ' ' + set.size + '">' + raw + '</svg>';

      // 文件名：colorful:about -> colorful-about
      const name = iconKey.replace(':', '-');
      const file = path.join(DEST, name + '.png');
      try {
        await sharp(Buffer.from(svg), { density: 300 })
          .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toFile(file);
        mapping[iconKey] = name;
        done++;
      } catch (e) {
        failed++;
        if (failed <= 5) console.log('失败:', iconKey, e.message);
      }
    }
  }

  console.log('转换完成: 成功', done, '失败', failed);

  // 生成 OC 映射文件
  const entries = Object.entries(mapping).map(([k, v]) => '        @"' + k + '": @"' + v + '",').join('\n');
  const header = [
    '//',
    '//  ABColorIconMap.h',
    '//  MyAccountBook',
    '//',
    '//  彩色图标（colorful: / life:）→ bundle 内 PNG 名映射。',
    '//  由 scripts/gen_color_icons.js 从 frontend/src/constants/color-icons.ts 生成，请勿手改。',
    '//',
    '',
    '#import <Foundation/Foundation.h>',
    '',
    'NS_ASSUME_NONNULL_BEGIN',
    '',
    '@interface ABColorIconMap : NSObject',
    '',
    '/// 彩色图标 key → PNG 文件名（不含扩展名）。不存在返回 nil。',
    '+ (nullable NSString *)imageNameForKey:(NSString *)iconKey;',
    '',
    '/// 是否为彩色图标 key（前缀 colorful: / life:）',
    '+ (BOOL)isColorIconKey:(NSString *)iconKey;',
    '',
    '@end',
    '',
    'NS_ASSUME_NONNULL_END',
    ''
  ].join('\n');

  const impl = [
    '//',
    '//  ABColorIconMap.m',
    '//  MyAccountBook',
    '//',
    '',
    '#import "ABColorIconMap.h"',
    '',
    '@implementation ABColorIconMap',
    '',
    '+ (NSDictionary<NSString *, NSString *> *)map {',
    '    static NSDictionary *dict = nil;',
    '    static dispatch_once_t onceToken;',
    '    dispatch_once(&onceToken, ^{',
    '        dict = @{',
    entries,
    '        };',
    '    });',
    '    return dict;',
    '}',
    '',
    '+ (NSString *)imageNameForKey:(NSString *)iconKey {',
    '    if (!iconKey.length) return nil;',
    '    return [self map][iconKey];',
    '}',
    '',
    '+ (BOOL)isColorIconKey:(NSString *)iconKey {',
    '    if (![iconKey isKindOfClass:NSString.class]) return NO;',
    '    return [iconKey hasPrefix:@"colorful:"] || [iconKey hasPrefix:@"life:"];',
    '}',
    '',
    '@end',
    ''
  ].join('\n');

  fs.writeFileSync('/Users/luchao/WorkSpace/MyAccountBook/frontend-IOS/MyAccountBook/Utils/ABColorIconMap.h', header);
  fs.writeFileSync('/Users/luchao/WorkSpace/MyAccountBook/frontend-IOS/MyAccountBook/Utils/ABColorIconMap.m', impl);
  console.log('生成 ABColorIconMap.h/.m 完成');
})();
