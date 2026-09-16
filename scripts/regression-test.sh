#!/bin/bash
# 后端接口完整回归测试
set -u
BASE=http://127.0.0.1:7001
# 本机可能配置了 HTTP 代理，访问 127.0.0.1 必须绕过，否则会被代理拦成 502
export no_proxy="127.0.0.1,localhost"
export NO_PROXY="127.0.0.1,localhost"
PASS=0
FAIL=0
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

check() {
  if [ "$2" = "$3" ]; then
    echo "  PASS  $1 (HTTP $3)"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $1 (expect $2, got $3)"
    FAIL=$((FAIL+1))
  fi
}

code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
jq_get() { node -pe "try{JSON.parse(require('fs').readFileSync(0)).$1}catch(e){''}"; }

echo "=========================================="
echo " Account Book Backend - Regression Test"
echo "=========================================="
echo ""

U="test_$(date +%s)_$RANDOM"
TOKEN=""

echo "[auth]"
cat > $TMP/reg.json <<EOF
{"username":"$U","password":"123456"}
EOF
# 注册一次：同时拿状态码和 token
REG_CODE=$(code -X POST $BASE/api/auth/register -H 'Content-Type: application/json' --data-binary @$TMP/reg.json)
R=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' --data-binary @$TMP/reg.json)
# 上面第二次调用会 409，所以 token 需从第一次调用获取，这里改为直接再登录
TOKEN=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' --data-binary @$TMP/reg.json | jq_get "data.token")
check "register" 200 "$REG_CODE"
check "register dup 409" 409 "$(code -X POST $BASE/api/auth/register -H 'Content-Type: application/json' --data-binary @$TMP/reg.json)"
cat > $TMP/login.json <<EOF
{"username":"$U","password":"123456"}
EOF
check "login ok" 200 "$(code -X POST $BASE/api/auth/login -H 'Content-Type: application/json' --data-binary @$TMP/login.json)"
cat > $TMP/badlogin.json <<EOF
{"username":"$U","password":"badpass"}
EOF
check "login wrong pwd 401" 401 "$(code -X POST $BASE/api/auth/login -H 'Content-Type: application/json' --data-binary @$TMP/badlogin.json)"
echo '{"username":"ab","password":"1"}' > $TMP/short.json
check "validate 422" 422 "$(code -X POST $BASE/api/auth/register -H 'Content-Type: application/json' --data-binary @$TMP/short.json)"
echo ""

echo "[jwt guard]"
check "no token 401" 401 "$(code $BASE/api/categories)"
check "bad token 401" 401 "$(code $BASE/api/categories -H 'Authorization: Bearer bad.token')"
# ⚠️ 用 /accounts 而非 /categories 做「token 有效性」探针：
#    分类自 2026-09-16 起为账本级隔离，/categories 必传 accountId，
#    拿它当探针会得到 422（假失败）。
check "valid token 200" 200 "$(code $BASE/api/accounts -H "Authorization: Bearer $TOKEN")"
echo ""

echo "[category]"
# ⚠️ 分类自 2026-09-16 起为**账本级隔离**：所有分类接口必传 accountId。
#    且默认账本（母本）的分类**禁删**（D16）—— 所以"删不存在的分类应 404"这条
#    必须在**非默认账本**上验，否则会先撞上默认账本保护返回 400。
#    这里先建一个空的临时非默认账本，专供分类用例使用。
echo '{"name":"回归临时分类账本","copyAll":false,"categoryIds":[]}' > $TMP/acc_cat.json
ACC_CAT=$(curl -s -X POST $BASE/api/accounts -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/acc_cat.json)
AID=$(echo "$ACC_CAT" | jq_get "data.id")
echo "  (temp account id=$AID)"

