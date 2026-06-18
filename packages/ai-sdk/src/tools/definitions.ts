// packages/ai-sdk/src/tools/definitions.ts
// Standard tool definitions available to AI agents
// Authority check is performed BEFORE tool execution

import type { ToolDefinition } from "@vsme/llm";

// ─── Common Tools ─────────────────────────────────────────────────────────────

export const TOOL_SEARCH_DATABASE: ToolDefinition = {
  name: "search_database",
  description: "Tìm kiếm dữ liệu trong hệ thống theo module và điều kiện. Dùng để tra cứu thông tin trước khi thực hiện hành động.",
  input_schema: {
    type: "object",
    properties: {
      module: {
        type: "string",
        description: "Tên module: gl, invoice, ar, ap, cash, sales, hr, procurement, inventory, contracts, documents, projects, meetings",
        enum: ["gl", "invoice", "ar", "ap", "cash", "tax", "assets", "sales", "vendors", "procurement", "inventory", "contracts", "hr", "recruitment", "documents", "approvals", "projects", "performance", "meetings", "support"],
      },
      query: {
        type: "string",
        description: "Câu hỏi hoặc từ khóa tìm kiếm (tiếng Việt hoặc tiếng Anh)",
      },
      filters: {
        type: "object",
        description: "Bộ lọc bổ sung: {field: value}",
      },
      limit: {
        type: "number",
        description: "Số kết quả tối đa (mặc định 10, tối đa 50)",
      },
    },
    required: ["module", "query"],
  },
};

export const TOOL_GET_SUMMARY: ToolDefinition = {
  name: "get_module_summary",
  description: "Lấy tóm tắt/dashboard của một module: tổng số, xu hướng, các chỉ số quan trọng.",
  input_schema: {
    type: "object",
    properties: {
      module: {
        type: "string",
        description: "Tên module cần lấy summary",
      },
      period: {
        type: "string",
        description: "Kỳ báo cáo: today, this_week, this_month, this_quarter, this_year",
        enum: ["today", "this_week", "this_month", "this_quarter", "this_year"],
      },
    },
    required: ["module"],
  },
};

export const TOOL_CREATE_APPROVAL: ToolDefinition = {
  name: "create_approval_request",
  description: "Tạo yêu cầu phê duyệt khi hành động vượt quá thẩm quyền. Hệ thống sẽ tự động thông báo cho người có thẩm quyền.",
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "Tên hành động cần phê duyệt",
      },
      title: {
        type: "string",
        description: "Tiêu đề yêu cầu phê duyệt",
      },
      description: {
        type: "string",
        description: "Mô tả chi tiết lý do cần phê duyệt",
      },
      data: {
        type: "object",
        description: "Dữ liệu của hành động cần phê duyệt",
      },
      approver: {
        type: "string",
        description: "AgentId hoặc role level của người cần phê duyệt",
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high", "urgent"],
        description: "Mức độ ưu tiên",
      },
    },
    required: ["action", "title", "data"],
  },
};

export const TOOL_SEND_NOTIFICATION: ToolDefinition = {
  name: "send_notification",
  description: "Gửi thông báo tới người dùng hoặc một nhóm người dùng.",
  input_schema: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description: "Người nhận: userId, roleLevel (board/c_suite/manager/staff), hoặc 'all'",
      },
      title: {
        type: "string",
        description: "Tiêu đề thông báo",
      },
      message: {
        type: "string",
        description: "Nội dung thông báo",
      },
      type: {
        type: "string",
        description: "Loại thông báo",
        enum: ["info", "warning", "error", "success", "action_required"],
      },
    },
    required: ["to", "title", "message"],
  },
};

export const TOOL_CREATE_TASK: ToolDefinition = {
  name: "create_task",
  description: "Tạo một task/công việc cho người dùng hoặc agent khác.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Tiêu đề task",
      },
      description: {
        type: "string",
        description: "Mô tả chi tiết task",
      },
      assignee: {
        type: "string",
        description: "Người được giao: userId hoặc agentId",
      },
      dueDate: {
        type: "string",
        description: "Hạn hoàn thành (ISO 8601)",
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high", "urgent"],
      },
      module: {
        type: "string",
        description: "Module liên quan",
      },
    },
    required: ["title", "assignee"],
  },
};

export const TOOL_GET_REPORT: ToolDefinition = {
  name: "get_report",
  description: "Tạo hoặc lấy báo cáo tài chính/vận hành. Hỗ trợ các mẫu báo cáo TT200.",
  input_schema: {
    type: "object",
    properties: {
      reportType: {
        type: "string",
        description: "Loại báo cáo",
        enum: ["balance_sheet", "income_statement", "cash_flow", "trial_balance", "ar_aging", "ap_aging", "inventory_valuation", "payroll_summary", "sales_pipeline", "kpi_dashboard"],
      },
      period: {
        type: "string",
        description: "Kỳ báo cáo: this_month, last_month, this_quarter, this_year, custom",
      },
      fromDate: {
        type: "string",
        description: "Ngày bắt đầu (khi period=custom), ISO 8601",
      },
      toDate: {
        type: "string",
        description: "Ngày kết thúc (khi period=custom), ISO 8601",
      },
    },
    required: ["reportType", "period"],
  },
};

