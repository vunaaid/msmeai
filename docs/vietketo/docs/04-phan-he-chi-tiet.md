# Đặc Tả Phân Hệ Chi Tiết — VietKeto

> Tài liệu mô tả nghiệp vụ, quy trình và màn hình chính của 11 phân hệ

---

## PHÂN HỆ 01: KẾ TOÁN TỔNG HỢP (General Ledger)

### Mô Tả
Phân hệ trung tâm của toàn bộ hệ thống. Mọi giao dịch kinh tế đều được phản ánh qua bút toán kép (double-entry bookkeeping), đảm bảo Nợ = Có tại mọi thời điểm.

### Chức Năng Chính

#### 1.1 Hệ Thống Tài Khoản (Chart of Accounts)
- Seed sẵn **~300 tài khoản** theo TT200/2014/TT-BTC
- Cấu trúc 3 cấp: Cấp 1 (3 chữ số) → Cấp 2 (4 chữ số) → Cấp 3 (5+ chữ số)
- Cho phép thêm tài khoản chi tiết cấp 4, 5 (tuỳ doanh nghiệp)
- Chỉ tài khoản chi tiết nhất mới được nhập bút toán

**Ví dụ cấu trúc TK Tiền:**
```
111 - Tiền mặt (Cấp 1)
  └── 1111 - Tiền Việt Nam (Cấp 2)  ← Nhập bút toán tại đây
  └── 1112 - Ngoại tệ (Cấp 2)
```

#### 1.2 Nhật Ký Bút Toán
- Hỗ trợ nhật ký chung và nhật ký đặc biệt (thu tiền, chi tiền, bán hàng, mua hàng)
- Tự động đánh số bút toán theo kỳ (VD: `BT2025-001`)
- Quy trình duyệt 2 bước: Nhập → Chờ duyệt → Ghi sổ
- Đảo ngược bút toán (reverse entry) với 1 click
- Kết chuyển cuối kỳ tự động (TK 5xx, 6xx, 7xx, 8xx → 911, 421)

#### 1.3 Sổ Cái & Báo Cáo GL
| Báo cáo | Mô tả |
|---------|-------|
| Sổ chi tiết TK | Tất cả giao dịch qua 1 tài khoản |
| Bảng CĐSPS | Bảng cân đối số phát sinh tháng/quý/năm |
| Bảng cân đối kế toán | B01-DN theo TT200 |
| Báo cáo KQHĐKD | B02-DN theo TT200 |
| Báo cáo LCTT | B03-DN theo TT200 |
| Thuyết minh BCTC | B09-DN theo TT200 |

### Màn Hình Chính
```
┌─────────────────────────────────────────────┐
│  NHẬT KÝ BÚT TOÁN                    [+ Tạo]│
├──────┬──────────┬──────────────┬────────────┤
│ Số BT│ Ngày     │ Diễn giải    │ Trạng thái │
├──────┼──────────┼──────────────┼────────────┤
│BT-001│15/01/2025│Bán HH cho KH │ Ghi sổ ✅  │
│BT-002│16/01/2025│Thanh toán NCC│ Chờ duyệt ⏳│
│BT-003│17/01/2025│Chi phí VP    │ Nháp 📝    │
└──────┴──────────┴──────────────┴────────────┘

Chi tiết bút toán BT-001:
┌──────────────────┬──────────────┬──────────────┐
│ Tài khoản        │ Nợ           │ Có           │
├──────────────────┼──────────────┼──────────────┤
│ 1311 - Phải thu  │ 11,000,000   │              │
│ 5111 - DT bán hàng│             │ 10,000,000   │
│ 3331 - Thuế GTGT │              │  1,000,000   │
├──────────────────┼──────────────┼──────────────┤
│ Tổng             │ 11,000,000   │ 11,000,000 ✅│
└──────────────────┴──────────────┴──────────────┘
```

---

## PHÂN HỆ 02: HÓA ĐƠN ĐIỆN TỬ

