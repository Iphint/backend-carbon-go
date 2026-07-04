#!/bin/bash
# API Health Check — Carbon-Go Backend
# Usage: bash test-api.sh

BASE="http://localhost:5001/api"
PASS=0
FAIL=0
TOKEN=""
ADMIN_TOKEN=""

green() { printf "  \033[32m✓ %s\033[0m\n" "$1"; }
red()   { printf "  \033[31m✗ %s\033[0m\n" "$1"; }
bold()  { printf "\033[1m%s\033[0m\n" "$1"; }

check() {
  local desc="$1" method="$2" url="$3" expect="$4" extra="$5"
  local resp
  resp=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
    -H "Content-Type: application/json" \
    $extra 2>/dev/null)
  if [ "$resp" = "$expect" ]; then
    green "$desc → $resp"
    PASS=$((PASS+1))
  else
    red "$desc → expected $expect got $resp"
    FAIL=$((FAIL+1))
  fi
}

check_json() {
  local desc="$1" method="$2" url="$3" expect="$4" extra="$5"
  local resp
  resp=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
    -H "Content-Type: application/json" \
    $extra 2>/dev/null)
  # Accept 200 or 201 for POST
  if [ "$resp" = "200" ] || [ "$resp" = "201" ]; then
    green "$desc → $resp"
    PASS=$((PASS+1))
  else
    red "$desc → expected 200/201 got $resp"
    FAIL=$((FAIL+1))
  fi
}

bold "━━━━━ Health Check ━━━━━"
check "Health endpoint" GET "$BASE/health" "200"

