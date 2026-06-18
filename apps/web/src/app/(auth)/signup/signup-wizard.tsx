"use client";

// src/app/(auth)/signup/signup-wizard.tsx
// Wizard đăng ký dùng thử (Phase 2): tài khoản → công ty/subdomain → mô hình tổ chức
// → module → xác nhận. Submit → POST /api/signup → tự đăng nhập → /redirect.

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Loader2, Eye, EyeOff, Check, ChevronLeft, ChevronRight,
  User, Building2, Network, LayoutGrid, CheckCircle2,
} from "lucide-react";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "example.com";

const BUSINESS_TYPES = [
  "Công ty TNHH MTV", "Công ty TNHH 2TV+", "Công ty Cổ phần",
  "Doanh nghiệp tư nhân", "Công ty Hợp danh", "Hộ kinh doanh",
];

const DEPARTMENTS: { key: "accounting" | "sales" | "hr"; name: string }[] = [
  { key: "accounting", name: "Phòng Kế toán" },
  { key: "sales", name: "Phòng Kinh doanh" },
  { key: "hr", name: "Phòng Nhân sự" },
];

const OPTIONAL_MODULES: { key: string; name: string }[] = [
  { key: "gl", name: "Kế toán - Sổ cái" },
  { key: "invoice", name: "Hóa đơn" },
  { key: "ar", name: "Công nợ phải thu" },
  { key: "ap", name: "Công nợ phải trả" },
  { key: "cash", name: "Dòng tiền" },
  { key: "sales", name: "Bán hàng" },
  { key: "inventory", name: "Kho" },
  { key: "hr", name: "Nhân sự" },
  { key: "assets", name: "Tài sản" },
  { key: "tax", name: "Thuế" },
  { key: "reports", name: "Báo cáo" },
  { key: "contracts", name: "Hợp đồng" },
  { key: "ai-agents", name: "AI Agent" },
];

const STEPS = [
  { n: 1, label: "Tài khoản", icon: User },
  { n: 2, label: "Công ty", icon: Building2 },
  { n: 3, label: "Tổ chức", icon: Network },
  { n: 4, label: "Module", icon: LayoutGrid },
  { n: 5, label: "Xác nhận", icon: CheckCircle2 },
];

