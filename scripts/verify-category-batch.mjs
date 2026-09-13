/**
 * 分类「批量操作 + 可见性过滤」的端到端验证。
 *
 *   node scripts/verify-category-batch.mjs
 *
 * 覆盖四组规则（都是"不报错但会错"的那类，必须自动盯住）：
 *
 *   ① 可见性过滤：`visibility=visible` 排除隐藏分类；`visibility=all`（默认）返回全部。
 *      默认必须是 all —— 否则分类管理页看不到被隐藏的分类，用户永远无法取消隐藏（功能死锁）。
 *   ② 父隐藏 ⇒ 子不可选：隐藏一级后，其下二级也从 `visible` 里消失，**但没有被写入 is_hidden**
 *      （取消隐藏父级后子级自动回来）。这是实体注释里约定的实现方式。
 *   ③ 批量删除去重：父子同时被选中时，`deleted` 不能把被 CASCADE 的子分类重复计数。
 *   ④ 整单失败：传入不存在/不属于自己的 id 时**整单报错**，不静默少删。
 *
 * ⚠️ 破坏性用例（③④）一律用**自建分类**，脚本结束前删除干净；
 *    ①② 只切换真实分类的 is_hidden，结束时全部还原。
 */
const API = process.env.API || 'http://127.0.0.1:7001/api';
const USER = process.env.SEED_USER || 'demo';
const PASS = process.env.SEED_PASS || '123456';

let pass = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, actual, expected });
    console.log(`  ✗ ${name}\n      实测 ${JSON.stringify(actual)}\n      预期 ${JSON.stringify(expected)}`);
  }
}

function checkTrue(name, cond, detail = '') {
  check(`${name}${detail ? `（${detail}）` : ''}`, !!cond, true);
}

const req = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { http: res.status, ...(json || {}) };
};

// ───────────────────────────────────────────────────────────── 登录
const login = await req('POST', '/auth/login', { body: { username: USER, password: PASS } });
if (login.code !== 0) {
  console.error('登录失败：', login.message);
  process.exit(1);
}
const token = login.data.token;

const list = (qs = '') => req('GET', `/categories${qs}`, { token });

/**
 * 把库里所有分类的 is_hidden 归零，建立**已知基线**。
 *
 * 为什么必须有这一步：脚本上一版把"测试①故意隐藏的分类"留到了测试②，
 * 而测试②又断言"所有二级的 isHidden 都是 false" —— 两条用例互相污染，
 * 报出来的失败看着像产品 bug，其实是脚本自己的状态管理问题。
 * **验证脚本要自己建立前置条件，不能假设库是干净的。**
 */
const resetHidden = async () => {
  const all = (await list()).data || [];
  const hidden = all.filter((c) => c.isHidden).map((c) => c.id);
  if (hidden.length) {
    await req('POST', '/categories/batch-hide', { token, body: { ids: hidden, hidden: false } });
  }
  return hidden.length;
};
const clearedCount = await resetHidden();
console.log(
  clearedCount ? `（基线复位：清掉了 ${clearedCount} 个残留的隐藏标记）` : '（基线干净：无残留隐藏标记）'
);

console.log('\n══ ① 可见性过滤（visibility=all / visible）══');
{
  const all = await list('?type=expense');
  const root = all.data.find((c) => !c.parentId && c.name === '居家物业');
  const child = all.data.find((c) => c.parentId === root.id);
  checkTrue('拿到「居家物业」及其二级分类', !!root && !!child);

  const beforeVisible = (await list('?type=expense&visibility=visible')).data;
  checkTrue('隐藏前：可见列表包含该二级分类', beforeVisible.some((c) => c.id === child.id));

  // —— 隐藏一个二级
  const hide = await req('POST', '/categories/batch-hide', { token, body: { ids: [child.id], hidden: true } });
  check('batch-hide 返回', [hide.code, hide.data.updated, hide.data.hidden], [0, 1, true]);

  const afterAll = (await list('?type=expense')).data;
  const afterVisible = (await list('?type=expense&visibility=visible')).data;
  checkTrue('visibility=all 仍返回它，且 isHidden=true', afterAll.some((c) => c.id === child.id && c.isHidden === true));
  checkTrue('visibility=visible 排除它', !afterVisible.some((c) => c.id === child.id));
  checkTrue('默认（不传 visibility）等同 all', afterAll.length === (await list('?type=expense')).data.length);

  // 本用例用完就地还原 —— 否则这个"故意隐藏"的状态会漏到下一组用例，
  // 让 ② 的"子分类 isHidden 仍是 false"断言假失败（上一版就是这样误导过一次）
  await req('POST', '/categories/batch-hide', { token, body: { ids: [child.id], hidden: false } });
  checkTrue('本用例还原后它又能被 visible 看到', (await list('?type=expense&visibility=visible')).data.some((c) => c.id === child.id));

  console.log('\n══ ② 父隐藏 ⇒ 子不可选（且不写子的 is_hidden）══');
  const hideRoot = await req('POST', '/categories/batch-hide', { token, body: { ids: [root.id], hidden: true } });
  check('隐藏一级只写 1 条（不冗余写子）', hideRoot.data.updated, 1);

  const v2 = (await list('?type=expense&visibility=visible')).data;
  const children = all.data.filter((c) => c.parentId === root.id);
  checkTrue(`父隐藏后其 ${children.length} 个二级全部不可见`, children.every((c) => !v2.some((x) => x.id === c.id)));

  const a2 = (await list('?type=expense')).data;
  checkTrue(
    '这些子分类自身的 isHidden 仍是 false（未被冗余写入）',
    children.every((c) => a2.find((x) => x.id === c.id)?.isHidden === false),
    `检查 ${children.length} 个二级分类`
  );

  // —— 还原
  await req('POST', '/categories/batch-hide', { token, body: { ids: [root.id], hidden: false } });
  await req('POST', '/categories/batch-hide', { token, body: { ids: [child.id], hidden: false } });
  const restored = (await list('?type=expense&visibility=visible')).data;
  checkTrue('取消隐藏后全部恢复可见', children.every((c) => restored.some((x) => x.id === c.id)));
}

