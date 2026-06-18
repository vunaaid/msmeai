# Module 07 — Tài Liệu (Documents)

> Tài liệu tham chiếu **đầy đủ & tự chứa** cho module Tài Liệu. Đọc tài liệu này là đủ để
> vận hành, mở rộng hoặc tích hợp — không cần đọc lại code.
> Cập nhật: 2026-05-29.

---

## 1. Mục tiêu & phạm vi

Quản lý **tài liệu** và **template** định dạng **Word (.docx), Excel (.xlsx), PowerPoint (.pptx), Markdown (.md)** với:

1. **Xem & sửa cho người dùng (UI)**:
   - Office (docx/xlsx/pptx): xem & sửa WYSIWYG bằng **OnlyOffice Document Server**.
   - Markdown: editor textarea + preview (`react-markdown`).
2. **Tool cho AI agent**: bộ tool **độc lập** (đọc / tạo-từ-template / tạo-mới / sửa), nơi khác tự quyết định cách dùng.
3. **Danh sách template**:
   - **Template hệ thống** (dùng chung mọi công ty) — **KHÔNG được xóa/sửa**.
   - **Template công ty** — mỗi công ty tự upload, xóa được (xóa mềm).
4. Lưu trữ trên **MinIO** (object storage S3-compatible); metadata ở **PostgreSQL**; có **versioning**.

---

## 2. Kiến trúc & luồng dữ liệu

```
                    ┌─────────────────────────────┐
  Browser ─────────►│ OnlyOffice Document Server  │  (Docker, JWT)
   │  (DocsAPI JS)   │  port 8082                  │
   │                 └──────────┬──────────────────┘
   │ /api/documents/*           │ callback (server→server) + tải file (presigned)
   ▼                            ▼
┌──────────────┐  proxy   ┌──────────────┐   ┌──────────────┐
│ Next.js web  │─────────►│ Express API  │──►│ MinIO (file) │
│ (apps/web)   │  /api/*  │ (apps/api)   │   │ + Postgres   │
└──────────────┘          └──────┬───────┘   └──────────────┘
                                 │ dùng chung
                          ┌──────▼────────────────┐
                          │ @vsme/storage          │ ← cũng được AI tools dùng
                          │ (MinIO + doc service)  │
                          └────────────────────────┘
```

**Luồng upload**: browser → `POST /api/documents/upload` (multipart) → API (multer) → `@vsme/storage` upload buffer lên MinIO + tạo `Document` + `DocumentVersion`.

**Luồng sửa Office (OnlyOffice)**: web mở `[id]` → gọi `GET /editor-config` (API ký JWT, trả presigned URL bằng **endpoint công khai**) → web nạp DocsAPI từ OnlyOffice → editor tải file từ MinIO → khi lưu, OnlyOffice gọi `POST /:id/callback` (server→server) → API tải file đã sửa, lưu **version mới**.

**Luồng sửa Markdown**: `GET /:id/content` (text) → sửa trong textarea → `PUT /:id/content` → lưu version mới.

---

## 3. Bản đồ file (mọi file của module)

| File | Vai trò |
|---|---|
| `packages/db/prisma/schema.prisma` | Models `Document`, `DocumentVersion`, `DocumentTemplate`; enum `DocumentFileType`; `FileEntityType` thêm `document`,`template` |
| `packages/db/prisma/migrations/*_add_documents_and_templates/` | Migration additive cho production |
| `packages/db/src/index.ts` | Export type/enum mới của `@vsme/db` |
| `packages/db/src/seed.ts` | Seed module config + permissions + 4 template hệ thống |
| `packages/storage/` | **Package dùng chung** — MinIO + document service (xem §5) |
| `apps/api/src/modules/documents/documents.router.ts` | Toàn bộ REST endpoints (xem §6) |
| `apps/api/src/modules/documents/onlyoffice.ts` | Ký/verify JWT + dựng editor config |
| `apps/api/src/app.ts` | Mount router: `api.use("/documents", documentsRouter)` |
| `apps/web/src/app/(dashboard)/documents/page.tsx` | Server page (auth) |
| `apps/web/src/app/(dashboard)/documents/documents-client.tsx` | 2 tab Tài liệu / Template |
| `apps/web/src/app/(dashboard)/documents/upload-modal.tsx` | Modal upload (multipart) |
| `apps/web/src/app/(dashboard)/documents/create-from-template-modal.tsx` | Tạo tài liệu từ template |
| `apps/web/src/app/(dashboard)/documents/[id]/page.tsx` + `document-client.tsx` | Trang xem/sửa |
| `apps/web/src/app/(dashboard)/documents/[id]/onlyoffice-editor.tsx` | Nhúng OnlyOffice (client, dynamic) |
| `packages/ai-sdk/src/tools/document-tools.ts` | **Bộ AI tool độc lập** (xem §7) |
| `packages/modules/src/registry.ts` + `types.ts` | Đăng ký module `documents` |
| `docker/docker-compose.yml` | Service `onlyoffice` |
| `scripts/configure-document-env.sh` | Cấu hình env theo domain (xem §11) |

