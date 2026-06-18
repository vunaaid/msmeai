# Đóng góp cho vSME

> 🇬🇧 English: [CONTRIBUTING.md](CONTRIBUTING.md) · 🇻🇳 Bản tiếng Việt (bạn đang đọc).

Cảm ơn bạn quan tâm đóng góp! Dự án hoan nghênh ý tưởng, báo lỗi, và pull request.

## Trước khi bắt đầu

- vSME dùng giấy phép **source-available** ([LICENSE](LICENSE)) — không phải open source.
- Mọi đóng góp đều phải tuân theo **Thỏa thuận Đóng góp (CLA)** — xem [CLA.vi.md](CLA.vi.md).
  Lần đầu mở Pull Request, bot CLA sẽ yêu cầu bạn ký (một lần duy nhất).

## Quy trình

1. **Mở issue trước** với thay đổi lớn để thống nhất hướng đi.
2. Fork → tạo branch từ `main` (đặt tên `feat/...` hoặc `fix/...`).
3. Cài đặt và chạy dự án theo [CLAUDE.md](CLAUDE.md) (pnpm + turbo).
4. Trước khi commit:
   - `pnpm db:check` — đảm bảo DB khớp schema.
   - `pnpm type-check` — không lỗi kiểu.
5. Commit theo Conventional Commits (`feat:`, `fix:`, `docs:`...).
6. Mở Pull Request mô tả rõ thay đổi và lý do.

## Quyền lợi & nghĩa vụ của người đóng góp

**Bạn giữ bản quyền** phần code mình viết. Qua CLA, bạn **cấp phép** (không chuyển
nhượng) cho chủ dự án quyền sử dụng và re-license đóng góp đó, kể cả trong bản thương mại.

- Bạn được ghi nhận trong lịch sử commit và `CONTRIBUTORS.md`.
- Đóng góp được phát hành dưới cùng giấy phép của dự án.
- Việc gửi PR **không** tạo ra quyền đồng sở hữu sản phẩm hay quyền lợi tài chính.
  Các thỏa thuận maintainer/chia sẻ doanh thu (nếu có) được bàn riêng, ngoài CLA này.

## Báo lỗi bảo mật

Không mở issue công khai cho lỗ hổng bảo mật. Gửi riêng tới **vuna.aid@gmail.com**.
