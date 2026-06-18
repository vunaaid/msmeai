# AI Agent System — Implementation Spec

> **Nguồn:** `/docs/company-ai-system/` (skill files + workflow architecture + user interaction)  
> **Quyết định chốt:**  
> - Skill Engine: Cách B (parse có cấu trúc, authority check bằng code)  
> - MVP Channel: Web Chat only  
> - Plan System: sau khi Projects module xong  
> **Thời gian ước tính:** 5.5 tuần

---

## Tổng Quan: Cái Gì Từ Docs → Code Nào

```
docs/company-ai-system/                    →  Code
─────────────────────────────────────────────────────────────────
*.skill.md (26 files)                      →  packages/ai-sdk/skill-engine
                                               (parser + SkillDefinition type)

AI-WORKFLOW-ARCHITECTURE.md               →  apps/ai-worker/
IMPLEMENTATION-GUIDE.md                    →  apps/web/server/ai/

USER-AI-INTERACTION.md (role dashboards)  →  apps/web/app/(dashboard)/ai/
USER-AI-INTERACTION.md (approval flow)    →  apps/web/app/(dashboard)/ai/approvals/
USER-AI-INTERACTION.md (auth + context)   →  packages/ai-sdk/context-builder

org-chart.md                              →  DB schema: users.reports_to,
                                              users.department_id, roles table

PLAN-AI-ENGINE.md                         →  Module 17 (Projects) — AFTER
```

---

## Lớp 0: Foundation Tối Thiểu (Tuần 1–1.5)

> Chỉ build những gì AI cần. Không cần full kế toán hay vận hành.

### Schema DB (Core only)

```prisma
// packages/db/prisma/schema.prisma

model Company {
  id          String   @id @default(cuid())
  name        String
  ai_mode     AIMode   @default(ASSISTANT)  // FULL | ASSISTANT
  created_at  DateTime @default(now())

  users       User[]
  modules     ModuleConfig[]
}

enum AIMode {
  FULL       // AI tự thực thi trong thẩm quyền
  ASSISTANT  // AI chỉ đề xuất, con người confirm
}

model Department {
  id         String  @id @default(cuid())
  company_id String
  name       String
  code       String  // 'kinh-doanh', 'tai-chinh-ke-toan', ...

  company    Company   @relation(...)
  users      User[]
}

model Role {
  id          String     @id @default(cuid())
  company_id  String
  name        String
  level       RoleLevel  // BOARD | C_SUITE | MANAGER | STAFF
  skill_file  String     // relative path: 'c-suite/giam-doc-kinh-doanh.skill.md'
  permissions Json       // { module_key: { read, write, approve } }

  company     Company  @relation(...)
  users       User[]
}

enum RoleLevel {
  BOARD
  C_SUITE
  MANAGER
  STAFF
}

model User {
  id            String  @id @default(cuid())
  company_id    String
  email         String
  name          String
  role_id       String
  department_id String
  manager_id    String?   // reports_to — FK chính mình (self-relation)
  is_active     Boolean   @default(true)

  company       Company    @relation(...)
  role          Role       @relation(...)
  department    Department @relation(...)
  manager       User?      @relation("reports_to", fields: [manager_id], references: [id])
  reports       User[]     @relation("reports_to")
  sessions      Session[]
  ai_sessions   AISession[]
}

model Session {
  id         String   @id @default(cuid())
  user_id    String
  token      String   @unique
  expires_at DateTime

  user       User @relation(...)
}

// Audit log — append only
model AuditLog {
  id          String   @id @default(cuid())
  company_id  String
  user_id     String
  action      String   // 'create' | 'update' | 'delete' | 'approve' | 'ai_execute'
  entity_type String
  entity_id   String
  data_before Json?
  data_after  Json?
  ip_address  String?
  created_at  DateTime @default(now())

  @@index([company_id, entity_type, entity_id])
}

// Domain events
model DomainEvent {
  id            String   @id @default(cuid())
  company_id    String
  event_type    String   // 'sales.deal.won', 'ai.task.completed', ...
  source_module String
  payload       Json
  published_at  DateTime @default(now())
  processed_at  DateTime?
  status        String   @default("pending")

  @@index([company_id, status])
}

model ModuleConfig {
  id         String  @id @default(cuid())
  company_id String
  module_key String
  enabled    Boolean @default(false)
  settings   Json    @default("{}")

  company    Company @relation(...)
  @@unique([company_id, module_key])
}
```