### Mô Tả
Quản lý toàn bộ hóa đơn điện tử theo TT78/2021. Giai đoạn đầu: quản lý thủ công. Giai đoạn sau: kết nối trực tiếp TCT eTax.

### Chức Năng Chính

#### 2.1 Hóa Đơn Đầu Ra (Xuất)
**Quy trình:**
```
Tạo hóa đơn (từ đơn hàng hoặc trực tiếp)
    ↓
Kiểm tra thông tin (MST, địa chỉ, sản phẩm)
    ↓
Xác nhận → [Ký số + Gửi TCT - để sau]
    ↓
Lưu trữ PDF
    ↓
Gửi email cho khách hàng
    ↓
Tạo bút toán kế toán tự động
```

**Bút toán tự động khi xác nhận HĐ bán:**
```
Nợ 1311 (Phải thu KH): tổng tiền
    Có 511x (Doanh thu):   tiền hàng
    Có 3331 (VAT phải nộp): tiền VAT
```

#### 2.2 Hóa Đơn Đầu Vào (Mua)
- Nhập thủ công hóa đơn từ nhà cung cấp
- Upload ảnh/PDF hóa đơn giấy
- Khớp với đơn mua hàng (Purchase Order)
- Duyệt để đưa vào kê khai VAT đầu vào

**Bút toán tự động khi duyệt HĐ mua:**
```
Nợ 152x/1561/641... (Hàng/Chi phí): tiền hàng
Nợ 1331 (VAT đầu vào được khấu trừ): tiền VAT
    Có 3311 (Phải trả NCC):           tổng tiền
```

#### 2.3 Thông Tin Trên Hóa Đơn
| Trường | Bắt buộc | Ghi chú |
|--------|----------|---------|
| Tên, địa chỉ người bán | ✅ | Lấy từ thông tin công ty |
| MST người bán | ✅ | |
| Tên, địa chỉ người mua | ✅ | |
| MST người mua | Theo yêu cầu | |
| Ngày lập hóa đơn | ✅ | |
| Ký hiệu hóa đơn | ✅ | VD: 1C25TAA |
| Số hóa đơn | ✅ | Tự động |
| Tên hàng hóa/DV | ✅ | |
| Đơn vị, số lượng, đơn giá | ✅ | |
| Thuế suất VAT | ✅ | 0%, 5%, 8%, 10% |
| Tiền thuế VAT | ✅ | |
| Tổng tiền thanh toán | ✅ | |

---

## PHÂN HỆ 03: PHẢI THU (Accounts Receivable)

### Mô Tả
Theo dõi công nợ phải thu từ khách hàng, quản lý thanh toán và cảnh báo nợ quá hạn.

### Chức Năng Chính

#### 3.1 Quản Lý Khách Hàng
- Hồ sơ khách hàng: tên, MST, địa chỉ, hạn mức tín dụng, điều kiện thanh toán
- Phân loại: KH thông thường / KH VIP / KH nội bộ
- Lịch sử giao dịch và công nợ

#### 3.2 Theo Dõi Công Nợ
- Tổng nợ phải thu theo từng khách hàng
- Cảnh báo khi vượt hạn mức tín dụng
- Nhắc nợ tự động qua email khi đến hạn

#### 3.3 Ghi Nhận Thanh Toán
- Khớp thanh toán với hóa đơn (1 lần/nhiều lần)
- Tạo bút toán tự động:
```
Nợ 1121 (TK ngân hàng): số tiền nhận
    Có 1311 (Phải thu KH):  số tiền nhận
```

#### 3.4 Báo Cáo Tuổi Nợ (Aging Report)
```
Khách hàng     │ Chưa đến hạn │ 1-30 ngày │ 31-60 ngày │ 61-90 ngày │ >90 ngày
───────────────┼──────────────┼───────────┼────────────┼────────────┼──────────
Công ty A      │   50,000,000 │10,000,000 │  5,000,000 │          0 │        0
Công ty B      │            0 │         0 │          0 │  8,000,000 │5,000,000 ⚠️
```

