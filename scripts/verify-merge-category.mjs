/**
 * 「合并账本时的分类迁移」端到端验证（接口级，设计 D7）。
 *
 *   node scripts/verify-merge-category.mjs
 *
 * 覆盖：
 *   ① 合并后交易的分类**仍指向目标账本的分类**（同账本不变量）
 *   ② 目标账本没有同名分类时，源分类被**复制**过去
 *   ③ 目标账本已有同名分类时，**复用**它（不产生重复）
 *   ④ 合并去重指纹用**分类名**（同名分类跨账本能正确判重）
 *   ⑤ 合并后源账本被删除
 *
 * ⚠️ 会创建 2 个临时账本 + 临时交易，结束前全部清理。
 */
const API = process.env.API || 'http://127.0.0.1:7001/api';
const USER = process.env.SEED_USER || 'demo';
const PASS = process.env.SEED_PASS || '123456';

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}\n      实测 ${JSON.stringify(actual)}\n      预期 ${JSON.stringify(expected)}`);
  }
};
const checkTrue = (name, cond, detail = '') =>
  check(`${name}${detail ? `（${detail}）` : ''}`, !!cond, true);

let token = '';
const api = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
};
{
  const l = await api('POST', '/auth/login', { username: USER, password: PASS });
  token = l.data.token;
}

const ts = Date.now();
const targetName = `__mg_t_${ts}`;
const sourceName = `__mg_s_${ts}`;
const created = [];

try {
  // 两个空账本（copyAll:false → 0 分类），分类自己建，便于精确断言
  const target = (await api('POST', '/accounts', { name: targetName, icon: 'wallet', copyAll: false })).data;
  const source = (await api('POST', '/accounts', { name: sourceName, icon: 'wallet', copyAll: false })).data;
  created.push([target.id, targetName], [source.id, sourceName]);
  console.log(`（目标账本 ${target.id}、源账本 ${source.id} 已创建）`);

  console.log('\n══ ① 合并：目标无同名分类 → 源分类被复制过去 ══');
  {
    // 源：一级「餐饮S」+ 二级「早餐S」；交易挂在二级上
    const sRoot = (
      await api('POST', '/categories', {
        accountId: source.id,
        name: '餐饮S',
        type: 'expense',
        icon: 'cat-food',
      })
    ).data;
    const sChild = (
      await api('POST', '/categories', {
        accountId: source.id,
        name: '早餐S',
        type: 'expense',
        icon: 'cat-food',
        parentId: sRoot.id,
      })
    ).data;
    await api('POST', '/transactions', {
      accountId: source.id,
      type: 'expense',
      amount: '25.00',
      recordDate: '2026-09-10',
      categoryId: sChild.id,
      note: '__mg_a',
    });

    const before = (await api('GET', `/categories?accountId=${target.id}`)).data;
    check('目标账本合并前 0 分类', before.length, 0);

    const merge = await api('POST', '/accounts/merge', { targetId: target.id, sourceId: source.id });
    check('合并成功', merge.code, 0);

    const afterCats = (await api('GET', `/categories?accountId=${target.id}`)).data;
    const names = afterCats.map((c) => c.name).sort();
    check('目标账本出现了源的两个分类', names, ['早餐S', '餐饮S'].sort());

    const txns = (await api('GET', `/transactions?accountId=${target.id}&size=50`)).data;
    const list = txns.list || txns;
    const moved = list.find((t) => t.note === '__mg_a');
    checkTrue('交易已迁入目标账本', !!moved);
    if (moved) {
      // 关键：分类必须指向**目标账本**的分类行（同账本不变量）
      const targetCatIds = new Set(afterCats.map((c) => c.id));
      checkTrue('交易的分类指向目标账本的分类行', targetCatIds.has(String(moved.categoryId)), `categoryId=${moved.categoryId}`);

      // 且分类名对得上
      const cat = afterCats.find((c) => c.id === String(moved.categoryId));
      check('分类名保持为「早餐S」', cat && cat.name, '早餐S');
    }
  }

  console.log('\n══ ② 合并：目标已有同名分类 → 复用（不重复）══');
  {
    // 再造一对账本；目标先建同名「餐饮S」，源也有「餐饮S」
    const target2Name = `__mg_t2_${ts}`;
    const source2Name = `__mg_s2_${ts}`;
    const target2 = (await api('POST', '/accounts', { name: target2Name, icon: 'wallet', copyAll: false })).data;
    const source2 = (await api('POST', '/accounts', { name: source2Name, icon: 'wallet', copyAll: false })).data;
    created.push([target2.id, target2Name], [source2.id, source2Name]);

    const tRoot = (
      await api('POST', '/categories', {
        accountId: target2.id,
        name: '餐饮S',
        type: 'expense',
        icon: 'cat-food',
      })
    ).data;
    const sRoot2 = (
      await api('POST', '/categories', {
        accountId: source2.id,
        name: '餐饮S',
        type: 'expense',
        icon: 'cat-food',
      })
    ).data;
    await api('POST', '/transactions', {
      accountId: source2.id,
      type: 'expense',
      amount: '30.00',
      recordDate: '2026-09-11',
      categoryId: sRoot2.id,
      note: '__mg_b',
    });

    await api('POST', '/accounts/merge', { targetId: target2.id, sourceId: source2.id });

    const cats2 = (await api('GET', `/categories?accountId=${target2.id}`)).data;
    const sameName = cats2.filter((c) => c.name === '餐饮S');
    check('同名分类没有重复（仍只有 1 个）', sameName.length, 1);
    check('复用的是目标原有的那行', sameName[0] && sameName[0].id, String(tRoot.id));

    const txns2 = (await api('GET', `/transactions?accountId=${target2.id}&size=50`)).data;
    const list2 = txns2.list || txns2;
    const moved2 = list2.find((t) => t.note === '__mg_b');
    checkTrue('交易迁入且分类指向目标的「餐饮S」', !!moved2 && String(moved2.categoryId) === String(tRoot.id), moved2 ? `categoryId=${moved2.categoryId}` : 'n/a');
  }

  console.log('\n══ ③ 合并后源账本被删除 ══');
  {
    const accs = (await api('GET', '/accounts')).data;
    checkTrue('源账本已不在列表', !accs.some((a) => a.name === sourceName));
    checkTrue('目标账本仍在', accs.some((a) => a.name === targetName));
  }

  console.log('\n══ ④ 合并预检的分类口径 ══');
  {
    // 两个账本各有一笔"分类名相同、金额日期类型备注都相同"的交易 → 应判为重复
    const t3Name = `__mg_t3_${ts}`;
    const s3Name = `__mg_s3_${ts}`;
    const t3 = (await api('POST', '/accounts', { name: t3Name, icon: 'wallet', copyAll: false })).data;
    const s3 = (await api('POST', '/accounts', { name: s3Name, icon: 'wallet', copyAll: false })).data;
    created.push([t3.id, t3Name], [s3.id, s3Name]);

    const catA = (
      await api('POST', '/categories', { accountId: t3.id, name: '同名类', type: 'expense', icon: 'cat-misc' })
    ).data;
    const catB = (
      await api('POST', '/categories', { accountId: s3.id, name: '同名类', type: 'expense', icon: 'cat-misc' })
    ).data;
    checkTrue('两个账本的同名分类是不同 id（物理隔离）', catA.id !== catB.id);

    for (const [accId, catId, note] of [
      [t3.id, catA.id, '__mg_dup'],
      [s3.id, catB.id, '__mg_dup'],
    ]) {
      await api('POST', '/transactions', {
        accountId: accId,
        type: 'expense',
        amount: '55.55',
        recordDate: '2026-09-12',
        categoryId: catId,
        note,
      });
    }

    const preview = await api('POST', '/accounts/merge-preview', {
      targetId: t3.id,
      sourceId: s3.id,
    });
    check('预检成功', preview.code, 0);
    check('源 1 笔、判重 1 笔（分类名相同 → 正确判重）', [
      preview.data.sourceTotal,
      preview.data.willSkip,
    ], [1, 1]);
  }
} finally {
  for (const [id, name] of created) {
    await api('DELETE', `/accounts/${id}?confirmName=${encodeURIComponent(name)}`).catch(() => {});
  }
  console.log(`（清理了 ${created.length} 个临时账本）`);
}

console.log('\n' + '─'.repeat(62));
if (failures.length) {
  console.log(`❌ 失败 ${failures.length} 项 / 通过 ${pass} 项`);
  for (const f of failures) console.log(`   · ${f}`);
  process.exitCode = 1;
} else {
  console.log(`✅ 全部通过（${pass} 项断言）`);
}
