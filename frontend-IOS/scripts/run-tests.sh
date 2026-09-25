#!/usr/bin/env bash
#
# 跑 iOS 单元测试。用法：bash scripts/run-tests.sh
#
# ⚠️ 判据是日志里的 `** TEST SUCCEEDED **`，**不是退出码**：
#   · 收尾时沙箱常拦一个无关的删除动作（~/.swiftpm/security）让退出码非 0；
#   · 反过来，只 grep "error:" 会漏掉断言失败 —— 失败信息里没有 "error:"。
#   所以：先落日志文件，再判成功标记，最后才打印摘要。
#
set -uo pipefail

# ⚠️ Intel Mac 上 pod / ruby 在 /usr/local/bin，工具 shell 的 PATH 里没有
export PATH="/usr/local/bin:$PATH"

cd "$(dirname "$0")/.." || exit 1

LOG="$(mktemp -t abtest)"
DERIVED="$(cd .. && pwd)/.tmp-ios-build"
BUNDLE_ID="com.luchao.MyAccountBook"

# ⚠️ **必须先卸掉模拟器上的 App。**
# 测试 bundle 就在 App 包的 `PlugIns/` 里，而 `xcodebuild test` 在 App **已在运行**时
# 不会把它换成新的 —— 于是 **xcrun 跑的是旧代码 / 旧测试**，结果"全绿"但毫无意义。
# 实测踩到：故意写反一条断言（`XCTAssertNotNil`），仍然报「✅ 全部通过」，
# 卸载后重跑才如期变红。这个坑**没有任何报错**，比测试失败危险得多。
xcrun simctl terminate booted "$BUNDLE_ID" >/dev/null 2>&1
xcrun simctl uninstall booted "$BUNDLE_ID" >/dev/null 2>&1

xcodebuild test \
  -workspace MyAccountBook.xcworkspace \
  -scheme MyAccountBook \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO >"$LOG" 2>&1

# 编译错误 / 断言失败 / 用例统计
grep -E "error:|Test Case .* failed|Executed [0-9]+ tests, with" "$LOG" | tail -20
echo "--- 日志：$LOG ---"

if grep -q '\*\* TEST SUCCEEDED \*\*' "$LOG"; then
  echo "✅ 全部通过"
  exit 0
fi

echo "❌ 测试失败 —— 完整日志见 $LOG"
grep -E "failed \(|XCTAssert|error:" "$LOG" | head -20
exit 1
