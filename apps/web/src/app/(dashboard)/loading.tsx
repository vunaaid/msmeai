// src/app/(dashboard)/loading.tsx
// Hiển thị spinner khi chuyển trang trong dashboard

export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-cyan-500 rounded-full animate-spin" />
        <p className="text-sm text-slate-500">Đang tải...</p>
      </div>
    </div>
  );
}