---

## 4. Cơ sở dữ liệu

### 4.1 Enum

```prisma
enum DocumentFileType { docx  xlsx  pptx  md }
enum FileEntityType { invoice contract report employee product attachment export document template }
```

### 4.2 `DocumentTemplate` — danh sách template

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `companyId` | string? | **NULL = template hệ thống** (dùng chung) |
| `name`, `description?`, `category?` | string | |
| `fileType` | DocumentFileType | |
| `bucket`, `storagePath` | string | vị trí file mẫu trên MinIO |
| `originalName`, `mimeType`, `size` | | |
| `variables` | Json? | danh sách biến `{{placeholder}}` (mảng key hoặc object) |
| `isSystem` | bool=false | **true ⇒ KHÔNG xóa/sửa** |
| `createdBy` | string (userId) | |
| `createdAt`, `updatedAt`, `deletedAt?` | | soft-delete (chỉ template công ty) |

> **Quy tắc bất biến:** template với `isSystem = true` **HOẶC** `companyId = null` → API trả **403** khi cố xóa. Chỉ template `companyId == user.companyId` mới xóa được.

### 4.3 `Document` — tài liệu thực tế

`id`, `companyId`, `name`, `fileType`, `templateId?` (nếu tạo từ template), `currentVersionId?` (unique), `createdBy`, `createdAt/updatedAt`, `deletedAt?` (soft-delete). Quan hệ: `currentVersion`, `versions[]`, `template`.

### 4.4 `DocumentVersion` — lịch sử phiên bản

`id`, `documentId`, `versionNo` (unique theo document), `bucket`, `storagePath`, `mimeType`, `size`, `createdBy`, `createdAt`. Mỗi lần lưu (upload/OnlyOffice callback/sửa md) → tạo version mới + cập nhật `Document.currentVersionId`.

### 4.5 Đường dẫn lưu trên MinIO

| Loại | Prefix |
|---|---|
| Tài liệu (mỗi version) | `{companyId}/documents/{documentId}/{year}/{month}/v{n}{ext}` |
| Template công ty | `{companyId}/templates/{year}/{month}/{uuid}{ext}` |
| Template hệ thống | `_system/templates/{year}/{month}/{uuid}{ext}` |

### 4.6 Migration — LƯU Ý QUAN TRỌNG

DB local là **CLONE** quản lý bằng **`prisma db push`** (KHÔNG `migrate dev` — sẽ phát hiện drift và **RESET sạch dữ liệu**, đã từng xảy ra). Lệnh `pnpm db:migrate` đã bị **chặn** trong `packages/db/package.json`.
- Áp schema: **`pnpm --filter @vsme/db db:push`** rồi `db:generate`.
- File migration trong repo chỉ là bản additive cho production (`migrate deploy`); lịch sử migration đã lệch live schema từ trước.

---

## 5. Package `@vsme/storage` (dùng chung)

ESM, `type: module`. Cài: `minio, mammoth, exceljs, docx, docxtemplater, pizzip, officeparser` (tất cả pure-JS). Dùng bởi cả `apps/api` và `packages/ai-sdk`.

