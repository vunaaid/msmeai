// packages/modules/src/registry.ts
// Module Registry — Định nghĩa tất cả modules và dependency graph

import type { ModuleDefinition, ModuleKey } from "./types";

/**
 * MODULE_REGISTRY — Single source of truth cho tất cả modules.
 * Order matters: dùng cho sidebar navOrder.
 */
export const MODULE_REGISTRY: Record<ModuleKey, ModuleDefinition> = {
  foundation: {
    key: "foundation",
    name: "Nền Tảng",
    description: "Auth, RBAC, Audit, Event Bus — bắt buộc",
    tier: "core",
    dependencies: [],
    icon: "Shield",
    route: "/foundation",
    navOrder: 0,
    canDisable: false,  // Không thể tắt
  },
  admin: {
    key: "admin",
    name: "Quản Trị",
    description: "Cấu hình hệ thống, users, modules",
    tier: "core",
    dependencies: [],
    icon: "Settings",
    route: "/admin",
    navOrder: 1,
    canDisable: false,  // Không thể tắt
  },
  gl: {
    key: "gl",
    name: "Kế Toán Tổng Hợp",
    description: "General Ledger — bút toán kép, TT200",
    tier: "core",
    dependencies: [],
    icon: "BookOpen",
    route: "/gl",
    navOrder: 10,
    canDisable: true,
  },
  invoice: {
    key: "invoice",
    name: "Hóa Đơn Điện Tử",
    description: "HĐ đầu vào/ra, TCT eTax, ký số",
    tier: "core",
    dependencies: ["gl"],
    icon: "FileText",
    route: "/invoice",
    navOrder: 20,
    canDisable: true,
  },
  ar: {
    key: "ar",
    name: "Công Nợ Phải Thu",
    description: "Accounts Receivable, aging report",
    tier: "core",
    dependencies: ["gl"],
    icon: "TrendingUp",
    route: "/ar",
    navOrder: 30,
    canDisable: true,
  },
  ap: {
    key: "ap",
    name: "Công Nợ Phải Trả",
    description: "Accounts Payable, PO matching",
    tier: "core",
    dependencies: ["gl"],
    icon: "TrendingDown",
    route: "/ap",
    navOrder: 40,
    canDisable: true,
  },
  cash: {
    key: "cash",
    name: "Ngân Quỹ",
    description: "Quỹ tiền mặt, ngân hàng, sao kê",
    tier: "core",
    dependencies: ["gl"],
    icon: "Banknote",
    route: "/cash",
    navOrder: 50,
    canDisable: true,
  },
  tax: {
    key: "tax",
    name: "Khai Báo Thuế",
    description: "GTGT, TNDN, TNCN — nộp qua TCT",
    tier: "core",
    dependencies: ["gl", "invoice"],
    icon: "Calculator",
    route: "/tax",
    navOrder: 60,
    canDisable: true,
  },
  reports: {
    key: "reports",
    name: "Báo Cáo & Dashboard",
    description: "BCTC, CEO Dashboard, export PDF/Excel",
    tier: "core",
    dependencies: ["gl"],
    icon: "BarChart3",
    route: "/reports",
    navOrder: 70,
    canDisable: true,
  },
  sales: {
    key: "sales",
    name: "Bán Hàng & CRM",
    description: "Lead → Quote → Order → Invoice",
    tier: "extended",
    dependencies: ["gl", "invoice"],
    icon: "ShoppingCart",
    route: "/sales",
    navOrder: 80,
    canDisable: true,
  },
  inventory: {
    key: "inventory",
    name: "Hàng Tồn Kho",
    description: "Sản phẩm, kho, nhập/xuất kho",
    tier: "extended",
    dependencies: ["gl", "sales"],
    icon: "Package",
    route: "/inventory",
    navOrder: 90,
    canDisable: true,
  },
  hr: {
    key: "hr",
    name: "Nhân Sự & Lương",
    description: "Hồ sơ nhân viên, lương, BHXH/BHYT/BHTN",
    tier: "extended",
    dependencies: ["gl"],
    icon: "Users",
    route: "/hr",
    navOrder: 100,
    canDisable: true,
  },
  assets: {
    key: "assets",
    name: "Tài Sản Cố Định",
    description: "TSCĐ, khấu hao TT45",
    tier: "extended",
    dependencies: ["gl"],
    icon: "Building2",
    route: "/assets",
    navOrder: 110,
    canDisable: true,
  },
  contracts: {
    key: "contracts",
    name: "Hợp Đồng Điện Tử",
    description: "Soạn thảo, ký số, lưu trữ hợp đồng",
    tier: "extended",
    dependencies: [],
    icon: "Pen",
    route: "/contracts",
    navOrder: 120,
    canDisable: true,
  },
  "ai-agents": {
    key: "ai-agents",
    name: "AI Agent System",
    description: "26 AI agents theo org chart, Full AI / Assistant mode",
    tier: "ai",
    dependencies: [],
    icon: "Bot",
    route: "/ai",
    navOrder: 200,
    canDisable: true,
  },
  work: {
    key: "work",
    name: "Quản Lý Công Việc",
    description: "Giao việc theo cấp bậc, dự án, theo dõi tiến độ với AI",
    tier: "core",
    dependencies: [],
    icon: "ClipboardList",
    route: "/work",
    navOrder: 5,
    canDisable: false,  // Module mặc định — luôn bật cho mọi user trong hệ thống
  },
  documents: {
    key: "documents",
    name: "Tài Liệu",
    description: "Quản lý tài liệu & template Word/Excel/PPTX/Markdown, xem & sửa trực tuyến",
    tier: "core",
    dependencies: [],
    icon: "FileStack",
    route: "/documents",
    navOrder: 6,
    canDisable: true,
  },
  notes: {
    key: "notes",
    name: "Ghi Chép",
    description: "Ghi chép theo ngày, ghi âm & bóc nội dung, tạo công việc từ ghi chép",
    tier: "core",
    dependencies: [],
    icon: "NotebookPen",
    route: "/notes",
    navOrder: 7,
    canDisable: false,  // Module cá nhân — luôn bật cho mọi user
  },
  chat: {
    key: "chat",
    name: "Trò Chuyện",
    description: "Nhắn tin realtime 1-1 & nhóm giữa nhân sự trong công ty",
    tier: "core",
    dependencies: [],
    icon: "MessagesSquare",
    route: "/chat",
    navOrder: 8,
    canDisable: false,  // Luôn bật cho mọi user (như work / notes)
  },
};

