/**
 * 金额表达式（记一笔键盘加减计算）单测。
 *
 * 被测对象是前端纯函数 utils/amountExpr.ts —— 不依赖 uni-app 运行时，
 * 所以可以直接进根目录 jest。判据全部钉**具体值**，不钉"不抛错"：
 * 金额逻辑"差不多对"就是错。
 *
 * 反向样本（坏实现应该红的用例）刻意包含：
 *   - `0.1+0.2`：浮点求值会得 0.30000000000000004，分单位整数运算必须正好 30 分
 *   - 布尔式断言（只测"能算出数"）抓不住"恒返回 true"的坏实现 → 每个分支都有负例
 */
import {
  pressDigit,
  pressDot,
  pressOperator,
  backspaceExpr,
  isExpression,
  evalExpr,
  formatCents,
} from '../frontend/src/utils/amountExpr';

describe('pressDigit 数字输入', () => {
  it('空串起手与普通追加', () => {
    expect(pressDigit('', '5')).toBe('5');
    expect(pressDigit('12', '3')).toBe('123');
  });

  it('前导零坍缩：0 后按数字替换而不是追加', () => {
    expect(pressDigit('0', '5')).toBe('5');
    expect(pressDigit('3+0', '5')).toBe('3+5');
    // 但 0 前面的操作数不受影响
    expect(pressDigit('10', '0')).toBe('100');
  });

  it('小数位最多两位，第三位被忽略', () => {
    expect(pressDigit('1.23', '4')).toBe('1.23');
    expect(pressDigit('1.2', '3')).toBe('1.23');
    // 作用域是「当前操作数」：前一个操作数的小数不拦后一个
    expect(pressDigit('1.23+4.5', '6')).toBe('1.23+4.56');
  });

  it('整数部分最多 9 位（去前导零后计）', () => {
    expect(pressDigit('123456789', '0')).toBe('123456789');
    expect(pressDigit('12345678', '9')).toBe('123456789');
    // 每个操作数独立计位
    expect(pressDigit('123456789+1', '2')).toBe('123456789+12');
    expect(pressDigit('123456789+123456789', '0')).toBe('123456789+123456789');
    // 小数点后的位数不占整数位额度
    expect(pressDigit('123456789.1', '2')).toBe('123456789.12');
  });
});

describe('pressDot 小数点', () => {
  it('空位自动补 0', () => {
    expect(pressDot('')).toBe('0.');
    expect(pressDot('3+')).toBe('3+0.');
    expect(pressDot('-')).toBe('-0.');
  });

  it('同一操作数只能有一个小数点', () => {
    expect(pressDot('1.2')).toBe('1.2');
    // 运算符后进入新操作数，可以再有
    expect(pressDot('1.2+3')).toBe('1.2+3.');
  });
});

describe('pressOperator 运算符状态机', () => {
  it('空串：只允许负号起手', () => {
    expect(pressOperator('', '-')).toBe('-');
    expect(pressOperator('', '+')).toBe('');
  });

  it('数字后追加运算符', () => {
    expect(pressOperator('3', '+')).toBe('3+');
    expect(pressOperator('3', '-')).toBe('3-');
  });

  it('悬点小数点先收掉再追加', () => {
    expect(pressOperator('3.', '+')).toBe('3+');
    expect(pressOperator('0.', '-')).toBe('0-');
  });

  it('"+ "后再按 - = 加负数；再按 + 去重', () => {
    expect(pressOperator('3+', '-')).toBe('3+-');
    expect(pressOperator('3+', '+')).toBe('3+');
  });

  it('起始负号：按 + 撤销，按 - 去重', () => {
    expect(pressOperator('-', '+')).toBe('');
    expect(pressOperator('-', '-')).toBe('-');
  });

  it('"加负数"的负号：按 + 撤销该负号，按 - 去重', () => {
    expect(pressOperator('3+-', '+')).toBe('3+');
    expect(pressOperator('3+-', '-')).toBe('3+-');
  });

  it('数字后的减号运算符：按 + 换运算符，按 - 去重（不支持 --）', () => {
    expect(pressOperator('3-', '+')).toBe('3+');
    expect(pressOperator('3-', '-')).toBe('3-');
  });
});

describe('backspaceExpr 退格', () => {
  it('逐字符删除，表达式与数字一视同仁', () => {
    expect(backspaceExpr('12.5+3')).toBe('12.5+');
    expect(backspaceExpr('3+-')).toBe('3+');
    expect(backspaceExpr('5')).toBe('');
    expect(backspaceExpr('')).toBe('');
  });
});

describe('isExpression 形态判定', () => {
  it('含真正运算符才是表达式；起始负号不算', () => {
    expect(isExpression('12+3')).toBe(true);
    expect(isExpression('3-2')).toBe(true);
    expect(isExpression('-5')).toBe(false);
    expect(isExpression('12.5')).toBe(false);
    expect(isExpression('')).toBe(false);
  });
});

describe('evalExpr 求值（分单位整数运算）', () => {
  it('纯数字原样转分', () => {
    expect(evalExpr('12.5')).toBe(1250);
    expect(evalExpr('0.05')).toBe(5);
    expect(evalExpr('100')).toBe(10000);
  });

  it('精度钉死：0.1+0.2 必须正好 30 分（浮点求值会得 0.30000000000000004）', () => {
    expect(evalExpr('0.1+0.2')).toBe(30);
    // 2.55 在二进制浮点里是 2.5499999999999998…，直接加会得 5.09999…
    expect(evalExpr('2.55+2.55')).toBe(510);
    expect(evalExpr('0.7+0.1')).toBe(80);
  });

  it('多步混合从左到右', () => {
    expect(evalExpr('12.5+3-2')).toBe(1350);
    expect(evalExpr('1+2+3-4')).toBe(200);
    expect(evalExpr('10-20+5')).toBe(-500);
  });

  it('正负号：起始负号与"加负数"', () => {
    expect(evalExpr('-5+3')).toBe(-200);
    expect(evalExpr('3+-2')).toBe(100);
    expect(evalExpr('-5+-5')).toBe(-1000);
  });

  it('容忍尾部悬空：12+ / 3+- / 3. 都能求值（与「确定」行为一致）', () => {
    expect(evalExpr('12+')).toBe(1200);
    expect(evalExpr('3+-')).toBe(300);
    expect(evalExpr('3.')).toBe(300);
    expect(evalExpr('3.+5')).toBe(800);
  });

  it('无法求值返回 null（空 / 只剩符号）', () => {
    expect(evalExpr('')).toBeNull();
    expect(evalExpr('-')).toBeNull();
    expect(evalExpr('+')).toBeNull();
  });
});

describe('formatCents 展示格式化', () => {
  it('去掉多余的尾零', () => {
    expect(formatCents(1350)).toBe('13.5');
    expect(formatCents(1300)).toBe('13');
    expect(formatCents(1305)).toBe('13.05');
    expect(formatCents(5)).toBe('0.05');
  });

  it('负数带符号', () => {
    expect(formatCents(-200)).toBe('-2');
    expect(formatCents(-250)).toBe('-2.5');
  });

  it('evalExpr + formatCents 组合：实时预览端到端', () => {
    expect(formatCents(evalExpr('12.5+3-2')!)).toBe('13.5');
    expect(formatCents(evalExpr('0.1+0.2')!)).toBe('0.3');
  });
});