---

## PHÂN HỆ 04: PHẢI TRẢ (Accounts Payable)

### Mô Tả
Quản lý công nợ phải trả nhà cung cấp, lên kế hoạch thanh toán và tối ưu dòng tiền.

### Chức Năng Chính
- Tương tự AR nhưng cho nhà cung cấp
- Lập kế hoạch thanh toán theo tuần/tháng
- Quản lý nhiều hình thức thanh toán (tiền mặt, chuyển khoản)
- Báo cáo tuổi nợ phải trả

**Bút toán thanh toán cho NCC:**
```
Nợ 3311 (Phải trả NCC): số tiền trả
    Có 1121 (TK ngân hàng): số tiền trả
```

---

## PHÂN HỆ 05: NGÂN QUỸ

### Mô Tả
Quản lý tiền mặt và tiền gửi ngân hàng, đối chiếu sao kê, theo dõi dòng tiền thực tế.

### Chức Năng Chính

#### 5.1 Quản Lý Quỹ Tiền Mặt
- Phiếu thu tiền mặt (PT)
- Phiếu chi tiền mặt (PC)
- Tồn quỹ cuối ngày
- In phiếu thu/chi

#### 5.2 Quản Lý Tài Khoản Ngân Hàng
- Quản lý nhiều TK ngân hàng (Vietcombank, BIDV, Techcombank, ...)
- Số dư thực tế theo ngân hàng
- Phiếu thu/chi ngân hàng

#### 5.3 Import Sao Kê Ngân Hàng
Hỗ trợ import định dạng CSV/Excel từ các ngân hàng phổ biến:

| Ngân hàng | Định dạng |
|-----------|-----------|
| Vietcombank | Excel (.xlsx) |
| BIDV | Excel (.xls) |
| Techcombank | CSV |
| VPBank | Excel |
| MB Bank | Excel |

**Mapping columns tự động + cho phép điều chỉnh thủ công**

#### 5.4 Đối Chiếu Ngân Hàng (Bank Reconciliation)
```
Sao kê ngân hàng          Bút toán kế toán
─────────────────    ↔    ─────────────────
15/01 Thu 10tr      ✅    15/01 Thu KH 10tr
16/01 Chi 5tr       ✅    16/01 Trả NCC 5tr
17/01 Thu 3tr       ❓    Chưa có bút toán → Tạo mới
18/01 ?             ❓    18/01 Thu 2tr → Chưa có sao kê
```

Smart matching tự động dựa trên: số tiền + ngày ± 3 ngày + từ khóa mô tả

---

## PHÂN HỆ 06: BÁN HÀNG

### Mô Tả
Quản lý quy trình bán hàng từ báo giá đến hóa đơn. Tự động cập nhật tồn kho và tạo bút toán.

### Quy Trình
```
Báo giá (Quote)
    ↓ [Khách hàng chấp nhận]
Đơn hàng (Sales Order) ──→ Xuất kho (Stock Out)
    ↓ [Giao hàng xong]
Hóa đơn (Invoice) ──→ Bút toán GL
    ↓ [Khách thanh toán]
Phiếu thu → Bút toán GL
```

### Trạng Thái Đơn Hàng
```
DRAFT → CONFIRMED → PARTIAL (giao một phần) → COMPLETED
                 → CANCELLED
```

### Chức Năng
- Tạo báo giá với nhiều phiên bản
- Gửi báo giá qua email (PDF)
- Chuyển báo giá thành đơn hàng 1 click
- Theo dõi tiến độ giao hàng
- Dashboard doanh thu: theo ngày/tháng/quý, theo sản phẩm, theo KH

---

## PHÂN HỆ 07: HÀNG TỒN KHO

### Mô Tả
Quản lý nhập/xuất/tồn kho theo phương pháp bình quân gia quyền (hoặc FIFO). Tích hợp với phân hệ Bán hàng và Mua hàng.

### Chức Năng Chính

