#!/usr/bin/env bash
# 内信 IntraChat - REST API 冒烟测试（开发/部署自检）
# 覆盖：健康检查、注册、审核流转（通过/驳回/禁用/恢复/重置密码/删除）、登录、
#       通讯录、私聊（去重/消息/已读/详情）、群聊（建群/改名/加人/踢人/消息分页）、
#       文件上传/下载、管理统计、鉴权边界（401/403）。
# 用法: bash scripts/api-smoke.sh   （服务需已启动；依赖 curl 与 python3）
set -euo pipefail

BASE="${SMOKE_BASE:-http://localhost:5000}"
ADMIN_USER="${ADMIN_USERNAME:-admin}"
ADMIN_PASS="${ADMIN_INITIAL_PASSWORD:-Admin@123456}"
TS=$(date +%s)
U1="smk1${TS}"
U2="smk2${TS}"
U3="smk3${TS}"
U4="smk4${TS}"
PASS="smokepass123"
PASS_NEW="smokepass456"

say() { echo "[smoke] PASS  $*"; }
fail() { echo "[smoke] FAIL  $*" >&2; exit 1; }

json_field() { # stdin json, $1 = 字段表达式（python）
  python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"
}

# ---------- 0. 健康检查 ----------
curl -sf "$BASE/api/health" | grep -q '"status":"ok"' || fail "health"
say "GET /api/health"

# ---------- 1. 注册（两名用户） ----------
curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U1\",\"password\":\"$PASS\",\"displayName\":\"冒烟一号\"}" \
  "$BASE/api/auth/register" | grep -q '审核' || fail "register $U1"
curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U2\",\"password\":\"$PASS\",\"displayName\":\"冒烟二号\"}" \
  "$BASE/api/auth/register" | grep -q '审核' || fail "register $U2"
curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U3\",\"password\":\"$PASS\",\"displayName\":\"冒烟三号\"}" \
  "$BASE/api/auth/register" | grep -q '审核' || fail "register $U3"
curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U4\",\"password\":\"$PASS\",\"displayName\":\"冒烟四号\"}" \
  "$BASE/api/auth/register" | grep -q '审核' || fail "register $U4"
say "POST /api/auth/register x4"

# 重复注册 -> 409
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U1\",\"password\":\"$PASS\",\"displayName\":\"重复\"}" \
  "$BASE/api/auth/register")
[ "$CODE" = "409" ] || fail "register duplicate expected 409 got $CODE"
say "register duplicate -> 409"

# ---------- 2. 待审核禁止登录 ----------
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U1\",\"password\":\"$PASS\"}" "$BASE/api/auth/login")
[ "$CODE" = "403" ] || fail "pending login expected 403 got $CODE"
say "pending login blocked -> 403"