cat > $TMP/ce.json <<EOF
{"accountId":"$AID","name":"RegExpense","type":"expense","sort":1}
EOF
CE=$(curl -s -X POST $BASE/api/categories -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/ce.json)
CE_ID=$(echo "$CE" | jq_get "data.id")
cat > $TMP/ci.json <<EOF
{"accountId":"$AID","name":"RegIncome","type":"income","sort":1}
EOF
CI=$(curl -s -X POST $BASE/api/categories -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/ci.json)
CI_ID=$(echo "$CI" | jq_get "data.id")
echo "  (expense id=$CE_ID, income id=$CI_ID)"
cat > $TMP/dup.json <<EOF
{"accountId":"$AID","name":"RegExpense","type":"expense"}
EOF
check "dup name 409" 409 "$(code -X POST $BASE/api/categories -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/dup.json)"
check "list 200" 200 "$(code "$BASE/api/categories?accountId=$AID" -H "Authorization: Bearer $TOKEN")"
check "filter by type 200" 200 "$(code "$BASE/api/categories?accountId=$AID&type=income" -H "Authorization: Bearer $TOKEN")"
check "missing accountId 422" 422 "$(code $BASE/api/categories -H "Authorization: Bearer $TOKEN")"
echo '{"sort":9}' > $TMP/upd.json
check "update 200" 200 "$(code -X PUT "$BASE/api/categories/$CE_ID?accountId=$AID" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/upd.json)"
check "delete missing 404" 404 "$(code -X DELETE "$BASE/api/categories/99999?accountId=$AID" -H "Authorization: Bearer $TOKEN")"
echo ""

echo "[transaction]"
cat > $TMP/t1.json <<EOF
{"type":"expense","amount":"88.88","recordDate":"2026-09-15","categoryId":"$CE_ID","accountId":"$AID","note":"reg test"}
EOF
T1=$(curl -s -X POST $BASE/api/transactions -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/t1.json)
T1_ID=$(echo "$T1" | jq_get "data.id")
echo "  (txn id=$T1_ID)"
# ⚠️ categoryId 属于临时账本 AID，交易必须落到**同一个账本**，
#    否则会撞上「分类不属于该账本」→ 404。这是账本级分类的核心不变量。
cat > $TMP/t2.json <<EOF
{"type":"income","amount":"100","recordDate":"2026-09-15","categoryId":"$CI_ID","accountId":"$AID"}
EOF
check "create 200" 200 "$(code -X POST $BASE/api/transactions -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/t2.json)"
echo '{"type":"expense","amount":"0","recordDate":"2026-09-15"}' > $TMP/t0.json
check "amount=0 422" 422 "$(code -X POST $BASE/api/transactions -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/t0.json)"
echo '{"type":"expense","amount":"1.234","recordDate":"2026-09-15"}' > $TMP/t3.json
check "amount 3dp 422" 422 "$(code -X POST $BASE/api/transactions -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/t3.json)"
cat > $TMP/t4.json <<EOF
{"type":"expense","amount":"10","recordDate":"2026-09-15","categoryId":"$CI_ID","accountId":"$AID"}
EOF
check "type mismatch 400" 400 "$(code -X POST $BASE/api/transactions -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/t4.json)"
# 分类不属于该账本 -> 404（账本级分类的不变量，回归要守住）
cat > $TMP/t5.json <<EOF
{"type":"expense","amount":"10","recordDate":"2026-09-15","categoryId":"$CE_ID"}
EOF
check "category from other account 404" 404 "$(code -X POST $BASE/api/transactions -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/t5.json)"
check "list 200" 200 "$(code $BASE/api/transactions -H "Authorization: Bearer $TOKEN")"
check "date range 200" 200 "$(code "$BASE/api/transactions?start=2026-09-01&end=2026-09-30" -H "Authorization: Bearer $TOKEN")"
check "type filter 200" 200 "$(code "$BASE/api/transactions?type=expense" -H "Authorization: Bearer $TOKEN")"
check "category filter 200" 200 "$(code "$BASE/api/transactions?categoryId=$CE_ID" -H "Authorization: Bearer $TOKEN")"
check "detail 200" 200 "$(code $BASE/api/transactions/$T1_ID -H "Authorization: Bearer $TOKEN")"
echo '{"amount":"99.99"}' > $TMP/tupd.json
check "update 200" 200 "$(code -X PUT $BASE/api/transactions/$T1_ID -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/tupd.json)"
# 清空分类：传空字符串后 categoryId 必须为 null。
# 这里踩过坑——只改 categoryId 不改关系对象时，TypeORM 会用仍挂在实体上的
# entity.category 把外键回填成旧值，导致"清空"无效。
echo '{"categoryId":""}' > $TMP/tclr.json
CLR=$(curl -s -X PUT $BASE/api/transactions/$T1_ID -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/tclr.json)
check "clear category -> null" "null" "$(echo "$CLR" | jq_get "data.categoryId")"
check "missing 404" 404 "$(code $BASE/api/transactions/99999 -H "Authorization: Bearer $TOKEN")"
echo ""