#### 7.1 Nhập Kho
- Phiếu nhập kho (từ PO hoặc nhập thủ công)
- Cập nhật giá vốn bình quân tự động
- Bút toán tự động:
```
Nợ 1521/1561 (Hàng tồn kho): giá nhập
    Có 3311 (Phải trả NCC):    giá nhập
```

#### 7.2 Xuất Kho
- Phiếu xuất kho (từ SO hoặc xuất thủ công)
- Tính giá xuất theo phương pháp đã chọn
- Bút toán tự động:
```
Nợ 632 (Giá vốn hàng bán): giá vốn
    Có 1561 (Hàng tồn kho):  giá vốn
```

#### 7.3 Kiểm Kê Kho
1. Khóa kho (không nhập/xuất trong khi kiểm kê)
2. In phiếu kiểm kê (danh sách sản phẩm, số lượng theo sổ sách)
3. Nhập số lượng thực tế
4. Hệ thống tính chênh lệch
5. Xác nhận → Tạo bút toán điều chỉnh

#### 7.4 Báo Cáo Tồn Kho
```
Sản phẩm  │ Đầu kỳ │ Nhập kỳ │ Xuất kỳ │ Cuối kỳ │ Giá trị
──────────┼─────────┼─────────┼─────────┼─────────┼──────────
SP-A      │   100   │    50   │    80   │    70   │ 14,000,000
SP-B      │    50   │   100   │    60   │    90   │ 36,000,000
```

---

## PHÂN HỆ 08: NHÂN SỰ & LƯƠNG

### Mô Tả
Quản lý hồ sơ nhân viên và tính lương tự động theo quy định Việt Nam hiện hành.

### Chức Năng Chính

#### 8.1 Hồ Sơ Nhân Viên
- Thông tin cá nhân (CCCD, MST cá nhân, mã BHXH)
- Hợp đồng lao động
- Thông tin ngân hàng để chuyển lương
- Lịch sử lương, thưởng

#### 8.2 Tính Lương Tháng

**Công thức chi tiết:**
```
1. Tổng thu nhập (Gross):
   = Lương cơ bản + Phụ cấp + Thưởng + Overtime

2. Các khoản giảm trừ (Phần nhân viên đóng):
   BHXH = Lương cơ bản × 8%
   BHYT = Lương cơ bản × 1.5%
   BHTN = Lương cơ bản × 1%

3. Thu nhập chịu thuế TNCN:
   = Gross - BHXH - BHYT - BHTN
     - Giảm trừ bản thân (11,000,000đ/tháng)
     - Giảm trừ người phụ thuộc (4,400,000đ/người/tháng)
     - Đóng góp từ thiện (nếu có)

4. Thuế TNCN (Biểu thuế lũy tiến):
   Bậc 1: đến   5 triệu          × 5%
   Bậc 2:  5 – 10 triệu          × 10%
   Bậc 3: 10 – 18 triệu          × 15%
   Bậc 4: 18 – 32 triệu          × 20%
   Bậc 5: 32 – 52 triệu          × 25%
   Bậc 6: 52 – 80 triệu          × 30%
   Bậc 7: trên 80 triệu           × 35%

5. Thực nhận (Net):
   = Gross - BHXH - BHYT - BHTN - Thuế TNCN

6. Chi phí doanh nghiệp:
   BHXH DN = Lương cơ bản × 17.5%
   BHYT DN = Lương cơ bản × 3%
   BHTN DN = Lương cơ bản × 1%
   Tổng chi phí DN = Gross + BHXH DN + BHYT DN + BHTN DN
```

#### 8.3 Bút Toán Hạch Toán Lương
```
Nợ 641/642 (Chi phí lương):     tổng gross
    Có 3341 (Lương phải trả):    thực nhận NV
    Có 3383 (BHXH phải nộp NV):  BHXH NV
    Có 3384 (BHYT phải nộp NV):  BHYT NV
    Có 3386 (BHTN phải nộp NV):  BHTN NV
    Có 3335 (Thuế TNCN phải nộp): thuế TNCN

Nợ 641/642 (Chi phí BHXH DN):   BHXH+BHYT+BHTN phần DN
    Có 3383 (BHXH phải nộp DN):   BHXH DN
    Có 3384 (BHYT phải nộp DN):   BHYT DN
    Có 3386 (BHTN phải nộp DN):   BHTN DN
```