### Auth API (REST)

```
POST  /api/auth/login    → { email, password } → { token, user, role, skill_file }
POST  /api/auth/logout
GET   /api/auth/me       → { user, role, permissions, ai_mode }
```

### Middleware: Inject Role Context

```typescript
// apps/web/server/middleware/auth.ts
// Mọi request đều có req.ctx = { user, role, skill, company }

export async function authMiddleware(req, res, next) {
  const token = extractToken(req);
  const session = await db.session.findUnique({ where: { token }, include: { user: { include: { role: true, department: true } } } });

  req.ctx = {
    user: session.user,
    role: session.user.role,
    company_id: session.user.company_id,
    ai_mode: session.user.company.ai_mode,
    // Skill file path — dùng cho AI SDK
    skill_file_path: session.user.role.skill_file,
  };
  next();
}
```

---

## Lớp 1: packages/llm — Multi-LLM Provider (3 ngày)

```
packages/llm/
├── src/
│   ├── types.ts           ← Interface chung
│   ├── providers/
│   │   ├── claude.ts      ← Anthropic SDK với prompt caching
│   │   ├── gemini.ts      ← Google AI SDK
│   │   └── ollama.ts      ← Ollama HTTP client
│   ├── router.ts          ← Chọn provider theo config
│   ├── usage-tracker.ts   ← Log tokens, cost, latency
│   └── index.ts
```

### Interface Chung

```typescript
// packages/llm/src/types.ts

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
  execute: (args: unknown) => Promise<unknown>;
}

export interface ChatOptions {
  tools?: Tool[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  tool_calls?: ToolCall[];
  usage: { prompt_tokens: number; completion_tokens: number };
  provider: string;
  model: string;
  latency_ms: number;
}

export interface LLMClient {
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  stream(messages: Message[], options?: ChatOptions): AsyncIterable<string>;
}
```

### Claude Adapter (với Prompt Caching)

```typescript
// packages/llm/src/providers/claude.ts
import Anthropic from '@anthropic-ai/sdk';

export class ClaudeProvider implements LLMClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const start = Date.now();

    // Tách system message — cache nếu dài (skill file content)
    const [systemMsg, ...rest] = messages;
    const systemContent = systemMsg?.role === 'system' ? systemMsg.content : undefined;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: options?.max_tokens ?? 4096,
      // Cache system prompt (skill file) — giảm cost & latency
      system: systemContent ? [
        { type: 'text', text: systemContent, cache_control: { type: 'ephemeral' } }
      ] : undefined,
      messages: rest.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      tools: options?.tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
    });

    return {
      content: response.content[0].type === 'text' ? response.content[0].text : '',
      tool_calls: response.content
        .filter(b => b.type === 'tool_use')
        .map(b => ({ id: b.id, name: b.name, arguments: b.input })),
      usage: { prompt_tokens: response.usage.input_tokens, completion_tokens: response.usage.output_tokens },
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      latency_ms: Date.now() - start,
    };
  }
}
```

### Router — Chọn Provider

```typescript
// packages/llm/src/router.ts

export class LLMRouter {
  private providers: Map<string, LLMClient>;
  private config: ProviderConfig[];

  // Chọn provider theo: agent config → task type → fallback chain
  select(agentRole?: string, taskType?: string): LLMClient {
    // 1. Agent có preferred provider không?
    const agentPref = this.getAgentPreference(agentRole);
    if (agentPref && this.isAvailable(agentPref)) return this.providers.get(agentPref)!;

    // 2. Task type rule
    if (taskType === 'sensitive_data') return this.providers.get('ollama')!;
    if (taskType === 'simple_query') return this.providers.get('gemini')!;

    // 3. Default: Claude
    return this.providers.get('claude')!;
  }

  // Fallback tự động khi provider lỗi
  async chatWithFallback(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    for (const provider of this.config.sort((a, b) => a.priority - b.priority)) {
      try {
        const client = this.providers.get(provider.name)!;
        return await client.chat(messages, options);
      } catch (err) {
        console.warn(`Provider ${provider.name} failed, trying next...`, err);
      }
    }
    throw new Error('All LLM providers failed');
  }
}
```

