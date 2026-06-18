// src/modules/gl/tt200-accounts.ts
// Hệ thống tài khoản kế toán theo Thông tư 200/2014/TT-BTC.
// Dùng để seed Chart of Accounts cho mỗi công ty (idempotent).
// level + parent + isLeaf được suy ra tự động từ code khi seed.

import type { GlAccountType } from "@vsme/db";

/** Suy ra loại tài khoản từ chữ số đầu của code (theo phân loại TT200). */
export function accountTypeFromCode(code: string): GlAccountType {
  switch (code[0]) {
    case "1":
    case "2":
      return "asset";
    case "3":
      return "liability";
    case "4":
      return "equity";
    case "5":
    case "7":
      return "revenue";
    case "6":
    case "8":
      return "expense";
    case "9":
      return "determination";
    default:
      return "off_balance";
  }
}

/** Danh mục [code, name] — hệ thống TK TT200 (mức phổ biến cho SME). */
export const TT200_ACCOUNTS: [string, string][] = [
  // ─── Loại 1: Tài sản ngắn hạn ───────────────────────────────────────────────
  ["111", "Tiền mặt"],
  ["1111", "Tiền Việt Nam"],
  ["1112", "Ngoại tệ"],
  ["1113", "Vàng tiền tệ"],
  ["112", "Tiền gửi ngân hàng"],
  ["1121", "Tiền Việt Nam"],
  ["1122", "Ngoại tệ"],
  ["1123", "Vàng tiền tệ"],
  ["113", "Tiền đang chuyển"],
  ["1131", "Tiền Việt Nam"],
  ["1132", "Ngoại tệ"],
  ["121", "Chứng khoán kinh doanh"],
  ["1211", "Cổ phiếu"],
  ["1212", "Trái phiếu"],
  ["1218", "Chứng khoán và công cụ tài chính khác"],
  ["128", "Đầu tư nắm giữ đến ngày đáo hạn"],
  ["1281", "Tiền gửi có kỳ hạn"],
  ["1282", "Trái phiếu"],
  ["1283", "Cho vay"],
  ["1288", "Các khoản đầu tư khác nắm giữ đến ngày đáo hạn"],
  ["131", "Phải thu của khách hàng"],
  ["133", "Thuế GTGT được khấu trừ"],
  ["1331", "Thuế GTGT được khấu trừ của hàng hóa, dịch vụ"],
  ["1332", "Thuế GTGT được khấu trừ của TSCĐ"],
  ["136", "Phải thu nội bộ"],
  ["1361", "Vốn kinh doanh ở đơn vị trực thuộc"],
  ["1368", "Phải thu nội bộ khác"],
  ["138", "Phải thu khác"],
  ["1381", "Tài sản thiếu chờ xử lý"],
  ["1388", "Phải thu khác"],
  ["141", "Tạm ứng"],
  ["151", "Hàng mua đang đi đường"],
  ["152", "Nguyên liệu, vật liệu"],
  ["153", "Công cụ, dụng cụ"],
  ["154", "Chi phí sản xuất, kinh doanh dở dang"],
  ["155", "Thành phẩm"],
  ["156", "Hàng hóa"],
  ["1561", "Giá mua hàng hóa"],
  ["1562", "Chi phí thu mua hàng hóa"],
  ["1567", "Hàng hóa bất động sản"],
  ["157", "Hàng gửi đi bán"],
  ["158", "Hàng hóa kho bảo thuế"],
  ["161", "Chi sự nghiệp"],
  ["171", "Giao dịch mua bán lại trái phiếu Chính phủ"],

  // ─── Loại 2: Tài sản dài hạn ────────────────────────────────────────────────
  ["211", "Tài sản cố định hữu hình"],
  ["2111", "Nhà cửa, vật kiến trúc"],
  ["2112", "Máy móc, thiết bị"],
  ["2113", "Phương tiện vận tải, truyền dẫn"],
  ["2114", "Thiết bị, dụng cụ quản lý"],
  ["2118", "Tài sản cố định khác"],
  ["212", "Tài sản cố định thuê tài chính"],
  ["213", "Tài sản cố định vô hình"],
  ["2131", "Quyền sử dụng đất"],
  ["2133", "Bản quyền, bằng sáng chế"],
  ["2135", "Phần mềm máy vi tính"],
  ["2138", "Tài sản cố định vô hình khác"],
  ["214", "Hao mòn tài sản cố định"],
  ["2141", "Hao mòn TSCĐ hữu hình"],
  ["2142", "Hao mòn TSCĐ thuê tài chính"],
  ["2143", "Hao mòn TSCĐ vô hình"],
  ["2147", "Hao mòn bất động sản đầu tư"],
  ["217", "Bất động sản đầu tư"],
  ["221", "Đầu tư vào công ty con"],
  ["222", "Đầu tư vào công ty liên doanh, liên kết"],
  ["228", "Đầu tư khác"],
  ["229", "Dự phòng tổn thất tài sản"],
  ["2291", "Dự phòng giảm giá chứng khoán kinh doanh"],
  ["2293", "Dự phòng phải thu khó đòi"],
  ["2294", "Dự phòng giảm giá hàng tồn kho"],
  ["241", "Xây dựng cơ bản dở dang"],
  ["2411", "Mua sắm TSCĐ"],
  ["2412", "Xây dựng cơ bản"],
  ["2413", "Sửa chữa lớn TSCĐ"],
  ["242", "Chi phí trả trước"],
  ["243", "Tài sản thuế thu nhập hoãn lại"],
  ["244", "Cầm cố, thế chấp, ký quỹ, ký cược"],

  // ─── Loại 3: Nợ phải trả ────────────────────────────────────────────────────
  ["331", "Phải trả cho người bán"],
  ["333", "Thuế và các khoản phải nộp Nhà nước"],
  ["3331", "Thuế GTGT phải nộp"],
  ["33311", "Thuế GTGT đầu ra"],
  ["33312", "Thuế GTGT hàng nhập khẩu"],
  ["3332", "Thuế tiêu thụ đặc biệt"],
  ["3333", "Thuế xuất, nhập khẩu"],
  ["3334", "Thuế thu nhập doanh nghiệp"],
  ["3335", "Thuế thu nhập cá nhân"],
  ["3336", "Thuế tài nguyên"],
  ["3337", "Thuế nhà đất, tiền thuê đất"],
  ["3338", "Thuế bảo vệ môi trường và các loại thuế khác"],
  ["3339", "Phí, lệ phí và các khoản phải nộp khác"],
  ["334", "Phải trả người lao động"],
  ["3341", "Phải trả công nhân viên"],
  ["3348", "Phải trả người lao động khác"],
  ["335", "Chi phí phải trả"],
  ["336", "Phải trả nội bộ"],
  ["337", "Thanh toán theo tiến độ kế hoạch hợp đồng xây dựng"],
  ["338", "Phải trả, phải nộp khác"],
  ["3382", "Kinh phí công đoàn"],
  ["3383", "Bảo hiểm xã hội"],
  ["3384", "Bảo hiểm y tế"],
  ["3386", "Bảo hiểm thất nghiệp"],
  ["3387", "Doanh thu chưa thực hiện"],
  ["3388", "Phải trả, phải nộp khác"],
  ["341", "Vay và nợ thuê tài chính"],
  ["3411", "Các khoản đi vay"],
  ["3412", "Nợ thuê tài chính"],
  ["343", "Trái phiếu phát hành"],
  ["344", "Nhận ký quỹ, ký cược"],
  ["347", "Thuế thu nhập hoãn lại phải trả"],
  ["352", "Dự phòng phải trả"],
  ["353", "Quỹ khen thưởng, phúc lợi"],
  ["356", "Quỹ phát triển khoa học và công nghệ"],

  // ─── Loại 4: Vốn chủ sở hữu ─────────────────────────────────────────────────
  ["411", "Vốn đầu tư của chủ sở hữu"],
  ["4111", "Vốn góp của chủ sở hữu"],
  ["4112", "Thặng dư vốn cổ phần"],
  ["4118", "Vốn khác"],
  ["412", "Chênh lệch đánh giá lại tài sản"],
  ["413", "Chênh lệch tỷ giá hối đoái"],
  ["414", "Quỹ đầu tư phát triển"],
  ["418", "Các quỹ khác thuộc vốn chủ sở hữu"],
  ["419", "Cổ phiếu quỹ"],
  ["421", "Lợi nhuận sau thuế chưa phân phối"],
  ["4211", "Lợi nhuận sau thuế chưa phân phối năm trước"],
  ["4212", "Lợi nhuận sau thuế chưa phân phối năm nay"],
  ["441", "Nguồn vốn đầu tư xây dựng cơ bản"],
  ["461", "Nguồn kinh phí sự nghiệp"],
  ["466", "Nguồn kinh phí đã hình thành TSCĐ"],

  // ─── Loại 5: Doanh thu ──────────────────────────────────────────────────────
  ["511", "Doanh thu bán hàng và cung cấp dịch vụ"],
  ["5111", "Doanh thu bán hàng hóa"],
  ["5112", "Doanh thu bán các thành phẩm"],
  ["5113", "Doanh thu cung cấp dịch vụ"],
  ["5118", "Doanh thu khác"],
  ["515", "Doanh thu hoạt động tài chính"],
  ["521", "Các khoản giảm trừ doanh thu"],
  ["5211", "Chiết khấu thương mại"],
  ["5212", "Hàng bán bị trả lại"],
  ["5213", "Giảm giá hàng bán"],

  // ─── Loại 6: Chi phí sản xuất, kinh doanh ───────────────────────────────────
  ["611", "Mua hàng"],
  ["621", "Chi phí nguyên liệu, vật liệu trực tiếp"],
  ["622", "Chi phí nhân công trực tiếp"],
  ["623", "Chi phí sử dụng máy thi công"],
  ["627", "Chi phí sản xuất chung"],
  ["6271", "Chi phí nhân viên phân xưởng"],
  ["6272", "Chi phí vật liệu"],
  ["6273", "Chi phí dụng cụ sản xuất"],
  ["6274", "Chi phí khấu hao TSCĐ"],
  ["6277", "Chi phí dịch vụ mua ngoài"],
  ["6278", "Chi phí bằng tiền khác"],
  ["631", "Giá thành sản xuất"],
  ["632", "Giá vốn hàng bán"],
  ["635", "Chi phí tài chính"],
  ["641", "Chi phí bán hàng"],
  ["6411", "Chi phí nhân viên"],
  ["6412", "Chi phí vật liệu, bao bì"],
  ["6413", "Chi phí dụng cụ, đồ dùng"],
  ["6414", "Chi phí khấu hao TSCĐ"],
  ["6417", "Chi phí dịch vụ mua ngoài"],
  ["6418", "Chi phí bằng tiền khác"],
  ["642", "Chi phí quản lý doanh nghiệp"],
  ["6421", "Chi phí nhân viên quản lý"],
  ["6422", "Chi phí vật liệu quản lý"],
  ["6423", "Chi phí đồ dùng văn phòng"],
  ["6424", "Chi phí khấu hao TSCĐ"],
  ["6425", "Thuế, phí và lệ phí"],
  ["6426", "Chi phí dự phòng"],
  ["6427", "Chi phí dịch vụ mua ngoài"],
  ["6428", "Chi phí bằng tiền khác"],

  // ─── Loại 7: Thu nhập khác ──────────────────────────────────────────────────
  ["711", "Thu nhập khác"],

  // ─── Loại 8: Chi phí khác ───────────────────────────────────────────────────
  ["811", "Chi phí khác"],
  ["821", "Chi phí thuế thu nhập doanh nghiệp"],
  ["8211", "Chi phí thuế TNDN hiện hành"],
  ["8212", "Chi phí thuế TNDN hoãn lại"],

  // ─── Loại 9: Xác định kết quả kinh doanh ────────────────────────────────────
  ["911", "Xác định kết quả kinh doanh"],
];

/** Nhật ký mặc định (general + 4 nhật ký đặc biệt). */
export const DEFAULT_JOURNALS: { code: string; name: string; type: string }[] = [
  { code: "NKC", name: "Nhật ký chung", type: "general" },
  { code: "PT", name: "Nhật ký thu tiền", type: "cash_receipt" },
  { code: "PC", name: "Nhật ký chi tiền", type: "cash_payment" },
  { code: "NKMH", name: "Nhật ký mua hàng", type: "purchase" },
  { code: "NKBH", name: "Nhật ký bán hàng", type: "sales" },
];
