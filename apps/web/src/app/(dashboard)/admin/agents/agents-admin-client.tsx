"use client";

// src/app/(dashboard)/admin/agents/agents-admin-client.tsx
// Quản lý AI Agents của công ty trong khu Quản Trị Hệ Thống (/admin):
// thêm/sửa/xóa/enable-disable agent + quản lý CREDENTIAL LLM dùng chung (API + API key mã hóa).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bot, Plus, Edit2, Trash2, Power, PowerOff,
  ChevronDown, ChevronUp, Save, X, Loader2,
  MessageSquare, Shield, Info, Key, Star, KeyRound,
} from "lucide-react";
import Link from "next/link";
import { apiSend } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/page-header";

// ─── Types ─────────────────────────────────────────────────────────────────

interface CredentialRef {
  id: string;
  label: string;
  provider: string;
}

interface DbAgent {
  id: string;
  agentId: string;
  displayName: string;
  description: string | null;
  department: string | null;
  level: string;
  systemPrompt: string;
  model: string;
  provider: string;
  allowTools: boolean;
  icon: string;
  isActive: boolean;
  isCustom: boolean;
  sortOrder: number;
  credentialId: string | null;
  credential: CredentialRef | null;
  sessionCount: number;
}

interface FileAgent {
  agentId: string;
  displayName: string;
  department: string | null;
  level: string;
  description: string | null;
}

interface Credential {
  id: string;
  label: string;
  provider: string;
  baseUrl: string | null;
  defaultModel: string | null;
  isActive: boolean;
  isDefault: boolean;
  hasKey: boolean;
  createdAt: string;
}

interface ModelOption { id: string; label: string; toolCapable?: boolean }
interface ProviderModels {
  provider: string; label: string; toolCapable: boolean;
  allowCustom: boolean; needsBaseUrl: boolean; models: ModelOption[];
}
type SupportedModels = Record<string, ProviderModels>;

interface Props {
  dbAgents: DbAgent[];
  fileAgents: FileAgent[];
  credentials: Credential[];
  supportedModels: SupportedModels;
  companyId: string;
}

const LEVEL_LABEL: Record<string, string> = {
  board:   "HĐQT",
  c_suite: "C-Suite",
  manager: "Trưởng Phòng",
  staff:   "Nhân Viên",
  special: "Đặc Biệt",
};

const LEVEL_COLOR: Record<string, string> = {
  board:   "bg-purple-900/30 text-purple-300 border-purple-700",
  c_suite: "bg-blue-900/30 text-blue-300 border-blue-700",
  manager: "bg-emerald-900/30 text-emerald-300 border-emerald-700",
  staff:   "bg-slate-800 text-slate-300 border-slate-700",
  special: "bg-amber-900/30 text-amber-300 border-amber-700",
};

const PROVIDER_LABEL: Record<string, string> = {
  claude: "Claude (Anthropic)",
  gemini: "Gemini (Google)",
  openai: "OpenAI-compatible (DeepSeek/Kimi/Qwen/GPT)",
  ollama: "Ollama (self-host)",
};

// ─── Default system prompt template ──────────────────────────────────────────

const SYSTEM_PROMPT_TEMPLATE = `Bạn là [Tên Agent] của công ty.
Nhiệm vụ chính của bạn là [mô tả nhiệm vụ].

Quyền hạn:
- [Quyền 1]
- [Quyền 2]

Phong cách:
- Chuyên nghiệp, ngắn gọn, đúng trọng tâm
- Sử dụng tiếng Việt
- Đưa ra gợi ý cụ thể, có thể thực hiện được`;

// ─── Agent form ──────────────────────────────────────────────────────────────

interface AgentForm {
  agentId: string;
  displayName: string;
  description: string;
  department: string;
  level: string;
  systemPrompt: string;
  model: string;
  provider: string;
  allowTools: boolean;
  icon: string;
  sortOrder: number;
  credentialId: string;
}

const emptyForm = (): AgentForm => ({
  agentId: "",
  displayName: "",
  description: "",
  department: "",
  level: "staff",
  systemPrompt: SYSTEM_PROMPT_TEMPLATE,
  model: "sonnet",
  provider: "claude",
  allowTools: false,
  icon: "Bot",
  sortOrder: 100,
  credentialId: "",
});

// ─── Credential form ─────────────────────────────────────────────────────────

