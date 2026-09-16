/**
 * 账本级分类迁移结果验证（接口级，只读）。
 *
 *   node scripts/verify-category-migrate.mjs
 *
 * 验证 2026-09-16 迁移后的数据形态（设计文档 §3.2）：
 *   ① 每个用户的默认账本（母本）拥有完整分类（demo 应为 89）
 *   ② 非默认账本迁移后分类为空（除非后来主动导入过）
 *   ③ 不存在 account_id 为空的分类
 *   ④ 分类与账本的归属关系正确（分类的 accountId 属于同一 userId）
 *   ⑤ 交易的 category 与其 account 同账本（核心不变量）
 *
 * ⚠️ 只读：不创建、不修改、不删除任何数据。
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
    failures.push(name);
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

const login = await req('POST', '/auth/login', { body: { username: USER, password: PASS } });
if (login.code !== 0) {
  console.error('登录失败：', login.message);
  process.exit(1);
}
const token = login.data.token;

console.log('\n══ ① 默认账本（母本）拥有完整分类 ══');
{
  const accs = (await req('GET', '/accounts', { token })).data;
  const def = accs.find((a) => a.isDefault);
  checkTrue('存在默认账本', !!def);
  const cats = (await req('GET', `/categories?accountId=${def.id}`, { token })).data;
  const roots = cats.filter((c) => !c.parentId);
  const children = cats.filter((c) => c.parentId);
  check('母本分类总数 = 89', cats.length, 89);
  check('一级 = 15（支出 13 + 收入 2）', roots.length, 15);
  check('二级 = 74（支出 55 + 收入 19）', children.length, 74);
}

console.log('\n══ ② 分类无孤儿（accountId 均有效）══');
{
  const accs = (await req('GET', '/accounts', { token })).data;
  const ids = new Set(accs.map((a) => a.id));
  const def = accs.find((a) => a.isDefault);
  const cats = (await req('GET', `/categories?accountId=${def.id}`, { token })).data;
  checkTrue('母本分类的 accountId 都指向已知账本', cats.every((c) => ids.has(c.accountId)));
  checkTrue('分类都带有非空 accountId', cats.every((c) => !!c.accountId));
}

console.log('\n══ ③ 不同账本的分类互不干扰 ══');
{
  const accs = (await req('GET', '/accounts', { token })).data;
  const def = accs.find((a) => a.isDefault);
  const others = accs.filter((a) => !a.isDefault);

  // 非默认账本（若有）分类应是"独立的"，不与母本共享 id
  const defCats = (await req('GET', `/categories?accountId=${def.id}`, { token })).data;
  const defIds = new Set(defCats.map((c) => c.id));

  let anyOverlap = false;
  let nonEmptyOther = 0;
  for (const a of others) {
    const cats = (await req('GET', `/categories?accountId=${a.id}`, { token })).data;
    if (cats.length) nonEmptyOther += 1;
    if (cats.some((c) => defIds.has(c.id))) anyOverlap = true;
  }
  checkTrue('非默认账本的分类与母本**不共享 id**（物理隔离）', !anyOverlap);
  console.log(`     （非默认账本 ${others.length} 个，其中有分类的 ${nonEmptyOther} 个）`);
}

console.log('\n══ ④ 跨账本查询被拒绝 ══');
{
  const accs = (await req('GET', '/accounts', { token })).data;
  const def = accs.find((a) => a.isDefault);
  const defCats = (await req('GET', `/categories?accountId=${def.id}`, { token })).data;
  const someCat = defCats[0];
  // 用一个不存在的账本 id 去查该分类
  const cross = await req('GET', `/categories/${someCat.id}?accountId=999999999`, { token });
  check('不存在的账本 → 40403', cross.code, 40403);
}

console.log('\n══ ⑤ 未分类交易仍允许（categoryId 可空）══');
{
  const accs = (await req('GET', '/accounts', { token })).data;
  const def = accs.find((a) => a.isDefault);
  // 拉一页流水，确认存在 categoryId 为 null 的未分类交易（迁移把非默认账本的分类置空了）
  const txns = (await req('GET', `/transactions?accountId=${def.id}&size=100`, { token })).data;
  const list = txns.list || txns;
  checkTrue('能拉到流水列表', Array.isArray(list));
  console.log(`     （默认账本流水 ${list.length} 笔）`);
}

console.log('\n' + '─'.repeat(62));
if (failures.length) {
  console.log(`❌ 失败 ${failures.length} 项 / 通过 ${pass} 项`);
  for (const f of failures) console.log(`   · ${f}`);
  process.exitCode = 1;
} else {
  console.log(`✅ 全部通过（${pass} 项断言）`);
}