### 5.1 `minio.ts` — low-level

| Hàm | Mô tả |
|---|---|
| `getMinioClient()` | Client theo `MINIO_ENDPOINT` (browser/host dùng) |
| `getMinioPublicClient()` | Client theo `MINIO_PUBLIC_ENDPOINT` (cho OnlyOffice container) |
| `BUCKETS` | `{ FILES, EXPORTS, TEMP }` từ env |
| `ensureBucket(bucket)` | tạo bucket nếu chưa có |
| `buildStoragePath(prefix, originalName)` | sinh path `{prefix}/{year}/{month}/{uuid}{ext}` |
| `uploadBuffer({bucket?, storagePath, buffer, mimeType})` | → `{bucket, storagePath, size}` |
| `getObjectBuffer(bucket, path)` | tải object → Buffer |
| `getPresignedUrl(bucket, path, expires=3600)` | presigned URL **cho trình duyệt** |
| `getPresignedUrlPublic(bucket, path, expires=3600)` | presigned URL **cho OnlyOffice** (endpoint công khai) |
| `removeObject(bucket, path)` | xóa hẳn object |

### 5.2 `documents.ts` — document service

| Hàm | Mô tả |
|---|---|
| `MIME_BY_TYPE` | map `DocumentFileType → mime` |
| `detectFileType(originalName, mimeType?)` | suy ra fileType, null nếu không hỗ trợ |
| `extractText(buffer, fileType)` | trích text (docx→mammoth, xlsx→exceljs, pptx→officeparser, md→raw) |
| `extractDocxHtml(buffer)` | HTML preview docx |
| `generateDocx({title?, paragraphs[]})` | sinh .docx → Buffer |
| `generateXlsx({sheets:[{name, rows[][]}]})` | sinh .xlsx → Buffer |
| `fillTemplate(buffer, fileType, data)` | điền `{{placeholder}}` (docx: docxtemplater delimiters `{{ }}`; xlsx: thay ô; md: regex) |
| `createDocument({companyId, userId, name, fileType, buffer, mimeType, templateId?})` | tạo Document + v1 |
| `createDocumentFromTemplate({companyId, userId, templateId, name?, data})` | tải mẫu → fill → tạo Document |
| `saveDocumentVersion({documentId, userId, buffer, mimeType, companyId})` | → `{versionId, versionNo}` |
| `readDocumentText({documentId, companyId})` | text của version hiện tại |

---

## 6. REST API (`/api/documents`)

Tất cả qua proxy Next `/api/*` → Express. Envelope: `{ success, data, meta?, error? }`. Auth qua cookie NextAuth (proxy tự forward). Permission module key = **`documents`**.

| Method | Path | Quyền | Mô tả / body | Trả về |
|---|---|---|---|---|
| GET | `/documents` | đăng nhập | query: `page,limit,fileType` | `Document[]` (kèm currentVersion, template) + meta |
| POST | `/documents/upload` | `documents:write` | multipart `file` + field `name` | `Document` |
| POST | `/documents` | `documents:write` | JSON `{name, fileType?, templateId?, data?, content?}` | `Document` |
| GET | `/documents/:id` | đăng nhập | | `Document` + versions[] |
| GET | `/documents/:id/download` | đăng nhập | | `{url, filename}` (presigned) |
| GET | `/documents/:id/content` | đăng nhập | | `{content, fileType}` (text) |
| PUT | `/documents/:id/content` | `documents:write` | JSON `{content}` — **chỉ md** | `{versionId, versionNo}` |
| GET | `/documents/:id/editor-config` | đăng nhập | | `{config, documentServerUrl}` (config đã ký JWT) |
| POST | `/documents/:id/callback` | **không auth** (verify JWT OnlyOffice) | OnlyOffice gọi | `{error:0}` |
| DELETE | `/documents/:id` | `documents:delete` | | 204 |
| GET | `/documents/templates` | đăng nhập | query `fileType?` | template hệ thống + công ty |
| POST | `/documents/templates/upload` | `documents:write` | multipart `file` + `name,category?,description?` | `DocumentTemplate` |
| GET | `/documents/templates/:id/download` | đăng nhập | | `{url, filename}` |
| DELETE | `/documents/templates/:id` | `documents:delete` | | 204 — **403 nếu template hệ thống** |

