"use client";

// src/app/(dashboard)/admin/company/company-client.tsx
// Form Cài đặt công ty — sửa tên & thông tin công ty của người đang đăng nhập.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Building2, Loader2, Check } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { apiFetch, apiSend } from "@/lib/api/client";

interface Company {
  id: string;
  name: string;
  taxCode: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  slug: string | null;
}

const inputCls =
  "w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 " +
  "focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/60 transition-all disabled:opacity-50";

export function CompanyClient() {
  const router = useRouter();
  const { update } = useSession();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName]       = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone]     = useState("");
  const [email, setEmail]     = useState("");
  const [website, setWebsite] = useState("");
  const [slug, setSlug]       = useState<string | null>(null);

  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    apiFetch<Company>("/api/admin/company")
      .then(({ data }) => {
        setName(data.name ?? "");
        setTaxCode(data.taxCode ?? "");
        setAddress(data.address ?? "");
        setPhone(data.phone ?? "");
        setEmail(data.email ?? "");
        setWebsite(data.website ?? "");
        setSlug(data.slug ?? null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Không tải được thông tin công ty"))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      try {
        const { data } = await apiSend<Company>("/api/admin/company", "PATCH", {
          name, taxCode, address, phone, email, website,
        });
        // Cập nhật companyName trong JWT/session ngay để lời chào & header đổi theo,
        // không phải đợi đăng nhập lại (JWT cache 24h).
        await update({ companyName: data.name });
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lưu thất bại, vui lòng thử lại");
      }
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        icon="Building2"
        title="Cài Đặt Công Ty"
        subtitle="Sửa tên và thông tin công ty"
        backHref="/admin"
      />

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-12 justify-center">
          <Loader2 size={16} className="animate-spin" /> Đang tải…
        </div>
      ) : loadError ? (
        <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {loadError}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs leading-relaxed">
              <span className="mt-0.5 flex-shrink-0">⚠</span>
              {error}
            </div>
          )}
          {saved && !error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
              <Check size={14} /> Đã lưu thay đổi.
            </div>
          )}

          {/* Tên công ty */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Tên công ty <span className="text-red-400">*</span>
            </label>
            <input
              type="text" required minLength={2} value={name}
              onChange={(e) => { setName(e.target.value); setSaved(false); }}
              placeholder="Công ty TNHH ABC"
              className={inputCls}
            />
          </div>

          {/* Mã số thuế */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Mã số thuế <span className="text-red-400">*</span>
            </label>
            <input
              type="text" required value={taxCode}
              onChange={(e) => { setTaxCode(e.target.value); setSaved(false); }}
              placeholder="0312345678"
              className={inputCls}
            />
          </div>

          {/* Địa chỉ */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Địa chỉ</label>
            <input
              type="text" value={address}
              onChange={(e) => { setAddress(e.target.value); setSaved(false); }}
              placeholder="Số nhà, đường, quận/huyện, tỉnh/thành"
              className={inputCls}
            />
          </div>

          {/* 2 cột: SĐT + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Số điện thoại</label>
              <input
                type="tel" value={phone}
                onChange={(e) => { setPhone(e.target.value); setSaved(false); }}
                placeholder="028 1234 5678"
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Email</label>
              <input
                type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setSaved(false); }}
                placeholder="lienhe@congty.com"
                className={inputCls}
              />
            </div>
          </div>

          {/* Website */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">Website</label>
            <input
              type="text" value={website}
              onChange={(e) => { setWebsite(e.target.value); setSaved(false); }}
              placeholder="https://congty.com"
              className={inputCls}
            />
          </div>

          {/* Slug (chỉ đọc) */}
          {slug && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Định danh (slug)</label>
              <input type="text" value={slug} disabled className={inputCls} />
              <p className="text-[11px] text-slate-500">Định danh URL — không đổi tại đây vì ảnh hưởng đường dẫn & đăng nhập.</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <><Loader2 size={14} className="animate-spin" /> Đang lưu…</>
              ) : (
                <><Building2 size={14} /> Lưu thay đổi</>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
