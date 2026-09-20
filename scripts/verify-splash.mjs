/**
 * 启动图（boot splash）运行时验证（真实浏览器）。
 *
 *   node scripts/verify-splash.mjs
 *
 * 背景（2026-09-20）：iOS「添加到主屏幕」后全屏打开时，从点图标到 Vue 挂载
 * 这段没有地址栏/进度条，是纯白。为此在 index.html 内联了一个启动图
 * （视觉照抄登录页 header），并由内联脚本在**页面真实内容出现后**移除它。
 *
 * 覆盖：
 *   ① index.html 里有启动图，且**样式内联**（不能依赖外部 CSS —— 那要等 JS）
 *   ② 启动图与登录页 header 视觉一致（尺寸/位置），保证过渡无缝
 *   ③ 启动期 splash 可见；加载完成后被移除（不残留）
 *   ④ ⚠️ **6 秒兜底存在**：源码里必须有超时移除 —— 否则一旦页面渲染失败，
 *      启动图会永远糊在屏幕上（比白屏更糟，用户连报错都看不到）
 *   ⑤ 启动图不在 #app 内（放里面会被 Vue 挂载清空，实测漏 723ms 空窗）
 *
 * ⚠️ 只读不写。
 */
import fs from 'node:fs';
import path from 'node:path';

const PW = '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;