**Giới hạn upload**: multer memoryStorage, **50MB**. Multipart không qua `express.json` nên không vướng limit 10MB.

**Thứ tự route**: `/templates*` khai báo **trước** `/:id` (tránh `:id` nuốt `templates`). `/:id/callback` không dùng `requireAuth`.

---

## 7. AI Tools (độc lập — "tool only")

File `packages/ai-sdk/src/tools/document-tools.ts`. **Không gắn vào agent-runner** — nơi dùng tự quyết định.

### 7.1 Exports

```ts
interface DocumentToolContext { companyId: string; userId: string }
interface StandaloneTool { definition: ToolDefinition; execute(input, ctx): Promise<string> }

DOCUMENT_TOOLS: StandaloneTool[]              // 4 tool đầy đủ (schema + execute)
DOCUMENT_TOOL_DEFINITIONS: ToolDefinition[]   // chỉ schema (truyền cho LLM)
isDocumentTool(name): boolean
getDocumentTool(name): StandaloneTool | undefined
executeDocumentTool(name, input, ctx): Promise<string>
```

### 7.2 4 tool

| Tool name | Input | Hành vi |
|---|---|---|
| `read_document` | `{documentId}` | trả text (cắt còn ≤12000 ký tự) |
| `create_document_from_template` | `{templateId, name?, data}` | điền template → Document mới |
| `create_document` | `{name, fileType(docx/xlsx/md), content?, rows?}` | sinh file mới |
| `edit_document` | `{documentId, content}` | lưu version mới — **chỉ md**; Office trả cảnh báo dùng OnlyOffice |

### 7.3 Cách tích hợp (ở "chỗ khác")

```ts
import { DOCUMENT_TOOL_DEFINITIONS, isDocumentTool, executeDocumentTool } from "@vsme/ai-sdk";

// 1. Khai báo schema cho LLM:
tools.push(...DOCUMENT_TOOL_DEFINITIONS);

// 2. Khi LLM gọi tool:
if (isDocumentTool(name)) {
  const result = await executeDocumentTool(name, input, { companyId, userId });
}
```

> **Lưu ý governance**: nếu wiring vào agent-runner thì authority checker mặc định `NOT_ALLOWED` khi skill không khai báo rule cho action tương ứng. Đây là quyết định ở tầng tích hợp, không thuộc bản thân tool.

---

## 8. OnlyOffice integration

### 8.1 `onlyoffice.ts` (apps/api)

| Hàm | Mô tả |
|---|---|
| `isOnlyOfficeEnabled()` | true nếu có `ONLYOFFICE_URL` |
| `signOnlyOffice(payload)` | ký HS256 bằng `ONLYOFFICE_JWT_SECRET`, exp 12h |
| `verifyOnlyOffice(token)` | verify token callback |
| `buildEditorConfig({...})` | dựng config + chèn `token` đã ký |

`documentType` map: docx→`word`, xlsx→`cell`, pptx→`slide`. `versionKey` = `{documentId}_{versionNo}` (đổi khi nội dung đổi → OnlyOffice không cache nhầm).

### 8.2 Callback protocol

OnlyOffice POST JSON tới `/api/documents/:id/callback`. `status`: **2 = MustSave**, **6 = ForceSave** → API tải file từ `url` trong body → `saveDocumentVersion`. API **luôn trả `{error:0}`**. Token verify lấy từ `body.token` hoặc header `Authorization`.

### 8.3 ⚠️ GOTCHA mạng (điểm dễ vướng nhất)

Presigned URL của MinIO **ký theo Host** → ai truy cập phải dùng đúng host đó:
- **Browser** tải file (nút Download, download UI): dùng `getPresignedUrl()` → `MINIO_ENDPOINT` (vd `localhost:9000`).
- **OnlyOffice container** tải file để mở editor: dùng `getPresignedUrlPublic()` → `MINIO_PUBLIC_ENDPOINT` (vd `host.docker.internal:9000`).
- **Callback** OnlyOffice→API: qua `ONLYOFFICE_CALLBACK_BASE`.

