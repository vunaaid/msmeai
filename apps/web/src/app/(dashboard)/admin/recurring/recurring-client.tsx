"use client";

// src/app/(dashboard)/admin/recurring/recurring-client.tsx
// Quản lý danh mục công việc định kỳ của công ty.

import { useState, useEffect } from "react";
import {
  CalendarClock, Plus, Download, Play, Pencil, Trash2, X, Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useApi, apiFetch, apiSend } from "@/lib/api/client";

type Cadence = "weekly" | "monthly" | "quarterly" | "yearly";
type Priority = "urgent" | "high" | "normal" | "low";

interface RoleOpt { id: string; name: string; level: string }

interface RecurringItem {
  id: string;
  roleId: string;
  title: string;
  description: string | null;
  cadence: Cadence;
  module: string | null;
  priority: Priority;
  dueOffsetDays: number;
  active: boolean;
  source: string;
  role: { id: string; name: string; level: string };
}

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "Hàng tuần", monthly: "Hàng tháng", quarterly: "Hàng quý", yearly: "Hàng năm",
};
const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Khẩn cấp", high: "Cao", normal: "Bình thường", low: "Thấp",
};

interface FormState {
  id?: string;
  roleId: string;
  title: string;
  description: string;
  cadence: Cadence;
  module: string;
  priority: Priority;
  dueOffsetDays: number;
  active: boolean;
}

const emptyForm = (): FormState => ({
  roleId: "", title: "", description: "", cadence: "monthly",
  module: "", priority: "normal", dueOffsetDays: 0, active: true,
});