---

## Lớp 2: packages/ai-sdk — Skill Engine (Cách B) (1 tuần)

```
packages/ai-sdk/
├── src/
│   ├── skill-engine/
│   │   ├── parser.ts         ← Parse .skill.md → SkillDefinition
│   │   ├── loader.ts         ← Cache + hot-reload skill files
│   │   └── types.ts          ← SkillDefinition interface
│   ├── authority/
│   │   ├── checker.ts        ← Check action vs authority table
│   │   └── types.ts          ← AuthorityResult enum
│   ├── escalation/
│   │   ├── engine.ts         ← Build escalation chain từ org chart
│   │   └── timeout.ts        ← Timeout handler
│   ├── context/
│   │   └── builder.ts        ← Build system prompt từ skill + live data
│   ├── audit/
│   │   └── logger.ts         ← Log mọi AI action
│   └── index.ts
```

### SkillDefinition Type (Cách B — typed)

```typescript
// packages/ai-sdk/src/skill-engine/types.ts

export interface AuthorityRule {
  action: string;             // 'sign_contract', 'approve_discount', 'hire_employee'
  result: AuthorityResult;
  condition?: {
    field: string;            // 'value', 'discount_pct', 'risk_level'
    operator: '<' | '>' | '<=' | '>=' | '==' | 'in';
    value: number | string | string[];
  };
  requires_cosign?: string;   // role phải cùng ký
  notes?: string;
}

export type AuthorityResult = 'SELF_EXECUTE' | 'NEEDS_APPROVAL' | 'NOT_ALLOWED' | 'ESCALATE';

export interface WorkflowTrigger {
  condition: string;           // NẾU... → (từ "NGUYÊN TẮC HÀNH ĐỘNG")
  action: string;              // Thực thi / Alert / Escalate
  target_role?: string;        // Ai nhận action
  sla_hours?: number;
}

export interface SkillDefinition {
  // Từ YAML frontmatter
  role: string;
  role_en: string;
  level: 'board' | 'c_suite' | 'manager' | 'staff';
  department: string;
  reports_to: string;          // role key của cấp trên
  manages: string[];           // role keys của cấp dưới
  preferred_provider?: string;

  // Từ ## sections
  description: string;
  core_duties: string[];
  authority_table: AuthorityRule[];
  workflows: { name: string; steps: string[] }[];
  kpis: { name: string; target: string; frequency: string }[];
  interaction_matrix: { role: string; frequency: string; topics: string }[];
  workflow_triggers: WorkflowTrigger[];   // NẾU...→ rules

  // Raw content để inject vào system prompt
  raw_markdown: string;
}
```

### Parser (Markdown → SkillDefinition)

```typescript
// packages/ai-sdk/src/skill-engine/parser.ts

export function parseSkillFile(content: string): SkillDefinition {
  // 1. Parse YAML frontmatter
  const { data: frontmatter, content: body } = parseFrontmatter(content);

  // 2. Parse ## THẨM QUYỀN QUYẾT ĐỊNH table
  const authorityTable = parseAuthorityTable(body);
  //   | Ký HĐ < 200M | ✅ Tự quyết |
  //   → { action: 'sign_contract', result: 'SELF_EXECUTE', condition: { field: 'value', operator: '<', value: 200_000_000 } }
  //   | Ký HĐ 200M-1 tỷ | ✅ Đồng ký CEO |
  //   → { action: 'sign_contract', result: 'NEEDS_APPROVAL', condition: { ... }, requires_cosign: 'giam-doc-dieu-hanh' }

  // 3. Parse ## NGUYÊN TẮC HÀNH ĐỘNG (NẾU...→ rules)
  const triggers = parseWorkflowTriggers(body);

  // 4. Parse ## KPIs & METRICS table
  const kpis = parseKPITable(body);

  // 5. Parse other sections
  return {
    ...frontmatter,
    authority_table: authorityTable,
    workflow_triggers: triggers,
    kpis,
    raw_markdown: content,  // giữ nguyên để inject vào prompt
  };
}

// Quy tắc mapping icon → AuthorityResult
// ✅ → SELF_EXECUTE
// ❌ → NEEDS_APPROVAL (nếu ghi "cần X duyệt") hoặc NOT_ALLOWED
// Logic đặc biệt: "Đồng ký CEO" → NEEDS_APPROVAL + requires_cosign
```

