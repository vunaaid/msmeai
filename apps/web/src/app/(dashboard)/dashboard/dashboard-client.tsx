"use client";

// src/app/(dashboard)/dashboard/dashboard-client.tsx
// Lưới widget — render theo danh sách key đã quyết định ở server (resolveWidgets).
// Các widget tài chính dùng FinanceProvider để chia sẻ 1 lần gọi báo cáo.

import { Fragment, type ReactNode } from "react";
import type { WidgetKey } from "@/lib/dashboard/widgets";
import {
  MyTasksWidget, MySubmittedWidget, DelegatedWidget, ProjectsWidget,
  RecurringWidget, NotificationsWidget, AiApprovalsWidget,
} from "./_widgets/work";
import {
  FinanceProvider, FinanceSnapshotWidget, BalanceSheetWidget, CashPositionWidget,
  ProfitTrendWidget, ExpensePieWidget, PendingGlWidget, GlHealthWidget,
} from "./_widgets/finance";

// Widget cần báo cáo tài chính chung (FinanceProvider).
const NEEDS_FINANCE = new Set<WidgetKey>(["financeSnapshot", "balanceSheet", "cashPosition", "glHealth", "expensePie"]);

function renderWidget(key: WidgetKey, year: number): ReactNode {
  switch (key) {
    case "financeSnapshot": return <FinanceSnapshotWidget />;
    case "balanceSheet":    return <BalanceSheetWidget />;
    case "cashPosition":    return <CashPositionWidget />;
    case "profitTrend":     return <ProfitTrendWidget year={year} />;
    case "expensePie":      return <ExpensePieWidget />;
    case "pendingGl":       return <PendingGlWidget />;
    case "glHealth":        return <GlHealthWidget />;
    case "aiApprovals":     return <AiApprovalsWidget />;
    case "myTasks":         return <MyTasksWidget />;
    case "mySubmitted":     return <MySubmittedWidget />;
    case "delegated":       return <DelegatedWidget />;
    case "projects":        return <ProjectsWidget />;
    case "recurring":       return <RecurringWidget />;
    case "notifications":   return <NotificationsWidget />;
    default:                return null;
  }
}

export function DashboardClient({ widgets, year }: { widgets: WidgetKey[]; year: number }) {
  const hasFinance = widgets.some((k) => NEEDS_FINANCE.has(k));

  const grid = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {widgets.map((k) => (
        <Fragment key={k}>{renderWidget(k, year)}</Fragment>
      ))}
    </div>
  );

  return hasFinance ? <FinanceProvider year={year}>{grid}</FinanceProvider> : grid;
}