Nếu file **không mở được trong editor** → 90% do `MINIO_PUBLIC_ENDPOINT`/`ONLYOFFICE_CALLBACK_BASE` sai (container không reach được host/MinIO). Container có `extra_hosts: host.docker.internal:host-gateway`.

---

## 9. Frontend

- `/documents` — server page check `auth()`, truyền `canManage` (= company_admin/superAdmin).
- `documents-client.tsx` — 2 tab **Tài liệu / Template**, dùng `useApi`/`apiFetch`/`apiSend` (`@/lib/api/client`). Tab Template: badge **"Hệ thống"** (không nút xóa) vs **"Công ty"** (xóa được); nút **Dùng** (tạo từ template).
- `upload-modal.tsx` — kéo-thả, `FormData` → `/upload` hoặc `/templates/upload`.
- `[id]/document-client.tsx` — md → MarkdownEditor (textarea + preview); office → `OnlyOfficeEditor` (dynamic, `ssr:false`).
- Icon module: `FileStack` (đã thêm vào `sidebar.tsx` ICON_MAP).

---

## 10. Đăng ký module & RBAC

- `packages/modules/src/types.ts`: `ModuleKey` thêm `"documents"`.
- `registry.ts`: entry `documents` (name "Tài Liệu", icon `FileStack`, route `/documents`, tier `core`, navOrder 6, canDisable true).
- `apps/web/.../layout.tsx`: `IMPLEMENTED_MODULES` chứa `"documents"` (bỏ "Sắp ra mắt").
- Hiển thị sidebar khi: moduleConfig của công ty bật `documents` **VÀ** (user là admin **HOẶC** role có quyền `documents:read`).
- Backend enforce bằng `assertPermission`/`hasPermission(user, "documents", action)`.

---

## 11. Biến môi trường

| Biến | Ý nghĩa | Dev mặc định |
|---|---|---|
| `MINIO_ENDPOINT`/`MINIO_PORT` | MinIO cho host/browser | `localhost`/`9000` |
| `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` | credentials | `vsme_minio_admin`/`vsme_minio_secret` |
| `MINIO_BUCKET_FILES` | bucket chính | `vsme-files` |
| `MINIO_PUBLIC_ENDPOINT`/`MINIO_PUBLIC_PORT` | MinIO cho OnlyOffice container | `host.docker.internal`/`9000` |
| `ONLYOFFICE_URL` | URL browser nạp editor | `http://localhost:8082` |
| `NEXT_PUBLIC_ONLYOFFICE_URL` | (= ONLYOFFICE_URL) | |
| `ONLYOFFICE_JWT_SECRET` | **phải khớp** `JWT_SECRET` container | `vsme_onlyoffice_jwt_secret` |
| `ONLYOFFICE_CALLBACK_BASE` | URL OnlyOffice gọi callback | `http://host.docker.internal:4000` |

> Env nạp qua `--env-file=.env` (PM2/dev). `NEXT_PUBLIC_*` được Next inline lúc **build** — nếu client cần thì phải build lại web. (Hiện editor lấy URL từ API response nên không phụ thuộc biến này.)

### Cấu hình theo domain — `scripts/configure-document-env.sh`

```bash
# Dev:
bash scripts/configure-document-env.sh --profile docker-dev

# Prod (reverse proxy, mỗi service 1 subdomain):
bash scripts/configure-document-env.sh \
  --onlyoffice-url https://docs.example.com \
  --callback-base  https://api.example.com \
  --minio-endpoint files.example.com --minio-port 443
```
Cập nhật idempotent 5 biến trong `.env`. Sau đó **khởi động lại api + web**.

---

## 12. Docker

Service `onlyoffice` trong `docker/docker-compose.yml`:
- image `onlyoffice/documentserver:latest`, port **8082→80**.
- env: `JWT_ENABLED=true`, `JWT_SECRET=vsme_onlyoffice_jwt_secret` (khớp `ONLYOFFICE_JWT_SECRET`), `JWT_HEADER=Authorization`.
- `extra_hosts: host.docker.internal:host-gateway`.
- volumes: `onlyoffice_data`, `onlyoffice_log`.
- RAM khuyến nghị ≥ 2GB.

