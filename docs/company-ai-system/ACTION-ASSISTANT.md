# Trợ Lý Hành Động (Action Assistant)

> Tài liệu thiết kế: trợ lý AI **thực thi hành động** trong app (không chỉ tư vấn bằng văn bản).
> Bám theo code đã có trong `packages/ai-sdk` và module `Work` của `apps/api`.
> Liên quan: [RECURRING-WORK.md](./RECURRING-WORK.md) — công việc **định kỳ** tự lên workboard.

---

## 1. Mục tiêu & phân biệt

| | Trợ lý tư vấn (hiện tại) | Trợ lý hành động (mục tiêu) |
|---|---|---|
| Cơ chế | `streamClaude` + `--allowedTools ""` (không tool) | `runAgent` (vòng lặp tool-use) |
| Kết quả | Văn bản: phân tích, đề xuất, soạn thảo | Thao tác thật: tạo việc, gửi thông báo, tạo yêu cầu duyệt… |
| Kiểm soát | Không | Qua **bảng thẩm quyền** + **chế độ FULL/ASSISTANT** |
| Lưu vết | Chỉ message | **AITask** + **ApprovalRequest** + log chi phí |

Trợ lý hành động = **LLM suy luận + bộ công cụ + cổng thẩm quyền + duyệt/escalate + lưu vết**.

---

## 2. Các thành phần (đã có code)

### 2.1 Bộ công cụ — `packages/ai-sdk/src/tools/definitions.ts`
Cấp theo bậc vai trò:

- **Staff**: `search_database`, `get_module_summary`, `create_task`, `send_notification`
- **Manager** (+): `get_report`, `create_approval_request`, `approve_document`, `escalate_to_superior`
- **C-Suite / Board** (+): kế thừa toàn bộ

### 2.2 Cổng thẩm quyền — `packages/ai-sdk/src/authority/checker.ts`
`checkAuthority(skill, { action, fields })` đối chiếu hành động với `authority_table` trong skill → trả 1 trong 4:

- **SELF_EXECUTE** — tự làm
- **NEEDS_APPROVAL** — cần người có thẩm quyền duyệt (kèm `approver`)
- **ESCALATE** — đẩy lên cấp trên (`reports_to`)
- **NOT_ALLOWED** — cấm (mặc định nếu không khớp luật nào)

Có xét **điều kiện** (vd `amount > 500000000`). Luật có điều kiện được ưu tiên trước luật wildcard.

### 2.3 Chế độ chạy — `applyModeOverride`
- **FULL**: SELF_EXECUTE → thực thi ngay.
- **ASSISTANT**: mọi SELF_EXECUTE bị hạ thành **NEEDS_APPROVAL** (đề xuất, chờ người dùng xác nhận).

### 2.4 Vòng lặp agent — `packages/ai-sdk/src/runner/agent-runner.ts` (`runAgent`)
1. Nạp skill + lịch sử hội thoại + bộ tool theo cấp.
2. Gọi LLM kèm tools.
3. Khi LLM `stopReason === "tool_use"`: với mỗi tool call → `executeToolWithAuthority`:
   - `checkAuthority` → `applyModeOverride`.
   - Nếu NEEDS_APPROVAL/ESCALATE → `handleEscalation` (tạo ApprovalRequest + thông báo).
   - Nếu SELF_EXECUTE → `executeTool` (thao tác thật).
4. Trả kết quả tool về LLM → lặp đến khi xong.
5. Lưu **AITask** (`awaiting_approval`/`completed`), `approvalRequestIds`, log chi phí LLM.

### 2.5 Engine duyệt/escalate — `packages/ai-sdk/src/escalation/engine.ts`
Tạo `ApprovalRequest`, xác định người duyệt (`approver` hoặc `reports_to`), gửi thông báo.

---

## 3. Kịch bản: vị trí nhận việc + có quyền giao việc

**Ví dụ:** Trưởng phòng nhận việc *"Chuẩn bị báo cáo doanh số Q3"*, có quyền giao việc cho nhân viên.