interface CredForm {
  label: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  isDefault: boolean;
}

const emptyCredForm = (): CredForm => ({
  label: "",
  provider: "claude",
  baseUrl: "",
  apiKey: "",
  defaultModel: "",
  isDefault: false,
});

// ─── Component ───────────────────────────────────────────────────────────────

export function AgentsAdminClient({ dbAgents: initial, fileAgents, credentials: initialCreds, supportedModels }: Props) {
  const router = useRouter();
  const [agents, setAgents] = useState<DbAgent[]>(initial);
  const [creds, setCreds] = useState<Credential[]>(initialCreds);
  const [isPending, startTransition] = useTransition();

  // Agent form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AgentForm>(emptyForm());
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);

  // Credential form state
  const [showCredForm, setShowCredForm] = useState(false);
  const [editingCredId, setEditingCredId] = useState<string | null>(null);
  const [credForm, setCredForm] = useState<CredForm>(emptyCredForm());

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const dbAgentIds = new Set(agents.map(a => a.agentId));
  const fileOnlyAgents = fileAgents.filter(a => !dbAgentIds.has(a.agentId));

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const flash = (msg: string, isError = false) => {
    if (isError) { setError(msg); setTimeout(() => setError(null), 4000); }
    else { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3000); }
  };

  const openCreate = (prefill?: Partial<AgentForm>) => {
    setEditingId(null);
    setForm({ ...emptyForm(), ...prefill });
    setShowForm(true);
  };

  const openEdit = (agent: DbAgent) => {
    setEditingId(agent.id);
    setForm({
      agentId:      agent.agentId,
      displayName:  agent.displayName,
      description:  agent.description ?? "",
      department:   agent.department ?? "",
      level:        agent.level,
      systemPrompt: agent.systemPrompt,
      model:        agent.model,
      provider:     agent.provider,
      allowTools:   agent.allowTools,
      icon:         agent.icon,
      sortOrder:    agent.sortOrder,
      credentialId: agent.credentialId ?? "",
    });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm()); };

  // ─── Agent API calls ──────────────────────────────────────────────────────

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const isEdit = !!editingId;
      const url = isEdit
        ? `/api/ai/agents/company/${form.agentId}`
        : "/api/ai/agents/company";
      // credentialId rỗng → null (về fallback env)
      const payload = { ...form, credentialId: form.credentialId || null };
      try {
        const { data: agent } = await apiSend<DbAgent>(url, isEdit ? "PATCH" : "POST", payload);
        flash(isEdit ? "Đã cập nhật agent" : "Đã tạo agent mới");
        closeForm();
        router.refresh();
        if (agent) {
          const cred = creds.find(c => c.id === agent.credentialId);
          const credRef: CredentialRef | null = cred
            ? { id: cred.id, label: cred.label, provider: cred.provider }
            : null;
          setAgents(prev =>
            isEdit
              ? prev.map(a => a.id === editingId ? { ...agent, credential: credRef, sessionCount: a.sessionCount } : a)
              : [...prev, { ...agent, credential: credRef, sessionCount: 0 }]
          );
        }
      } catch (err) {
        flash(err instanceof Error ? err.message : "Lỗi lưu agent", true);
      }
    });
  };

  const handleToggleActive = (agent: DbAgent) => {
    startTransition(async () => {
      try {
        await apiSend(`/api/ai/agents/company/${agent.agentId}`, "PATCH", { isActive: !agent.isActive });
        setAgents(prev => prev.map(a =>
          a.id === agent.id ? { ...a, isActive: !a.isActive } : a
        ));
        flash(agent.isActive ? "Agent đã tạm ngưng" : "Agent đã kích hoạt");
      } catch (err) {
        flash(err instanceof Error ? err.message : "Lỗi khi cập nhật", true);
      }
    });
  };

  const handleDelete = (agent: DbAgent) => {
    if (!confirm(`Xóa agent "${agent.displayName}"?`)) return;
    startTransition(async () => {
      try {
        await apiSend(`/api/ai/agents/company/${agent.agentId}`, "DELETE");
        setAgents(prev => prev.filter(a => a.id !== agent.id));
        flash("Đã xóa agent");
      } catch (err) {
        flash(err instanceof Error ? err.message : "Lỗi khi xóa", true);
      }
    });
  };

  const importFileAgent = (fa: FileAgent) => {
    openCreate({
      agentId:     fa.agentId,
      displayName: fa.displayName,
      description: fa.description ?? "",
      department:  fa.department ?? "",
      level:       fa.level,
    });
  };

  // ─── Credential API calls ─────────────────────────────────────────────────

  const openCredCreate = () => {
    setEditingCredId(null);
    setCredForm(emptyCredForm());
    setShowCredForm(true);
  };

  const openCredEdit = (c: Credential) => {
    setEditingCredId(c.id);
    setCredForm({
      label: c.label,
      provider: c.provider,
      baseUrl: c.baseUrl ?? "",
      apiKey: "", // không bao giờ prefill key — để trống = giữ key cũ
      defaultModel: c.defaultModel ?? "",
      isDefault: c.isDefault,
    });
    setShowCredForm(true);
  };

  const closeCredForm = () => { setShowCredForm(false); setEditingCredId(null); setCredForm(emptyCredForm()); };

  const handleSaveCred = () => {
    setError(null);
    startTransition(async () => {
      const isEdit = !!editingCredId;
      const url = isEdit ? `/api/ai/credentials/${editingCredId}` : "/api/ai/credentials";
      // Bỏ field rỗng để PATCH không ghi đè bằng giá trị trống
      const payload: Record<string, unknown> = {
        label: credForm.label,
        provider: credForm.provider,
        isDefault: credForm.isDefault,
      };
      if (credForm.baseUrl) payload.baseUrl = credForm.baseUrl;
      if (credForm.apiKey) payload.apiKey = credForm.apiKey;
      if (credForm.defaultModel) payload.defaultModel = credForm.defaultModel;
      try {
        const { data: cred } = await apiSend<Credential>(url, isEdit ? "PATCH" : "POST", payload);
        flash(isEdit ? "Đã cập nhật credential" : "Đã thêm credential");
        closeCredForm();
        router.refresh();
        if (cred) {
          setCreds(prev => {
            // nếu vừa set default → bỏ default ở các credential cùng provider khác
            const cleared = cred.isDefault
              ? prev.map(c => c.provider === cred.provider ? { ...c, isDefault: false } : c)
              : prev;
            return isEdit
              ? cleared.map(c => c.id === cred.id ? cred : c)
              : [...cleared, cred];
          });
        }
      } catch (err) {
        flash(err instanceof Error ? err.message : "Lỗi lưu credential", true);
      }
    });
  };

  const handleDeleteCred = (c: Credential) => {
    const used = agents.filter(a => a.credentialId === c.id);
    const warn = used.length > 0
      ? `\n${used.length} agent đang dùng credential này sẽ chuyển về cấu hình mặc định (env).`
      : "";
    if (!confirm(`Xóa credential "${c.label}"?${warn}`)) return;
    startTransition(async () => {
      try {
        await apiSend(`/api/ai/credentials/${c.id}`, "DELETE");
        setCreds(prev => prev.filter(x => x.id !== c.id));
        setAgents(prev => prev.map(a => a.credentialId === c.id ? { ...a, credentialId: null, credential: null } : a));
        flash("Đã xóa credential");
      } catch (err) {
        flash(err instanceof Error ? err.message : "Lỗi khi xóa", true);
      }
    });
  };

  const activeCreds = creds.filter(c => c.isActive);

  // Provider hiệu lực của agent (theo credential đang chọn, else theo form) → lọc model.
  const agentProvider = creds.find(c => c.id === form.credentialId)?.provider ?? form.provider ?? "claude";
  const agentPm = supportedModels[agentProvider];
  const agentModels = agentPm?.models ?? [];
  // Credential form: model gợi ý theo provider đang chọn trong form credential.
  const credPm = supportedModels[credForm.provider];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <PageHeader
        icon={Bot}
        iconColor="text-fuchsia-400"
        backHref="/admin"
        title="Quản Lý AI Agents"
        subtitle="Thuê & cấu hình agents; khai báo API LLM và API key dùng chung cho công ty"
        actions={
          <button
            onClick={() => openCreate()}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg transition-colors"
          >
            <Plus size={14} />
            Tạo Agent Mới
          </button>
        }
      />

      {/* Flash messages */}
      {successMsg && (
        <div className="p-3 bg-emerald-900/20 border border-emerald-800/40 rounded-xl text-sm text-emerald-300">
          ✓ {successMsg}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
          ⚠ {error}
        </div>
      )}

      {/* ═══ Credentials section ═══ */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Key size={14} className="text-fuchsia-400" />
            Credential LLM dùng chung ({creds.length})
          </h2>
          <button
            onClick={openCredCreate}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
          >
            <Plus size={12} />
            Thêm Credential
          </button>
        </div>

        <div className="flex items-start gap-2.5 px-5 py-3 bg-slate-800/30 text-xs text-slate-400 border-b border-slate-800">
          <Info size={13} className="mt-0.5 flex-shrink-0 text-slate-500" />
          <span>
            API key được <strong className="text-slate-300">mã hóa</strong> và không bao giờ hiển thị lại.
            Mỗi agent chọn 1 credential; nếu để trống sẽ dùng credential <strong className="text-slate-300">mặc định</strong> theo provider
            (hoặc cấu hình env của hệ thống). Agent dùng <strong className="text-slate-300">tools</strong> chỉ chạy được với provider Claude.
          </span>
        </div>

        {creds.length === 0 ? (
          <div className="text-center py-10 text-slate-600">
            <KeyRound size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Chưa có credential — thêm để cấu hình API LLM cho agents</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {creds.map(c => (
              <div key={c.id} className={`flex items-center gap-4 px-5 py-3 ${!c.isActive ? "opacity-50" : ""}`}>
                <div className="w-9 h-9 bg-fuchsia-600/10 border border-fuchsia-700/30 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Key size={15} className="text-fuchsia-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-200">{c.label}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300">
                      {PROVIDER_LABEL[c.provider] ?? c.provider}
                    </span>
                    {c.isDefault && (
                      <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-amber-700 bg-amber-900/30 text-amber-300">
                        <Star size={10} className="fill-amber-300" /> Mặc định
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                    <span className={c.hasKey ? "text-emerald-500" : "text-red-500"}>
                      {c.hasKey ? "•••• API key đã lưu" : "Chưa có API key"}
                    </span>
                    {c.defaultModel && <span>model: {c.defaultModel}</span>}
                    {c.baseUrl && <span className="font-mono text-slate-600 truncate max-w-[240px]">{c.baseUrl}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openCredEdit(c)}
                    className="p-1.5 text-slate-600 hover:text-cyan-400 transition-colors"
                    title="Chỉnh sửa"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteCred(c)}
                    disabled={isPending}
                    className="p-1.5 text-slate-600 hover:text-red-400 transition-colors"
                    title="Xóa"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Credential form */}
      {showCredForm && (
        <div className="bg-slate-900 border border-fuchsia-700/40 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-fuchsia-900/10">
            <h2 className="text-sm font-semibold text-white">
              {editingCredId ? "Chỉnh sửa Credential" : "Thêm Credential LLM"}
            </h2>
            <button onClick={closeCredForm} className="text-slate-500 hover:text-white"><X size={16} /></button>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Tên nhãn</label>
                <input
                  value={credForm.label}
                  onChange={e => setCredForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="vd: Claude-prod, Gemini"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Provider</label>
                <select
                  value={credForm.provider}
                  onChange={e => setCredForm(f => ({ ...f, provider: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500"
                >
                  {Object.entries(PROVIDER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                API Key {credForm.provider === "ollama" && <span className="text-slate-600">(không bắt buộc với Ollama)</span>}
              </label>
              <input
                type="password"
                value={credForm.apiKey}
                onChange={e => setCredForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder={editingCredId ? "Để trống nếu không đổi key" : "Dán API key…"}
                autoComplete="new-password"
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500 font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Base URL <span className="text-slate-600">(tuỳ chọn — gateway / Ollama host)</span>
                </label>
                <input
                  value={credForm.baseUrl}
                  onChange={e => setCredForm(f => ({ ...f, baseUrl: e.target.value }))}
                  placeholder="vd: http://localhost:11434"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Model mặc định <span className="text-slate-600">(tuỳ chọn)</span>
                </label>
                <input
                  list="cred-model-list"
                  value={credForm.defaultModel}
                  onChange={e => setCredForm(f => ({ ...f, defaultModel: e.target.value }))}
                  placeholder={credPm?.models[0]?.id ?? "vd: claude-sonnet-4-6"}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500 font-mono"
                />
                <datalist id="cred-model-list">
                  {(credPm?.models ?? []).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </datalist>
              </div>
            </div>
            {credPm?.needsBaseUrl && (
              <p className="text-xs text-amber-400/80">
                Provider này cần <strong>Base URL</strong> (vd DeepSeek: https://api.deepseek.com · Kimi: https://api.moonshot.cn/v1 · Ollama: http://localhost:11434).
              </p>
            )}

            <label className="flex items-center gap-2.5 cursor-pointer">
              <div
                onClick={() => setCredForm(f => ({ ...f, isDefault: !f.isDefault }))}
                className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${credForm.isDefault ? "bg-fuchsia-600" : "bg-slate-700"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${credForm.isDefault ? "translate-x-5" : "translate-x-0"}`} />
              </div>
              <span className="text-xs text-slate-400">Đặt làm mặc định cho provider này</span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button onClick={closeCredForm} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Hủy</button>
              <button
                onClick={handleSaveCred}
                disabled={isPending || !credForm.label || (credForm.provider !== "ollama" && !editingCredId && !credForm.apiKey)}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editingCredId ? "Lưu thay đổi" : "Thêm Credential"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Agent create/edit form ═══ */}
      {showForm && (
        <div className="bg-slate-900 border border-fuchsia-700/40 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-fuchsia-900/10">
            <h2 className="text-sm font-semibold text-white">
              {editingId ? "Chỉnh sửa Agent" : "Tạo Agent Mới"}
            </h2>
            <button onClick={closeForm} className="text-slate-500 hover:text-white"><X size={16} /></button>
          </div>

          <div className="p-5 space-y-4">
            {/* Row 1: ID + Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Agent ID <span className="text-slate-600">(slug, không đổi sau khi tạo)</span>
                </label>
                <input
                  value={form.agentId}
                  onChange={e => setForm(f => ({ ...f, agentId: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                  disabled={!!editingId}
                  placeholder="vd: hr_manager, cfo_agent"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Tên hiển thị</label>
                <input
                  value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  placeholder="vd: Giám Đốc Nhân Sự"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500"
                />
              </div>
            </div>

            {/* Row 2: Dept + Level */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Phòng ban</label>
                <input
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="vd: Phòng Nhân Sự"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Cấp bậc</label>
                <select
                  value={form.level}
                  onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500"
                >
                  {Object.entries(LEVEL_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Mô tả ngắn</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Mô tả ngắn về agent này"
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500"
              />
            </div>

            {/* System Prompt */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                System Prompt <span className="text-slate-600">(định nghĩa tính cách và quyền hạn)</span>
              </label>
              <textarea
                value={form.systemPrompt}
                onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                rows={10}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500 resize-y font-mono"
              />
            </div>

            {/* Row 3: Credential + Model */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Credential LLM <span className="text-slate-600">(API + key)</span>
                </label>
                <select
                  value={form.credentialId}
                  onChange={e => setForm(f => ({ ...f, credentialId: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500"
                >
                  <option value="">— Mặc định theo provider / env —</option>
                  {activeCreds.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.label} ({PROVIDER_LABEL[c.provider] ?? c.provider}){c.isDefault ? " ★" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Model <span className="text-slate-600">({agentPm?.label ?? agentProvider})</span>
                </label>
                {agentPm?.allowCustom ? (
                  <>
                    <input
                      list="agent-model-list"
                      value={form.model}
                      onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                      placeholder="Chọn hoặc nhập model"
                      className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500 font-mono"
                    />
                    <datalist id="agent-model-list">
                      {agentModels.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </datalist>
                  </>
                ) : (
                  <select
                    value={form.model}
                    onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500"
                  >
                    {agentModels.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                )}
              </div>
            </div>

            {/* Row 4: SortOrder + Tools */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Thứ tự hiển thị</label>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={form.sortOrder}
                  onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 100 }))}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-fuchsia-500"
                />
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <div
                    onClick={() => setForm(f => ({ ...f, allowTools: !f.allowTools }))}
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${form.allowTools ? "bg-fuchsia-600" : "bg-slate-700"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.allowTools ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                  <span className="text-xs text-slate-400">Cho phép dùng Tools <span className="text-slate-600">(chỉ Claude)</span></span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button onClick={closeForm} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Hủy</button>
              <button
                onClick={handleSave}
                disabled={isPending || !form.agentId || !form.displayName || !form.systemPrompt}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editingId ? "Lưu thay đổi" : "Tạo Agent"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ DB Agents List ═══ */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">
            {agents.length} agents của công ty
          </h2>
        </div>

        {agents.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            <Bot size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Chưa có agent nào — tạo mới hoặc import từ file agents bên dưới</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {agents.map(agent => (
              <div key={agent.id} className={`px-5 py-4 transition-colors ${!agent.isActive ? "opacity-50" : ""}`}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-fuchsia-600/10 border border-fuchsia-700/30 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Bot size={18} className="text-fuchsia-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-200">{agent.displayName}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${LEVEL_COLOR[agent.level] ?? LEVEL_COLOR.staff}`}>
                        {LEVEL_LABEL[agent.level] ?? agent.level}
                      </span>
                      {!agent.isCustom && (
                        <span className="text-xs text-slate-600 border border-slate-700 px-1.5 py-0.5 rounded">File-based</span>
                      )}
                      {!agent.isActive && (
                        <span className="text-xs text-red-500 border border-red-800 px-1.5 py-0.5 rounded">Tạm ngưng</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                      <span className="font-mono text-slate-600">{agent.agentId}</span>
                      {agent.department && <span>{agent.department}</span>}
                      <span className="flex items-center gap-1"><MessageSquare size={10} />{agent.sessionCount} sessions</span>
                      <span>{agent.model}</span>
                      <span className="flex items-center gap-1 text-fuchsia-400/80">
                        <Key size={10} />
                        {agent.credential ? `${agent.credential.label}` : "mặc định/env"}
                      </span>
                      {agent.allowTools && <span className="text-amber-600">tools ✓</span>}
                    </div>
                    {agent.description && <p className="text-xs text-slate-500 mt-1">{agent.description}</p>}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setExpandedPrompt(expandedPrompt === agent.id ? null : agent.id)}
                      className="p-1.5 text-slate-600 hover:text-slate-300 transition-colors"
                      title="Xem system prompt"
                    >
                      {expandedPrompt === agent.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <Link
                      href={`/ai/chat/${agent.agentId}`}
                      className="p-1.5 text-slate-600 hover:text-fuchsia-400 transition-colors"
                      title="Chat với agent"
                    >
                      <MessageSquare size={14} />
                    </Link>
                    <button
                      onClick={() => openEdit(agent)}
                      className="p-1.5 text-slate-600 hover:text-cyan-400 transition-colors"
                      title="Chỉnh sửa"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(agent)}
                      disabled={isPending}
                      className="p-1.5 text-slate-600 hover:text-amber-400 transition-colors"
                      title={agent.isActive ? "Tạm ngưng" : "Kích hoạt"}
                    >
                      {agent.isActive ? <Power size={14} /> : <PowerOff size={14} />}
                    </button>
                    <button
                      onClick={() => handleDelete(agent)}
                      disabled={isPending}
                      className="p-1.5 text-slate-600 hover:text-red-400 transition-colors"
                      title="Xóa"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {expandedPrompt === agent.id && (
                  <div className="mt-3 ml-14">
                    <pre className="text-xs text-slate-400 bg-slate-800/50 border border-slate-700 rounded-lg p-3 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                      {agent.systemPrompt}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File-based agents (import / "thuê") */}
      {fileOnlyAgents.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h2 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Shield size={14} className="text-slate-500" />
              {fileOnlyAgents.length} agents mẫu từ hệ thống
              <span className="text-xs text-slate-600">(chưa thuê cho công ty — click để thuê & tuỳ chỉnh)</span>
            </h2>
          </div>
          <div className="divide-y divide-slate-800">
            {fileOnlyAgents.map(fa => (
              <div key={fa.agentId} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-800/30 transition-colors group">
                <div className="w-8 h-8 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Bot size={14} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-300">{fa.displayName}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${LEVEL_COLOR[fa.level] ?? LEVEL_COLOR.staff}`}>
                      {LEVEL_LABEL[fa.level] ?? fa.level}
                    </span>
                  </div>
                  {fa.department && <span className="text-xs text-slate-500">{fa.department}</span>}
                </div>
                <button
                  onClick={() => importFileAgent(fa)}
                  className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-all"
                >
                  <Plus size={12} />
                  Thuê & Tuỳ chỉnh
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
