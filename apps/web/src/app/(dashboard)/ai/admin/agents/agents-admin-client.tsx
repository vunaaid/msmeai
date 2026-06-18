"use client";

// src/app/(dashboard)/ai/admin/agents/agents-admin-client.tsx
// Quản lý AI Agents của công ty: thêm/sửa/xóa/enable-disable

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bot, Plus, Edit2, Trash2, Power, PowerOff,
  ChevronDown, ChevronUp, Save, X, Loader2,
  MessageSquare, Shield, Info,
} from "lucide-react";
import Link from "next/link";
import { apiSend } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/page-header";

// ─── Types ─────────────────────────────────────────────────────────────────

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
  sessionCount: number;
}

interface FileAgent {
  agentId: string;
  displayName: string;
  department: string | null;
  level: string;
  description: string | null;
}

interface Props {
  dbAgents: DbAgent[];
  fileAgents: FileAgent[];
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

const MODELS = ["sonnet", "opus", "haiku", "claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5-20251001"];

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

// ─── Form ─────────────────────────────────────────────────────────────────────

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
});

// ─── Component ───────────────────────────────────────────────────────────────

export function AgentsAdminClient({ dbAgents: initial, fileAgents }: Props) {
  const router = useRouter();
  const [agents, setAgents] = useState<DbAgent[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AgentForm>(emptyForm());
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
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
    });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm()); };

  // ─── API Calls ────────────────────────────────────────────────────────────

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const isEdit = !!editingId;
      const url = isEdit
        ? `/api/ai/agents/company/${form.agentId}`
        : "/api/ai/agents/company";
      try {
        const { data: agent } = await apiSend<DbAgent>(url, isEdit ? "PATCH" : "POST", form);

        flash(isEdit ? "Đã cập nhật agent" : "Đã tạo agent mới");
        closeForm();
        router.refresh();
        // Cập nhật local state ngay (router.refresh tải lại bản chuẩn từ server)
        if (agent) {
          setAgents(prev =>
            isEdit
              ? prev.map(a => a.id === editingId ? { ...agent, sessionCount: a.sessionCount } : a)
              : [...prev, { ...agent, sessionCount: 0 }]
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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <PageHeader
        icon={Bot}
        iconColor="text-purple-400"
        backHref="/ai/admin"
        title="Quản Lý AI Agents"
        subtitle="Cấu hình agents cho toàn bộ người dùng trong công ty"
        actions={
          <button
            onClick={() => openCreate()}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
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

      {/* Info */}
      <div className="flex items-start gap-2.5 p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-xs text-slate-400">
        <Info size={13} className="mt-0.5 flex-shrink-0 text-slate-500" />
        <span>
          Agents được lưu theo công ty — mỗi công ty có danh sách agents riêng.
          Người dùng có thể chat với agent qua <strong className="text-slate-300">/ai</strong>.
          Thay đổi có hiệu lực ngay lập tức.
        </span>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-slate-900 border border-purple-700/40 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-purple-900/10">
            <h2 className="text-sm font-semibold text-white">
              {editingId ? "Chỉnh sửa Agent" : "Tạo Agent Mới"}
            </h2>
            <button onClick={closeForm} className="text-slate-500 hover:text-white">
              <X size={16} />
            </button>
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
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Tên hiển thị</label>
                <input
                  value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  placeholder="vd: Giám Đốc Nhân Sự"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
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
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Cấp bậc</label>
                <select
                  value={form.level}
                  onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
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
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
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
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500 resize-y font-mono"
              />
            </div>

            {/* Row 3: Model + Tools */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Model</label>
                <select
                  value={form.model}
                  onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
                >
                  {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Thứ tự hiển thị</label>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={form.sortOrder}
                  onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 100 }))}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <div
                    onClick={() => setForm(f => ({ ...f, allowTools: !f.allowTools }))}
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${form.allowTools ? "bg-purple-600" : "bg-slate-700"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.allowTools ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                  <span className="text-xs text-slate-400">Cho phép dùng Tools</span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button onClick={closeForm} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                Hủy
              </button>
              <button
                onClick={handleSave}
                disabled={isPending || !form.agentId || !form.displayName || !form.systemPrompt}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editingId ? "Lưu thay đổi" : "Tạo Agent"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DB Agents List */}
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
                  {/* Icon */}
                  <div className="w-10 h-10 bg-purple-600/10 border border-purple-700/30 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Bot size={18} className="text-purple-400" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-200">{agent.displayName}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${LEVEL_COLOR[agent.level] ?? LEVEL_COLOR.staff}`}>
                        {LEVEL_LABEL[agent.level] ?? agent.level}
                      </span>
                      {!agent.isCustom && (
                        <span className="text-xs text-slate-600 border border-slate-700 px-1.5 py-0.5 rounded">
                          File-based
                        </span>
                      )}
                      {!agent.isActive && (
                        <span className="text-xs text-red-500 border border-red-800 px-1.5 py-0.5 rounded">
                          Tạm ngưng
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                      <span className="font-mono text-slate-600">{agent.agentId}</span>
                      {agent.department && <span>{agent.department}</span>}
                      <span className="flex items-center gap-1">
                        <MessageSquare size={10} />
                        {agent.sessionCount} sessions
                      </span>
                      <span>{agent.model}</span>
                      {agent.allowTools && (
                        <span className="text-amber-600">tools ✓</span>
                      )}
                    </div>
                    {agent.description && (
                      <p className="text-xs text-slate-500 mt-1">{agent.description}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {/* Expand system prompt */}
                    <button
                      onClick={() => setExpandedPrompt(expandedPrompt === agent.id ? null : agent.id)}
                      className="p-1.5 text-slate-600 hover:text-slate-300 transition-colors"
                      title="Xem system prompt"
                    >
                      {expandedPrompt === agent.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {/* Chat */}
                    <Link
                      href={`/ai/chat/${agent.agentId}`}
                      className="p-1.5 text-slate-600 hover:text-purple-400 transition-colors"
                      title="Chat với agent"
                    >
                      <MessageSquare size={14} />
                    </Link>
                    {/* Edit */}
                    <button
                      onClick={() => openEdit(agent)}
                      className="p-1.5 text-slate-600 hover:text-cyan-400 transition-colors"
                      title="Chỉnh sửa"
                    >
                      <Edit2 size={14} />
                    </button>
                    {/* Toggle active */}
                    <button
                      onClick={() => handleToggleActive(agent)}
                      disabled={isPending}
                      className="p-1.5 text-slate-600 hover:text-amber-400 transition-colors"
                      title={agent.isActive ? "Tạm ngưng" : "Kích hoạt"}
                    >
                      {agent.isActive ? <Power size={14} /> : <PowerOff size={14} />}
                    </button>
                    {/* Delete */}
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

                {/* Expanded system prompt */}
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

      {/* File-based agents (import) */}
      {fileOnlyAgents.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h2 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Shield size={14} className="text-slate-500" />
              {fileOnlyAgents.length} agents từ file hệ thống
              <span className="text-xs text-slate-600">(chưa cấu hình cho công ty — click để import)</span>
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
                  {fa.department && (
                    <span className="text-xs text-slate-500">{fa.department}</span>
                  )}
                </div>
                <button
                  onClick={() => importFileAgent(fa)}
                  className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-all"
                >
                  <Plus size={12} />
                  Import & Tuỳ chỉnh
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
