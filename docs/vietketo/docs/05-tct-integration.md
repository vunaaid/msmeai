# TCT eTax Integration Guide — VietKeto

> ⏳ **TÀI LIỆU NÀY SẼ ĐƯỢC HOÀN THIỆN SAU KHI CÁC PHÂN HỆ CƠ BẢN HOÀN THÀNH**

---

## Trạng Thái: Chờ Triển Khai (Phase 6)

Tích hợp TCT eTax sẽ được thực hiện sau khi toàn bộ các phân hệ nội bộ hoàn chỉnh và đã được kiểm thử (Phase 1–5).

---

## Nội Dung Sẽ Bao Gồm

### 1. Đăng Ký & Chuẩn Bị
- Đăng ký tài khoản doanh nghiệp trên eTax Portal
- Đăng ký phát hành hóa đơn điện tử
- Cấp phát chứng thư số (USB Token hoặc Soft Certificate)
- Đăng ký môi trường test TCT

### 2. TCT SDK Development (`packages/tct-sdk`)
```typescript
// Các class sẽ được xây dựng:
class TCTClient {
  signInvoice(invoice: InvoiceData, cert: Certificate): SignedXML
  submitInvoice(xml: SignedXML): Promise<TCTResponse>
  queryIncoming(params: QueryParams): Promise<Invoice[]>
  verifyInvoice(invoiceCode: string): Promise<VerifyResult>
  downloadXML(invoiceCode: string): Promise<Buffer>
  checkStatus(transactionId: string): Promise<StatusResult>
}

class InvoiceXMLBuilder {
  // Generate XML theo định dạng TT78/2021
  build(invoice: InvoiceData): string
  validate(xml: string): ValidationResult
}

class CertificateSigner {
  // Ký số XML với chứng thư số
  signWithSoftCert(xml: string, p12Path: string, password: string): string
  signWithUSBToken(xml: string, pkcs11Config: PKCS11Config): string
}
```

### 3. API Endpoints TCT
```
URL Base: https://hoadondientu.gdt.gov.vn:443

POST /api/invoice/create        → Tạo và gửi HĐ đầu ra
GET  /api/invoice/search        → Tra cứu HĐ đầu vào
GET  /api/invoice/verify        → Xác minh HĐ bất kỳ
GET  /api/invoice/download      → Tải XML HĐ
GET  /api/invoice/status        → Kiểm tra trạng thái gửi
```

### 4. Luồng Hóa Đơn Đầu Ra
```
Xác nhận HĐ (UI)
    → Generate XML (TT78 format)
    → Ký số (USB Token / Soft Cert)
    → Enqueue BullMQ
    → Worker: POST TCT API
    → Nhận mã CQT
    → Update DB status
    → Send email (PDF) to customer
    → Create GL journal entry
```

### 5. Luồng Hóa Đơn Đầu Vào
```
Cron job (hàng ngày 8:00 AM)
    → GET TCT API (search by period + MST)
    → Parse invoice list
    → Save to DB (status: PENDING_REVIEW)
    → Notify accountant (in-app + email)
    → Accountant reviews → Approve
    → Create GL journal entry
```

### 6. Xử Lý Chứng Thư Số
- **Soft Certificate** (.p12/.pfx): Dùng cho môi trường Cloud
- **USB Token** (PKCS#11): Dùng tại văn phòng
- Mã hóa lưu trữ cert trong DB (AES-256-GCM)
- Key Vault: MinIO + environment variables

### 7. Kiểm Thử
- Môi trường test: https://hoadondientu.gdt.gov.vn (test environment)
- Test cases: Gửi HĐ thành công, Gửi HĐ lỗi, Retry, Tra cứu đầu vào
- UAT với kế toán thực tế

---

## Timeline Dự Kiến
- Bắt đầu sau khi Phase 5 hoàn thành
- Thời gian: ~4 tuần
- Yêu cầu: Chứng thư số doanh nghiệp + tài khoản TCT

---

*Liên hệ team phát triển để cập nhật timeline.*
