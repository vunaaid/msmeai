// packages/audit/src/types.ts

import type { AuditAction } from "@vsme/db";

export interface AuditContext {
  companyId: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  moduleKey: string;
}

export interface WriteAuditLogParams {
  context: AuditContext;
  action: AuditAction;
  entityType: string;
  entityId: string;
  dataBefore?: Record<string, unknown> | null;
  dataAfter?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

// Domain event types — Convention: {module}.{entity}.{action}
export type DomainEventType =
  // GL
  | "gl.journal.posted"
  | "gl.period.closed"
  // Invoice
  | "invoice.outgoing.created"
  | "invoice.outgoing.confirmed"
  | "invoice.outgoing.sent_to_tct"
  | "invoice.outgoing.cancelled"
  | "invoice.incoming.received"
  // AR/AP
  | "ar.payment.received"
  | "ap.payment.made"
  // Sales
  | "sales.deal.stage_changed"
  | "sales.deal.won"
  | "sales.deal.lost"
  | "sales.order.created"
  // HR
  | "hr.employee.onboarded"
  | "hr.payroll.approved"
  | "hr.payroll.paid"
  // Approval
  | "approval.request.created"
  | "approval.request.approved"
  | "approval.request.rejected"
  | "approval.request.expired"
  // AI
  | "ai.task.completed"
  | "ai.task.failed"
  | "ai.task.queued"
  | "ai.escalation.triggered"
  | "ai.escalation.resolved"
  | "ai.approval_request.created"
  | "ai.approval_request.approved"
  | "ai.approval_request.rejected"
  // Cash alerts
  | "cash.balance.low"
  | "cash.balance.critical"
  // Support
  | "support.ticket.created"
  | "support.ticket.sla_warning"
  | "support.ticket.sla_breached"
  | "support.ticket.resolved"
  | "support.ticket.escalated"
  // Performance
  | "performance.kpi.below_threshold"
  // Auth
  | "auth.user.login"
  | "auth.user.logout"
  | "auth.user.created"
  // Module
  | "module.enabled"
  | "module.disabled"
  // Generic
  | string;

export interface PublishEventParams {
  companyId: string;
  eventType: DomainEventType;
  sourceModule: string;
  payload: Record<string, unknown>;
}
