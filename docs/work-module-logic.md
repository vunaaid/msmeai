# Tài liệu chức năng — Module Quản Lý Công Việc

> Mô tả đầy đủ chức năng, luồng nghiệp vụ, dữ liệu và API của module **Quản Lý Công Việc** (work management) trong vSME.
> Bám sát code hiện hành — chỉ mô tả, không thay đổi code. Cập nhật: 2026-06-18.

## 1. Tổng quan

Module Quản Lý Công Việc là trung tâm điều hành của vSME, hỗ trợ 3 dạng công việc và 4 chiều phối hợp:

- **Giao việc (trên → dưới):** cấp trên tạo việc, giao cho cấp dưới, tuỳ chọn yêu cầu duyệt.
- **Báo cáo (dưới → trên):** người nhận cập nhật trạng thái, ghi chú, đính kèm minh chứng; người giao theo dõi.
- **Cộng tác (ngang):** bình luận, người theo dõi (watchers), file đính kèm.
- **AI agent:** trợ lý AI phân tích việc lớn thành việc con (breakdown), hoặc trực tiếp nhận và thực thi việc (`agentJob`).

**3 dạng công việc** (`workType`):

| Loại | `workType` | Đặc điểm |
|---|---|---|
| Vận hành | `operational` | Việc hằng ngày, không cần dự án. Có thể sinh tự động từ việc định kỳ. |
| Dự án | `project_task` | Thuộc một `Project`, hỗ trợ Epic/Sprint/Story Points kiểu Jira, board Kanban. |
| Định kỳ | (sinh ra `operational`) | Khuôn mẫu `RecurringWork` theo vai trò, tự sinh `WorkItem` theo lịch. |

### Kiến trúc

```
apps/web (Next.js)                          apps/api (Express + Prisma)
─────────────────────                       ──────────────────────────────
work/page.tsx  (server, lấy session)
   └─ work-dashboard.tsx  (client)  ──────► GET /api/work?view=...      work.router.ts
        ├─ chọn `path` theo tab              GET /api/projects           projects.router.ts
        ├─ useApi<...>(path)                 GET /api/recurring          recurring.router.ts
        └─ render theo tab
   └─ work/[id]  (chi tiết việc)     ──────► GET/PUT /api/work/:id, /approve, /reject,
                                              /comments, /attachments, /breakdown
   └─ work/project/[id]  (board dự án)──────► GET /api/projects/:id, /:id/items
```

- **Entry server component:** [work/page.tsx](apps/web/src/app/(dashboard)/work/page.tsx) — load session, truyền `userId, userName, roleName, roleLevel, canManage` xuống dashboard.
- **Dashboard client:** [work-dashboard.tsx](apps/web/src/app/(dashboard)/work/work-dashboard.tsx) — toàn bộ logic các tab.
- **Cơ chế gọi API:** hook `useApi<T>(path)` ([client.ts](apps/web/src/lib/api/client.ts)). Đổi tab → đổi `path` → tự fetch lại. Trả `data, meta, loading, refreshing, error, refresh`.
- **Cô lập dữ liệu:** mọi truy vấn đều lọc theo `companyId` (đa công ty).

---

## 2. Mô hình dữ liệu

Định nghĩa tại [schema.prisma](packages/db/prisma/schema.prisma) — model `WorkItem`, `Project`, `ProjectMember`, `Epic`, `Sprint`, `WorkComment`, `RecurringWork`.

### Enum

| Enum | Giá trị |
|---|---|
| `WorkType` | `operational`, `project_task` |
| `WorkItemStatus` | `draft` → `pending_approval` → `active` → `in_progress` → `completed` / `cancelled` |
| `WorkItemPriority` | `urgent`, `high`, `normal`, `low` |
| `ProjectStatus` | `planning`, `active`, `on_hold`, `completed`, `cancelled` |
| `RecurringCadence` | `weekly`, `monthly`, `quarterly`, `yearly` |

### `WorkItem` — trường chính

