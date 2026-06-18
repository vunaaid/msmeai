#!/usr/bin/env bash
# setup-github.sh — Cấu hình repo public msmeai một lần (settings + branch protection + Actions).
# Yêu cầu: gh CLI đã đăng nhập (gh auth login) và repo đã tồn tại + đã push main + CI đã chạy ≥1 lần.
#
#   ./scripts/setup-github.sh
#
set -euo pipefail

OWNER="vunaaid"
REPO="msmeai"
SLUG="$OWNER/$REPO"

command -v gh >/dev/null || { echo "❌ Chưa cài gh CLI. Xem: https://cli.github.com/"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "❌ Chưa đăng nhập gh. Chạy: gh auth login"; exit 1; }
gh repo view "$SLUG" >/dev/null 2>&1 || { echo "❌ Repo $SLUG chưa tồn tại. Tạo trước (Public, KHÔNG add README/LICENSE)."; exit 1; }

echo "▶ 1/5 — Mô tả + tính năng repo"
gh api -X PATCH "repos/$SLUG" \
  -f description="AI-native ERP cho doanh nghiệp nhỏ & siêu nhỏ Việt Nam — kế toán, nhân sự, bán hàng, hóa đơn & thuế, vận hành bằng AI agents." \
  -F has_issues=true -F has_wiki=false -F has_projects=false -F has_discussions=true \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true >/dev/null
echo "  ✓ description, squash-only, delete-branch-on-merge, discussions on, wiki off"

echo "▶ 2/5 — Topics"
echo '{"names":["erp","sme","msme","ai-agents","vietnam","accounting","nextjs","prisma","source-available"]}' \
  | gh api -X PUT "repos/$SLUG/topics" -H "Accept: application/vnd.github+json" --input - >/dev/null
echo "  ✓ topics"

echo "▶ 3/5 — Branch protection cho main"
# LƯU Ý: 'restrictions' (giới hạn ai được push) chỉ áp dụng cho repo thuộc Organization.
# Repo tài khoản cá nhân -> để null; kiểm soát merge dựa vào require code-owner review + bạn là admin duy nhất.
tmp="$(mktemp)"
cat > "$tmp" <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["check"] },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
gh api -X PUT "repos/$SLUG/branches/main/protection" \
  -H "Accept: application/vnd.github+json" --input "$tmp" >/dev/null
rm -f "$tmp"
echo "  ✓ require PR + 1 approval + code-owner review, status check 'check', linear history, no force-push"
echo "  ℹ Sau khi CLA workflow chạy lần đầu, thêm context 'CLA Assistant' vào required checks (UI hoặc chạy lại)."

echo "▶ 4/5 — Actions: bắt duyệt CI cho PR từ người ngoài"
# Chặn fork độc hại tự chạy workflow / chạm secret.
gh api -X PUT "repos/$SLUG/actions/permissions/fork-pr-contributor-approval" \
  -H "Accept: application/vnd.github+json" -f approval_policy="all_external_contributors" >/dev/null 2>&1 \
  && echo "  ✓ yêu cầu duyệt workflow cho mọi outside contributor" \
  || echo "  ⚠ Không set được qua API — bật tay: Settings → Actions → General → Fork pull request workflows → 'Require approval for all outside collaborators'"

echo "▶ 5/5 — Bật secret scanning + push protection"
gh api -X PATCH "repos/$SLUG" -H "Accept: application/vnd.github+json" \
  --input - >/dev/null 2>&1 <<'JSON' \
  && echo "  ✓ secret scanning + push protection" \
  || echo "  ⚠ Bật tay: Settings → Code security → Secret scanning + Push protection"
{ "security_and_analysis": { "secret_scanning": { "status": "enabled" }, "secret_scanning_push_protection": { "status": "enabled" } } }
JSON

echo
echo "✅ Hoàn tất cấu hình $SLUG."
echo "   Còn lại làm tay (1 lần): thêm Collaborator (Settings → Collaborators) với role Write cho thành viên tin tưởng;"
echo "   tạo secret CLA_PAT (Settings → Secrets → Actions) cho bot CLA."