### Authority Checker

```typescript
// packages/ai-sdk/src/authority/checker.ts

export function checkAuthority(
  skill: SkillDefinition,
  action: string,
  context: Record<string, unknown>
): { result: AuthorityResult; reason: string; approver?: string } {

  // Tìm rule khớp với action
  const matchingRules = skill.authority_table.filter(r => r.action === action);

  if (matchingRules.length === 0) {
    // Action không có trong skill → không được phép
    return { result: 'NOT_ALLOWED', reason: `Action '${action}' not in authority table for ${skill.role}` };
  }

  // Kiểm tra condition (nếu có)
  for (const rule of matchingRules) {
    if (!rule.condition || evaluateCondition(rule.condition, context)) {
      return {
        result: rule.result,
        reason: rule.notes ?? '',
        approver: rule.result === 'NEEDS_APPROVAL' ? skill.reports_to : undefined,
      };
    }
  }

  // Không có rule nào match condition → escalate
  return { result: 'ESCALATE', reason: 'No matching authority rule' };
}

function evaluateCondition(
  cond: AuthorityRule['condition'],
  ctx: Record<string, unknown>
): boolean {
  const fieldValue = ctx[cond!.field] as number;
  switch (cond!.operator) {
    case '<':  return fieldValue < (cond!.value as number);
    case '>':  return fieldValue > (cond!.value as number);
    case '<=': return fieldValue <= (cond!.value as number);
    case '>=': return fieldValue >= (cond!.value as number);
    case '==': return fieldValue === cond!.value;
    case 'in': return (cond!.value as string[]).includes(String(fieldValue));
    default:   return false;
  }
}
```

### Escalation Engine

```typescript
// packages/ai-sdk/src/escalation/engine.ts

export class EscalationEngine {

  // Build chain từ role hiện tại đến CEO
  buildChain(startRoleKey: string, orgChart: OrgChartNode[]): string[] {
    const chain: string[] = [];
    let current = startRoleKey;

    while (current) {
      const node = orgChart.find(n => n.role_key === current);
      if (!node?.reports_to) break;
      chain.push(node.reports_to);
      current = node.reports_to;
    }
    return chain;  // ['truong-phong-kinh-doanh', 'giam-doc-kinh-doanh', 'giam-doc-dieu-hanh']
  }

  // Crisis: nhảy thẳng CEO
  buildCrisisChain(): string[] {
    return ['giam-doc-dieu-hanh'];
  }

  // Tạo escalation request
  async createEscalationRequest(params: {
    origin_role: string;
    action: string;
    context: unknown;
    ai_recommendation: string;
    is_crisis?: boolean;
    timeout_hours?: number;
  }) {
    const chain = params.is_crisis
      ? this.buildCrisisChain()
      : this.buildChain(params.origin_role, await this.getOrgChart());

    return db.aIApprovalRequest.create({
      data: {
        requesting_agent: params.origin_role,
        approver_role: chain[0],  // gửi cho cấp ngay trên
        action_type: params.action,
        action_data: params.context,
        ai_recommendation: params.ai_recommendation,
        escalation_chain: chain,
        timeout_at: params.timeout_hours
          ? new Date(Date.now() + params.timeout_hours * 3600_000)
          : null,
        status: 'pending',
      }
    });
  }
}
```

### Context Builder — Build System Prompt Per Request

```typescript
// packages/ai-sdk/src/context/builder.ts

export async function buildSystemPrompt(params: {
  skill: SkillDefinition;
  user: User;
  live_context: LiveContext;  // KPIs, alerts, pending items từ Visibility
}): Promise<string> {

  return `
# Bạn là ${params.skill.role} tại ${params.user.company.name}

## Thông tin của bạn
- Tên: ${params.user.name}
- Vai trò: ${params.skill.role}
- Cấp: ${params.skill.level}
- Phòng ban: ${params.skill.department}
- Báo cáo cho: ${params.skill.reports_to}
- Quản lý: ${params.skill.manages.join(', ')}