| Nhóm | Trường | Ý nghĩa |
|---|---|---|
| Định danh | `id`, `companyId`, `workType`, `projectId`, `parentId` | `parentId` ≠ null ⇒ việc con (subtask). |
| Nội dung | `title`, `description` (markdown), `note` | Mô tả chi tiết + ghi chú người thực hiện. |
| Trạng thái | `status`, `priority` | Vòng đời + mức ưu tiên. |
| Con người | `createdBy` (người giao), `assignedTo` (người nhận), `watchers` (JSON `[userId]`) | |
| Thời gian | `dueDate`, `startedAt`, `completedAt` | `startedAt` set khi sang `in_progress`; `completedAt` set khi `completed`. |
| Duyệt | `approvedBy`, `approvedAt`, `completionNote` | `completionNote` cũng chứa lý do từ chối (prefix `[Từ chối]`). |
| AI | `aiBreakdown` (JSON), `aiAssignee` (agentId), `agentJob` (bool), `agentAttempts`, `agentContext` | `agentJob=true` ⇒ worker AI tự nhặt việc. |
| Jira | `epicId`, `sprintId`, `storyPoints`, `boardOrder` | Phục vụ board dự án (kéo-thả sort theo `boardOrder`). |

**Quan hệ:** `creator`, `assignee` (User), `project`, `parent`/`children` (WorkItem), `comments` (WorkComment).

### Các model phụ trợ

- **`Project`** — container cho `project_task`: `managerId`, `status`, `priority`, `startDate/dueDate`, `aiBreakdown`. Quan hệ `members`, `epics`, `sprints`, `workItems`.
- **`ProjectMember`** — `userId` + `role` (`manager` | `member` | `viewer`).
- **`Epic`** — nhóm việc lớn trong dự án: `title`, `color`, `status` (`open`/`done`), `order`.
- **`Sprint`** — `name`, `goal`, `status` (`planned`/`active`/`completed`), `startDate/endDate`, `order`.
- **`WorkComment`** — `workItemId`, `userId`, `content`.
- **`RecurringWork`** — khuôn mẫu định kỳ: `roleId` (giao theo vai trò), `cadence`, `module`, `dueOffsetDays`, `active`, `source` (`default`/`custom`), `dueDateOverrides` (JSON `{periodKey: "YYYY-MM-DD"}`), `lastGeneratedAt`.

---

## 3. Vòng đời công việc

```
        requireApproval=true
   ┌──────────────────────────────► pending_approval ──duyệt (/approve)──┐
   │                                      │ từ chối                       │
tạo (POST /work)                          ▼                               ▼
   │                                  cancelled                        active ──┐
   ├── có assignedTo ───────────────────────────────────────────────► active   │
   └── không assignedTo ────────────────────────────────────────────► draft    │
                                                                                ▼
                              active ──(người nhận bắt đầu, PUT status)──► in_progress
                                                                                │
                                                  ┌─────────────────────────────┤
                                                  ▼                             ▼
                                              completed                     cancelled
                                          (set completedAt)            (/reject + lý do)
```