bold ""
bold "━━━━━ User Auth ━━━━━"
# Login as regular user (Arifin / password123)
RESP=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"Arifin","password":"password123"}')
TOKEN=$(echo "$RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then
  green "User login → token obtained"
  PASS=$((PASS+1))
  check "User auth me" GET "$BASE/auth/me" "200" "-H \"Authorization: Bearer $TOKEN\""
else
  red "User login failed"
  FAIL=$((FAIL+1))
fi

# Wrong password
check "User login (wrong pass)" POST "$BASE/auth/login" "401" \
  "-d '{\"username\":\"Arifin\",\"password\":\"wrong\"}'"

bold ""
bold "━━━━━ Admin Auth ━━━━━"
# Login as admin
RESP=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin12345"}')
ADMIN_TOKEN=$(echo "$RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$ADMIN_TOKEN" ]; then
  green "Admin login → token obtained"
  PASS=$((PASS+1))
else
  red "Admin login failed"
  FAIL=$((FAIL+1))
fi

AUTH="Authorization: Bearer $ADMIN_TOKEN"
ADMIN_HEADERS="-H \"$AUTH\" -H \"X-Admin-Client: true\" -H \"X-Language: id\""

bold ""
bold "━━━━━ Admin Endpoints ━━━━━"
check_json "Dashboard summary" GET "$BASE/admin/dashboard-summary?filter=all" "200" "$ADMIN_HEADERS"
check_json "Users list" GET "$BASE/admin/users" "200" "$ADMIN_HEADERS"
check_json "Survey logs" GET "$BASE/admin/survey-logs" "200" "$ADMIN_HEADERS"
check_json "Activity logs" GET "$BASE/admin/activity-logs" "200" "$ADMIN_HEADERS"
check_json "Leaderboard" GET "$BASE/admin/leaderboard" "200" "$ADMIN_HEADERS"
check_json "Eco-Badges" GET "$BASE/admin/eco-badges" "200" "$ADMIN_HEADERS"
check_json "Milestones" GET "$BASE/admin/milestones" "200" "$ADMIN_HEADERS"
check_json "Quests" GET "$BASE/admin/quests" "200" "$ADMIN_HEADERS"
check_json "Rank Logs" GET "$BASE/admin/rank-logs" "200" "$ADMIN_HEADERS"
check_json "Custom Green Actions" GET "$BASE/admin/custom-green-actions" "200" "$ADMIN_HEADERS"

# User detail
FIRST_USER=$(curl -s "$BASE/admin/users" -H "$AUTH" -H "X-Admin-Client: true" -H "X-Language: id" 2>/dev/null | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
if [ -n "$FIRST_USER" ]; then
  check_json "User detail (id=$FIRST_USER)" GET "$BASE/admin/users/$FIRST_USER" "200" "$ADMIN_HEADERS"
  check_json "User activity logs" GET "$BASE/admin/users/$FIRST_USER/activity-logs" "200" "$ADMIN_HEADERS"
  check_json "User progress" GET "$BASE/admin/users/$FIRST_USER/progress" "200" "$ADMIN_HEADERS"
  check_json "User rank logs" GET "$BASE/admin/users/$FIRST_USER/rank-logs" "200" "$ADMIN_HEADERS"
  check_json "User point logs" GET "$BASE/admin/users/$FIRST_USER/point-logs" "200" "$ADMIN_HEADERS"
  check_json "User survey logs" GET "$BASE/admin/users/$FIRST_USER/survey-logs" "200" "$ADMIN_HEADERS"
fi

bold ""
bold "━━━━━ CRUD Tests ━━━━━"
# Create milestone
MILESTONE_ID=$(curl -s -X POST "$BASE/admin/milestones" \
  -H "$AUTH" -H "X-Admin-Client: true" -H "X-Language: id" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Milestone","description":"Test","target_value":999}' \
  2>/dev/null | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
if [ -n "$MILESTONE_ID" ]; then
  green "Create milestone → id=$MILESTONE_ID"
  PASS=$((PASS+1))
  check_json "Update milestone" PUT "$BASE/admin/milestones/$MILESTONE_ID" "200" \
    "$ADMIN_HEADERS -d '{\"name\":\"Updated Milestone\",\"description\":\"Updated\",\"target_value\":999}'"
else
  red "Create milestone failed"
  FAIL=$((FAIL+1))
fi

# Create eco-badge
BADGE_ID=$(curl -s -X POST "$BASE/admin/eco-badges" \
  -H "$AUTH" -H "X-Admin-Client: true" -H "X-Language: id" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Badge","description":"Test badge","icon":"🏅","requirement_type":"carbon_points","requirement_value":999}' \
  2>/dev/null | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
if [ -n "$BADGE_ID" ]; then
  green "Create badge → id=$BADGE_ID"
  PASS=$((PASS+1))
  check_json "Update badge" PUT "$BASE/admin/eco-badges/$BADGE_ID" "200" \
    "$ADMIN_HEADERS -d '{\"name\":\"Updated Badge\",\"description\":\"Updated\",\"icon\":\"🏅\",\"requirement_type\":\"carbon_points\",\"requirement_value\":999}'"
else
  red "Create badge failed"
  FAIL=$((FAIL+1))
fi

# Create quest
QUEST_ID=$(curl -s -X POST "$BASE/admin/quests" \
  -H "$AUTH" -H "X-Admin-Client: true" -H "X-Language: id" \
  -H "Content-Type: application/json" \
  -d '{"slug":"test-quest","name":"Test Quest","description":"Test quest","requirement_value":999,"reward":25}' \
  2>/dev/null | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
if [ -n "$QUEST_ID" ]; then
  green "Create quest → id=$QUEST_ID"
  PASS=$((PASS+1))
  check_json "Update quest" PUT "$BASE/admin/quests/$QUEST_ID" "200" \
    "$ADMIN_HEADERS -d '{\"slug\":\"test-quest\",\"name\":\"Updated Quest\",\"description\":\"Updated\",\"requirement_value\":999,\"reward\":25}'"
else
  red "Create quest failed"
  FAIL=$((FAIL+1))
fi

# Create rank log
RANK_ID=$(curl -s -X POST "$BASE/admin/rank-logs" \
  -H "$AUTH" -H "X-Admin-Client: true" -H "X-Language: id" \
  -H "Content-Type: application/json" \
  -d '{"rank_name":"Test Rank"}' \
  2>/dev/null | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
if [ -n "$RANK_ID" ]; then
  green "Create rank → id=$RANK_ID"
  PASS=$((PASS+1))
else
  red "Create rank failed"
  FAIL=$((FAIL+1))
fi

# Delete created test data (cleanup)
if [ -n "$MILESTONE_ID" ]; then
  check "Delete milestone" DELETE "$BASE/admin/milestones/$MILESTONE_ID" "200" "$ADMIN_HEADERS"
fi
if [ -n "$BADGE_ID" ]; then
  check "Delete badge" DELETE "$BASE/admin/eco-badges/$BADGE_ID" "200" "$ADMIN_HEADERS"
fi
if [ -n "$QUEST_ID" ]; then
  check "Delete quest" DELETE "$BASE/admin/quests/$QUEST_ID" "200" "$ADMIN_HEADERS"
fi
if [ -n "$RANK_ID" ]; then
  check "Delete rank" DELETE "$BASE/admin/rank-logs/$RANK_ID" "200" "$ADMIN_HEADERS"
fi

bold ""
bold "━━━━━ CORS Check ━━━━━"
ORIGIN_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$BASE/admin/dashboard-summary?filter=all" \
  -H "Origin: http://localhost:5174" \
  -H "Access-Control-Request-Method: GET")
if [ "$ORIGIN_CHECK" = "204" ]; then
  CORS_HEADERS=$(curl -s -D - -X OPTIONS "$BASE/admin/dashboard-summary?filter=all" \
    -H "Origin: http://localhost:5174" \
    -H "Access-Control-Request-Method: GET" 2>/dev/null | grep -i "access-control-allow-origin\|access-control-allow-credentials")
  if echo "$CORS_HEADERS" | grep -q "Access-Control-Allow-Origin: http://localhost:5174"; then
    green "CORS preflight OK (localhost:5174 allowed)"
    PASS=$((PASS+1))
  fi
fi

bold ""
bold "━━━━━ Summary ━━━━━"
TOTAL=$((PASS+FAIL))
printf "  \033[1m%d passed, %d failed out of %d tests\033[0m\n" "$PASS" "$FAIL" "$TOTAL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  bold "❌ Some tests FAILED. Check the issues above."
  exit 1
else
  bold "✅ All tests passed!"
fi