## Chế độ AI hiện tại: ${params.user.company.ai_mode}
${params.user.company.ai_mode === 'FULL'
  ? '→ Bạn CÓ THỂ tự thực thi các action trong thẩm quyền.'
  : '→ Bạn CHỈ đề xuất, phân tích, tạo draft. KHÔNG tự thực thi bất kỳ action nào.'}

## Ngữ cảnh hiện tại (live data)
${formatLiveContext(params.live_context)}

## Skill file đầy đủ (luật bạn phải tuân theo)
${params.skill.raw_markdown}

## Quy tắc bất biến
1. Trước khi thực thi action, kiểm tra thẩm quyền trong "THẨM QUYỀN QUYẾT ĐỊNH"
2. Nếu vượt thẩm quyền → gọi tool create_approval_request, KHÔNG tự thực thi
3. Mọi action phải ghi audit log
4. Chỉ xem data trong scope của role: ${getScopeDescription(params.skill.level)}
5. Trả lời bằng tiếng Việt, ngắn gọn, hành động rõ ràng
  `.trim();
}
```

---

## Lớp 3: apps/ai-worker — BullMQ Worker (1 tuần)

```
apps/ai-worker/
├── src/
│   ├── queues.ts              ← Định nghĩa queues
│   ├── handlers/
│   │   ├── orchestrator.ts    ← Nhận request → dispatch đúng agent
│   │   ├── agent.ts           ← Generic agent handler
│   │   └── briefing.ts        ← Morning briefing (cron)
│   ├── tools/                 ← Tools AI có thể gọi
│   │   ├── registry.ts        ← Đăng ký tools theo module
│   │   ├── core.ts            ← Tools luôn có: notify, create_task, create_approval
│   │   └── [module].ts        ← Tools theo module (khi module bật)
│   └── index.ts
```

### Queue Definitions

```typescript
// apps/ai-worker/src/queues.ts
import { Queue, Worker } from 'bullmq';

export const AI_QUEUES = {
  TASKS:      new Queue('ai-tasks',      { connection: redis }),
  APPROVALS:  new Queue('ai-approvals',  { connection: redis }),
  ESCALATIONS:new Queue('ai-escalations',{ connection: redis }),
  BRIEFINGS:  new Queue('ai-briefings',  { connection: redis }),
};

// Job data interface
export interface AITaskJob {
  company_id: string;
  trigger: {
    type: 'user_message' | 'scheduled' | 'event' | 'escalation';
    user_id?: string;
    agent_role: string;         // 'giam-doc-kinh-doanh'
    skill_file: string;         // relative path
    content: string;
    context?: Record<string, unknown>;
  };
  session_id?: string;
  mode: 'FULL' | 'ASSISTANT';
}
```

### Generic Agent Handler

```typescript
// apps/ai-worker/src/handlers/agent.ts

export async function processAgentTask(job: Job<AITaskJob>) {
  const { company_id, trigger, mode } = job.data;

  // 1. Load skill file
  const skillLoader = SkillLoader.getInstance();
  const skill = await skillLoader.load(trigger.skill_file);

  // 2. Lấy live context từ Visibility (nếu bật)
  const liveContext = await getLiveContext(company_id, trigger.agent_role);

  // 3. Build system prompt
  const systemPrompt = await buildSystemPrompt({ skill, user: await getUser(trigger.user_id), live_context: liveContext });

  // 4. Build tools cho agent này (chỉ tools của modules đang bật)
  const tools = await buildToolsForAgent(company_id, skill.level);

  // 5. Gọi LLM
  const router = getLLMRouter(company_id);
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: trigger.content },
  ];

  const response = await router.chatWithFallback(messages, { tools });

  // 6. Xử lý tool calls nếu có
  if (response.tool_calls?.length) {
    for (const toolCall of response.tool_calls) {
      // Kiểm tra authority TRƯỚC khi execute (Cách B)
      const authResult = checkAuthority(skill, toolCall.name, toolCall.arguments as Record<string, unknown>);

      if (authResult.result === 'SELF_EXECUTE' && mode === 'FULL') {
        // Thực thi
        const tool = tools.find(t => t.name === toolCall.name)!;
        const result = await tool.execute(toolCall.arguments);
        await logAIAction({ company_id, agent_role: trigger.agent_role, action_type: toolCall.name, input: toolCall.arguments, output: result, mode });

      } else if (authResult.result === 'NEEDS_APPROVAL' || mode === 'ASSISTANT') {
        // Tạo approval request
        await createApprovalRequest({
          company_id,
          requesting_agent: trigger.agent_role,
          approver_role: authResult.approver ?? skill.reports_to,
          action_type: toolCall.name,
          action_data: toolCall.arguments,
          ai_recommendation: response.content,
        });

      } else if (authResult.result === 'NOT_ALLOWED') {
        await logAIAction({ ...params, output: { error: 'NOT_ALLOWED', reason: authResult.reason }, mode });
      }
    }
  }

  // 7. Gửi kết quả về web app (SSE stream)
  await publishResult({ session_id: job.data.session_id, content: response.content, tool_calls: response.tool_calls });

  // 8. Log usage
  await logLLMUsage({ company_id, provider: response.provider, model: response.model, tokens: response.usage, agent_role: trigger.agent_role });
}
```

