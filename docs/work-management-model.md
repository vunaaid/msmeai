# Mô hình công việc co giãn 1→N người cho vSME

> Tài liệu đề xuất **một mô hình quản lý công việc co giãn**: mặc định thu về **công ty 1 người + đội AI agent**, và **tự "sáng đèn" thành nhiều người** khi tuyển thêm — không phải hai sản phẩm khác nhau.
> Kèm **audit hiện trạng code** (đã phù hợp tới đâu) và **danh sách cần làm thêm**.
> Tham chiếu: Jira / OpenProject / Base.vn / 1Office. Cập nhật: 2026-06-18.

---

## 1. Triết lý: một mô hình co giãn, không phải hai sản phẩm

vSME nhắm tới công ty **cực ít người, có thể 1 người**, nhưng vẫn phải chạy được khi công ty lớn lên. Nguyên tắc:

> **Công ty 1 người là *trường hợp tối giản của cây tổ chức*, không phải một chế độ riêng.** Mọi cơ chế "nhiều người" (giao theo cây, nghiệm thu nhiều cấp, phân vai trò) vẫn hiện diện trong mô hình — chỉ là khi solo thì các nhánh rỗng và tự gập lại.

Hệ quả thiết kế:
- **Không `if (headcount === 1)` ở bất kỳ đâu.** Mọi logic hỏi **cây tổ chức** (ai là cấp trên, ai là người thật ở đỉnh), nên thêm người = cây dày lên, luồng tự đúng.
- Với solo, người duy nhất **vừa là người giao, vừa là người nghiệm thu, vừa là đỉnh cây (apex)**. "Cấp dưới" của họ chủ yếu là **các AI agent**.
- Cổng kiểm soát duy nhất đáng giá khi solo — **người thật nghiệm thu việc do agent làm** — chính là **phiên bản 1 chặng** của cây nghiệm thu nhiều chặng. Không cắt, chỉ thu nhỏ.

```
1 người:     [apex = bạn]  ◄── agent nhân viên              (review 1 chặng)
vài người:   [apex = CEO] ◄ [quản lý thật] ◄ agent/nhân viên   (review N chặng)
```

---

## 2. Ba trục co giãn (phải thiết kế đúng từ đầu)

Đây là các trục mà nếu làm đúng ngay, hệ thống chạy mượt cho cả 1 và N người **mà không phải viết lại**.

### Trục 1 — Cây tổ chức (`User.managerId`)
Mọi quan hệ "ai giao/duyệt cho ai" suy ra từ `managerId`, không hardcode. Solo: cây 1 nút thật + các agent treo dưới. Đông người: cây đầy đủ.

### Trục 2 — Reviewer là giá trị *được phân giải*, không nhập tay
Không lưu cứng "reviewer = creator". Cần một hàm `resolveReviewer(workItem)`:
- solo → trả về **apex** (chính bạn);
- đông người → đi ngược cây lấy **người thật gần nhất / apex**.
Cùng một luồng nghiệm thu chạy cho cả hai, chỉ khác đầu ra của hàm.

### Trục 3 — Việc định kỳ giao theo **vai trò** (`RecurringWork.roleId`), không theo người
Solo giữ mọi vai trò → mọi việc định kỳ rơi về mình. Tuyển người → gán vai trò → việc tự chảy sang họ, **không sửa cấu hình**.

---

## 3. Vòng đời & nghiệm thu co giãn

Giữ enum hiện có, bổ sung một bước **review** đóng vai trò "cổng người-trên-agent":

```
draft ─► (pending_approval) ─► active ─► in_progress ─► review ─► completed
  │            │                  │           │            │
  └────────────┴──────────────────┴───────────┴────────────┴──► cancelled
```

- `pending_approval` — duyệt **đề bài/breakdown đầu vào** (đã có). Với solo nên **mặc định tắt** (`requireApproval=false`); chỉ bật khi giao cho agent việc lớn cần xem breakdown trước.
- **`review`** *(đề xuất thêm)* — người/agent làm xong, **người thật nghiệm thu đầu ra**. Đây là điểm co giãn:

| | Solo (1 chặng) | Nhiều người (N chặng) |
|---|---|---|
| Agent làm xong | → thẳng **apex (bạn)** duyệt | → **quản lý thật** duyệt sơ bộ → trách nhiệm cuối vẫn ở **apex** |
| Người thật làm xong | tự đóng (bạn = người làm = apex) | → cấp trên trực tiếp nghiệm thu |