**Quy tắc xác định trạng thái khi tạo** ([work.router.ts:203-207](apps/api/src/modules/work/work.router.ts#L203-L207)):
- `status` truyền tay (nếu có) được ưu tiên; ngược lại:
- `requireApproval=true` → `pending_approval`;
- có `assignedTo` → `active`;
- không có người nhận → `draft`.

**Mốc thời gian tự động** ([work.router.ts:343-349](apps/api/src/modules/work/work.router.ts#L343-L349)):
- chuyển sang `in_progress` lần đầu → set `startedAt`;
- chuyển sang `completed` → set `completedAt`;
- mở lại việc đã hoàn thành (status ≠ completed mà có `completedAt` cũ) → xoá `completedAt`.

---

## 4. Phân quyền

| Hành động | Người được phép | Tham chiếu |
|---|---|---|
| Tạo công việc | Mọi user trong công ty | `POST /work` |
| Giao việc cho ai | Chính mình + cấp dưới (`getAssignableUsers`) | `GET /work/assignees` |
| Sửa việc (`PUT`) | Người tạo, người nhận; hoặc quản lý/thành viên dự án (nếu là việc dự án) | [work.router.ts:302-317](apps/api/src/modules/work/work.router.ts#L302-L317) |
| Duyệt breakdown | Chỉ người tạo, khi việc ở `pending_approval` | `POST /work/:id/approve` |
| Từ chối việc | Người nhận, người giao, hoặc admin (company/system/super) | [work.router.ts:457-461](apps/api/src/modules/work/work.router.ts#L457-L461) |
| Gỡ file đính kèm | Người tải lên, người giao, hoặc người nhận | [work.router.ts:591](apps/api/src/modules/work/work.router.ts#L591) |
| Xem/sửa danh mục định kỳ | Xem: mọi user; tạo/sửa/xoá: quyền `admin:configure` | recurring.router.ts |

---

## 5. API công việc — `work.router.ts`

### 5.1 `GET /api/work` — danh sách (theo view + nhóm tiến độ)

[work.router.ts:108-181](apps/api/src/modules/work/work.router.ts#L108-L181).

**Tham số:** `view` (mặc định `assigned_to_me`), `bucket`, `status`, `projectId`, `workType`, `page`, `limit` (max 50, mặc định 20).

**Bộ lọc nền (luôn áp dụng):** `companyId` + `parentId: null` (⚠️ **chỉ lấy việc gốc**, ẩn việc con) + các filter tùy chọn `status/projectId/workType`.

**Bộ lọc theo view:**

| `view` | Điều kiện | Hỗ trợ nhóm tiến độ? |
|---|---|---|
| `assigned_to_me` | `assignedTo = user.id` | ✅ |
| `created_by_me` | `createdBy = user.id` | ✅ |
| `pending_approval` | `status = pending_approval AND createdBy = user.id` | ❌ (danh sách phẳng) |
| `project_tasks` | `workType = project_task AND (assignedTo = user.id OR createdBy = user.id)` | ✅ |

**Nhóm tiến độ (bucket / sub-tab)** — chỉ với các view hỗ trợ ([work.router.ts:93-106](apps/api/src/modules/work/work.router.ts#L93-L106)):

| `bucket` | Điều kiện |
|---|---|
| `in_progress` (mặc định) | status ∈ {active, in_progress} **và** (`dueDate` null hoặc ≥ nay) |
| `overdue` | status ∈ {active, in_progress} **và** `dueDate` < nay |
| `completed` | status = completed |

> "Quá hạn" được **suy ra** từ `dueDate < nay` trên việc đang xử lý, không phải một trạng thái riêng.

**Đếm số mỗi nhóm:** với view hỗ trợ bucket, trả thêm `meta.counts = { in_progress, overdue, completed }` — đếm trên toàn scope (không phụ thuộc bucket đang chọn hay phân trang) để hiển thị số trên từng sub-tab.

**Dữ liệu trả:** `WorkItem[]` include `creator`, `assignee`, `project{id,title}`, `_count{children,comments}`; sắp xếp `priority asc, dueDate asc, createdAt desc`. Meta: `{ total, page, limit, counts? }`.

### 5.2 `POST /api/work` — tạo công việc

Body: `title` (bắt buộc), `description?`, `note?`, `workType`, `projectId?`, `parentId?`, `assignedTo?`, `priority`, `dueDate?`, `requireApproval`, `epicId?/sprintId?/storyPoints?`, `status?`. Kiểm tra `projectId` và `assignedTo` thuộc công ty. Nếu giao cho người khác → gửi thông báo `work.assigned` (in-app + realtime + web push).

### 5.3 `GET /api/work/:id` — chi tiết

Trả việc kèm `creator`, `assignee`, `project`, `parent`, `children` (kèm assignee), `comments` (kèm user). Là nguồn dữ liệu cho trang chi tiết.

### 5.4 `PUT /api/work/:id` — cập nhật

Cập nhật từng phần: `title/description/note/priority/assignedTo/dueDate/completionNote`, trường Jira (`epicId/sprintId/storyPoints/boardOrder`), và `status` (kèm tự set mốc thời gian, xem §3). Kiểm tra quyền (xem §4).

### 5.5 `POST /api/work/:id/approve` — duyệt & sinh việc con

Chỉ việc ở `pending_approval`. Body `breakdown[]` (`title, description?, assignedTo?, priority, estimatedDays?, dueDate?`); nếu không truyền → dùng `aiBreakdown` đã lưu. Trong 1 transaction:
- việc cha → `active`, set `approvedBy/approvedAt`, lưu `aiBreakdown`;
- tạo các `WorkItem` con (`parentId = id`, thừa kế `workType/projectId`); con có người nhận → `active`, không có → `draft`; `dueDate` tính từ `dueDate` hoặc `estimatedDays`.
- Trả `{ parent, subtasks, total }`.

### 5.6 `POST /api/work/:id/reject` — từ chối

Body `reason`. Không áp dụng cho việc đã `completed`/`cancelled`. Đặt `status = cancelled`, `completionNote = "[Từ chối] <reason>"`, và thông báo `work.rejected` cho người giao.

### 5.7 `POST /api/work/batch` — tạo hàng loạt (từ đề xuất AI)

Body: `parentId?` + `tasks[]` (1–30 mục: `title, description?, assigneeId?, assigneeKind(user|agent), watchers[]?, dueInDays?, priority`).
- Nếu có `parentId`: các việc tạo ra là con, **thừa kế** `workType/projectId/epicId/sprintId` từ cha; đồng thời lưu `aiBreakdown` vào cha để xem lại.
- **Phân giải người nhận:** nếu là trợ lý AI (kind `agent` với agentId hợp lệ, hoặc userId của persona agent) → set `aiAssignee` + `agentJob=true`; nếu là user thật → `assignedTo`.
- Thông báo cho người nhận (`work.assigned`) và watchers.
- Có việc giao cho agent → gọi `ensureQueueRunning()` để worker thực thi ngay.
- Trả `{ count, ids }`.

### 5.8 Bình luận & file đính kèm

- `POST /api/work/:id/comments` — body `content`, trả `WorkComment` kèm user.
- `GET /api/work/:id/attachments` — danh sách file (kèm link tải presigned tạm thời).
- `POST /api/work/:id/attachments` — upload multipart field `file` (tối đa 50MB). Lưu qua `FileRecord` (`moduleKey="work"`, `entityType="attachment"`, `entityId=workItemId`).
- `DELETE /api/work/:id/attachments/:fileId` — soft delete + xoá object storage.

### 5.9 Phụ trợ

- `GET /api/work/assignees` — danh sách người có thể giao việc (`{id, name, role, isSelf}`).
- `GET /api/work/:id/breakdown` — xem `aiBreakdown` đã lưu.
- `POST /api/work/:id/append-note` — ghi thêm một mục markdown (`## <heading> — <ngày>`) vào **mô tả** việc; dùng khi chat với trợ lý AI về việc này.

---

## 6. Giao diện Dashboard — các tab

[work-dashboard.tsx](apps/web/src/app/(dashboard)/work/work-dashboard.tsx). Chọn endpoint theo tab; 3 tab công việc dùng chung endpoint `/api/work` (chỉ khác `view`).

| Tab UI | Endpoint | Component | Nhóm tiến độ |
|---|---|---|---|
| Việc của tôi (`assigned_to_me`) | `GET /api/work?view=assigned_to_me` | `WorkItemRow` | ✅ |
| Tôi giao (`created_by_me`) | `GET /api/work?view=created_by_me` | `WorkItemRow` | ✅ |
| Chờ duyệt (`pending_approval`) | `GET /api/work?view=pending_approval` | `WorkItemRow` | ❌ |
| Dự án (`projects`) | `GET /api/projects?limit=50` | card `<Link>` → `/work/project/:id` | — |
| Việc định kỳ (`recurring`) | `GET /api/recurring` | `RecurringView` | — |

> Các tab hỗ trợ nhóm tiến độ hiển thị 3 sub-tab **Đang xử lý / Quá hạn / Hoàn thành** kèm số đếm từ `meta.counts`.

### Hiển thị một dòng việc (`WorkItemRow`)

Mỗi dòng là `<Link href="/work/:id">` gồm: icon trạng thái (`STATUS_CFG`), tiêu đề + badge tên dự án (nếu là việc dự án) + nhãn trạng thái, mô tả (1 dòng), chấm ưu tiên, hạn (`formatDate`: "Quá hạn N", "Hôm nay", "Ngày mai", dd/mm), số việc con, avatar người nhận ("Bạn"/tên/"Chưa giao").

**Nút bên phải (tuỳ trạng thái):**
- Đã có việc con → nút tím **Sparkles + số con** → mở `BreakdownModal` (xem phân tích AI trước).
- Chưa bắt đầu & chưa giao con (status ∈ draft/active/pending_approval) → nút **Sparkles** → đẩy prompt sang panel Trợ lý AI (`askAssistant`).

### Tab Dự án

`GET /api/projects` ([projects.router.ts](apps/api/src/modules/projects/projects.router.ts)), `view` mặc định `all`. Mỗi card: FolderKanban + tiêu đề + nhãn trạng thái (`PROJECT_STATUS_CFG`), số thành viên & số việc (`_count`), hạn (cảnh báo quá hạn), avatar quản lý. Click → board dự án `/work/project/:id` (overview/board/list/timeline, có sprint/epic) — xem §7.

### Tab Việc định kỳ (`RecurringView`)

`GET /api/recurring?year=` ([recurring.router.ts](apps/api/src/modules/work/recurring.router.ts)). Nhóm theo **vai trò** (theo level: HĐQT → C-Suite → Quản trị → Quản lý → Nhân viên → Hệ thống), chỉ hiển thị mục `active`. Bố cục **4 quý**, mỗi việc: tiêu đề, chấm ưu tiên, nhóm avatar nhân sự giữ vai trò (`AvatarGroup`, tối đa 4 + "+N"), nhãn cadence, badge hạn. Admin có thể sửa ngày của một kỳ qua `PUT /api/recurring/:id/occurrence`.

---

## 7. Dự án (Project) & board

- `GET /api/projects` — danh sách (`view`: `all`/`mine`/`managed`, `status`, phân trang). Include `manager`, `creator`, `_count{workItems, members}`.
- `POST /api/projects` — tạo dự án (`title, description?, managerId?, priority, startDate?, dueDate?`).
- `GET /api/projects/:id` — chi tiết kèm `members`, `epics`, `sprints`, `_count`.
- `PATCH /api/projects/:id` — cập nhật.
- `GET /api/projects/:id/items` — toàn bộ `WorkItem` của dự án (cho board Kanban / list / timeline).

Board dự án dùng các trường Jira trên `WorkItem`: `epicId`, `sprintId`, `storyPoints`, `boardOrder` (thứ tự thẻ khi kéo-thả).

---

## 8. Việc định kỳ — sinh việc tự động

### Tính ngày thực hiện

[recurring-schedule.ts](apps/api/src/modules/work/recurring-schedule.ts):
- **weekly** → mọi thứ Sáu; **monthly** → thứ Sáu cuối mỗi tháng; **quarterly** → thứ Sáu cuối quý; **yearly** → thứ Sáu cuối tháng 12.
- `closingFriday()` lùi về ngày làm việc trước nếu trùng ngày lễ VN ([vn-holidays.ts](apps/api/src/modules/work/vn-holidays.ts)).
- Mỗi occurrence: `{ date, periodKey, quarter }`. `periodKey` dùng để **override** ngày qua `dueDateOverrides`.

### Sinh việc thật

Tab định kỳ chỉ là **danh mục/lịch**. Việc thật do service sinh ([recurring.service.ts](apps/api/src/modules/work/recurring.service.ts)):
- `generateDueForCompany(companyId)` — với mỗi `RecurringWork` active: kiểm tra `isDue()` (theo cadence + `lastGeneratedAt`), tạo 1 `WorkItem` (`status=active`) cho **mỗi user** giữ vai trò, `dueDate = now + dueOffsetDays`, cập nhật `lastGeneratedAt`.
- `generateAllCompanies()` — chạy cho mọi công ty (dùng cho cron).
- `importDefaults(companyId)` — nạp danh mục checklist mặc định (tháng/quý).
- Việc sinh ra xuất hiện ở tab **Việc của tôi** của từng người.

---

## 9. Tích hợp AI

- **Breakdown:** trợ lý AI đề xuất việc con từ một việc lớn → người tạo duyệt (`/approve`) hoặc tạo hàng loạt (`/batch`). Lưu ở `aiBreakdown`.
- **Giao việc cho agent:** `assigneeKind=agent` → set `aiAssignee` + `agentJob=true`; worker `agent-exec` chỉ nhặt việc `agentJob=true`, theo dõi `agentAttempts`, dùng `agentContext`.
- **Trợ lý hội thoại:** panel [work-assistant.tsx](apps/web/src/app/(dashboard)/work/work-assistant.tsx) chat về công việc; có thể ghi kết quả vào mô tả qua `/append-note`.

---

## 10. Điểm dễ nhầm

- **`parentId: null`** trên `GET /api/work`: danh sách luôn ẩn việc con — chỉ thấy việc con trong trang chi tiết việc cha.
- **"Quá hạn" không phải trạng thái:** là `dueDate < nay` trên việc `active`/`in_progress`.
- **`meta.counts`** chỉ có với view hỗ trợ bucket (`assigned_to_me`, `created_by_me`, `project_tasks`); `pending_approval` trả danh sách phẳng.
- **`completionNote`** vừa là ghi chú hoàn thành vừa chứa lý do từ chối (prefix `[Từ chối]`).
- **Phân trang** mặc định `limit=50` cho work & projects; recurring trả toàn bộ danh mục (không phân trang).

---

## 11. File tham chiếu

**Frontend**
- [work/page.tsx](apps/web/src/app/(dashboard)/work/page.tsx) · [work-dashboard.tsx](apps/web/src/app/(dashboard)/work/work-dashboard.tsx)
- [create-work-modal.tsx](apps/web/src/app/(dashboard)/work/create-work-modal.tsx) · [create-project-modal.tsx](apps/web/src/app/(dashboard)/work/create-project-modal.tsx) · [breakdown-modal.tsx](apps/web/src/app/(dashboard)/work/breakdown-modal.tsx) · [work-assistant.tsx](apps/web/src/app/(dashboard)/work/work-assistant.tsx)
- [work/[id]/page.tsx](apps/web/src/app/(dashboard)/work/[id]/page.tsx) · [lib/api/client.ts](apps/web/src/lib/api/client.ts)

**Backend**
- [work.router.ts](apps/api/src/modules/work/work.router.ts) · [projects.router.ts](apps/api/src/modules/projects/projects.router.ts)
- [recurring.router.ts](apps/api/src/modules/work/recurring.router.ts) · [recurring.service.ts](apps/api/src/modules/work/recurring.service.ts) · [recurring-schedule.ts](apps/api/src/modules/work/recurring-schedule.ts) · [vn-holidays.ts](apps/api/src/modules/work/vn-holidays.ts)

**Database**
- [schema.prisma](packages/db/prisma/schema.prisma) — `WorkItem`, `Project`, `ProjectMember`, `Epic`, `Sprint`, `WorkComment`, `RecurringWork`

> Tài liệu phân tích mô hình thiết kế (so sánh Jira/OpenProject/Base/1Office, đề xuất trạng thái `review`, RACI): xem [work-management-model.md](docs/work-management-model.md).