### Tool Registry

```typescript
// apps/ai-worker/src/tools/registry.ts

// Core tools — luôn có (không phụ thuộc module)
export const CORE_TOOLS: Tool[] = [
  {
    name: 'create_approval_request',
    description: 'Tạo yêu cầu phê duyệt khi action vượt thẩm quyền',
    parameters: { type: 'object', properties: { action_type: { type: 'string' }, data: { type: 'object' }, reason: { type: 'string' } } },
    execute: async (args) => createApprovalRequest(args),
  },
  {
    name: 'send_notification',
    description: 'Gửi notification cho người dùng',
    parameters: { type: 'object', properties: { user_id: { type: 'string' }, message: { type: 'string' }, priority: { type: 'string' } } },
    execute: async (args) => sendNotification(args),
  },
  {
    name: 'create_task',
    description: 'Tạo task và assign cho người',
    parameters: { type: 'object', properties: { title: { type: 'string' }, assignee_id: { type: 'string' }, due_date: { type: 'string' }, description: { type: 'string' } } },
    execute: async (args) => createTask(args),
  },
  {
    name: 'get_org_info',
    description: 'Lấy thông tin tổ chức: ai báo cáo cho ai, phòng ban nào',
    parameters: { type: 'object', properties: { query_type: { type: 'string' } } },
    execute: async (args) => getOrgInfo(args),
  },
];

// Dynamic tools — chỉ có khi module bật
export async function buildToolsForAgent(company_id: string, level: RoleLevel): Promise<Tool[]> {
  const enabledModules = await getEnabledModules(company_id);
  const tools = [...CORE_TOOLS];

  if (enabledModules.includes('sales')) tools.push(...SALES_TOOLS);
  if (enabledModules.includes('hr'))    tools.push(...HR_TOOLS);
  if (enabledModules.includes('gl'))    tools.push(...FINANCE_TOOLS);
  // ...

  // Filter theo level — staff không có C-Suite tools
  return filterToolsByLevel(tools, level);
}
```

---

## Lớp 4: AI Console UI — Web Chat (1 tuần)

```
apps/web/app/(dashboard)/ai/
├── page.tsx                  ← AI Console (chat + sidebar)
├── approvals/
│   └── page.tsx              ← Approval Inbox
├── tasks/
│   └── page.tsx              ← AI Task Queue
└── admin/
    └── page.tsx              ← AI Admin (mode toggle, LLM config)
```

### API Endpoints

```
POST /api/ai/chat
  body: { message: string, session_id?: string }
  → 202 Accepted + { task_id, session_id }
  → SSE stream tại /api/ai/stream/:task_id

GET  /api/ai/stream/:task_id          ← SSE: realtime output từ agent
GET  /api/ai/sessions                 ← Lịch sử chat
GET  /api/ai/sessions/:id/messages    ← Messages của session

GET  /api/ai/approvals                ← Approval requests chờ user duyệt
POST /api/ai/approvals/:id/decide     ← { decision: 'approve'|'reject', comment }

GET  /api/ai/tasks                    ← AI tasks trong scope
GET  /api/ai/admin/config             ← LLM provider config (admin only)
PUT  /api/ai/admin/mode               ← Toggle FULL/ASSISTANT
```

