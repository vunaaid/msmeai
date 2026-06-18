// packages/ai-sdk/src/authority/checker.ts
// Authority Checker — programmatic check of agent authority table
// Không dùng LLM để check authority → deterministic, no hallucination

import type {
  SkillDefinition,
  AuthorityRule,
  AuthorityCheckContext,
  AuthorityCheckResult,
  AuthorityResult,
} from "../skill/types.js";

// ─── Condition Evaluator ──────────────────────────────────────────────────────

function evaluateCondition(
  condition: AuthorityRule["condition"],
  fields: Record<string, unknown>
): boolean {
  if (!condition) return true;

  const fieldValue = fields[condition.field];
  const { operator, value } = condition;

  switch (operator) {
    case "<":
      return typeof fieldValue === "number" && typeof value === "number"
        ? fieldValue < value : false;
    case ">":
      return typeof fieldValue === "number" && typeof value === "number"
        ? fieldValue > value : false;
    case "<=":
      return typeof fieldValue === "number" && typeof value === "number"
        ? fieldValue <= value : false;
    case ">=":
      return typeof fieldValue === "number" && typeof value === "number"
        ? fieldValue >= value : false;
    case "==":
      return String(fieldValue) === String(value);
    case "in":
      return Array.isArray(value) && value.includes(String(fieldValue));
    case "not_in":
      return Array.isArray(value) && !value.includes(String(fieldValue));
    default:
      return false;
  }
}

// ─── Authority Checker ────────────────────────────────────────────────────────

/**
 * Check if an agent can perform an action given its skill definition
 *
 * Rules are evaluated in order. First matching rule wins.
 * If no rule matches, default to NOT_ALLOWED.
 */
export function checkAuthority(
  skill: SkillDefinition,
  context: AuthorityCheckContext
): AuthorityCheckResult {
  const { action, fields } = context;

  // Find matching rules (action must match, condition must be true)
  const matchingRules = skill.authorityTable.filter((rule) => {
    // Exact match or glob pattern match (e.g., "payment.*")
    const actionMatches =
      rule.action === action ||
      rule.action === "*" ||
      (rule.action.endsWith(".*") &&
        action.startsWith(rule.action.slice(0, -2)));

    if (!actionMatches) return false;
    return evaluateCondition(rule.condition, fields);
  });

  if (matchingRules.length === 0) {
    return {
      result: "NOT_ALLOWED",
      rule: null,
      reason: `Không tìm thấy quyền hạn cho hành động "${action}"`,
    };
  }

  // Sort: rules with conditions take precedence over wildcard rules
  const sortedRules = matchingRules.sort((a, b) => {
    const aHasCondition = !!a.condition ? 1 : 0;
    const bHasCondition = !!b.condition ? 1 : 0;
    return bHasCondition - aHasCondition;
  });

  const rule = sortedRules[0]!;
  const result = rule.result;

  let reason = "";
  switch (result) {
    case "SELF_EXECUTE":
      reason = `${skill.displayName} có quyền tự thực hiện "${action}"`;
      break;
    case "NEEDS_APPROVAL":
      reason = `"${action}" yêu cầu phê duyệt từ ${rule.approver ?? "cấp trên"}`;
      break;
    case "ESCALATE":
      reason = `"${action}" vượt quá thẩm quyền, cần chuyển lên ${rule.approver ?? skill.reportsTo ?? "cấp trên"}`;
      break;
    case "NOT_ALLOWED":
      reason = `${skill.displayName} không được phép thực hiện "${action}"`;
      break;
  }

  if (rule.note) reason += `. ${rule.note}`;

  return {
    result,
    rule,
    reason,
    approver: rule.approver ?? (result !== "SELF_EXECUTE" ? skill.reportsTo : undefined),
  };
}

// ─── Batch Check ─────────────────────────────────────────────────────────────

/**
 * Check multiple actions at once — useful for building tool available list
 */
export function checkMultipleActions(
  skill: SkillDefinition,
  actions: string[],
  fields: Record<string, unknown> = {},
  companyId: string = ""
): Map<string, AuthorityCheckResult> {
  const results = new Map<string, AuthorityCheckResult>();
  for (const action of actions) {
    results.set(
      action,
      checkAuthority(skill, { action, fields, agentId: skill.agentId, companyId })
    );
  }
  return results;
}

// ─── Authority Summary for UI ─────────────────────────────────────────────────

export interface AuthoritySummary {
  canDo: string[];          // Actions with SELF_EXECUTE
  needsApproval: string[];  // Actions with NEEDS_APPROVAL
  cannotDo: string[];       // Actions with NOT_ALLOWED
}

export function getAuthoritySummary(skill: SkillDefinition): AuthoritySummary {
  const summary: AuthoritySummary = {
    canDo: [],
    needsApproval: [],
    cannotDo: [],
  };

  for (const rule of skill.authorityTable) {
    // Only include rules without conditions for the summary (base rules)
    if (rule.condition) continue;

    switch (rule.result) {
      case "SELF_EXECUTE":
        summary.canDo.push(rule.action);
        break;
      case "NEEDS_APPROVAL":
      case "ESCALATE":
        summary.needsApproval.push(rule.action);
        break;
      case "NOT_ALLOWED":
        summary.cannotDo.push(rule.action);
        break;
    }
  }

  return summary;
}

// ─── Mode Override ────────────────────────────────────────────────────────────

/**
 * In ASSISTANT mode, convert SELF_EXECUTE → NEEDS_APPROVAL for all actions
 * so human always confirms before execution
 */
export function applyModeOverride(
  result: AuthorityCheckResult,
  aiMode: "full" | "assistant"
): AuthorityCheckResult {
  if (aiMode === "assistant" && result.result === "SELF_EXECUTE") {
    return {
      ...result,
      result: "NEEDS_APPROVAL" as AuthorityResult,
      reason: `[ASSISTANT MODE] ${result.reason} — cần xác nhận từ người dùng`,
      approver: "user",
    };
  }
  return result;
}