/**
 * Lấy tất cả modules phụ thuộc vào moduleKey (ngược chiều)
 */
export function getModulesDependingOn(moduleKey: ModuleKey): ModuleKey[] {
  return Object.values(MODULE_REGISTRY)
    .filter(m => m.dependencies.includes(moduleKey))
    .map(m => m.key);
}

/**
 * Kiểm tra có thể tắt module không.
 * @param moduleKey - Module muốn tắt
 * @param enabledModules - Set các module đang bật
 */
export function canDisableModule(
  moduleKey: ModuleKey,
  enabledModules: Set<ModuleKey>
): { allowed: boolean; blockingDependents: ModuleKey[] } {
  const def = MODULE_REGISTRY[moduleKey];
  if (!def) return { allowed: false, blockingDependents: [] };
  if (!def.canDisable) return { allowed: false, blockingDependents: [] };

  const dependents = getModulesDependingOn(moduleKey);
  const blockingDependents = dependents.filter(d => enabledModules.has(d));

  return {
    allowed: blockingDependents.length === 0,
    blockingDependents,
  };
}

/**
 * Kiểm tra có thể bật module không.
 * @param moduleKey - Module muốn bật
 * @param enabledModules - Set các module đang bật
 */
export function canEnableModule(
  moduleKey: ModuleKey,
  enabledModules: Set<ModuleKey>
): { allowed: boolean; missingDeps: ModuleKey[] } {
  const def = MODULE_REGISTRY[moduleKey];
  if (!def) return { allowed: false, missingDeps: [] };

  const missingDeps = def.dependencies.filter(d => !enabledModules.has(d));

  return {
    allowed: missingDeps.length === 0,
    missingDeps,
  };
}

/**
 * Lấy sidebar navigation items theo module config.
 */
export function getSidebarItems(enabledModules: Set<ModuleKey>) {
  return Object.values(MODULE_REGISTRY)
    .filter(m => enabledModules.has(m.key))
    .sort((a, b) => a.navOrder - b.navOrder);
}