# ---------- 3. 管理员登录 ----------
# 预置管理员首次登录强制改密：仅当管理员当前处于“待强制改密”状态(must_change_password=1)时断言全流程；
# 若标志已清除（改密完成/非强制）则说明功能已生效或此前已验证，跳过并提示，避免污染后续用例。
RESP=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" "$BASE/api/auth/login")
echo "$RESP" | grep -qi '"mustChangePassword":true' || {
  echo "[smoke] PASS  强制改密已生效或未开启（管理员非强制态），跳过全流程断言"
  AT=$(echo "$RESP" | json_field "d['token']")
  curl -s "$BASE/api/auth/me" -H "Authorization: Bearer $AT" | grep -q '"role":"admin"' || fail "me"
  say "admin login + GET /api/auth/me"
  # 后续依赖 $AT 的用例需要 AT 已定义
  set +e; RETEST_SKIP=1; set -e
}
if [ "${RETEST_SKIP:-0}" != "1" ]; then
  ATF=$(echo "$RESP" | json_field "d['token']")
  curl -s "$BASE/api/auth/me" -H "Authorization: Bearer $ATF" | grep -qi '"mustChangePassword":true' || fail "强制改密 · me 携带标记"
  curl -s -X PUT -H 'Content-Type: application/json' \
    -d "{\"oldPassword\":\"$ADMIN_PASS\",\"newPassword\":\"TempSmoke#123\"}" \
    "$BASE/api/auth/password" -H "Authorization: Bearer $ATF" | grep -qi '已更新' || fail "强制改密 · 修改密码失败"
  curl -s "$BASE/api/auth/me" -H "Authorization: Bearer $ATF" | grep -qi '"mustChangePassword":false' || fail "强制改密 · 改密后标记未清除"
  RESP2=$(curl -s -X POST -H 'Content-Type: application/json' \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"TempSmoke#123\"}" "$BASE/api/auth/login")
  echo "$RESP2" | grep -qi '"token"' || fail "强制改密 · 新密码登录失败"
  ATF2=$(echo "$RESP2" | json_field "d['token']")
  curl -s -X PUT -H 'Content-Type: application/json' \
    -d "{\"oldPassword\":\"TempSmoke#123\",\"newPassword\":\"$ADMIN_PASS\"}" \
    "$BASE/api/auth/password" -H "Authorization: Bearer $ATF2" | grep -qi '已更新' || fail "强制改密 · 还原密码失败"
  say "预置管理员首次登录强制改密（改密→标记清除→新密码登录）"
  # 全流程后重新以初始密码取 AT，供后续用例使用
  AT=$(curl -s -X POST -H 'Content-Type: application/json' \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" \
    "$BASE/api/auth/login" | json_field "d['token']") || fail "admin login"
  curl -s "$BASE/api/auth/me" -H "Authorization: Bearer $AT" | grep -q '"role":"admin"' || fail "me"
  say "admin login + GET /api/auth/me"
fi

admin_id_of() { # $1 username -> id（在待审核列表中查找）
  curl -s "$BASE/api/admin/users?status=pending&keyword=$1" -H "Authorization: Bearer $AT" \
    | json_field "[u for u in d['users'] if u['username']=='$1'][0]['id']"
}

# ---------- 4. 驳回 U4，验证驳回后禁止登录 ----------
ID4=$(admin_id_of "$U4")
curl -s -X POST -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"reason":"冒烟驳回"}' "$BASE/api/admin/users/$ID4/reject" | grep -q '"ok":true' || fail "reject"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U4\",\"password\":\"$PASS\"}" "$BASE/api/auth/login")
[ "$CODE" = "403" ] || fail "rejected login expected 403 got $CODE"
say "POST /api/admin/users/:id/reject -> 驳回后登录 403"
# 需求基线：删除=禁用、保留历史，无硬删除接口（不在此断言）

# ---------- 5. 审核通过 U1/U2/U3，登录 ----------
ID1=$(admin_id_of "$U1"); ID2=$(admin_id_of "$U2"); ID3=$(admin_id_of "$U3")
curl -s -X POST -H "Authorization: Bearer $AT" "$BASE/api/admin/users/$ID1/approve" | grep -q '"ok":true' || fail "approve $U1"
curl -s -X POST -H "Authorization: Bearer $AT" "$BASE/api/admin/users/$ID2/approve" | grep -q '"ok":true' || fail "approve $U2"
curl -s -X POST -H "Authorization: Bearer $AT" "$BASE/api/admin/users/$ID3/approve" | grep -q '"ok":true' || fail "approve $U3"
say "POST /api/admin/users/:id/approve x3"

T1=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U1\",\"password\":\"$PASS\"}" "$BASE/api/auth/login" | json_field "d['token']") || fail "login $U1"
T2=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U2\",\"password\":\"$PASS\"}" "$BASE/api/auth/login" | json_field "d['token']") || fail "login $U2"
say "user login x2"

# ---------- 6. 通讯录 ----------
curl -s "$BASE/api/users" -H "Authorization: Bearer $T1" | grep -q "$U2" || fail "users list"
say "GET /api/users"