MinIO buckets tạo bởi `minio-setup` container: `vsme-files`, `vsme-exports`, `vsme-temp`.

---

## 13. Seed & kích hoạt

```bash
docker compose -f docker/docker-compose.yml up -d        # minio + onlyoffice
pnpm --filter @vsme/db db:seed                            # cần MinIO up
```
Seed tạo: module config `documents` (enabled, core), permissions, và **4 template hệ thống**: "Hợp đồng lao động" (docx), "Báo giá" (docx), "Biên bản họp" (md), "Bảng lương" (xlsx) — file mẫu sinh tại chỗ + upload lên `_system/templates/`. Nếu MinIO chưa sẵn sàng → block template tự bỏ qua (warning), phần DB vẫn chạy.

Bật module cho công ty đã tồn tại (không seed lại): upsert `moduleConfig {moduleKey:"documents", enabled:true}` qua admin UI hoặc prisma.

---

## 14. Giấy phép OnlyOffice

- **Community Edition = AGPL v3** (miễn phí). Dùng thương mại được; chạy dạng **service riêng, không sửa mã nguồn** (như vSME) thường không kích hoạt nghĩa vụ mở source, nhưng **phải giữ branding** OnlyOffice. Giới hạn ~20 kết nối đồng thời.
- Muốn **white-label / tránh ràng buộc AGPL** khi bán SaaS → **Developer Edition** (license thương mại). Nên tham vấn pháp lý trước khi phát hành rộng.

---

## 15. Mở rộng

- **Thêm loại file**: thêm value vào enum `DocumentFileType` (db push), bổ sung `MIME_BY_TYPE`/`detectFileType`/`extractText` trong `@vsme/storage`, cập nhật UI `TYPE_META`.
- **Thêm AI tool tài liệu**: thêm 1 `StandaloneTool` vào `DOCUMENT_TOOLS` (`document-tools.ts`) — tự động vào registry.
- **Template có biến**: set `variables` (mảng key) khi tạo template → UI/AI render field điền tự động; điền bằng `fillTemplate` (delimiters `{{ }}`).
- **Phân quyền chi tiết**: cấp permission `documents:{read|write|delete}` cho role qua admin UI.

---

## 16. Hạn chế đã biết

- Sửa **pptx** qua template (`fillTemplate`) chưa hỗ trợ — trả nguyên bản.
- AI `edit_document` chỉ sửa **md**; Office phải dùng OnlyOffice.
- Proxy đệm toàn bộ body vào RAM → giữ giới hạn upload hợp lý (50MB).
- Xóa mềm tài liệu/template không xóa object khỏi MinIO (cần cleanup job riêng nếu muốn).

---

## 17. Kiểm thử end-to-end

1. **Upload**: `/documents` → upload .docx/.xlsx/.md → thấy trong danh sách → Tải về mở đúng file.
2. **Template**: tab Template thấy 4 template hệ thống **không có nút Xóa**; upload template công ty → xóa được; `DELETE` template hệ thống qua API → **403**.
3. **OnlyOffice**: mở .docx → sửa → đóng → mở lại thấy nội dung mới (versionNo tăng trong `DocumentVersion`).
4. **Markdown**: mở .md → sửa → Lưu → preview đúng.
5. **AI tool**: gọi `executeDocumentTool("create_document_from_template", {...}, {companyId,userId})` → Document mới xuất hiện.
6. **RBAC**: user không quyền `documents` → không thấy sidebar + API trả 403.

---

## 18. Trạng thái hiện tại (2026-05-29)

- DB: 3 companies, module `documents` **đã bật cho cả 3**; permission catalog `documents` đã tạo.
- Chưa có document/template nào (bảng rỗng) — **chưa chạy seed template hệ thống** vì cần MinIO up.
- Docker (onlyoffice/minio) chưa chạy trong môi trường dev hiện tại → cần `docker compose up` để test luồng Office.
