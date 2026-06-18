"use client";

// src/app/(dashboard)/hr/hr-client.tsx
// Module Quản trị Nhân sự (HR) — Giai đoạn 1: hồ sơ nhân viên + phòng ban + vị trí.
// Employee là gốc; "Cấp tài khoản" tạo User theo vị trí (điểm nối HR → IAM).

import { useState } from "react";
import {
  Users, Plus, Building2, Briefcase, Pencil, Trash2, UserPlus, RefreshCw,
  Loader2, X, KeyRound, CheckCircle2, UserSearch, Calculator, Wallet, Play, Check,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useApi, apiSend } from "@/lib/api/client";
import { HrAssistant } from "./hr-assistant";

const vnd = (n: number) => `${Math.round(n ?? 0).toLocaleString("vi-VN")} đ`;

type EmployeeStatus = "probation" | "active" | "on_leave" | "resigned" | "terminated";

interface Dept { id: string; name: string; code: string | null; description: string | null; parentId: string | null; _count?: { employees: number; positions: number } }
interface Role { id: string; name: string; level: string }
interface Position {
  id: string; title: string; code: string | null; departmentId: string | null;
  description: string | null; defaultRoleId: string | null; level: string | null; headcount: number | null;
  department?: { id: string; name: string } | null; _count?: { employees: number };
}
interface Employee {
  id: string; employeeCode: string; fullName: string; email: string | null; phone: string | null;
  gender: string | null; dob: string | null; departmentId: string | null; positionId: string | null;
  managerId: string | null; status: EmployeeStatus; hireDate: string | null; note: string | null;
  baseSalary?: number; allowance?: number; dependents?: number; insuranceSalary?: number | null;
  department?: { id: string; name: string } | null;
  position?: { id: string; title: string; defaultRoleId: string | null } | null;
  manager?: { id: string; fullName: string } | null;
  user?: { id: string; email: string; isActive: boolean; role: { name: string } | null } | null;
}

type Tab = "employees" | "departments" | "positions" | "recruitment" | "payroll";
type CandidateStatus = "applied" | "screening" | "interview" | "offer" | "hired" | "rejected";

interface Candidate {
  id: string; fullName: string; email: string | null; phone: string | null;
  positionId: string | null; departmentId: string | null; source: string | null;
  expectedSalary: number | null; status: CandidateStatus; note: string | null; employeeId: string | null;
  position?: { id: string; title: string } | null;
}
interface PayrollRow { id: string; month: string; status: "draft" | "approved" | "paid"; note: string | null; paidDate: string | null; count: number; totalNet: number; totalCost: number }
interface PayrollItemRow {
  id: string; baseSalary: number; allowance: number; otherDeduction: number; grossSalary: number;
  insuranceEmployee: number; insuranceEmployer: number; dependents: number; taxableIncome: number;
  pit: number; netSalary: number; companyCost: number;
  employee: { id: string; fullName: string; employeeCode: string };
}
interface PayrollDetail { id: string; month: string; status: "draft" | "approved" | "paid"; items: PayrollItemRow[] }

const CAND_CFG: Record<CandidateStatus, { label: string; cls: string }> = {
  applied:   { label: "Ứng tuyển",  cls: "text-slate-400 bg-slate-800/40 border-slate-700/40" },
  screening: { label: "Sàng lọc",   cls: "text-cyan-400 bg-cyan-900/20 border-cyan-800/40" },
  interview: { label: "Phỏng vấn",  cls: "text-amber-400 bg-amber-900/20 border-amber-800/40" },
  offer:     { label: "Đã offer",   cls: "text-purple-400 bg-purple-900/20 border-purple-800/40" },
  hired:     { label: "Đã tuyển",   cls: "text-emerald-400 bg-emerald-900/20 border-emerald-800/40" },
  rejected:  { label: "Từ chối",    cls: "text-red-400 bg-red-900/20 border-red-800/40" },
};
const PAYROLL_CFG: Record<"draft" | "approved" | "paid", { label: string; cls: string }> = {
  draft:    { label: "Nháp",      cls: "text-slate-400 bg-slate-800/40 border-slate-700/40" },
  approved: { label: "Đã duyệt",  cls: "text-cyan-400 bg-cyan-900/20 border-cyan-800/40" },
  paid:     { label: "Đã chi",    cls: "text-emerald-400 bg-emerald-900/20 border-emerald-800/40" },
};