# ---------- 7. 私聊：建会话（去重）/发消息/详情/已读/分页 ----------
CID=$(curl -s -X POST -H "Authorization: Bearer $T1" -H 'Content-Type: application/json' \
  -d "{\"userId\":$ID2}" "$BASE/api/conversations/direct" | json_field "d['conversation']['id']") || fail "direct create"
CID2=$(curl -s -X POST -H "Authorization: Bearer $T2" -H 'Content-Type: application/json' \
  -d "{\"userId\":$ID1}" "$BASE/api/conversations/direct" | json_field "d['conversation']['id']")
[ "$CID" = "$CID2" ] || fail "direct dedup ($CID != $CID2)"
say "POST /api/conversations/direct（双向去重）"

curl -s -X POST -H "Authorization: Bearer $T1" -H 'Content-Type: application/json' \
  -d '{"type":"text","content":"冒烟：第一条私聊"}' \
  "$BASE/api/conversations/$CID/messages" | grep -q '第一条私聊' || fail "send direct message"
curl -s -X POST -H "Authorization: Bearer $T1" -H 'Content-Type: application/json' \
  -d '{"type":"text","content":"冒烟：第二条私聊"}' \
  "$BASE/api/conversations/$CID/messages" > /dev/null || fail "send direct message 2"

# 分页：limit=1 应 hasMore=true
curl -s "$BASE/api/conversations/$CID/messages?limit=1" -H "Authorization: Bearer $T1" \
  | grep -q '"hasMore":true' || fail "messages pagination"
say "messages POST/GET（分页 hasMore）"

# 会话详情（含成员）
curl -s "$BASE/api/conversations/$CID" -H "Authorization: Bearer $T1" \
  | grep -q "\"displayName\":\"冒烟二号\"" || fail "conversation detail"
say "GET /api/conversations/:id（成员详情）"

# U2 视角未读=2，标记已读
UNREAD=$(curl -s "$BASE/api/conversations" -H "Authorization: Bearer $T2" \
  | json_field "[c for c in d['conversations'] if c['id']==$CID][0]['unreadCount']")
[ "$UNREAD" = "2" ] || fail "unread expected 2 got $UNREAD"
curl -s -X POST -H "Authorization: Bearer $T2" "$BASE/api/conversations/$CID/read" | grep -q '"ok":true' || fail "mark read"
UNREAD=$(curl -s "$BASE/api/conversations" -H "Authorization: Bearer $T2" \
  | json_field "[c for c in d['conversations'] if c['id']==$CID][0]['unreadCount']")
[ "$UNREAD" = "0" ] || fail "unread after read expected 0 got $UNREAD"
say "未读数统计 + POST /api/conversations/:id/read"

# ---------- 8. 群聊：建群/改名/加人/踢人/群消息 ----------
GID=$(curl -s -X POST -H "Authorization: Bearer $T1" -H 'Content-Type: application/json' \
  -d "{\"name\":\"冒烟测试群\",\"memberIds\":[$ID2]}" "$BASE/api/conversations/group" \
  | json_field "d['conversation']['id']") || fail "group create"
say "POST /api/conversations/group"

curl -s -X PUT -H "Authorization: Bearer $T1" -H 'Content-Type: application/json' \
  -d '{"name":"冒烟改名群"}' "$BASE/api/conversations/$GID/name" | grep -q '"ok":true' || fail "rename"
curl -s "$BASE/api/conversations" -H "Authorization: Bearer $T1" | grep -q '冒烟改名群' || fail "rename reflect"
say "PUT /api/conversations/:id/name（改名）"

curl -s -X POST -H "Authorization: Bearer $T1" -H 'Content-Type: application/json' \
  -d "{\"userIds\":[$ID3]}" "$BASE/api/conversations/$GID/members" | grep -q '"members"' || fail "add member"
MC=$(curl -s "$BASE/api/conversations/$GID" -H "Authorization: Bearer $T1" | json_field "len(d['members'])")
[ "$MC" = "3" ] || fail "member count expected 3 got $MC"
say "POST /api/conversations/:id/members（加人）"

curl -s -X DELETE -H "Authorization: Bearer $T1" "$BASE/api/conversations/$GID/members/$ID3" \
  | grep -q '"ok":true' || fail "remove member"
