// packages/modules/src/types.ts

export type ModuleKey =
  | "foundation"
  | "gl"
  | "invoice"
  | "ar"
  | "ap"
  | "cash"
  | "sales"
  | "inventory"
  | "hr"
  | "assets"
  | "tax"
  | "reports"
  | "contracts"
  | "ai-agents"
  | "admin"
  | "work"
  | "documents"
  | "notes"
  | "chat";

export type ModuleTier = "core" | "extended" | "ai";

export interface ModuleDefinition {
  key: ModuleKey;
  name: string;           // Tên hiển thị (tiếng Việt)
  description: string;
  tier: ModuleTier;
  dependencies: ModuleKey[];  // Phải bật trước khi bật module này
  icon: string;               // Lucide icon name
  route: string;              // App route prefix
  navOrder: number;           // Thứ tự trong sidebar
  canDisable: boolean;        // false = module bắt buộc (foundation, admin)
}

export interface ModuleStatus {
  key: ModuleKey;
  enabled: boolean;
  canEnable: boolean;
  canDisable: boolean;
  blockingDependents: ModuleKey[];  // Modules đang dùng module này
  missingDeps: ModuleKey[];         // Dependencies chưa được bật
}
