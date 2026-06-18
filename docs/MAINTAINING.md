# Maintaining — kiểm soát người tham gia & merge vào `main`

Tài liệu cho **maintainer** (chủ dự án). Cấu hình một lần sau khi tạo repo.
Có thể tự động hóa bằng [`scripts/setup-github.sh`](../scripts/setup-github.sh) (cần `gh` CLI).

## Mô hình kiểm soát (3 tầng)

| Tầng | Ai | Quyền |
|---|---|---|
| Public | Bất kỳ ai | Chỉ **fork + gửi PR**. Không push, không merge |
| Collaborator (Write) | Người được tin | Push branch `feat/...`, mở PR, review. **Không** merge thẳng `main` |
| Owner/Admin | Maintainer | Duyệt (CODEOWNERS) + merge |

→ Mọi code vào `main` đều phải: **PR → CI pass → CLA ký → maintainer duyệt → merge**.

## 1. Người tham gia code

- **Người ngoài**: không cần làm gì — họ fork & gửi PR, bạn kiểm soát merge.
- **Thành viên tin tưởng**: Settings → **Collaborators and teams** → Add people → role **Write**.
  - `Triage` = quản lý issue/PR, không push code.
  - `Write` = push branch + review (mặc định cho người code).
  - `Maintain`/`Admin` = chỉ cấp cho người đồng cấp.
- Có team thật, nhiều tầng → cân nhắc chuyển repo sang **Organization** + **Teams**.

## 2. Branch protection cho `main` (Settings → Branches → Add rule)

- ✅ Require a pull request before merging — **Require approvals: 1**
- ✅ Require review from **Code Owners** (CODEOWNERS = `@vunaaid`)
- ✅ Dismiss stale approvals when new commits are pushed
- ✅ Require status checks to pass → **`check`** (CI) + **`CLA Assistant`**
- ✅ Require branches to be up to date before merging
- ✅ Require conversation resolution before merging
- ✅ Require linear history
- ✅ Do not allow force pushes / deletions
- ❌ Allow bypass — để trống
- (Tùy) Include administrators — bật nếu muốn tự kỷ luật cả mình

> "Restrict who can push to matching branches" (giới hạn danh sách người merge) **chỉ có ở repo thuộc Organization**. Repo cá nhân: kiểm soát merge dựa vào *require code-owner review* + bạn là admin duy nhất.

## 3. Merge settings (Settings → General → Pull Requests)

- ✅ Allow **squash merging** (chỉ cái này)
- ❌ Allow merge commits · ❌ Allow rebase merging
- ✅ Automatically delete head branches

## 4. Bảo vệ khỏi PR người lạ (Settings → Actions → General)

- Fork pull request workflows → ✅ **Require approval for all outside collaborators**
  (CI từ fork không tự chạy → tránh lạm dụng Actions/secret).

## 5. Bảo mật (Settings → Code security)

- ✅ Dependabot alerts + security updates
- ✅ Secret scanning + **Push protection**
- ✅ Private vulnerability reporting (khớp [SECURITY.md](../SECURITY.md))

## 6. CLA bot

- Tạo secret **`CLA_PAT`** (Settings → Secrets and variables → Actions): Personal Access Token scope `repo`.
- Workflow: [`.github/workflows/cla.yml`](../.github/workflows/cla.yml). PR đầu của mỗi người sẽ bị chặn merge đến khi ký CLA.

## Quy trình PR thường ngày

```
# contributor
git switch -c feat/abc
git commit -m "feat: ..."   # Conventional Commits
git push -u origin feat/abc # (hoặc push lên fork)
# → mở PR → CI + CLA + review của bạn → Squash merge → branch tự xóa
```

## Release

- SemVer `MAJOR.MINOR.PATCH`. Tag: `git tag v0.1.0 && git push --tags`.
- Tạo GitHub Release → "Generate release notes" để tự gom PR thành changelog.