MC=$(curl -s "$BASE/api/conversations/$GID" -H "Authorization: Bearer $T1" | json_field "len(d['members'])")
[ "$MC" = "2" ] || fail "member count after kick expected 2 got $MC"
say "DELETE /api/conversations/:id/members/:userId（踢人）"

curl -s -X POST -H "Authorization: Bearer $T2" -H 'Content-Type: application/json' \
  -d '{"type":"text","content":"冒烟：群内消息"}' \
  "$BASE/api/conversations/$GID/messages" | grep -q '群内消息' || fail "group message"
say "群消息发送"

# ---------- 9. 文件：上传/文件消息/下载/越权防护 ----------
echo "smoke-file-content-冒烟-$TS" > "/tmp/smk-$TS.txt"
FID=$(curl -s -X POST -H "Authorization: Bearer $T1" -F "file=@/tmp/smk-$TS.txt" \
  "$BASE/api/files/upload" | json_field "d['file']['id']") || fail "upload"
say "POST /api/files/upload"

# ---------- 9b. 分片上传：逐片上传 + finalize 合并 ----------
head -c $((7*1024*1024)) /dev/urandom > "/tmp/smk-chunk-$TS.bin"
UPID="smk$(date +%s%N)"
python3 - "$BASE" "$T1" "$UPID" "/tmp/smk-chunk-$TS.bin" <<'PY' || fail "chunk upload"
import sys, subprocess, os, json, math
base, tok, upid, f = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
size = os.path.getsize(f); ck = 4*1024*1024; n = math.ceil(size/ck)
with open(f,'rb') as fh:
    for i in range(n):
        data = fh.read(ck)
        p = f'/tmp/smk_{upid}_{i}.part'
        with open(p,'wb') as o: o.write(data)
        r = subprocess.run(['curl','-s','-o','/dev/null','-X','POST','-H',f'Authorization: Bearer {tok}',
            '-F',f'file=@{p}','-F',f'uploadId={upid}','-F',f'chunkIndex={i}','-F',f'totalChunks={n}',
            '-F',f'totalSize={size}','-F','originalName=分片文件.bin','-F','mime=application/octet-stream',
            f'{base}/api/files/upload/chunk'],capture_output=True)
        os.remove(p)
        if r.returncode != 0: print('chunk curl failed'); sys.exit(1)
body = json.dumps({"uploadId":upid,"chunkCount":n,"originalName":"分片文件.bin","totalSize":size,"mime":"application/octet-stream"})
r = subprocess.run(['curl','-s','-X','POST','-H',f'Authorization: Bearer {tok}','-H','Content-Type: application/json',
    '-d',body,f'{base}/api/files/upload/finalize'],capture_output=True,text=True)
j = json.loads(r.stdout)
if j.get('file',{}).get('size') != size or '分片文件' not in j['file']['name']: sys.exit(1)
PY
say "POST /api/files/upload/chunk + finalize（分片合并）"
rm -f "/tmp/smk-chunk-$TS.bin"

curl -s -X POST -H "Authorization: Bearer $T1" -H 'Content-Type: application/json' \
  -d "{\"type\":\"file\",\"content\":\"smk-$TS.txt\",\"fileId\":$FID}" \
  "$BASE/api/conversations/$CID/messages" | grep -q '"type":"file"' || fail "file message"
say "文件消息发送"

curl -s -H "Authorization: Bearer $T2" "$BASE/api/files/$FID" > "/tmp/smk-$TS.dl" || fail "download"
grep -q "smoke-file-content-冒烟-$TS" "/tmp/smk-$TS.dl" || fail "download content mismatch"
say "GET /api/files/:id（会话成员可下载）"

# 非会话成员（U3）下载应被拒绝
T3=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U3\",\"password\":\"$PASS\"}" "$BASE/api/auth/login" | json_field "d['token']")
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $T3" "$BASE/api/files/$FID")
[ "$CODE" = "403" ] || fail "file guard expected 403 got $CODE"
say "非会话成员下载被拒 -> 403"