echo "[statistics]"
check "monthly 200" 200 "$(code "$BASE/api/statistics/monthly?month=2026-09" -H "Authorization: Bearer $TOKEN")"
check "category 200" 200 "$(code "$BASE/api/statistics/category?month=2026-09" -H "Authorization: Bearer $TOKEN")"
check "category by type 200" 200 "$(code "$BASE/api/statistics/category?month=2026-09&type=expense" -H "Authorization: Bearer $TOKEN")"
check "bad month 422" 422 "$(code "$BASE/api/statistics/monthly?month=2026-9" -H "Authorization: Bearer $TOKEN")"
check "overview 200" 200 "$(code "$BASE/api/statistics/overview" -H "Authorization: Bearer $TOKEN")"
# 流水分组汇总：五种粒度都要 200
for U in year quarter month week day; do
  check "summary unit=$U 200" 200 "$(code "$BASE/api/transactions/summary?unit=$U" -H "Authorization: Bearer $TOKEN")"
done
check "summary bad unit 422" 422 "$(code "$BASE/api/transactions/summary?unit=bad" -H "Authorization: Bearer $TOKEN")"
# 按分类分组（底栏「分类」维度）
check "summary groupBy=category L1 200" 200 "$(code "$BASE/api/transactions/summary?groupBy=category&level=1" -H "Authorization: Bearer $TOKEN")"
check "summary groupBy=category L2 200" 200 "$(code "$BASE/api/transactions/summary?groupBy=category&level=2" -H "Authorization: Bearer $TOKEN")"
check "summary bad level 422" 422 "$(code "$BASE/api/transactions/summary?groupBy=category&level=3" -H "Authorization: Bearer $TOKEN")"
check "summary bad groupBy 422" 422 "$(code "$BASE/api/transactions/summary?groupBy=bad" -H "Authorization: Bearer $TOKEN")"
check "summary no token 401" 401 "$(code "$BASE/api/transactions/summary?unit=month")"
# 列表新增筛选/排序
check "list keyword 200" 200 "$(code "$BASE/api/transactions?keyword=test" -H "Authorization: Bearer $TOKEN")"
# 关键词现在也匹配金额
check "list keyword=amount 200" 200 "$(code "$BASE/api/transactions?keyword=88" -H "Authorization: Bearer $TOKEN")"
check "list amount range 200" 200 "$(code "$BASE/api/transactions?minAmount=1&maxAmount=99999" -H "Authorization: Bearer $TOKEN")"
check "list order amountAsc 200" 200 "$(code "$BASE/api/transactions?order=amountAsc" -H "Authorization: Bearer $TOKEN")"
check "list order amountDesc 200" 200 "$(code "$BASE/api/transactions?order=amountDesc" -H "Authorization: Bearer $TOKEN")"
check "list bad order 422" 422 "$(code "$BASE/api/transactions?order=bad" -H "Authorization: Bearer $TOKEN")"
check "report year 200" 200 "$(code "$BASE/api/statistics/report?period=2026" -H "Authorization: Bearer $TOKEN")"
check "report month 200" 200 "$(code "$BASE/api/statistics/report?period=2026-09" -H "Authorization: Bearer $TOKEN")"
check "report bad period 422" 422 "$(code "$BASE/api/statistics/report?period=abc" -H "Authorization: Bearer $TOKEN")"
# 两级口径：一次请求同时返回一级（expenseCategories）与二级（expenseCategoriesL2）
REPORT_JSON=$(curl -s "$BASE/api/statistics/report?period=2026-09" -H "Authorization: Bearer $TOKEN")
check "report L1 has items" 200 "$(code "$BASE/api/statistics/report?period=2026-09" -H "Authorization: Bearer $TOKEN")"
check "report L2 field present" "true" "$(echo "$REPORT_JSON" | jq_get "data.expenseCategoriesL2 !== undefined")"
check "report L1 field present" "true" "$(echo "$REPORT_JSON" | jq_get "data.expenseCategories !== undefined")"
check "report no token 401" 401 "$(code "$BASE/api/statistics/report?period=2026")"
echo ""

echo "[data isolation]"
U2="other_$(date +%s)"
cat > $TMP/u2.json <<EOF
{"username":"$U2","password":"123456"}
EOF
TOKEN2=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' --data-binary @$TMP/u2.json | jq_get "data.token")
# ⚠️ 跨用户断言必须带**自己的** accountId 去查别人的分类 —— 不带会先撞上
#    「accountId 必传」的 422，验不到数据隔离本身。
A2_ID=$(curl -s $BASE/api/accounts -H "Authorization: Bearer $TOKEN2" | jq_get "data[0].id")
check "cross-user category 404" 404 "$(code "$BASE/api/categories/$CE_ID?accountId=$A2_ID" -H "Authorization: Bearer $TOKEN2")"
check "cross-user txn 404" 404 "$(code $BASE/api/transactions/$T1_ID -H "Authorization: Bearer $TOKEN2")"
echo ""