#### 8.4 Xuất Khẩu
- Phiếu lương PDF → gửi email nhân viên
- File Excel bảng lương tổng hợp
- File XML nộp BHXH online (định dạng BHXH quy định)
- Dữ liệu quyết toán thuế TNCN (05/QTT-TNCN)

---

## PHÂN HỆ 09: TÀI SẢN CỐ ĐỊNH

### Mô Tả
Quản lý toàn bộ vòng đời tài sản cố định: mua sắm → sử dụng → khấu hao → thanh lý.

### Chức Năng Chính

#### 9.1 Thẻ Tài Sản Cố Định
Thông tin cơ bản:
- Mã TSCĐ, Tên tài sản
- Nhóm TSCĐ (theo TT45/2013): Máy móc thiết bị, Phương tiện vận tải, TSCĐ vô hình...
- Nguyên giá, Ngày mua, Ngày đưa vào sử dụng
- Thời gian khấu hao (tháng)
- Bộ phận sử dụng

#### 9.2 Tính Khấu Hao Tự Động
Phương pháp đường thẳng (theo TT45):
```
Số KH tháng = (Nguyên giá - Giá trị còn lại) / Thời gian KH (tháng)
```

Chạy khấu hao tự động đầu tháng cho tất cả TSCĐ đang sử dụng.

**Bút toán khấu hao:**
```
Nợ 6424/6414/... (Chi phí khấu hao TSCĐ): số KH
    Có 2141/2142/... (Hao mòn TSCĐ):        số KH
```

#### 9.3 Bảng Tổng Hợp Khấu Hao
```
Tài sản      │ Nguyên giá │ Đầu kỳ KH │ KH kỳ này │ Lũy kế KH │ Còn lại
─────────────┼────────────┼───────────┼───────────┼───────────┼──────────
Máy tính A   │ 20,000,000 │18,000,000 │   500,000 │18,500,000 │1,500,000
Xe ô tô B    │800,000,000 │           │ 6,666,667 │ 6,666,667 │793,333,333
```

---

## PHÂN HỆ 10: KHAI BÁO THUẾ

### Mô Tả
Tự động tổng hợp dữ liệu từ các phân hệ khác để lập tờ khai thuế. Xuất file XML nộp qua HTKK hoặc eTax.

### 10.1 Thuế GTGT (Khai theo tháng)
| Tờ khai / Phụ lục | Nội dung |
|-------------------|----------|
| Tờ khai 01/GTGT | Tờ khai thuế GTGT tháng/quý |
| Bảng kê 01-1/GTGT | Hóa đơn đầu ra (bán ra) |
| Bảng kê 01-2/GTGT | Hóa đơn đầu vào (mua vào) |

**Tự động tổng hợp từ:**
- HĐ đầu ra: Từ module Hóa đơn (Invoice Outgoing)
- HĐ đầu vào: Từ module Hóa đơn (Invoice Incoming, đã được duyệt)

### 10.2 Thuế TNDN (Tạm tính theo quý)
- Tờ khai 03/TNDN tạm tính
- Tỷ lệ tạm tính: 20% trên lợi nhuận kế toán
- Xuất XML nộp HTKK

### 10.3 Thuế TNCN (Quyết toán năm)
- Tờ khai 05/QTT-TNCN
- Phụ lục 05-1/BK-QTT-TNCN: Danh sách cá nhân có thu nhập
- Tổng hợp tự động từ bảng lương 12 tháng