const STATUS_CFG: Record<EmployeeStatus, { label: string; cls: string }> = {
  probation:  { label: "Thử việc",   cls: "text-amber-400 bg-amber-900/20 border-amber-800/40" },
  active:     { label: "Chính thức", cls: "text-emerald-400 bg-emerald-900/20 border-emerald-800/40" },
  on_leave:   { label: "Tạm nghỉ",   cls: "text-cyan-400 bg-cyan-900/20 border-cyan-800/40" },
  resigned:   { label: "Đã nghỉ",    cls: "text-slate-500 bg-slate-800/40 border-slate-700/40" },
  terminated: { label: "Chấm dứt",   cls: "text-red-400 bg-red-900/20 border-red-800/40" },
};

export function HrClient({ canManage, roleName, roleLevel }: { canManage: boolean; roleName: string | null; roleLevel: string | null }) {
  const [tab, setTab] = useState<Tab>("employees");

  const employees = useApi<Employee[]>("/api/hr/employees?limit=100");
  const departments = useApi<Dept[]>("/api/hr/departments");
  const positions = useApi<Position[]>("/api/hr/positions");
  const roles = useApi<Role[]>("/api/hr/role-options");
  const candidates = useApi<Candidate[]>("/api/hr/candidates");
  const payroll = useApi<PayrollRow[]>("/api/hr/payroll");

  const [empModal, setEmpModal] = useState<Employee | "new" | null>(null);
  const [deptModal, setDeptModal] = useState<Dept | "new" | null>(null);
  const [posModal, setPosModal] = useState<Position | "new" | null>(null);
  const [candModal, setCandModal] = useState<Candidate | "new" | null>(null);
  const [payOpen, setPayOpen] = useState<string | null>(null); // payroll period detail id

  const deptList = departments.data ?? [];
  const posList = positions.data ?? [];
  const roleList = roles.data ?? [];

  const refreshAll = () => { employees.refresh(); departments.refresh(); positions.refresh(); candidates.refresh(); payroll.refresh(); };

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "employees",   label: "Nhân viên",  icon: Users },
    { key: "recruitment", label: "Tuyển dụng", icon: UserSearch },
    { key: "payroll",     label: "Bảng lương", icon: Calculator },
    { key: "departments", label: "Phòng ban",  icon: Building2 },
    { key: "positions",   label: "Vị trí",     icon: Briefcase },
  ];

  const onAdd = () => {
    if (tab === "employees") setEmpModal("new");
    else if (tab === "departments") setDeptModal("new");
    else if (tab === "positions") setPosModal("new");
    else if (tab === "recruitment") setCandModal("new");
    else if (tab === "payroll") void createPayroll();
  };

  const createPayroll = async () => {
    const month = prompt("Tạo bảng lương tháng (YYYY-MM):", new Date().toISOString().slice(0, 7));
    if (!month) return;
    try { await apiSend("/api/hr/payroll", "POST", { month }); payroll.refresh(); }
    catch (e) { alert(e instanceof Error ? e.message : "Lỗi tạo bảng lương"); }
  };

  const loading =
    tab === "employees" ? employees.loading : tab === "departments" ? departments.loading :
    tab === "positions" ? positions.loading : tab === "recruitment" ? candidates.loading : payroll.loading;

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-6">
      <PageHeader icon={Users} iconColor="text-pink-400" title="Quản Trị Nhân Sự" subtitle="Tuyển dụng · hồ sơ · tính lương · dòng tiền" />

      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
        {/* Cột chính */}
        <div className="lg:flex-[3] min-w-0">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit max-w-full overflow-x-auto">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 whitespace-nowrap ${
                      tab === t.key ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
                    }`}>
                    <Icon size={14} /> {t.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              {canManage && (
                <button onClick={onAdd}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-pink-600 hover:bg-pink-500 text-white rounded-lg transition-colors">
                  <Plus size={15} /> Thêm
                </button>
              )}
              <button onClick={refreshAll} title="Làm mới"
                className="p-2 text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg">
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center py-20"><Loader2 size={26} className="animate-spin text-pink-500" /></div>
            ) : tab === "employees" ? (
              <EmployeesTable rows={employees.data ?? []} canManage={canManage} onEdit={(e) => setEmpModal(e)} onChanged={refreshAll} />
            ) : tab === "recruitment" ? (
              <CandidatesTable rows={candidates.data ?? []} positions={posList} canManage={canManage} onEdit={(c) => setCandModal(c)} onChanged={refreshAll} />
            ) : tab === "payroll" ? (
              <PayrollTable rows={payroll.data ?? []} canManage={canManage} onOpen={(id) => setPayOpen(id)} onChanged={payroll.refresh} />
            ) : tab === "departments" ? (
              <DepartmentsTable rows={deptList} canManage={canManage} onEdit={(d) => setDeptModal(d)} onChanged={departments.refresh} />
            ) : (
              <PositionsTable rows={posList} roles={roleList} canManage={canManage} onEdit={(p) => setPosModal(p)} onChanged={positions.refresh} />
            )}
          </div>
        </div>

        {/* Trợ lý AI Nhân sự */}
        <div className="w-full lg:flex-1 min-w-0">
          <HrAssistant roleName={roleName} roleLevel={roleLevel} />
        </div>
      </div>

      {empModal && (
        <EmployeeModal value={empModal === "new" ? null : empModal} depts={deptList} positions={posList} roles={roleList}
          onClose={() => setEmpModal(null)} onSaved={() => { setEmpModal(null); employees.refresh(); }} />
      )}
      {deptModal && (
        <DepartmentModal value={deptModal === "new" ? null : deptModal} depts={deptList}
          onClose={() => setDeptModal(null)} onSaved={() => { setDeptModal(null); departments.refresh(); }} />
      )}
      {posModal && (
        <PositionModal value={posModal === "new" ? null : posModal} depts={deptList} roles={roleList}
          onClose={() => setPosModal(null)} onSaved={() => { setPosModal(null); positions.refresh(); }} />
      )}
      {candModal && (
        <CandidateModal value={candModal === "new" ? null : candModal} depts={deptList} positions={posList}
          canManage={canManage}
          onClose={() => setCandModal(null)} onSaved={() => { setCandModal(null); candidates.refresh(); employees.refresh(); }} />
      )}
      {payOpen && (
        <PayrollDetailModal periodId={payOpen} canManage={canManage}
          onClose={() => setPayOpen(null)} onChanged={() => payroll.refresh()} />
      )}
    </div>
  );
}

// ─── Employees ─────────────────────────────────────────────────────────────────

function EmployeesTable({ rows, canManage, onEdit, onChanged }: {
  rows: Employee[]; canManage: boolean; onEdit: (e: Employee) => void; onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const provision = async (e: Employee) => {
    if (!confirm(`Cấp tài khoản hệ thống cho ${e.fullName}? (role theo vị trí)`)) return;
    setBusy(e.id);
    try {
      const { data } = await apiSend<{ email: string; tempPassword?: string }>(`/api/hr/employees/${e.id}/provision-user`, "POST", {});
      onChanged();
      alert(`Đã cấp tài khoản: ${data?.email}` + (data?.tempPassword ? `\nMật khẩu tạm: ${data.tempPassword}\n(Hãy bàn giao cho nhân viên & yêu cầu đổi)` : ""));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi cấp tài khoản");
    } finally { setBusy(null); }
  };

  if (rows.length === 0) return <Empty icon={Users} text="Chưa có nhân viên nào" />;
  return (
    <div className="divide-y divide-slate-800">
      {rows.map((e) => {
        const st = STATUS_CFG[e.status];
        return (
          <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
            <div className="w-9 h-9 rounded-full bg-pink-700 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
              {e.fullName.trim().split(" ").map(w => w[0]).slice(-2).join("").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-200">{e.fullName}</span>
                <span className="text-[11px] text-slate-500">{e.employeeCode}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
                {e.user ? (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${e.user.isActive ? "text-emerald-400" : "text-slate-500"}`}>
                    <CheckCircle2 size={10} /> {e.user.isActive ? "Có tài khoản" : "TK đã khóa"}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500 flex-wrap">
                {e.position && <span>{e.position.title}</span>}
                {e.department && <span>· {e.department.name}</span>}
                {e.email && <span>· {e.email}</span>}
              </div>
            </div>
            {canManage && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {!e.user && e.status !== "resigned" && e.status !== "terminated" && (
                  <button onClick={() => provision(e)} disabled={busy === e.id} title="Cấp tài khoản hệ thống"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-cyan-300 bg-cyan-600/15 border border-cyan-700/40 hover:bg-cyan-600/30 disabled:opacity-50">
                    {busy === e.id ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} Cấp TK
                  </button>
                )}
                <button onClick={() => onEdit(e)} className="p-1.5 text-slate-500 hover:text-white"><Pencil size={14} /></button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EmployeeModal({ value, depts, positions, roles, onClose, onSaved }: {
  value: Employee | null; depts: Dept[]; positions: Position[]; roles: Role[];
  onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    fullName: value?.fullName ?? "", employeeCode: value?.employeeCode ?? "",
    email: value?.email ?? "", phone: value?.phone ?? "",
    gender: value?.gender ?? "", dob: value?.dob?.slice(0, 10) ?? "",
    departmentId: value?.departmentId ?? "", positionId: value?.positionId ?? "",
    status: (value?.status ?? "probation") as EmployeeStatus,
    hireDate: value?.hireDate?.slice(0, 10) ?? "", note: value?.note ?? "",
    baseSalary: value?.baseSalary?.toString() ?? "", allowance: value?.allowance?.toString() ?? "",
    dependents: value?.dependents?.toString() ?? "0", insuranceSalary: value?.insuranceSalary?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  void roles;

  const save = async () => {
    setSaving(true); setErr(null);
    const body = {
      fullName: f.fullName, employeeCode: f.employeeCode || undefined,
      email: f.email || null, phone: f.phone || null,
      gender: f.gender || null, dob: f.dob || null,
      departmentId: f.departmentId || null, positionId: f.positionId || null,
      status: f.status, hireDate: f.hireDate || null, note: f.note || null,
      baseSalary: f.baseSalary ? Number(f.baseSalary) : 0,
      allowance: f.allowance ? Number(f.allowance) : 0,
      dependents: f.dependents ? Number(f.dependents) : 0,
      insuranceSalary: f.insuranceSalary ? Number(f.insuranceSalary) : null,
    };
    try {
      if (value) await apiSend(`/api/hr/employees/${value.id}`, "PATCH", body);
      else await apiSend("/api/hr/employees", "POST", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };

  return (
    <Modal title={value ? `Sửa: ${value.fullName}` : "Thêm nhân viên"} onClose={onClose}>
      {err && <ErrBox msg={err} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Họ và tên *" className="col-span-2"><input className={inp} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <Field label="Mã NV (tự sinh nếu trống)"><input className={inp} value={f.employeeCode} onChange={(e) => setF({ ...f, employeeCode: e.target.value })} placeholder="NV0001" /></Field>
        <Field label="Trạng thái">
          <select className={inp} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as EmployeeStatus })}>
            {(Object.keys(STATUS_CFG) as EmployeeStatus[]).map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
          </select>
        </Field>
        <Field label="Email"><input className={inp} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Điện thoại"><input className={inp} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Phòng ban">
          <select className={inp} value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
            <option value="">— Chưa gán —</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Vị trí">
          <select className={inp} value={f.positionId} onChange={(e) => setF({ ...f, positionId: e.target.value })}>
            <option value="">— Chưa gán —</option>
            {positions.filter(p => !f.departmentId || p.departmentId === f.departmentId).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
        <Field label="Ngày sinh"><input type="date" className={inp} value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} /></Field>
        <Field label="Ngày vào làm"><input type="date" className={inp} value={f.hireDate} onChange={(e) => setF({ ...f, hireDate: e.target.value })} /></Field>

        <div className="col-span-2 mt-1 pt-2 border-t border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Lương & đãi ngộ (tính lương)</div>
        <Field label="Lương cơ bản (gross/tháng)"><input type="number" className={inp} value={f.baseSalary} onChange={(e) => setF({ ...f, baseSalary: e.target.value })} placeholder="VND" /></Field>
        <Field label="Phụ cấp"><input type="number" className={inp} value={f.allowance} onChange={(e) => setF({ ...f, allowance: e.target.value })} placeholder="VND" /></Field>
        <Field label="Số người phụ thuộc"><input type="number" className={inp} value={f.dependents} onChange={(e) => setF({ ...f, dependents: e.target.value })} /></Field>
        <Field label="Lương đóng BH (mặc định = cơ bản)"><input type="number" className={inp} value={f.insuranceSalary} onChange={(e) => setF({ ...f, insuranceSalary: e.target.value })} placeholder="VND" /></Field>

        <Field label="Ghi chú" className="col-span-2"><textarea className={inp} rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <ModalActions onClose={onClose} onSave={save} saving={saving} disabled={f.fullName.trim().length < 2} />
    </Modal>
  );
}

// ─── Departments ───────────────────────────────────────────────────────────────

function DepartmentsTable({ rows, canManage, onEdit, onChanged }: {
  rows: Dept[]; canManage: boolean; onEdit: (d: Dept) => void; onChanged: () => void;
}) {
  const del = async (d: Dept) => {
    if (!confirm(`Xóa phòng ban "${d.name}"?`)) return;
    try { await apiSend(`/api/hr/departments/${d.id}`, "DELETE"); onChanged(); }
    catch (e) { alert(e instanceof Error ? e.message : "Lỗi xóa"); }
  };
  if (rows.length === 0) return <Empty icon={Building2} text="Chưa có phòng ban nào" />;
  return (
    <div className="divide-y divide-slate-800">
      {rows.map((d) => (
        <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
          <Building2 size={16} className="text-pink-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-slate-200">{d.name}</span>
            {d.code && <span className="text-[11px] text-slate-500 ml-2">{d.code}</span>}
            <div className="text-[11px] text-slate-500 mt-0.5">{d._count?.employees ?? 0} nhân viên · {d._count?.positions ?? 0} vị trí</div>
          </div>
          {canManage && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => onEdit(d)} className="p-1.5 text-slate-500 hover:text-white"><Pencil size={14} /></button>
              <button onClick={() => del(d)} className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DepartmentModal({ value, depts, onClose, onSaved }: {
  value: Dept | null; depts: Dept[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({ name: value?.name ?? "", code: value?.code ?? "", parentId: value?.parentId ?? "", description: value?.description ?? "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setErr(null);
    const body = { name: f.name, code: f.code || undefined, parentId: f.parentId || null, description: f.description || undefined };
    try {
      if (value) await apiSend(`/api/hr/departments/${value.id}`, "PATCH", body);
      else await apiSend("/api/hr/departments", "POST", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };
  return (
    <Modal title={value ? `Sửa: ${value.name}` : "Thêm phòng ban"} onClose={onClose}>
      {err && <ErrBox msg={err} />}
      <div className="space-y-3">
        <Field label="Tên phòng ban *"><input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Mã"><input className={inp} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label="Phòng ban cha">
          <select className={inp} value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}>
            <option value="">— Không —</option>
            {depts.filter(d => d.id !== value?.id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Mô tả"><textarea className={inp} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
      <ModalActions onClose={onClose} onSave={save} saving={saving} disabled={f.name.trim().length < 1} />
    </Modal>
  );
}

// ─── Positions ─────────────────────────────────────────────────────────────────

function PositionsTable({ rows, roles, canManage, onEdit, onChanged }: {
  rows: Position[]; roles: Role[]; canManage: boolean; onEdit: (p: Position) => void; onChanged: () => void;
}) {
  const del = async (p: Position) => {
    if (!confirm(`Xóa vị trí "${p.title}"?`)) return;
    try { await apiSend(`/api/hr/positions/${p.id}`, "DELETE"); onChanged(); }
    catch (e) { alert(e instanceof Error ? e.message : "Lỗi xóa"); }
  };
  const roleName = (id: string | null) => roles.find(r => r.id === id)?.name;
  if (rows.length === 0) return <Empty icon={Briefcase} text="Chưa có vị trí nào" />;
  return (
    <div className="divide-y divide-slate-800">
      {rows.map((p) => (
        <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
          <Briefcase size={16} className="text-pink-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-slate-200">{p.title}</span>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {p.department?.name ?? "—"}
              {p.defaultRoleId && <span> · role: {roleName(p.defaultRoleId) ?? "?"}</span>}
              <span> · {p._count?.employees ?? 0} người</span>
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => onEdit(p)} className="p-1.5 text-slate-500 hover:text-white"><Pencil size={14} /></button>
              <button onClick={() => del(p)} className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PositionModal({ value, depts, roles, onClose, onSaved }: {
  value: Position | null; depts: Dept[]; roles: Role[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    title: value?.title ?? "", code: value?.code ?? "", departmentId: value?.departmentId ?? "",
    defaultRoleId: value?.defaultRoleId ?? "", level: value?.level ?? "",
    headcount: value?.headcount?.toString() ?? "", description: value?.description ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setErr(null);
    const body = {
      title: f.title, code: f.code || undefined, departmentId: f.departmentId || null,
      defaultRoleId: f.defaultRoleId || null, level: f.level || undefined,
      headcount: f.headcount ? Number(f.headcount) : null, description: f.description || undefined,
    };
    try {
      if (value) await apiSend(`/api/hr/positions/${value.id}`, "PATCH", body);
      else await apiSend("/api/hr/positions", "POST", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };
  return (
    <Modal title={value ? `Sửa: ${value.title}` : "Thêm vị trí"} onClose={onClose}>
      {err && <ErrBox msg={err} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tên vị trí *" className="col-span-2"><input className={inp} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Mã"><input className={inp} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label="Định biên"><input type="number" className={inp} value={f.headcount} onChange={(e) => setF({ ...f, headcount: e.target.value })} /></Field>
        <Field label="Phòng ban">
          <select className={inp} value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
            <option value="">— Không —</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Role mặc định (khi cấp tài khoản)">
          <select className={inp} value={f.defaultRoleId} onChange={(e) => setF({ ...f, defaultRoleId: e.target.value })}>
            <option value="">— Không —</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Mô tả công việc (JD)" className="col-span-2"><textarea className={inp} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
      <ModalActions onClose={onClose} onSave={save} saving={saving} disabled={f.title.trim().length < 1} />
    </Modal>
  );
}

// ─── Recruitment (Tuyển dụng) ────────────────────────────────────────────────────

function CandidatesTable({ rows, positions, canManage, onEdit, onChanged }: {
  rows: Candidate[]; positions: Position[]; canManage: boolean; onEdit: (c: Candidate) => void; onChanged: () => void;
}) {
  void positions;
  const del = async (c: Candidate) => {
    if (!confirm(`Xóa ứng viên "${c.fullName}"?`)) return;
    try { await apiSend(`/api/hr/candidates/${c.id}`, "DELETE"); onChanged(); }
    catch (e) { alert(e instanceof Error ? e.message : "Lỗi xóa"); }
  };
  if (rows.length === 0) return <Empty icon={UserSearch} text="Chưa có ứng viên nào" />;
  return (
    <div className="divide-y divide-slate-800">
      {rows.map((c) => {
        const st = CAND_CFG[c.status];
        return (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40">
            <UserSearch size={16} className="text-pink-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-200">{c.fullName}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {c.position?.title ?? "—"}
                {c.expectedSalary ? <span> · mong muốn {vnd(c.expectedSalary)}</span> : null}
                {c.email && <span> · {c.email}</span>}
              </div>
            </div>
            {canManage && (
              <div className="flex items-center gap-1.5">
                <button onClick={() => onEdit(c)} className="p-1.5 text-slate-500 hover:text-white" title={c.employeeId ? "Xem" : "Sửa / Tuyển"}><Pencil size={14} /></button>
                <button onClick={() => del(c)} className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CandidateModal({ value, depts, positions, canManage, onClose, onSaved }: {
  value: Candidate | null; depts: Dept[]; positions: Position[]; canManage: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    fullName: value?.fullName ?? "", email: value?.email ?? "", phone: value?.phone ?? "",
    positionId: value?.positionId ?? "", departmentId: value?.departmentId ?? "",
    source: value?.source ?? "", expectedSalary: value?.expectedSalary?.toString() ?? "",
    status: (value?.status ?? "applied") as CandidateStatus, note: value?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [hiring, setHiring] = useState(false);
  const [baseSalary, setBaseSalary] = useState(value?.expectedSalary?.toString() ?? "");
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setErr(null);
    const body = {
      fullName: f.fullName, email: f.email || null, phone: f.phone || null,
      positionId: f.positionId || null, departmentId: f.departmentId || null,
      source: f.source || null, expectedSalary: f.expectedSalary ? Number(f.expectedSalary) : null,
      status: f.status, note: f.note || null,
    };
    try {
      if (value) await apiSend(`/api/hr/candidates/${value.id}`, "PATCH", body);
      else await apiSend("/api/hr/candidates", "POST", body);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi lưu"); } finally { setSaving(false); }
  };

  const hire = async () => {
    if (!value) return;
    if (!confirm(`Tuyển ${value.fullName} → tạo hồ sơ nhân viên?`)) return;
    setHiring(true); setErr(null);
    try {
      await apiSend(`/api/hr/candidates/${value.id}/hire`, "POST", {
        departmentId: f.departmentId || null, positionId: f.positionId || null,
        baseSalary: baseSalary ? Number(baseSalary) : 0,
      });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi tuyển dụng"); } finally { setHiring(false); }
  };

  const hired = !!value?.employeeId;
  return (
    <Modal title={value ? `Ứng viên: ${value.fullName}` : "Thêm ứng viên"} onClose={onClose}>
      {err && <ErrBox msg={err} />}
      {hired && <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-800/40 text-emerald-300 text-xs">Đã tuyển — đã tạo hồ sơ nhân viên.</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Họ và tên *" className="col-span-2"><input className={inp} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <Field label="Email"><input className={inp} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Điện thoại"><input className={inp} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Vị trí ứng tuyển">
          <select className={inp} value={f.positionId} onChange={(e) => setF({ ...f, positionId: e.target.value })}>
            <option value="">— Chưa rõ —</option>
            {positions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
        <Field label="Phòng ban">
          <select className={inp} value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
            <option value="">— Chưa rõ —</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Trạng thái">
          <select className={inp} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as CandidateStatus })} disabled={hired}>
            {(Object.keys(CAND_CFG) as CandidateStatus[]).map(s => <option key={s} value={s}>{CAND_CFG[s].label}</option>)}
          </select>
        </Field>
        <Field label="Lương mong muốn"><input type="number" className={inp} value={f.expectedSalary} onChange={(e) => setF({ ...f, expectedSalary: e.target.value })} /></Field>
        <Field label="Nguồn"><input className={inp} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="web, giới thiệu..." /></Field>
        <Field label="Ghi chú" className="col-span-2"><textarea className={inp} rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>

      {value && !hired && canManage && (
        <div className="mt-4 pt-3 border-t border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wider">Tuyển dụng → tạo nhân viên</div>
          <div className="flex items-end gap-2">
            <Field label="Lương cơ bản khi tuyển" className="flex-1"><input type="number" className={inp} value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} placeholder="VND" /></Field>
            <button onClick={hire} disabled={hiring}
              className="flex items-center gap-1.5 px-4 h-[38px] text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-50">
              {hiring ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Tuyển
            </button>
          </div>
        </div>
      )}

      <ModalActions onClose={onClose} onSave={save} saving={saving} disabled={f.fullName.trim().length < 2 || hired} />
    </Modal>
  );
}

// ─── Payroll (Bảng lương) ─────────────────────────────────────────────────────────

function PayrollTable({ rows, canManage, onOpen, onChanged }: {
  rows: PayrollRow[]; canManage: boolean; onOpen: (id: string) => void; onChanged: () => void;
}) {
  const del = async (p: PayrollRow) => {
    if (!confirm(`Xóa bảng lương tháng ${p.month}?`)) return;
    try { await apiSend(`/api/hr/payroll/${p.id}`, "DELETE"); onChanged(); }
    catch (e) { alert(e instanceof Error ? e.message : "Lỗi xóa"); }
  };
  if (rows.length === 0) return <Empty icon={Calculator} text="Chưa có bảng lương nào" />;
  return (
    <div className="divide-y divide-slate-800">
      {rows.map((p) => {
        const st = PAYROLL_CFG[p.status];
        return (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 cursor-pointer" onClick={() => onOpen(p.id)}>
            <Calculator size={16} className="text-pink-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-200">Tháng {p.month}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{p.count} nhân viên · thực nhận {vnd(p.totalNet)} · chi phí DN {vnd(p.totalCost)}</div>
            </div>
            {canManage && p.status !== "paid" && (
              <button onClick={(e) => { e.stopPropagation(); del(p); }} className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PayrollDetailModal({ periodId, canManage, onClose, onChanged }: {
  periodId: string; canManage: boolean; onClose: () => void; onChanged: () => void;
}) {
  const detail = useApi<PayrollDetail>(`/api/hr/payroll/${periodId}`);
  const [busy, setBusy] = useState<string | null>(null);
  const d = detail.data;
  const items = d?.items ?? [];
  const sum = (k: keyof PayrollItemRow) => items.reduce((s, i) => s + (Number(i[k]) || 0), 0);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); detail.refresh(); onChanged(); }
    catch (e) { alert(e instanceof Error ? e.message : "Lỗi"); } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Calculator size={16} className="text-pink-400" /> Bảng lương {d ? `tháng ${d.month}` : ""}
            {d && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PAYROLL_CFG[d.status].cls}`}>{PAYROLL_CFG[d.status].label}</span>}
          </h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={16} /></button>
        </div>

        {canManage && d && (
          <div className="px-5 py-2.5 border-b border-slate-800 flex items-center gap-2 flex-wrap">
            {d.status === "draft" && (
              <button onClick={() => act("gen", () => apiSend(`/api/hr/payroll/${periodId}/generate`, "POST", {}))} disabled={busy !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg disabled:opacity-50">
                {busy === "gen" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Tính lương (từ NV đang làm)
              </button>
            )}
            {d.status === "draft" && items.length > 0 && (
              <button onClick={() => act("appr", () => apiSend(`/api/hr/payroll/${periodId}`, "PATCH", { status: "approved" }))} disabled={busy !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-white rounded-lg disabled:opacity-50">
                <Check size={13} /> Duyệt
              </button>
            )}
            {d.status === "approved" && (
              <button onClick={() => act("pay", () => apiSend(`/api/hr/payroll/${periodId}`, "PATCH", { status: "paid" }))} disabled={busy !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-50">
                <Wallet size={13} /> Xác nhận đã chi
              </button>
            )}
          </div>
        )}

        <div className="p-4 overflow-x-auto">
          {detail.loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-pink-500" /></div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">Chưa có dòng lương. Bấm <b>Tính lương</b> để sinh từ nhân viên đang làm việc.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800 text-right">
                  <th className="py-2 text-left">Nhân viên</th>
                  <th className="py-2">Gross</th><th>BHXH (NV)</th><th>Thuế TNCN</th><th>Thực nhận</th><th>Chi phí DN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {items.map((i) => (
                  <tr key={i.id} className="text-right text-slate-300">
                    <td className="py-1.5 text-left text-slate-200">{i.employee.fullName} <span className="text-slate-600">{i.employee.employeeCode}</span></td>
                    <td>{vnd(i.grossSalary)}</td>
                    <td className="text-amber-300">{vnd(i.insuranceEmployee)}</td>
                    <td className="text-amber-300">{vnd(i.pit)}</td>
                    <td className="text-emerald-300 font-medium">{vnd(i.netSalary)}</td>
                    <td className="text-slate-400">{vnd(i.companyCost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-right font-semibold text-white border-t border-slate-700">
                  <td className="py-2 text-left">Tổng ({items.length})</td>
                  <td>{vnd(sum("grossSalary"))}</td>
                  <td className="text-amber-300">{vnd(sum("insuranceEmployee"))}</td>
                  <td className="text-amber-300">{vnd(sum("pit"))}</td>
                  <td className="text-emerald-300">{vnd(sum("netSalary"))}</td>
                  <td className="text-slate-300">{vnd(sum("companyCost"))}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── UI primitives ─────────────────────────────────────────────────────────────

const inp = "w-full px-3 py-2 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500/40";

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`block space-y-1 ${className ?? ""}`}><span className="text-xs font-medium text-slate-300">{label}</span>{children}</label>;
}
function ErrBox({ msg }: { msg: string }) {
  return <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{msg}</div>;
}
function Empty({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
      <Icon size={30} className="mb-3 opacity-40" /><p className="text-sm">{text}</p>
    </div>
  );
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h2 className="text-base font-semibold text-white flex items-center gap-2"><KeyRound size={15} className="text-pink-400" /> {title}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
function ModalActions({ onClose, onSave, saving, disabled }: { onClose: () => void; onSave: () => void; saving: boolean; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-end gap-3 pt-4 mt-3 border-t border-slate-800">
      <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg disabled:opacity-50">Hủy</button>
      <button onClick={onSave} disabled={saving || disabled} className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-pink-600 hover:bg-pink-500 text-white rounded-lg disabled:opacity-50">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Lưu
      </button>
    </div>
  );
}