// ─── Module-Specific Tools ────────────────────────────────────────────────────

export const TOOL_APPROVE_DOCUMENT: ToolDefinition = {
  name: "approve_document",
  description: "Phê duyệt một document/request đang chờ duyệt. Yêu cầu quyền approve.",
  input_schema: {
    type: "object",
    properties: {
      approvalRequestId: {
        type: "string",
        description: "ID của approval request",
      },
      decision: {
        type: "string",
        enum: ["approved", "rejected"],
        description: "Quyết định phê duyệt",
      },
      comment: {
        type: "string",
        description: "Ghi chú, lý do quyết định",
      },
    },
    required: ["approvalRequestId", "decision"],
  },
};

export const TOOL_ESCALATE: ToolDefinition = {
  name: "escalate_to_superior",
  description: "Chuyển vấn đề lên cấp trên khi vượt quá thẩm quyền xử lý.",
  input_schema: {
    type: "object",
    properties: {
      issue: {
        type: "string",
        description: "Mô tả vấn đề cần escalate",
      },
      toAgent: {
        type: "string",
        description: "AgentId của cấp trên (nếu biết), VD: ceo, board_chair",
      },
      urgency: {
        type: "string",
        enum: ["normal", "urgent", "critical"],
        description: "Mức độ khẩn cấp",
      },
      data: {
        type: "object",
        description: "Dữ liệu kèm theo",
      },
    },
    required: ["issue"],
  },
};

export const TOOL_CREATE_JOURNAL_ENTRY: ToolDefinition = {
  name: "create_journal_entry",
  description:
    "Lập bút toán kép vào Sổ Cái (GL) theo TT200. Dùng MÃ tài khoản (VD: 1111 tiền mặt, 4111 vốn góp). " +
    "Tổng Nợ phải bằng tổng Có. Bút toán được tạo ở trạng thái 'pending' (chờ Kế toán trưởng ghi sổ).",
  input_schema: {
    type: "object",
    properties: {
      date: { type: "string", description: "Ngày chứng từ, dạng YYYY-MM-DD (mặc định hôm nay)" },
      description: { type: "string", description: "Diễn giải bút toán" },
      journalCode: {
        type: "string",
        description: "Mã nhật ký: NKC (chung), PT (thu tiền), PC (chi tiền), NKMH (mua), NKBH (bán). Mặc định NKC.",
      },
      lines: {
        type: "array",
        description: "Các dòng bút toán; mỗi dòng chỉ có Nợ HOẶC Có (> 0).",
        items: {
          type: "object",
          properties: {
            accountCode: { type: "string", description: "Mã tài khoản TT200, VD: 1111, 4111, 3331" },
            debit: { type: "number", description: "Số tiền ghi Nợ (VND)" },
            credit: { type: "number", description: "Số tiền ghi Có (VND)" },
            description: { type: "string", description: "Diễn giải dòng (tùy chọn)" },
          },
          required: ["accountCode"],
        },
      },
    },
    required: ["date", "lines"],
  },
};

// ─── Tool Collections by Role Level ──────────────────────────────────────────

export const TOOLS_STAFF = [
  TOOL_SEARCH_DATABASE,
  TOOL_GET_SUMMARY,
  TOOL_CREATE_TASK,
  TOOL_SEND_NOTIFICATION,
  // Kế toán viên (staff) cần lập bút toán; thực thi vẫn qua kiểm tra thẩm quyền theo skill.
  TOOL_CREATE_JOURNAL_ENTRY,
];

export const TOOLS_MANAGER = [
  ...TOOLS_STAFF,
  TOOL_GET_REPORT,
  TOOL_CREATE_APPROVAL,
  TOOL_APPROVE_DOCUMENT,
  TOOL_ESCALATE,
];

export const TOOLS_C_SUITE = [
  ...TOOLS_MANAGER,
];

export const TOOLS_BOARD = [
  ...TOOLS_C_SUITE,
];

export function getToolsForLevel(
  level: "board" | "c_suite" | "manager" | "staff" | "special"
): ToolDefinition[] {
  switch (level) {
    case "board": return TOOLS_BOARD;
    case "c_suite": return TOOLS_C_SUITE;
    case "manager": return TOOLS_MANAGER;
    case "staff": return TOOLS_STAFF;
    case "special": return TOOLS_MANAGER;
    default: return TOOLS_STAFF;
  }
}