1. **Hiểu việc + lấy ngữ cảnh** — đọc work item; `search_database` / `get_module_summary` để biết số liệu, nhân sự.
2. **Phân rã việc** — LLM đề xuất danh sách **việc con** (người nhận, hạn, ưu tiên) → lưu vào `WorkItem.aiBreakdown`.
3. **Kiểm tra thẩm quyền từng việc giao** (`create_task`):
   - Giao trong phòng → SELF_EXECUTE.
   - Vượt phạm vi/ngân sách → NEEDS_APPROVAL → tạo yêu cầu duyệt gửi cấp trên.
4. **Thực thi theo chế độ**:
   - **FULL** → tạo **việc con** (`work_items`, `parentId` = việc gốc, `assignedTo`, status `active`).
   - **ASSISTANT** → đề xuất breakdown, chờ trưởng phòng bấm **Duyệt** (`POST /api/work/:id/approve`) → hệ thống tạo việc con.
5. **Thông báo người nhận** — `send_notification`.
6. **Theo dõi & nhắc** — `workflow_triggers`: quá hạn → nhắc; trễ → `escalate_to_superior`.
7. **Ghi nhận** — AITask + approval đã tạo + log.

> Cơ chế giao việc thật (tạo `work_items` con) hiện nằm ở **luồng breakdown → approve** của module Work:
> `apps/api/src/modules/work/work.router.ts` → `POST /:id/approve` (tạo children từ `aiBreakdown`).

---

## 4. Hiện trạng thực thi (mức hoàn thiện)

| Thành phần | Trạng thái |
|---|---|
| `checkAuthority`, `applyModeOverride`, escalation engine | ✅ Đã code |
| `send_notification`, `approve_document`, `escalate_to_superior` | ✅ Chạy thật (ghi DB) |
| Tạo `AITask` + log LLM | ✅ Chạy thật |
| `search_database`, `get_module_summary`, `get_report` | ⚠️ Placeholder (chưa truy vấn dữ liệu thật) |
| `create_task` (tool) | ⚠️ Hiện tạo **AITask**, chưa tạo `work_items` (giao cho người) |
| **Luồng chat** (`POST /api/ai/agents/:id/chat`) | ⚠️ Đang `streamClaude` + `noTools` → chưa gọi `runAgent` |

---

## 5. Việc cần làm để "bật" trợ lý hành động

Phạm vi đề xuất: làm cho **1 vai trò** trước (vd Trưởng phòng) theo đúng kịch bản "nhận việc → phân rã → giao việc con".

1. **Nối `runAgent` vào luồng chat** (hoặc một endpoint hành động riêng), thay cho `streamClaude` khi agent được bật tool.
2. **Hoàn thiện executor** cho dữ liệu thật: `search_database`, `get_module_summary` (đọc từ Prisma theo module + companyId/scope).
3. **`create_task` → tạo `work_items`** (gán `assignedTo`, `parentId`) thay vì AITask; đi qua `checkAuthority` cho hành động giao việc.
4. **Map hành động giao việc vào `authority_table`** của các skill (vd `create_task`/`assign_task` với điều kiện cấp người nhận).
5. **Chế độ ASSISTANT mặc định** → trợ lý đề xuất breakdown, người dùng duyệt qua UI Work (đã có nút "Duyệt" + modal phân tích).
6. **Kiểm thử** end-to-end: nhận việc → trợ lý phân rã → (đề xuất/duyệt) → việc con xuất hiện trong "Việc của tôi" của người nhận + thông báo.

---

## 6. Tham chiếu code

- Skill + system prompt: `packages/ai-sdk/src/skill/parser.ts` (`buildSystemPrompt`)
- Bảng thẩm quyền: `authority_table` trong từng `skills/*.skill.md`
- Cổng thẩm quyền: `packages/ai-sdk/src/authority/checker.ts`
- Vòng lặp + executor: `packages/ai-sdk/src/runner/agent-runner.ts`
- Escalation/approval: `packages/ai-sdk/src/escalation/engine.ts`
- Tool definitions: `packages/ai-sdk/src/tools/definitions.ts`
- Giao việc (tạo việc con): `apps/api/src/modules/work/work.router.ts` (`POST /:id/approve`, `GET /:id/breakdown`)
- Chat agent (hiện tại): `apps/api/src/modules/ai/ai.router.ts` (`POST /agents/:agentId/chat`)
