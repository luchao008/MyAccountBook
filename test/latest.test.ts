/**
 * 「最后写入者胜」守卫单测。
 *
 * 被测对象是前端纯函数 `utils/latest.ts` —— 不依赖 uni-app / Vue 运行时，
 * 所以可以直接进根目录 jest（与 `amount-expr.test.ts` 同一路数）。
 *
 * ⚠️ **本文件的核心价值是「过期结果不许落地」这条反向样本**。
 *    它对应的真实缺陷已经在本项目里出现过（页面级加载没有守卫，
 *    报表页会把旧时段的数字写到新时段的标题下面，且不报错）。
 *    因此：**如果把 `run()` 里的 `if (token !== seq) return` 注释掉，
 *    「先发后到」那条用例必须变红。** 改实现后请手动跑一次这个负向验证 ——
 *    没验过"能报错"的校验器等于没有校验器。
 *
 * 反面做法（本文件刻意避免）：只测"能拿到数据"。
 * 那种断言对坏实现恒真 —— 一个把守卫删掉的实现照样能过。
 */
import { createLatest } from '../frontend/src/utils/latest';

/** 手工可控的 Promise（用于精确编排"谁先返回"） */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createLatest · 单次调用', () => {
  it('结果落地，onSettled 跑一次', async () => {
    const g = createLatest();
    const landed: string[] = [];
    let settled = 0;

    await g.run({
      task: async () => '值',
      onSuccess: (d) => landed.push(d),
      onSettled: () => {
        settled += 1;
      },
    });

    expect(landed).toEqual(['值']);
    expect(settled).toBe(1);
  });

  it('失败走 onError，onSettled 仍跑一次、且 run 不 reject', async () => {
    const g = createLatest();
    const errors: unknown[] = [];
    let settled = 0;

    await expect(
      g.run({
        task: async () => {
          throw new Error('boom');
        },
        onSuccess: () => {},
        onError: (e) => errors.push(e),
        onSettled: () => {
          settled += 1;
        },
      }),
    ).resolves.toBeUndefined();

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('boom');
    expect(settled).toBe(1);
  });
});

describe('createLatest · 竞态（本文件的存在理由）', () => {
  it('先发后到：旧结果不许落地', async () => {
    const g = createLatest();
    const first = deferred<string>();
    const second = deferred<string>();
    const landed: string[] = [];

    const p1 = g.run({ task: () => first.promise, onSuccess: (d) => landed.push(d) });
    const p2 = g.run({ task: () => second.promise, onSuccess: (d) => landed.push(d) });

    // 后发的先返回
    second.resolve('新');
    await p2;
    // 先发的后返回 —— 必须被丢弃
    first.resolve('旧');
    await p1;

    expect(landed).toEqual(['新']);
  });

  it('onSettled 只在最新一次时跑（旧请求不得提前关掉新请求的加载态）', async () => {
    const g = createLatest();
    const first = deferred<void>();
    const second = deferred<void>();
    let settled = 0;
    // 模拟页面上的 loading 标志
    let loading = true;

    const p1 = g.run({
      task: () => first.promise,
      onSuccess: () => {},
      onSettled: () => {
        settled += 1;
        loading = false;
      },
    });
    const p2 = g.run({
      task: () => second.promise,
      onSuccess: () => {},
      onSettled: () => {
        settled += 1;
        loading = false;
      },
    });

    first.resolve(); // 旧请求先回
    await p1;
    // 新请求还在飞 —— loading 必须仍然是 true，否则界面会假装"加载完了"
    expect(settled).toBe(0);
    expect(loading).toBe(true);

    second.resolve();
    await p2;
    expect(settled).toBe(1);
    expect(loading).toBe(false);
  });

  it('过期失败不上报，只有最新的失败才上报', async () => {
    const g = createLatest();
    const first = deferred<string>();
    const second = deferred<string>();
    const errors: unknown[] = [];

    const p1 = g.run({
      task: () => first.promise,
      onSuccess: () => {},
      onError: (e) => errors.push(e),
    });
    const p2 = g.run({
      task: () => second.promise,
      onSuccess: () => {},
      onError: (e) => errors.push(e),
    });

    second.reject(new Error('新失败'));
    await p2;
    first.reject(new Error('旧失败'));
    await p1;

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('新失败');
  });
});

describe('createLatest · invalidate', () => {
  it('invalidate 之后到期的响应不落地、不跑 onSettled（页面已卸载）', async () => {
    const g = createLatest();
    const d = deferred<string>();
    const landed: string[] = [];
    let settled = 0;

    const p = g.run({
      task: () => d.promise,
      onSuccess: (x) => landed.push(x),
      onSettled: () => {
        settled += 1;
      },
    });

    g.invalidate();
    d.resolve('晚了');
    await p;

    expect(landed).toEqual([]);
    expect(settled).toBe(0);
  });

  it('invalidate 只让已发出的作废，之后的新调用照常落地', async () => {
    const g = createLatest();
    const landed: string[] = [];

    g.invalidate();
    await g.run({ task: async () => '新页面', onSuccess: (d) => landed.push(d) });

    expect(landed).toEqual(['新页面']);
  });
});

describe('createLatest · begin / isCurrent 独立用法', () => {
  it('只有最后一次 begin 的序号是 current，invalidate 会作废当前序号', () => {
    const g = createLatest();
    const a = g.begin();
    expect(g.isCurrent(a)).toBe(true);

    const b = g.begin();
    expect(g.isCurrent(a)).toBe(false);
    expect(g.isCurrent(b)).toBe(true);

    g.invalidate();
    expect(g.isCurrent(b)).toBe(false);
  });
});