echo "[account]"
# 列表：注册时自动创建的默认账本
ACC_LIST=$(curl -s $BASE/api/accounts -H "Authorization: Bearer $TOKEN")
check "list 200" 200 "$(code $BASE/api/accounts -H "Authorization: Bearer $TOKEN")"
DEF_ID=$(echo "$ACC_LIST" | jq_get "data[0].id")

# 新建账本
echo '{"name":"回归测试账本","icon":"wallet","sort":1}' > $TMP/acc1.json
ACC=$(curl -s -X POST $BASE/api/accounts -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/acc1.json)
ACC_ID=$(echo "$ACC" | jq_get "data.id")
check "create 200" 200 "$(code -X POST $BASE/api/accounts -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"另建一个"}')"
check "dup name 409" 409 "$(code -X POST $BASE/api/accounts -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/acc1.json)"

# 指定账本记账
cat > $TMP/acc_txn.json <<EOF
{"type":"expense","amount":"30.00","recordDate":"2026-09-20","note":"记到新账本","accountId":"$ACC_ID"}
EOF
check "create txn in account 200" 200 "$(code -X POST $BASE/api/transactions -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/acc_txn.json)"
check "filter txn by account 200" 200 "$(code "$BASE/api/transactions?accountId=$ACC_ID" -H "Authorization: Bearer $TOKEN")"
check "stat by account 200" 200 "$(code "$BASE/api/statistics/monthly?month=2026-09&accountId=$ACC_ID" -H "Authorization: Bearer $TOKEN")"
check "report by account 200" 200 "$(code "$BASE/api/statistics/report?period=2026&accountId=$ACC_ID" -H "Authorization: Bearer $TOKEN")"
# 总览按账本：此时 ACC_ID 已有值，断言的是真正的账本维度
check "overview by account 200" 200 "$(code "$BASE/api/statistics/overview?accountId=$ACC_ID" -H "Authorization: Bearer $TOKEN")"

# 删除前预检
check "delete preview 200" 200 "$(code $BASE/api/accounts/$ACC_ID/delete-preview -H "Authorization: Bearer $TOKEN")"

# 防误删：确认名不匹配 -> 400
check "delete wrong name 400" 400 "$(code -X DELETE "$BASE/api/accounts/$ACC_ID?confirmName=写错了" -H "Authorization: Bearer $TOKEN")"

# 最后一个账本不可删（TOKEN2 的用户只有注册时那一个）
ACC2=$(curl -s $BASE/api/accounts -H "Authorization: Bearer $TOKEN2")
DEF2_ID=$(echo "$ACC2" | jq_get "data[0].id")
check "delete last account 400" 400 "$(code -X DELETE "$BASE/api/accounts/$DEF2_ID?confirmName=默认账本" -H "Authorization: Bearer $TOKEN2")"

# 合并预检 + 合并
cat > $TMP/merge.json <<EOF
{"targetId":"$DEF_ID","sourceId":"$ACC_ID"}
EOF
check "merge preview 200" 200 "$(code -X POST $BASE/api/accounts/merge-preview -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/merge.json)"
check "merge 200" 200 "$(code -X POST $BASE/api/accounts/merge -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/merge.json)"
# 合并后源账本应已消失
check "merged source gone 404" 404 "$(code $BASE/api/accounts/$ACC_ID -H "Authorization: Bearer $TOKEN")"
# 合并到自己 -> 400
# 注意：这里必须用文件传 JSON。带变量的 JSON 直接写进 -d 会被多层 shell 转义破坏，
# 导致 bodyParser 报 invalid JSON 而返回 500（这个坑踩过不止一次）。
cat > $TMP/mergeself.json <<EOF
{"targetId":"$DEF_ID","sourceId":"$DEF_ID"}
EOF
check "merge self 400" 400 "$(code -X POST $BASE/api/accounts/merge -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @$TMP/mergeself.json)"
# 无 token -> 401
check "no token 401" 401 "$(code $BASE/api/accounts)"
echo ""

echo "=========================================="
echo " Result: PASS=$PASS  FAIL=$FAIL"
echo "=========================================="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