**Phân loại theo rủi ro** (giữ pattern GL đã đúng):

| Loại việc | Cổng nghiệm thu |
|---|---|
| Nội bộ / đảo ngược được | Agent/người tự đóng, **chỉ thông báo**; apex có quyền mở lại (không chặn luồng) |
| Đụng tiền / đối ngoại / không đảo ngược | **BẮT BUỘC** dừng chờ **người thật** ký (đã đúng với GL: `accountType != 'agent'` + `gl:approve`) |

---

## 4. Bốn chiều điều hành (AI agent là trục chính khi solo)

Mở rộng mô hình 3 chiều của Base thêm **chiều AI agent** — với công ty 1 người, đây là chiều *quan trọng nhất* (agent là "nhân sự" để nhân bản sức làm):

1. **Giao việc** (trên→dưới) — bạn → agent (hoặc → cấp dưới thật khi có).
2. **Báo cáo** (dưới→lên) — agent/nhân viên cập nhật → tổng hợp về apex.
3. **Cộng tác** (ngang) — `watchers`, comment, mention (ít dùng khi solo, sáng đèn khi đông).
4. **AI agent** — `aiAssignee` + `agentJob=true` → worker tự thực thi → **trình người thật nghiệm thu** (chiều cốt lõi của vSME).

---

## 5. Audit hiện trạng — đã phù hợp tới đâu?

Đánh giá bám code thực tế (file:dòng). Mức: ✅ đủ & co giãn · ⚠️ có nhưng lệch/chưa đủ · ❌ thiếu.

| # | Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|---|
| 1 | **Cây tổ chức** (`managerId` + chuỗi cấp trên/dưới) | ✅ | [hierarchy.ts](apps/api/src/lib/hierarchy.ts): `getManagerChain`, `getAllReports`, `getDirectManager`, `wouldCreateCycle` — đầy đủ, an toàn vòng lặp, có fallback `role.level`. |
| 2 | **Giao việc co giãn** (self + cấp dưới) | ✅ | [hierarchy.ts:126-157](apps/api/src/lib/hierarchy.ts#L126-L157) `getAssignableUsers`. Solo → chỉ mình + agent; đông → thêm cấp dưới thật. |
| 3 | **Việc định kỳ theo vai trò** | ✅ | `RecurringWork.roleId` → `generateDueForCompany` sinh 1 việc cho mỗi user giữ vai trò. Co giãn hoàn hảo. |
| 4 | **Cộng tác** (watchers/comment/đính kèm) | ✅ | `watchers` (JSON), `WorkComment`, FileRecord — đã hỗ trợ nhiều người sẵn. |
| 5 | **Giao việc cho agent + worker** | ✅ | `/work/batch` (`assigneeKind=agent`) → `agentJob` → [agent-exec.ts](apps/api/src/lib/agent-exec.ts) queue in-process. |
| 6 | **Cổng người-trên-agent: bút toán tiền** | ✅ | [agent-reply.ts:444-458](apps/api/src/modules/chat/agent-reply.ts#L444-L458) `notifyGlApprovers`; agent chỉ rà soát, người thật `gl:approve` ghi sổ. |
| 7 | **Cổng người-trên-agent: hành động thẩm quyền** | ✅ | Model `AIApprovalRequest` ([schema.prisma:790](packages/db/prisma/schema.prisma#L790)) **đang dùng** ở [ai.router.ts:925-951](apps/api/src/modules/ai/ai.router.ts#L925-L951) (list/get/quyết định). |
| 8 | **Nghiệm thu deliverable thường của agent** | ⚠️ **LỆCH** | [agent-reply.ts:475-528](apps/api/src/modules/chat/agent-reply.ts#L475-L528) `auditByManager`: **chỉ chạy khi quản lý là AGENT**; nếu quản lý là **người thật → return, không làm gì** (dòng 477-479). ⇒ Đúng tình huống công ty 1 người (apex là người thật): việc agent làm xong **không có cổng người thật duyệt**, tự nằm `completed`. |
| 9 | **Đường FAIL khi audit trượt** | ⚠️ | [agent-reply.ts:524-525](apps/api/src/modules/chat/agent-reply.ts#L524-L525): trượt → **hủy luôn** (cancel việc + hủy bút toán), **không leo thang / trả lại làm lại**. |
| 10 | **Trạng thái `review`** | ❌ | Enum `WorkItemStatus` chỉ có `…in_progress → completed` ([schema.prisma:115-122](packages/db/prisma/schema.prisma#L115-L122)). Nhảy thẳng, không có chặng nghiệm thu. |
| 11 | **`reviewerId` + `resolveReviewer`/apex** | ❌ | Không có field `reviewerId`; không có helper phân giải apex (grep rỗng). Reviewer hiện ngầm = `createdBy`. |
| 12 | **Hàng đợi "Chờ tôi duyệt"** | ❌ | `GET /api/work` có view `assigned_to_me/created_by_me/pending_approval/project_tasks` nhưng **không có view "deliverable của agent/cấp dưới chờ tôi nghiệm thu"**. |
| 13 | **Nhắc hạn chủ động** | ❌ | Chỉ thông báo khi *giao* việc ([work.router.ts:234-241](apps/api/src/modules/work/work.router.ts#L234-L241)); không nhắc *sắp đến hạn / quá hạn*. |
| 14 | **UI thành viên/quyền dự án** | ⚠️ | `ProjectMember` + role có trong schema; UI quản lý thành viên còn mỏng (chấp nhận được — sáng đèn sau). |

**Kết luận audit:** *các trục co giãn (cây tổ chức, giao việc, định kỳ theo vai trò) đã đúng và sẵn sàng cho 1→N.* Khoảng trống nằm đúng ở **cổng người-trên-agent cho deliverable thường**: cơ chế hiện chỉ thiết kế cho "agent quản lý duyệt agent nhân viên" (#8) — ngược với nhu cầu solo, nơi **người thật phải là người duyệt**.

---

## 6. Cần làm thêm — xếp theo ưu tiên (solo-first, co giãn theo)

### Ưu tiên CAO

1. **Helper `resolveReviewer(workItem)` → apex người thật.**
   Đi ngược `getManagerChain`, lấy phần tử cuối có `accountType != 'agent'`; nếu người làm không có manager thật → chính họ (solo: bạn). Đây là **một primitive khóa toàn bộ tính co giãn** của review.

2. **Sửa `auditByManager` để KHÔNG bỏ qua khi quản lý là người thật** (#8).
   Sau khi agent làm xong: nếu quản lý/`resolveReviewer` là **người thật** → tạo mục **"Chờ tôi duyệt"** + thông báo, thay vì return. Agent-quản-lý (nếu có) chỉ là **pre-screen tầng trước**, không thay thế chốt người thật. Đây là việc quan trọng nhất cho công ty 1 người.

3. **View `pending_my_review` trong `GET /api/work`** + đẩy vào trang **"Hôm nay"**.
   Gộp: (a) deliverable agent/cấp dưới chờ tôi nghiệm thu, (b) việc quá hạn/sắp đến hạn, (c) việc định kỳ sắp sinh. Nguồn dữ liệu đã có (`AuditLog`, `dueDate`, `agentJob`).

4. **Đổi đường FAIL: leo thang / trả lại làm lại thay vì hủy** (#9).
   Audit trượt → đưa về `active`/`review` kèm nhận xét và thông báo apex, không `cancelled` trắng.

### Ưu tiên TRUNG BÌNH

5. **Thêm trạng thái `review` + field `reviewerId`** (auto-resolve, không nhập tay) (#10, #11).
   `in_progress → review → completed`. `reviewerId` set bằng `resolveReviewer` lúc vào `review`.

6. **Nhắc hạn chủ động (SLA tối giản)** (#13) — cron + notification đã có; nhắc sắp đến hạn / quá hạn / tồn đọng.

7. **Tận dụng `AIApprovalRequest` cho deliverable agent rủi ro cao** (đụng tiền/đối ngoại) — mở rộng pattern đã chạy ở ai.router để thống nhất với luồng WorkItem.

### Ưu tiên THẤP (sáng đèn khi đông người)

8. UI thành viên/quyền dự án (`ProjectMember`).
9. Review nhiều chặng / ủy quyền duyệt cho quản lý thật trung gian.
10. Workflow rẽ nhánh (dạng "process" của 1Office), Gantt/dependency, automation rules, dashboard BI.

---

## 7. Bật mặc định vs sáng đèn khi đông người

| Tính năng | Solo (mặc định) | Tự sáng đèn khi đông người |
|---|---|---|
| Giao việc | Mình + agent | Thêm cấp dưới thật (cùng `getAssignableUsers`) |
| Nghiệm thu | 1 chặng: agent → bạn | N chặng: agent → quản lý thật → apex |
| `reviewerId` | = bạn (apex) | phân giải theo cây; có thể ủy quyền |
| `pending_approval` đầu vào | tắt | bật khi cần sếp duyệt đề bài |
| Việc định kỳ | mọi vai trò về bạn | phân theo người giữ vai trò |
| Project | thư mục gom việc | bật `ProjectMember` + quyền |
| Sprint/Story Point/Gantt/workflow rẽ nhánh | ẩn (giữ field, không UI) | bật theo nhu cầu |
| Trang "Hôm nay" | việc agent chờ tôi duyệt | thêm bộ lọc theo phòng/người |

---

## 8. Bảng tham chiếu 4 nền tảng (rút gọn)

| Tiêu chí | Jira | OpenProject | Base Wework | 1Office | **vSME** |
|---|---|---|---|---|---|
| Đơn vị gốc | Issue | Work Package | Task + checklist | Task / Quy trình | `WorkItem` |
| Vai trò trên việc | Assignee+Reporter+Watcher | +**Accountable** | Làm+**Giám sát**+theo dõi | +**Duyệt mỗi bước** | createdBy+assignedTo+watchers (thiếu reviewer) |
| Workflow | engine sâu | ma trận role×type | cột + review | **low-code rẽ nhánh** | enum cố định |
| Nghiệm thu | cấu hình | có | "Cần xem xét" | duyệt từng bước | ❌ (đang bổ sung) |
| Việc lặp | plugin | cơ bản | có | có | ✅ theo vai trò + lịch VN |
| Báo cáo | JQL/Burndown | Gantt/Budget | Automation Report | BI + cảnh báo | AuditLog (chưa có dashboard) |
| **AI agent thực thi** | ❌ | ❌ | ❌ | ❌ | ✅✅ **độc quyền** |
| Hợp công ty siêu nhỏ | thấp | thấp | trung bình | trung bình | **cao (1 người + agent)** |

**Học gì:** xương sống 3 chiều của Base; phân loại rủi ro & ký số của 1Office (cho việc đụng tiền); phân cấp Epic/Sprint của Jira (để dành); RACI/Accountable của OpenProject (chính là `reviewerId`). **Không đua** engine workflow/Agile/Gantt cho công ty siêu nhỏ.

---

## 9. Tóm tắt một câu

> Xây vSME như **một mô hình co giãn**: công ty 1 người + agent là *trường hợp tối giản của cây tổ chức*. Các trục co giãn (cây `managerId`, giao việc theo cây, định kỳ theo vai trò) **đã đúng**; việc cần làm là **đảo cổng nghiệm thu về người thật** — `resolveReviewer`→apex, sửa `auditByManager` đừng bỏ qua khi quản lý là người thật, thêm view "Chờ tôi duyệt" + trạng thái `review`, và để FAIL leo thang thay vì hủy. Làm đúng ngần đó, cùng một hệ thống chạy mượt từ 1 người tới vài chục người, mỗi tính năng "nhiều người" tự sáng đèn khi tuyển thêm.

---

## 10. File tham chiếu

- [hierarchy.ts](apps/api/src/lib/hierarchy.ts) — cây tổ chức (`getManagerChain`, `getAllReports`, `getAssignableUsers`)
- [agent-reply.ts](apps/api/src/modules/chat/agent-reply.ts) — `auditByManager` (#8), `notifyGlApprovers` (#6)
- [agent-exec.ts](apps/api/src/lib/agent-exec.ts) — worker queue + gọi audit
- [ai.router.ts](apps/api/src/modules/ai/ai.router.ts) — `AIApprovalRequest` (#7)
- [work.router.ts](apps/api/src/modules/work/work.router.ts) — `GET /work` views (#12), thông báo giao việc (#13)
- [schema.prisma](packages/db/prisma/schema.prisma) — `WorkItemStatus` (#10), `AIApprovalRequest`, `RecurringWork`, `ProjectMember`
- Tài liệu chức năng module: [work-module-logic.md](docs/work-module-logic.md)
