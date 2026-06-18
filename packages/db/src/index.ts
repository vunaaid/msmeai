// packages/db/src/index.ts
// Public API của @vsme/db package

export { prisma } from "./client";
export type { Prisma, PrismaClient } from "./client";

// Cấu hình mặc định + provisioning công ty
export {
  ALL_MODULES,
  ENABLED_BY_DEFAULT,
  MODULE_PERMISSIONS,
  SYSTEM_ROLES,
  ADMIN_DEPARTMENT_ROLE_NAMES,
  ensureGlobalPermissions,
  createCompanyRoles,
  configureCompanyModules,
  importRecurringDefaults,
  initializeCompanyDefaults,
} from "./provisioning";
export type { RoleDef, InitOptions } from "./provisioning";
export { RECURRING_CATALOG } from "./recurring-catalog";
export type { Cadence, RoleLevelKey, Priority, RecurringDuty } from "./recurring-catalog";

// GL — service tạo bút toán dùng chung (API + AI SDK)
export { createJournalEntry } from "./gl-service";
export type { GlLineInput, CreateJournalEntryInput, CreateJournalEntryResult, CreatedEntry } from "./gl-service";

// Re-export enums và types từ generated client
export {
  AccountType,
  RoleLevel,
  PermissionAction,
  PermissionScope,
  AuditAction,
  EventStatus,
  NotificationChannel,
  FileEntityType,
  DocumentFileType,
  AiMode,
  ModuleTier,
  ApprovalStatus,
  // AI enums (available after db:generate)
  AISessionStatus,
  AITaskStatus,
  AIApprovalDecision,
  LLMProvider,
  // Work management enums
  WorkType,
  WorkItemStatus,
  WorkItemPriority,
  ProjectStatus,
  // Ghi chép (Notes) enums
  NoteBlockType,
  TranscriptStatus,
  // GL — Kế toán tổng hợp enums
  GlPeriodStatus,
  GlAccountType,
  JournalType,
  JournalEntryStatus,
  // HR — Quản trị nhân sự enums
  EmployeeStatus,
  Gender,
  CandidateStatus,
  PayrollStatus,
  PartnerKind,
  DebtKind,
  DebtStatus,
  CashAccountType,
  CashTxKind,
  AssetStatus,
  DepreciationMethod,
  CapitalKind,
  CapitalStatus,
  SalesOrderStatus,
  InteractionType,
  InteractionStatus,
  StockMoveKind,
  TaxType,
  TaxReturnStatus,
} from "../generated/client";

export type {
  Company,
  User,
  Role,
  Permission,
  RolePermission,
  Session,
  ModuleConfig,
  FeatureFlag,
  AuditLog,
  DomainEvent,
  Notification,
  NotificationTemplate,
  NotificationPreference,
  FileRecord,
  Document,
  DocumentVersion,
  DocumentTemplate,
  ApprovalRequest,
  // AI types (available after db:generate)
  AISession,
  AIMessage,
  AITask,
  AIApprovalRequest,
  LLMUsageLog,
  // Work management types
  Project,
  ProjectMember,
  WorkItem,
  WorkComment,
  // PWA push subscriptions
  UserPushSubscription,
  // Company agents
  CompanyAgent,
  // Ghi chép (Notes) types
  Note,
  NoteBlock,
  // GL — Kế toán tổng hợp types
  FiscalYear,
  FiscalPeriod,
  GlAccount,
  Journal,
  JournalEntry,
  JournalLine,
} from "../generated/client";