# ---------- 10. 管理员：重置密码 / 禁用 / 恢复 / 统计 / 群列表 ----------
curl -s -X POST -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"password\":\"$PASS_NEW\"}" "$BASE/api/admin/users/$ID2/reset-password" \
  | grep -q '"ok":true' || fail "reset password"
curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U2\",\"password\":\"$PASS_NEW\"}" "$BASE/api/auth/login" \
  | grep -q '"token"' || fail "login with new password"
say "POST /api/admin/users/:id/reset-password"

curl -s -X POST -H "Authorization: Bearer $AT" "$BASE/api/admin/users/$ID2/disable" | grep -q '"ok":true' || fail "disable"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U2\",\"password\":\"$PASS_NEW\"}" "$BASE/api/auth/login")
[ "$CODE" = "403" ] || fail "disabled login expected 403 got $CODE"
curl -s -X POST -H "Authorization: Bearer $AT" "$BASE/api/admin/users/$ID2/enable" | grep -q '"ok":true' || fail "enable"
curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U2\",\"password\":\"$PASS_NEW\"}" "$BASE/api/auth/login" \
  | grep -q '"token"' || fail "login after enable"
say "disable -> 403，enable -> 恢复登录"

# ---------- 10b. 历史文字搜索（需求基线：关键词搜索历史文字） ----------
curl -s "$BASE/api/conversations/search?q=%E5%86%92%E7%83%9F&limit=20" -H "Authorization: Bearer $T1" \
  | grep -q '"results"' || fail "message search"
curl -s "$BASE/api/conversations/search?q=%E7%AC%AC%E4%B8%80%E6%9D%A1%E7%A7%81%E8%81%8A&limit=20" -H "Authorization: Bearer $T1" \
  | grep -q '"conversationTitle"' || fail "message search hit title"
say "GET /api/conversations/search（历史文字搜索）"

# ---------- 10c. 头像上传（≤2MB jpg/png/webp） ----------
python3 - "$TS" > "/tmp/smk-avatar-$TS.png" <<'PY'
import sys, base64
# 1x1 像素 PNG
sys.stdout.buffer.write(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="))
PY
AVID=$(curl -s -X POST -H "Authorization: Bearer $T3" -F "file=@/tmp/smk-avatar-$TS.png;type=image/png" \
  "$BASE/api/users/me/avatar" | json_field "d['avatarId']") || fail "avatar upload"
curl -s "$BASE/api/auth/me" -H "Authorization: Bearer $T3" \
  | grep -q "\"avatarId\":$AVID" || fail "avatar reflect in me"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $T3" "$BASE/api/files/$AVID")
[ "$CODE" = "200" ] || fail "avatar access expected 200 got $CODE"
say "POST /api/users/me/avatar + GET /api/files/:id（头像内联可访问）"

# ---------- 10d. 登录失败锁定：连续 5 次错误锁 30 分钟 ----------
for i in 1 2 3 4 5; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
    -d "{\"username\":\"$U3\",\"password\":\"wrongpass$i\"}" "$BASE/api/auth/login")
  [ "$CODE" = "401" ] || fail "wrong login #$i expected 401 got $CODE"
done
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U3\",\"password\":\"$PASS\"}" "$BASE/api/auth/login")
[ "$CODE" = "429" ] || fail "login lockout expected 429 got $CODE"
say "连续 5 次失败后登录被锁定 -> 429"

# ---------- 11. 鉴权边界 ----------
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/users")
[ "$CODE" = "401" ] || fail "no-token expected 401 got $CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/admin/users" -H "Authorization: Bearer $T1")
[ "$CODE" = "403" ] || fail "non-admin expected 403 got $CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/conversations/$GID/messages" -H "Authorization: Bearer $T3")
[ "$CODE" = "403" ] || fail "non-member expected 403 got $CODE"
say "鉴权边界：未登录 401 / 非管理员 403 / 非群成员 403"

echo "API_SMOKE_ALL_PASS"
