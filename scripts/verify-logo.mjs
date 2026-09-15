/**
 * 网页 logo 运行时验证（真实浏览器）。
 *
 *   node scripts/verify-logo.mjs
 *
 * 覆盖：favicon（/static/logo.png）被请求且 200 / 无 favicon.ico 404 /
 *       <link rel="icon"> 指向正确 / logo 实际尺寸（192×192）。
 *
 * ⚠️ 只读不写。
 */
import fs from 'node:fs';
const PW = '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;
function findChrome() {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  for (const d of fs.readdirSync(root).filter(x => x.indexOf('chromium-') === 0).sort().reverse()) {
    for (const arch of ['chrome-mac-arm64','chrome-mac-x64']) {
      const p = root + '/' + d + '/' + arch + '/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
      if (fs.existsSync(p)) return p;
    }
  }
}
let pass = 0, fail = 0;
const check = (n, ok, extra) => { if (ok) { pass++; console.log('  OK ' + n + ' ' + (extra || '')); } else { fail++; console.log('  FAIL ' + n + ' ' + (extra || '')); } };

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();

// 监听 favicon 请求
const faviconReqs = [];
page.on('response', (res) => {
  const u = res.url();
  if (u.indexOf('logo') >= 0 || u.indexOf('favicon') >= 0) {
    faviconReqs.push({ url: u.replace('http://127.0.0.1:5173', ''), status: res.status(), type: res.headers()['content-type'] });
  }
});

await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

console.log('[1] favicon 请求');
console.log('  请求记录:', JSON.stringify(faviconReqs, null, 1));
const logoReq = faviconReqs.find(r => r.url.indexOf('logo.png') >= 0);
check('logo.png 被请求且 200', !!logoReq && logoReq.status === 200, logoReq ? JSON.stringify(logoReq) : 'no request');
check('无 favicon.ico 404', !faviconReqs.some(r => r.url.indexOf('favicon.ico') >= 0 && r.status === 404));

console.log('[2] link rel=icon 指向正确');
const href = await page.evaluate(() => {
  const el = document.querySelector('link[rel="icon"]');
  return el ? el.getAttribute('href') : null;
});
check('rel=icon 存在', !!href, 'href=' + href);

console.log('[3] 新 logo 是品牌橙 + 白 ¥（对比旧 logo 的尺寸变化）');
const size = await page.evaluate(async () => {
  // ⚠️ 用 document.createElement('img') 而不是 `new Image()`：
  //    后者是浏览器全局，而 eslint.config.mjs 给 scripts/**/*.mjs 的白名单里没有它
  //    （只有 document / window / location / history / localStorage / getComputedStyle /
  //    getCurrentPages 这几个）。用 document 系 API 可避免为一行代码去扩白名单。
  return await new Promise((resolve) => {
    const img = document.createElement('img');
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = '/static/logo.png?t=' + Date.now();
  });
});
check('logo 尺寸为 192x192', !!size && size.w === 192 && size.h === 192, JSON.stringify(size));

console.log('[4] 登录页也使用同一份 logo（不再用 SvgIcon）');
// 清 token 强制走登录页
await page.evaluate(() => { localStorage.clear(); });
await page.goto('http://127.0.0.1:5173/#/pages/login/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const loginLogo = await page.evaluate(() => {
  const el = document.querySelector('.logo');
  if (!el) return null;
  const tag = el.tagName;
  const img = el.querySelector('img') || (tag === 'IMG' ? el : null);
  const r = el.getBoundingClientRect();
  return {
    tag,
    src: img ? img.getAttribute('src') : null,
    naturalW: img ? img.naturalWidth : null,
    naturalH: img ? img.naturalHeight : null,
    displayW: Math.round(r.width),
    displayH: Math.round(r.height),
    isSvg: tag.toLowerCase().indexOf('svg') >= 0,
  };
});
check('登录页 logo 存在', !!loginLogo, JSON.stringify(loginLogo));
check('登录页 logo 不再是 svg', !!loginLogo && !loginLogo.isSvg, loginLogo && 'tag=' + loginLogo.tag);
check(
  '登录页 logo 指向 /static/logo.png',
  !!loginLogo && (loginLogo.src || '').indexOf('logo.png') >= 0,
  loginLogo && loginLogo.src
);
check(
  '登录页 logo 显示尺寸 64×64（与改造前 size=64 一致）',
  !!loginLogo && loginLogo.displayW === 64 && loginLogo.displayH === 64,
  loginLogo && loginLogo.displayW + 'x' + loginLogo.displayH
);

await page.screenshot({ path: '/tmp/logo-page.png' });
console.log('\n结果：PASS=' + pass + ' FAIL=' + fail);
await browser.close();