### 10.4 Lịch Nộp Thuế
```
Tháng 1/2025:
  ✅ 20/01 - Thuế GTGT tháng 12/2024 - Đã nộp
  ⏳ 30/01 - Thuế TNDN Q4/2024       - Còn 5 ngày

Tháng 2/2025:
  📅 20/02 - Thuế GTGT tháng 1/2025  - Còn 25 ngày
```

---

## PHÂN HỆ 11: BÁO CÁO & DASHBOARD

### Mô Tả
Cung cấp góc nhìn tổng quan về tình hình tài chính qua dashboard trực quan và báo cáo chuẩn TT200.

### 11.1 Dashboard CEO

```
┌────────────────────────────────────────────────────────────┐
│  VietKeto Dashboard          Tháng 1/2025   [Xuất báo cáo] │
├──────────┬──────────┬──────────┬────────────────────────────┤
│  DT THÁNG│ CHI PHÍ  │LỢI NHUẬN │     DÒNG TIỀN              │
│ 500tr ↑5%│ 350tr ↑2%│ 150tr ↑8%│  ████████░░ 80tr còn lại   │
├──────────┴──────────┴──────────┴────────────────────────────┤
│  Doanh Thu 12 Tháng                                          │
│  600 ┤                                          ╭──╮         │
│  500 ┤                                   ╭──╮  │  │╭──      │
│  400 ┤                            ╭──╮   │  ╰──╯  ╰╯        │
│  300 ┤  ╭──╮  ╭──╮  ╭──╮  ╭──╮   │  │                      │
│      └──┴──┴──┴──┴──┴──┴──┴──┴───┴──┴──                    │
│       T2   T3   T4   T5   T6   T7   T8   T9  T10 T11 T12 T1│
├─────────────────────┬──────────────────────────────────────┤
│  CÔNG NỢ PHẢI THU   │  CÔNG NỢ PHẢI TRẢ                    │
│  Tổng: 200,000,000  │  Tổng: 150,000,000                   │
│  Quá hạn: 30,000,000│  Sắp đến hạn: 50,000,000             │
├─────────────────────┴──────────────────────────────────────┤
│  VIỆC CẦN LÀM                                               │
│  ⚠️ 3 HĐ đầu vào chờ duyệt                                  │
│  ⚠️ 2 bút toán chờ duyệt                                    │
│  📅 Nộp thuế GTGT T1: còn 5 ngày                           │
└────────────────────────────────────────────────────────────┘
```

### 11.2 Báo Cáo Tài Chính TT200

| Mẫu biểu | Tên báo cáo |
|-----------|-------------|
| B01-DN | Bảng cân đối kế toán |
| B02-DN | Báo cáo kết quả hoạt động kinh doanh |
| B03-DN | Báo cáo lưu chuyển tiền tệ |
| B09-DN | Bản thuyết minh báo cáo tài chính |

Tất cả tự động tổng hợp từ dữ liệu GL, có thể so sánh cùng kỳ năm trước.

### 11.3 Xuất Khẩu Báo Cáo
- **Excel (.xlsx)**: Toàn bộ báo cáo với định dạng chuyên nghiệp
- **PDF**: Báo cáo có logo, chữ ký số (sẵn sàng nộp)
- **CSV**: Xuất dữ liệu thô cho phân tích

---

## Tổng Hợp Luồng Tích Hợp Giữa Phân Hệ

```
Bán hàng (06) ──→ Hóa đơn đầu ra (02) ──→ AR (03)
                       │                       │
                       ↓                       ↓
                   GL Bút toán (01) ←── Ngân quỹ (05)
                       ↑                       ↑
                       │                       │
Mua hàng (PO) ──→ Hóa đơn đầu vào (02) ─→ AP (04)
     │
     ↓
Hàng tồn kho (07) ←→ GL Bút toán (01)

Nhân sự & Lương (08) ──→ GL Bút toán (01)
        │
        └──→ Khai báo thuế (10): TNCN

TSCĐ (09) ──→ GL Bút toán (01) [khấu hao]

Tất cả GL ──→ Báo cáo tài chính (11)
Hóa đơn    ──→ Khai báo thuế VAT (10)
```