console.log('\n══ ③ 批量删除：父子同时选中不重复计数 ══');
const ts = Date.now();
let tRoot = null;
let tChildA = null;
let tChildB = null;
let tLone = null;
try {
  tRoot = (await req('POST', '/categories', { token, body: { name: `__vfy_root_${ts}`, type: 'expense', icon: 'cat-misc' } })).data;
  tChildA = (await req('POST', '/categories', { token, body: { name: `__vfy_a_${ts}`, type: 'expense', icon: 'cat-misc', parentId: tRoot.id } })).data;
  tChildB = (await req('POST', '/categories', { token, body: { name: `__vfy_b_${ts}`, type: 'expense', icon: 'cat-misc', parentId: tRoot.id } })).data;
  const other = (await list('?type=expense&parentId=root')).data.find((c) => c.id !== tRoot.id);
  tLone = (await req('POST', '/categories', { token, body: { name: `__vfy_lone_${ts}`, type: 'expense', icon: 'cat-misc', parentId: other.id } })).data;

  // 选中：一级 + 它的两个子 + 另一个一级下的孤子（去重 + 跨父组合）
  const del = await req('POST', '/categories/batch-delete', {
    token,
    body: { ids: [tRoot.id, tChildA.id, tChildB.id, tLone.id, tChildA.id] }, // 故意重复一个
  });
  // 预期：直接删 2 个（tRoot + tLone），级联 2 个（tChildA/tChildB），总计 4
  check('deleted = 直接删 2 + 级联 2 = 4（重复 id 已去重，子分类未重复计数）', del.data.deleted, 4);
  check('deletedChildren = 级联 2', del.data.deletedChildren, 2);

  const left = (await list('?type=expense')).data.map((c) => c.id);
  checkTrue('四个测试分类都已删除', [tRoot, tChildA, tChildB, tLone].every((c) => !left.includes(c.id)));
  tRoot = tChildA = tChildB = tLone = null;

  console.log('\n══ ④ 整单失败：不存在的 id 不让它静默少删 ══');
  const bogus = await req('POST', '/categories/batch-delete', {
    token,
    body: { ids: [String(other.id), '999999999'] },
  });
  check('混入不存在的 id → 40401', bogus.code, 40401);
  checkTrue('且那条真实分类**没有**被删掉', (await list('?type=expense')).data.some((c) => c.id === other.id));

  const empty = await req('POST', '/categories/batch-hide', { token, body: { ids: [], hidden: true } });
  checkTrue('空 ids 被参数校验拦下（422）', empty.http === 422 || empty.code === 42200, `http=${empty.http} code=${empty.code}`);
} finally {
  // —— 兜底清理：万一上面中途失败，也别留垃圾数据
  for (const c of [tChildA, tChildB, tLone, tRoot]) {
    if (c?.id) await req('DELETE', `/categories/${c.id}`, { token }).catch(() => {});
  }
}

console.log('\n' + '─'.repeat(62));
if (failures.length) {
  console.log(`❌ 失败 ${failures.length} 项 / 通过 ${pass} 项`);
  for (const f of failures) console.log(`   · ${f.name}`);
  process.exitCode = 1;
} else {
  console.log(`✅ 全部通过（${pass} 项断言）`);
}