function findChrome() {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  for (const d of fs
    .readdirSync(root)
    .filter((x) => x.indexOf('chromium-') === 0)
    .sort()
    .reverse()) {
    for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
      const p =
        root +
        '/' +
        d +
        '/' +
        arch +
        '/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error('未找到 chromium 可执行文件');
}

let pass = 0;
let fail = 0;
const check = (n, ok, extra) => {
  if (ok) {
    pass++;
    console.log('  OK ' + n + ' ' + (extra || ''));
  } else {
    fail++;
    console.log('  FAIL ' + n + ' ' + (extra || ''));
  }
};

const ROOT = path.resolve(import.meta.dirname, '..');
const INDEX = path.join(ROOT, 'frontend/index.html');
const html = fs.readFileSync(INDEX, 'utf8');

console.log('[1] index.html 结构（静态检查）');
check('存在 #boot-splash', html.indexOf('id="boot-splash"') >= 0);
check(
  '启动图样式是内联的（<style> 里含 #boot-splash 规则）',
  /<style>[\s\S]*#boot-splash\s*\{/.test(html),
  '外部 CSS 要等 JS 拉完才生效，覆盖不了"JS 到达前"这段窗口',
);
check(
  '启动图放在 #app **外面**',
  html.indexOf('id="boot-splash"') < html.indexOf('id="app"'),
  '放里面会被 Vue 挂载的 innerHTML="" 清空 —— 页面 chunk 是懒加载的，会漏一段空白',
);
check(
  '有 6 秒兜底（源码含 setTimeout 移除）',
  /setTimeout\(remove,\s*6000\)/.test(html),
  '没有兜底的话，页面渲染失败时启动图会永远留在屏幕上',
);
check(
  '移除判据是"uni-page-body 有实际文本"',
  html.indexOf('uni-page-body') >= 0 && html.indexOf('innerText') >= 0,
  '只看 uni-page 存在会撤得太早（实测 723ms 空窗）',
);

console.log('');
console.log('[2] 运行时：启动期可见 + 加载后被移除');
const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-proxy-server'],
});
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // 采样：记录 splash 从"在"到"不在"的时刻（用 Date.now，白名单里没有 performance）
  await page.addInitScript(() => {
    window.__splashLog = [];
    const t0 = Date.now();
    const tick = () => {
      const sp = document.getElementById('boot-splash');
      const title = document.querySelector('.title');
      const ready = !!(title && title.textContent.trim());
      const state = 'splash=' + (sp ? 1 : 0) + ' content=' + (ready ? 1 : 0);
      const log = window.__splashLog;
      if (!log.length || log[log.length - 1].state !== state) {
        log.push({ ms: Date.now() - t0, state });
      }
      if (Date.now() - t0 < 15000) setTimeout(tick, 50);
    };
    setTimeout(tick, 0);
  });

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  const log = await page.evaluate(() => window.__splashLog);
  console.log('  时序:', JSON.stringify(log));

  check(
    '启动图曾出现',
    log.some((e) => e.state.indexOf('splash=1') === 0),
  );
  check(
    '加载完成后启动图已移除',
    !(await page.evaluate(() => !!document.getElementById('boot-splash'))),
  );
  check(
    '登录页内容已渲染',
    await page.evaluate(() => {
      const t = document.querySelector('.title');
      return !!(t && t.textContent.trim());
    }),
  );

  /*
   * ⚠️ 必须找**最后一次** splash=0，不能 find 第一个：
   *    采样脚本在页面解析前就注入了，首帧读到的是"元素还没出现"（也是 splash=0），
   *    用 find 会命中那个 1ms 的初始态，算出"移除时内容还没就绪"的假失败（实测踩过）。
   */
  const splashOff = [...log].reverse().find((e) => e.state.indexOf('splash=0') === 0);
  const ready = log.find((e) => e.state.indexOf('content=1') >= 0);
  const splashOn = log.find((e) => e.state.indexOf('splash=1') === 0);
  if (splashOff && ready) {
    check(
      '启动图移除时内容已就绪（无空窗）',
      splashOff.ms >= ready.ms - 200,
      'splash 移除 ' + splashOff.ms + 'ms / 内容就绪 ' + ready.ms + 'ms',
    );
    check(
      '启动图覆盖了从"出现"到"内容就绪"的整段',
      !!splashOn && splashOn.ms <= ready.ms,
      'splash 出现 ' + (splashOn ? splashOn.ms : '?') + 'ms',
    );
  }

  console.log('');
  console.log('[3] 视觉与登录页 header 一致（保证过渡无缝）');
  // 重新开一页，在启动图还可见时量尺寸
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page2 = await ctx2.newPage();
  const cdp = await ctx2.newCDPSession(page2);
  await cdp.send('Network.enable');
  // 限速，让启动图停留得久一点，便于测量
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 100,
    downloadThroughput: (200 * 1024) / 8,
    uploadThroughput: (100 * 1024) / 8,
  });
  await page2.goto('http://127.0.0.1:5173', { waitUntil: 'commit' });
  await page2.waitForTimeout(900);

  const splashBox = await page2.evaluate(() => {
    const sp = document.getElementById('boot-splash');
    if (!sp) return null;
    const img = sp.querySelector('img');
    const title = sp.querySelector('.boot-title');
    const rect = (e) => {
      const r = e.getBoundingClientRect();
      const c = getComputedStyle(e);
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        fs: c.fontSize,
        fw: c.fontWeight,
        color: c.color,
      };
    };
    return {
      img: rect(img),
      title: rect(title),
      bg: getComputedStyle(sp).backgroundImage,
      padTop: getComputedStyle(sp).paddingTop,
    };
  });
  check(
    '启动图此刻可见（限速下）',
    !!splashBox,
    splashBox ? JSON.stringify(splashBox.img) : 'null',
  );

  if (splashBox) {
    check(
      '图标 64×64（与登录页 .logo 一致）',
      splashBox.img.w === 64 && splashBox.img.h === 64,
      splashBox.img.w + 'x' + splashBox.img.h,
    );
    check(
      '标题字号 28px / 字重 600（与登录页 .title 一致）',
      splashBox.title.fs === '28px' && splashBox.title.fw === '600',
      splashBox.title.fs + ' / ' + splashBox.title.fw,
    );
    check(
      '顶部留白 120px（与登录页 .header padding-top 一致）',
      splashBox.padTop === '120px',
      splashBox.padTop,
    );
    check(
      '背景渐变与登录页一致',
      splashBox.bg.indexOf('rgb(253, 246, 239)') >= 0 &&
        splashBox.bg.indexOf('rgb(248, 248, 248)') >= 0,
      splashBox.bg,
    );
  }
} finally {
  await browser.close();
}

console.log('');
console.log('结果：PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