### Chat UI Flow

```
User gõ message
       │
       ▼
POST /api/ai/chat → tạo AITaskJob → push vào BullMQ
       │
       ▼ 202 Accepted + task_id
Client mở SSE: GET /api/ai/stream/:task_id
       │
       ▼ Stream chunks từ worker
Hiển thị response realtime (typewriter effect)
       │
       ▼ Nếu có tool_call cần approval:
Hiển thị Approval Card trong chat:
┌─────────────────────────────────────┐
│ 🔐 Cần phê duyệt                    │
│ Action: Assign deal TechCorp cho Minh│
│ Lý do: Vượt thẩm quyền tự động      │
│ AI đề xuất: Approve — Minh có ít    │
│ workload nhất và expertise phù hợp  │
│ [✅ Approve] [❌ Reject] [💬 Thảo luận]│
└─────────────────────────────────────┘
```

---

## DB Schema: AI Tables

```prisma
model AISession {
  id           String   @id @default(cuid())
  company_id   String
  user_id      String
  agent_role   String
  started_at   DateTime @default(now())
  last_active  DateTime @updatedAt
  mode         AIMode

  user         User       @relation(...)
  messages     AIMessage[]
}

model AIMessage {
  id            String   @id @default(cuid())
  session_id    String
  role          String   // 'user' | 'assistant' | 'tool'
  content       String
  tool_calls    Json?
  tool_results  Json?
  tokens_used   Int?
  provider      String?
  model         String?
  latency_ms    Int?
  created_at    DateTime @default(now())

  session       AISession @relation(...)
}

model AITask {
  id            String   @id @default(cuid())
  company_id    String
  session_id    String?
  trigger_type  String   // 'user_message' | 'scheduled' | 'event'
  agent_role    String
  status        String   // 'queued' | 'running' | 'completed' | 'failed'
  input         Json
  output        Json?
  reasoning     String?
  tools_called  Json?
  error         String?
  created_at    DateTime @default(now())
  completed_at  DateTime?
}

model AIApprovalRequest {
  id                  String   @id @default(cuid())
  company_id          String
  task_id             String?
  requesting_agent    String
  approver_role       String
  approver_user_id    String?  // assign cho user cụ thể khi tìm được
  action_type         String
  action_data         Json
  ai_recommendation   String
  escalation_chain    String[] // remaining chain nếu timeout
  status              String   @default("pending")
  decided_by          String?
  decided_at          DateTime?
  decision_comment    String?
  timeout_at          DateTime?
  created_at          DateTime @default(now())
}

model LLMUsageLog {
  id               String   @id @default(cuid())
  company_id       String
  provider         String
  model            String
  agent_role       String
  prompt_tokens    Int
  completion_tokens Int
  cost_usd         Float?
  latency_ms       Int
  task_type        String?
  created_at       DateTime @default(now())

  @@index([company_id, created_at])
}
```

---

## Checklist Deploy (Thứ Tự Đúng)

```
□ 1. PostgreSQL, Redis, MinIO up (Docker Compose)
□ 2. pnpm install (toàn monorepo)
□ 3. packages/db: prisma migrate + seed (company, roles từ org-chart, admin user)
□ 4. Seed skill files: đọc /docs/company-ai-system/**/*.skill.md → parse → lưu path vào roles table
□ 5. packages/llm: set ANTHROPIC_API_KEY, GEMINI_API_KEY, OLLAMA_ENDPOINT
□ 6. packages/ai-sdk: test parse 1 skill file (giam-doc-kinh-doanh.skill.md)
□ 7. apps/ai-worker: start worker, test 1 task đơn giản
□ 8. apps/web: start web, test /api/auth/login + /api/ai/chat
□ 9. Test end-to-end: User đăng nhập với role GĐ KD → Chat → AI phản hồi đúng context
```

---

*Mọi phần trong file này đều implement trực tiếp từ nội dung `/docs/company-ai-system/`.*  
*Không có bước nào cần quyết định thêm về business logic — skill files đã có đủ.*
