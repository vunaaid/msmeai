// packages/ai-sdk/src/skill/types.ts
// Type definitions for Skill Engine (Cách B — structured parse)

import { z } from "zod";

// ─── Authority Rule ───────────────────────────────────────────────────────────

export const AuthorityResultSchema = z.enum([
  "SELF_EXECUTE",
  "NEEDS_APPROVAL",
  "NOT_ALLOWED",
  "ESCALATE",
]);
export type AuthorityResult = z.infer<typeof AuthorityResultSchema>;

export const AuthorityConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(["<", ">", "<=", ">=", "==", "in", "not_in"]),
  value: z.union([z.number(), z.string(), z.array(z.string())]),
});
export type AuthorityCondition = z.infer<typeof AuthorityConditionSchema>;

export const AuthorityRuleSchema = z.object({
  action: z.string(),
  result: AuthorityResultSchema,
  /** Condition must be satisfied for this result to apply */
  condition: AuthorityConditionSchema.optional(),
  /** Requires co-sign from another role */
  requires_cosign: z.string().optional(),
  /** Who must approve (role level or specific agentId) */
  approver: z.string().optional(),
  /** Additional context for the approval */
  note: z.string().optional(),
});
export type AuthorityRule = z.infer<typeof AuthorityRuleSchema>;

// ─── KPI Definition ───────────────────────────────────────────────────────────

export const KPIDefinitionSchema = z.object({
  name: z.string(),
  metric: z.string(),
  target: z.union([z.number(), z.string()]).optional(),
  unit: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly"]).optional(),
});
export type KPIDefinition = z.infer<typeof KPIDefinitionSchema>;

// ─── Workflow Trigger ─────────────────────────────────────────────────────────

export const WorkflowTriggerSchema = z.object({
  event: z.string(),         // Domain event type, e.g. "invoice.outgoing.confirmed"
  action: z.string(),        // What agent should do, e.g. "auto_create_gl_journal"
  condition: z.string().optional(), // Optional JSON path condition
});
export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;

// ─── Skill Definition ─────────────────────────────────────────────────────────
// This is the parsed, typed version of a .skill.md file

export const SkillDefinitionSchema = z.object({
  /** Unique agent identifier, e.g. "cfo", "hr_manager" */
  agentId: z.string(),
  /** Vietnamese display name */
  displayName: z.string(),
  /** Role level in org hierarchy */
  level: z.enum(["board", "c_suite", "manager", "staff", "special"]),
  /** Department/division */
  department: z.string(),
  /** Agent ID this role reports to */
  reportsTo: z.string().optional(),
  /** Agent IDs this role manages */
  manages: z.array(z.string()).default([]),
  /** Preferred LLM provider for this agent */
  preferredProvider: z.enum(["claude", "gemini", "ollama"]).optional(),
  /** Preferred model override */
  preferredModel: z.string().optional(),
  /** Authority rules — what this agent can do autonomously vs needs approval */
  authorityTable: z.array(AuthorityRuleSchema),
  /** Workflow triggers — automated actions on domain events */
  workflowTriggers: z.array(WorkflowTriggerSchema).default([]),
  /** KPIs this agent tracks */
  kpis: z.array(KPIDefinitionSchema).default([]),
  /** Raw markdown content — injected as system prompt */
  rawMarkdown: z.string(),
  /** Parsed capabilities (free-text list) */
  capabilities: z.array(z.string()).default([]),
  /** Modules this agent has access to */
  modules: z.array(z.string()).default([]),
});
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

// ─── Agent Registry Entry ─────────────────────────────────────────────────────

export interface AgentRegistryEntry {
  agentId: string;
  displayName: string;
  level: SkillDefinition["level"];
  department: string;
  skillFilePath: string;
}

// ─── Context for Authority Check ─────────────────────────────────────────────

export interface AuthorityCheckContext {
  /** The action being performed */
  action: string;
  /** Dynamic fields from the action context (e.g., amount, department) */
  fields: Record<string, unknown>;
  /** The agent performing the action */
  agentId: string;
  /** Company context */
  companyId: string;
}

export interface AuthorityCheckResult {
  result: AuthorityResult;
  rule: AuthorityRule | null; // Which rule matched
  reason: string;
  approver?: string; // Who must approve
}