export function RecurringClient() {
  const { data, loading, error, refresh } = useApi<RecurringItem[]>("/api/recurring");
  const items = data ?? [];

  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // "import" | "generate" | "save"
  const [flash, setFlash] = useState<{ msg: string; err?: boolean } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<RoleOpt[]>("/api/roles")
      .then(({ data }) => setRoles(data ?? []))
      .catch(() => {});
  }, []);

  const showFlash = (msg: string, err = false) => {
    setFlash({ msg, err });
    setTimeout(() => setFlash(null), 3500);
  };

  const importDefaults = async () => {
    setBusy("import");
    try {
      const { data } = await apiSend<{ imported: number }>("/api/recurring/import-defaults", "POST");
      showFlash(`Đã nạp ${data?.imported ?? 0} mục mặc định`);
      refresh();
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Lỗi nạp mặc định", true);
    } finally { setBusy(null); }
  };

  const generateNow = async () => {
    setBusy("generate");
    try {
      const { data } = await apiSend<{ created: number }>("/api/recurring/generate", "POST");
      showFlash(`Đã sinh ${data?.created ?? 0} công việc lên workboard`);
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Lỗi sinh việc", true);
    } finally { setBusy(null); }
  };

  const toggleActive = async (it: RecurringItem) => {
    try {
      await apiSend(`/api/recurring/${it.id}`, "PUT", { active: !it.active });
      refresh();
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Lỗi cập nhật", true);
    }
  };

  const remove = async (it: RecurringItem) => {
    if (!confirm(`Xoá "${it.title}"?`)) return;
    try {
      await apiSend(`/api/recurring/${it.id}`, "DELETE");
      refresh();
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Lỗi xoá", true);
    }
  };

  const openCreate = () => { setForm({ ...emptyForm(), roleId: roles[0]?.id ?? "" }); setFormErr(null); setModalOpen(true); };
  const openEdit = (it: RecurringItem) => {
    setForm({
      id: it.id, roleId: it.roleId, title: it.title, description: it.description ?? "",
      cadence: it.cadence, module: it.module ?? "", priority: it.priority,
      dueOffsetDays: it.dueOffsetDays, active: it.active,
    });
    setFormErr(null);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.roleId || form.title.trim().length < 2) { setFormErr("Chọn vai trò và nhập tiêu đề (≥2 ký tự)"); return; }
    setBusy("save");
    setFormErr(null);
    const body = {
      roleId: form.roleId,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      cadence: form.cadence,
      module: form.module.trim() || undefined,
      priority: form.priority,
      dueOffsetDays: Number(form.dueOffsetDays) || 0,
      active: form.active,
    };
    try {
      if (form.id) await apiSend(`/api/recurring/${form.id}`, "PUT", body);
      else await apiSend("/api/recurring", "POST", body);
      setModalOpen(false);
      refresh();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Lỗi lưu");
    } finally { setBusy(null); }
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <PageHeader
        icon={CalendarClock}
        iconColor="text-amber-400"
        backHref="/admin"
        title="Công Việc Định Kỳ"
        subtitle="Danh mục việc lặp lại theo vai trò — tự sinh lên workboard"
        actions={
          <>
            <button onClick={importDefaults} disabled={busy === "import"}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white rounded-lg transition-colors disabled:opacity-50">
              {busy === "import" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Nạp mặc định
            </button>
            <button onClick={generateNow} disabled={busy === "generate"}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white rounded-lg transition-colors disabled:opacity-50">
              {busy === "generate" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Sinh việc ngay
            </button>
            <button onClick={openCreate}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors">
              <Plus size={14} /> Thêm mục
            </button>
          </>
        }
      />

      {flash && (
        <div className={`p-3 rounded-xl text-sm border ${flash.err ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-emerald-900/20 border-emerald-800/40 text-emerald-300"}`}>
          {flash.err ? "⚠ " : "✓ "}{flash.msg}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-cyan-500" /></div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-400">{error}</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            Chưa có mục nào. Bấm <span className="text-slate-300">"Nạp mặc định"</span> để khởi tạo theo vai trò.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Vai trò</th>
                  <th className="text-left px-4 py-3">Công việc</th>
                  <th className="text-left px-4 py-3">Tần suất</th>
                  <th className="text-left px-4 py-3">Ưu tiên</th>
                  <th className="text-center px-4 py-3">Hạn (+ngày)</th>
                  <th className="text-center px-4 py-3">Bật</th>
                  <th className="text-right px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-slate-800/40 group">
                    <td className="px-5 py-3 text-slate-300">{it.role?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-200">{it.title}</div>
                      {it.description && <div className="text-xs text-slate-500 truncate max-w-md">{it.description}</div>}
                      {it.source === "default" && <span className="text-[10px] text-slate-600 border border-slate-700 px-1 py-0.5 rounded">mặc định</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{CADENCE_LABEL[it.cadence]}</td>
                    <td className="px-4 py-3 text-slate-400">{PRIORITY_LABEL[it.priority]}</td>
                    <td className="px-4 py-3 text-center text-slate-400">{it.dueOffsetDays}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActive(it)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${it.active ? "bg-cyan-600" : "bg-slate-700"}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${it.active ? "translate-x-4" : ""}`} />
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(it)} className="p-1.5 text-slate-500 hover:text-cyan-400" title="Sửa"><Pencil size={14} /></button>
                      <button onClick={() => remove(it)} className="p-1.5 text-slate-500 hover:text-red-400" title="Xoá"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
              <h2 className="text-base font-semibold text-white">{form.id ? "Sửa mục định kỳ" : "Thêm mục định kỳ"}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={16} /></button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              {formErr && <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">⚠ {formErr}</div>}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">Vai trò <span className="text-red-400">*</span></label>
                <select value={form.roleId} onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500">
                  <option value="">— Chọn vai trò —</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">Tiêu đề công việc <span className="text-red-400">*</span></label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="VD: Họp giao ban phòng"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500" />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">Mô tả</label>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 resize-none" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">Tần suất</label>
                  <select value={form.cadence} onChange={(e) => setForm((f) => ({ ...f, cadence: e.target.value as Cadence }))}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500">
                    {(["weekly", "monthly", "quarterly", "yearly"] as Cadence[]).map((c) => <option key={c} value={c}>{CADENCE_LABEL[c]}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">Ưu tiên</label>
                  <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500">
                    {(["urgent", "high", "normal", "low"] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">Module (tuỳ chọn)</label>
                  <input value={form.module} onChange={(e) => setForm((f) => ({ ...f, module: e.target.value }))}
                    placeholder="vd: reports"
                    className="w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">Hạn (+ngày)</label>
                  <input type="number" min={0} max={365} value={form.dueOffsetDays}
                    onChange={(e) => setForm((f) => ({ ...f, dueOffsetDays: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                Đang bật
              </label>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Hủy</button>
                <button onClick={save} disabled={busy === "save"}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50">
                  {busy === "save" && <Loader2 size={14} className="animate-spin" />}
                  {form.id ? "Lưu" : "Tạo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