function slugify(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

const inputCls =
  "w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-700/60 border border-slate-600/60 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 transition-all";

export function SignupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpMsg, setOtpMsg] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [businessType, setBusinessType] = useState(BUSINESS_TYPES[0]);

  const [hasBoard, setHasBoard] = useState(false);
  const [boardMembers, setBoardMembers] = useState(false);
  const [ceo, setCeo] = useState(true);
  const [cfo, setCfo] = useState(false);
  const [cto, setCto] = useState(false);
  const [departments, setDepartments] = useState<string[]>(["accounting"]);
  const [modules, setModules] = useState<string[]>(["gl", "reports"]);

  const effectiveSlug = slugEdited ? slug : slugify(companyName);
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function requestOtp() {
    setOtpBusy(true); setOtpMsg(null);
    try {
      const res = await fetch("/api/signup/request-otp", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) { setOtpMsg(json?.error?.message ?? "Không gửi được mã"); return; }
      setOtpSent(true);
      setOtpMsg(json?.data?.sent === false ? "Chế độ dev — xem mã ở log API." : "Đã gửi mã 6 số tới email của bạn.");
    } catch { setOtpMsg("Lỗi kết nối"); }
    finally { setOtpBusy(false); }
  }

  async function verifyOtpFn() {
    setOtpBusy(true); setOtpMsg(null);
    try {
      const res = await fetch("/api/signup/verify-otp", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, otp }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) { setOtpMsg(json?.error?.message ?? "Mã không đúng"); return; }
      setOtpVerified(true); setOtpMsg(null);
    } catch { setOtpMsg("Lỗi kết nối"); }
    finally { setOtpBusy(false); }
  }

  const canNext =
    step === 1 ? fullName.trim().length >= 2 && emailValid && password.length >= 6 && otpVerified :
    step === 2 ? companyName.trim().length >= 2 && /^[a-z0-9-]{2,40}$/.test(effectiveSlug) :
    step === 3 ? (hasBoard || ceo) :
    true;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName, email, password, companyName,
          slug: effectiveSlug, businessType,
          org: { hasBoard, boardMembers, ceo, cfo, cto, departments },
          modules,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) {
        setError(json?.error?.message ?? "Đăng ký thất bại, vui lòng thử lại");
        setBusy(false);
        return;
      }
      // Tự đăng nhập
      const r = await signIn("credentials", { email, password, companySlug: "", redirect: false });
      if (r?.error) { router.push("/login"); return; }
      router.push("/redirect");
      router.refresh();
    } catch {
      setError("Lỗi kết nối, vui lòng thử lại");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <div className="flex items-center justify-between">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = step > s.n;
          const active = step === s.n;
          return (
            <div key={s.n} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                  done ? "bg-cyan-600 text-white" : active ? "bg-cyan-600/20 border border-cyan-500 text-cyan-300" : "bg-slate-700/60 text-slate-500"}`}>
                  {done ? <Check size={14} /> : <Icon size={14} />}
                </div>
                <span className={`text-[10px] ${active ? "text-cyan-300" : "text-slate-500"}`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-1 ${done ? "bg-cyan-600" : "bg-slate-700"}`} />}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">⚠ {error}</div>
      )}

      {/* Step 1: Tài khoản */}
      {step === 1 && (
        <div className="space-y-3">
          <Field label="Họ và tên">
            <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" />
          </Field>
          <Field label="Email">
            <input className={inputCls} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setOtpSent(false); setOtpVerified(false); setOtp(""); setOtpMsg(null); }} placeholder="ban@congty.com" />
          </Field>
          <Field label="Mật khẩu (tối thiểu 6 ký tự)">
            <div className="relative">
              <input className={inputCls + " pr-10"} type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              <button type="button" tabIndex={-1} onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>

          {/* OTP xác minh email */}
          <Field label="Xác minh email (OTP)">
            {otpVerified ? (
              <div className="flex items-center gap-2 text-sm text-emerald-400"><Check size={15} /> Email đã xác minh</div>
            ) : !otpSent ? (
              <button type="button" disabled={!emailValid || otpBusy} onClick={requestOtp}
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white flex items-center justify-center gap-2">
                {otpBusy ? <><Loader2 size={14} className="animate-spin" /> Đang gửi...</> : "Gửi mã xác nhận tới email"}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input className={inputCls} value={otp} inputMode="numeric"
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Nhập mã 6 số" />
                <button type="button" disabled={otp.length < 6 || otpBusy} onClick={verifyOtpFn}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white whitespace-nowrap">
                  Xác minh
                </button>
              </div>
            )}
            {otpSent && !otpVerified && (
              <button type="button" onClick={requestOtp} disabled={otpBusy} className="text-xs text-cyan-400 hover:text-cyan-300 mt-1 block">Gửi lại mã</button>
            )}
            {otpMsg && <p className="text-xs text-slate-400 mt-1">{otpMsg}</p>}
          </Field>
        </div>
      )}

      {/* Step 2: Công ty */}
      {step === 2 && (
        <div className="space-y-3">
          <Field label="Tên công ty">
            <input className={inputCls} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Công ty TNHH ABC" />
          </Field>
          <Field label="Địa chỉ truy cập (subdomain)">
            <div className="flex items-center gap-1.5">
              <input className={inputCls} value={effectiveSlug}
                onChange={(e) => { setSlugEdited(true); setSlug(slugify(e.target.value)); }} placeholder="abc" />
              <span className="text-xs text-slate-500 whitespace-nowrap">.{ROOT_DOMAIN}</span>
            </div>
          </Field>
          <Field label="Loại hình doanh nghiệp">
            <select className={inputCls} value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
              {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
      )}

      {/* Step 3: Mô hình tổ chức */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-300">Mô hình lãnh đạo</p>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={hasBoard} onChange={(e) => setHasBoard(e.target.checked)} className="accent-cyan-500" />
              Có Hội đồng quản trị (HĐQT) → bắt buộc <b className="text-cyan-300">Chủ tịch HĐQT</b>
            </label>
            {hasBoard && (
              <label className="flex items-center gap-2 text-sm text-slate-400 ml-6">
                <input type="checkbox" checked={boardMembers} onChange={(e) => setBoardMembers(e.target.checked)} className="accent-cyan-500" />
                Thêm Thành viên HĐQT
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={ceo || !hasBoard} disabled={!hasBoard} onChange={(e) => setCeo(e.target.checked)} className="accent-cyan-500" />
              Tổng Giám Đốc (CEO){!hasBoard && <span className="text-[10px] text-slate-500">— bắt buộc khi không có HĐQT</span>}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={cfo} onChange={(e) => setCfo(e.target.checked)} className="accent-cyan-500" /> Giám Đốc Tài Chính (CFO)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={cto} onChange={(e) => setCto(e.target.checked)} className="accent-cyan-500" /> Giám Đốc Công Nghệ (CTO)
            </label>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-300">Phòng ban</p>
            {DEPARTMENTS.map((d) => (
              <label key={d.key} className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={departments.includes(d.key)} onChange={() => toggle(departments, d.key, setDepartments)} className="accent-cyan-500" />
                {d.name}
              </label>
            ))}
            <div className="flex items-center gap-2 text-sm text-emerald-400/90 mt-1">
              <Check size={14} /> Phòng Hành chính Tổng hợp <span className="text-[10px] text-slate-500">— luôn có (nhận việc không giao được cho ai)</span>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Module */}
      {step === 4 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/15 border border-emerald-600/30 text-emerald-300 text-xs">
              <Check size={12} /> Quản Lý Công Việc
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/15 border border-emerald-600/30 text-emerald-300 text-xs">
              <Check size={12} /> Tài Liệu
            </span>
            <span className="text-[10px] text-slate-500 self-center">— mặc định, luôn bật</span>
          </div>
          <p className="text-xs font-medium text-slate-300 pt-1">Bật thêm module</p>
          <div className="grid grid-cols-2 gap-1.5">
            {OPTIONAL_MODULES.map((m) => (
              <label key={m.key} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm border cursor-pointer transition-colors ${
                modules.includes(m.key) ? "bg-cyan-600/15 border-cyan-600/40 text-cyan-200" : "border-slate-700 text-slate-400 hover:border-slate-600"}`}>
                <input type="checkbox" checked={modules.includes(m.key)} onChange={() => toggle(modules, m.key, setModules)} className="accent-cyan-500" />
                {m.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Step 5: Xác nhận */}
      {step === 5 && (
        <div className="space-y-2 text-sm">
          <Row k="Quản trị viên" v={`${fullName} · ${email}`} />
          <Row k="Công ty" v={companyName} />
          <Row k="Truy cập" v={`${effectiveSlug}.${ROOT_DOMAIN}`} />
          <Row k="Loại hình" v={businessType ?? "—"} />
          <Row k="Lãnh đạo" v={[hasBoard && "Chủ tịch HĐQT", hasBoard && boardMembers && "TV HĐQT", (ceo || !hasBoard) && "CEO", cfo && "CFO", cto && "CTO"].filter(Boolean).join(", ")} />
          <Row k="Phòng ban" v={[...departments.map((d) => DEPARTMENTS.find((x) => x.key === d)?.name), "Hành chính Tổng hợp"].filter(Boolean).join(", ")} />
          <Row k="Module thêm" v={modules.length ? modules.join(", ") : "—"} />
          <p className="text-[11px] text-slate-500 pt-2">Nhấn "Tạo công ty" để khởi tạo cấu hình và vào trang quản trị.</p>
        </div>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between pt-2">
        <button type="button" disabled={step === 1 || busy} onClick={() => setStep((s) => s - 1)}
          className="flex items-center gap-1 px-3 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-0">
          <ChevronLeft size={15} /> Quay lại
        </button>
        {step < 5 ? (
          <button type="button" disabled={!canNext} onClick={() => setStep((s) => s + 1)}
            className="flex items-center gap-1 px-5 py-2.5 text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg transition-all">
            Tiếp tục <ChevronRight size={15} />
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={submit}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg transition-all">
            {busy ? <><Loader2 size={15} className="animate-spin" /> Đang tạo...</> : "Tạo công ty"}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-300">{label}</label>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start gap-3 py-1 border-b border-slate-700/40">
      <span className="text-slate-500 w-28 flex-shrink-0">{k}</span>
      <span className="text-slate-200 flex-1">{v || "—"}</span>
    </div>
  );
}
