"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  CalendarRange,
  CheckCircle2,
} from "lucide-react";
import {
  BudgetGroup,
  BudgetItem,
  Locale,
  MonthlyRecord,
  ViewMode,
} from "@/lib/types";
import { formatCurrency, SHORT_MONTH_NAMES } from "@/lib/i18n";
import { computeMonthlyBudget } from "@/lib/budget-engine";

interface AnnualMatrixViewProps {
  groups: BudgetGroup[];
  items: BudgetItem[];
  records: MonthlyRecord[];
  activeYearMonth: string;
  viewMode: ViewMode;
  currency: string;
  locale: Locale;
  onChangeViewMode: (mode: ViewMode) => void;
  onSelectMonthCell: (yearMonth: string, itemId?: string) => void;
}

export function AnnualMatrixView({
  groups,
  items,
  records,
  activeYearMonth,
  viewMode,
  currency,
  locale,
  onChangeViewMode,
  onSelectMonthCell,
}: AnnualMatrixViewProps) {
  const initialYear = parseInt(activeYearMonth.split("-")[0] || "2026", 10);
  const [year, setYear] = useState<number>(initialYear);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const shortMonths = SHORT_MONTH_NAMES[locale];
  const monthKeys = useMemo(
    () =>
      Array.from({ length: 12 }, (_, idx) => {
        const m = String(idx + 1).padStart(2, "0");
        return `${year}-${m}`;
      }),
    [year]
  );

  // Compute all 12 months for the selected year
  const monthlyData = useMemo(() => {
    return monthKeys.map((ym) => {
      const computed = computeMonthlyBudget(
        groups,
        items,
        records,
        ym,
        viewMode,
        locale
      );
      const byItemId = new Map(computed.map((c) => [c.item.id, c]));

      let income = 0;
      let expense = 0;
      let savings = 0;

      for (const c of computed) {
        if (c.group.kind === "income") income += c.effectiveAmount;
        else if (c.group.kind === "expense") expense += c.effectiveAmount;
        else if (c.group.kind === "savings") savings += c.effectiveAmount;
      }

      return {
        yearMonth: ym,
        byItemId,
        income,
        expense,
        savings,
        net: income - expense - savings,
      };
    });
  }, [groups, items, records, monthKeys, viewMode, locale]);

  const annualTotals = useMemo(() => {
    return monthlyData.reduce(
      (acc, m) => ({
        income: acc.income + m.income,
        expense: acc.expense + m.expense,
        savings: acc.savings + m.savings,
        net: acc.net + m.net,
      }),
      { income: 0, expense: 0, savings: 0, net: 0 }
    );
  }, [monthlyData]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const formatCompact = (val: number) => {
    const rounded = Math.round(val);
    if (rounded === 0) return "·";
    return new Intl.NumberFormat(locale === "sv" ? "sv-SE" : "en-US", {
      maximumFractionDigits: 0,
    }).format(rounded);
  };

  return (
    <main className="space-y-4 pb-28">
      {/* Header & Year Selector */}
      <div className="rounded-3xl border border-[#282825] bg-white p-4 shadow-editorial">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-[#057b40]" />
            <div>
              <h2 className="font-serif text-2xl leading-none text-[#282825]">
                {locale === "sv"
                  ? `Årsöversikt ${year}`
                  : `Annual Matrix ${year}`}
              </h2>
              <p className="mt-0.5 text-[11px] text-[#64645e]">
                {locale === "sv"
                  ? "12-månaders matris (Jan–Dec). Tryck på en ruta för att öppna månaden."
                  : "12-month matrix (Jan–Dec). Tap any cell to open that month."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-[#282825] bg-[#f4f4f2] px-2 py-1">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="rounded-full p-1 hover:bg-white transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-serif text-lg px-2 text-[#282825]">
              {year}
            </span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              className="rounded-full p-1 hover:bg-white transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Cashflow vs Accrual Toggle */}
        <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-full bg-[#ecece9] p-1 border border-[#c5c5ba]">
          <button
            type="button"
            onClick={() => onChangeViewMode("cashflow")}
            className={`rounded-full py-1.5 px-3 text-xs font-semibold transition ${
              viewMode === "cashflow"
                ? "bg-[#0c0d0d] text-white"
                : "text-[#64645e] hover:text-[#282825]"
            }`}
          >
            {locale === "sv"
              ? "Betalningsmånad (Kassaflöde)"
              : "Payment Month (Cashflow)"}
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode("accrual")}
            className={`rounded-full py-1.5 px-3 text-xs font-semibold transition ${
              viewMode === "accrual"
                ? "bg-[#0c0d0d] text-white"
                : "text-[#64645e] hover:text-[#282825]"
            }`}
          >
            {locale === "sv"
              ? "Månadssnitt (Periodiserad)"
              : "Monthly Average (Accrual)"}
          </button>
        </div>

        {/* Full-Year KPI Strip */}
        <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-2xl bg-[#e7f4eb] p-2.5 border border-[#b5e3c4]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#057b40]">
              {locale === "sv" ? "Årsinkomst" : "Annual Income"}
            </div>
            <div className="mt-0.5 font-serif text-base text-[#282825]">
              {formatCurrency(annualTotals.income, currency, locale)}
            </div>
          </div>

          <div className="rounded-2xl bg-[#fdeee0] p-2.5 border border-[#faca9e]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#b85d10]">
              {locale === "sv" ? "Årsutgifter" : "Annual Expenses"}
            </div>
            <div className="mt-0.5 font-serif text-base text-[#282825]">
              {formatCurrency(annualTotals.expense, currency, locale)}
            </div>
          </div>

          <div className="rounded-2xl bg-[#f6e6fc] p-2.5 border border-[#edc6fb]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#7a2899]">
              {locale === "sv" ? "Årssparande" : "Annual Savings"}
            </div>
            <div className="mt-0.5 font-serif text-base text-[#282825]">
              {formatCurrency(annualTotals.savings, currency, locale)}
            </div>
          </div>

          <div className="rounded-2xl bg-[#e1edfe] p-2.5 border border-[#b8d5ff]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#2173be]">
              {locale === "sv" ? "Årsnetto (Kvar)" : "Annual Net"}
            </div>
            <div
              className={`mt-0.5 font-serif text-base ${
                annualTotals.net >= 0 ? "text-[#057b40]" : "text-[#b81a14]"
              }`}
            >
              {formatCurrency(annualTotals.net, currency, locale)}
            </div>
          </div>
        </div>
      </div>

      {/* 12-Column Scrollable Editorial Spreadsheet */}
      <div className="rounded-3xl border border-[#282825] bg-white overflow-hidden shadow-editorial">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#282825] bg-[#f4f4f2]">
                <th className="sticky left-0 z-20 min-w-[150px] max-w-[180px] border-r border-[#c5c5ba] bg-[#f4f4f2] px-3 py-2.5 font-serif text-sm font-normal text-[#282825]">
                  {locale === "sv" ? "Grupp / Post" : "Group / Item"}
                </th>
                {monthKeys.map((ym, mIdx) => {
                  const isCurrent = ym === activeYearMonth;
                  return (
                    <th
                      key={ym}
                      onClick={() => onSelectMonthCell(ym)}
                      className={`min-w-[66px] cursor-pointer px-2 py-2.5 text-right font-mono text-[11px] font-bold transition hover:bg-[#e7f4eb] ${
                        isCurrent
                          ? "bg-[#ffe81a]/50 text-[#282825] underline"
                          : "text-[#64645e]"
                      }`}
                    >
                      {shortMonths[mIdx]}
                    </th>
                  );
                })}
                <th className="min-w-[82px] border-l border-[#c5c5ba] bg-[#ecece9] px-2.5 py-2.5 text-right font-mono text-[11px] font-bold text-[#282825]">
                  {locale === "sv" ? "Helår" : "Total"}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#ecece9]">
              {groups.map((group) => {
                const groupItems = items.filter(
                  (i) => i.is_active && i.group_id === group.id
                );
                if (groupItems.length === 0) return null;
                const isCollapsed = Boolean(collapsedGroups[group.id]);

                const groupMonthTotals = monthlyData.map((m) =>
                  groupItems.reduce((sum, it) => {
                    const comp = m.byItemId.get(it.id);
                    return sum + (comp ? comp.effectiveAmount : 0);
                  }, 0)
                );
                const groupYearTotal = groupMonthTotals.reduce(
                  (a, b) => a + b,
                  0
                );

                return (
                  <React.Fragment key={group.id}>
                    {/* Group Header Row */}
                    <tr
                      onClick={() => toggleGroup(group.id)}
                      className="cursor-pointer bg-[#f8f8f7] hover:bg-[#ecece9] transition font-semibold"
                    >
                      <td className="sticky left-0 z-10 border-r border-[#c5c5ba] bg-[#f8f8f7] px-3 py-2 text-[#282825]">
                        <div className="flex items-start gap-1.5">
                          {isCollapsed ? (
                            <ChevronRightIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#64645e]" />
                          ) : (
                            <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#64645e]" />
                          )}
                          <span className="font-serif text-sm leading-snug break-words whitespace-normal">
                            {group.name}
                          </span>
                        </div>
                      </td>
                      {groupMonthTotals.map((tot, idx) => (
                        <td
                          key={monthKeys[idx]}
                          className={`px-2 py-2 text-right font-mono text-[11px] text-[#282825] ${
                            monthKeys[idx] === activeYearMonth
                              ? "bg-[#ffe81a]/20"
                              : ""
                          }`}
                        >
                          {formatCompact(tot)}
                        </td>
                      ))}
                      <td className="border-l border-[#c5c5ba] bg-[#ecece9]/70 px-2.5 py-2 text-right font-mono text-[11px] font-bold text-[#282825]">
                        {formatCompact(groupYearTotal)}
                      </td>
                    </tr>

                    {/* Item Rows */}
                    {!isCollapsed &&
                      groupItems.map((item) => {
                        const itemMonthCells = monthlyData.map((m) =>
                          m.byItemId.get(item.id)
                        );
                        const itemYearTotal = itemMonthCells.reduce(
                          (s, c) => s + (c ? c.effectiveAmount : 0),
                          0
                        );
                        if (
                          item.recurrence_interval_months === 0 &&
                          itemYearTotal === 0
                        ) {
                          return null;
                        }

                        return (
                          <tr
                            key={item.id}
                            className="hover:bg-[#f8f8f7] transition"
                          >
                            <td className="sticky left-0 z-10 border-r border-[#c5c5ba] bg-white px-3 py-2 pl-5 text-[11px] font-medium text-[#282825]">
                              <div className="leading-snug break-words whitespace-normal max-w-[155px]">
                                {item.name}
                              </div>
                            </td>
                            {itemMonthCells.map((cell, mIdx) => {
                              const ym = monthKeys[mIdx];
                              const val = cell ? cell.effectiveAmount : 0;
                              const isConfirmed =
                                cell?.record?.status === "confirmed";
                              const isActiveCol = ym === activeYearMonth;

                              return (
                                <td
                                  key={ym}
                                  onClick={() => onSelectMonthCell(ym, item.id)}
                                  className={`cursor-pointer px-2 py-2 text-right font-mono text-[11px] transition hover:bg-[#e7f4eb] ${
                                    isActiveCol ? "bg-[#ffe81a]/15" : ""
                                  } ${
                                    isConfirmed
                                      ? "font-bold text-[#057b40]"
                                      : val > 0
                                      ? "text-[#282825]"
                                      : "text-[#c5c5ba]"
                                  }`}
                                  title={`${item.name} (${ym})`}
                                >
                                  <span className="inline-flex items-center justify-end gap-0.5">
                                    {isConfirmed && (
                                      <CheckCircle2 className="h-2.5 w-2.5 text-[#057b40] shrink-0" />
                                    )}
                                    <span>{formatCompact(val)}</span>
                                  </span>
                                </td>
                              );
                            })}
                            <td className="border-l border-[#c5c5ba] bg-[#f8f8f7] px-2.5 py-2 text-right font-mono text-[11px] font-semibold text-[#282825]">
                              {formatCompact(itemYearTotal)}
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </tbody>

            {/* Annual Matrix Bottom Totals Footer */}
            <tfoot className="border-t-2 border-[#282825] bg-[#f4f4f2] font-mono text-[11px]">
              <tr>
                <td className="sticky left-0 z-10 border-r border-[#c5c5ba] bg-[#e7f4eb] px-3 py-2 font-sans text-xs font-bold text-[#057b40]">
                  {locale === "sv" ? "Summa Inkomst" : "Total Income"}
                </td>
                {monthlyData.map((m) => (
                  <td
                    key={m.yearMonth}
                    className="bg-[#e7f4eb]/60 px-2 py-2 text-right font-bold text-[#057b40]"
                  >
                    {formatCompact(m.income)}
                  </td>
                ))}
                <td className="border-l border-[#c5c5ba] bg-[#e7f4eb] px-2.5 py-2 text-right font-bold text-[#057b40]">
                  {formatCompact(annualTotals.income)}
                </td>
              </tr>

              <tr>
                <td className="sticky left-0 z-10 border-r border-[#c5c5ba] bg-[#fdeee0] px-3 py-2 font-sans text-xs font-bold text-[#b85d10]">
                  {locale === "sv" ? "Summa Utgifter" : "Total Expenses"}
                </td>
                {monthlyData.map((m) => (
                  <td
                    key={m.yearMonth}
                    className="bg-[#fdeee0]/60 px-2 py-2 text-right font-bold text-[#b85d10]"
                  >
                    {formatCompact(m.expense)}
                  </td>
                ))}
                <td className="border-l border-[#c5c5ba] bg-[#fdeee0] px-2.5 py-2 text-right font-bold text-[#b85d10]">
                  {formatCompact(annualTotals.expense)}
                </td>
              </tr>

              <tr>
                <td className="sticky left-0 z-10 border-r border-[#c5c5ba] bg-[#f6e6fc] px-3 py-2 font-sans text-xs font-bold text-[#7a2899]">
                  {locale === "sv" ? "Summa Sparande" : "Total Savings"}
                </td>
                {monthlyData.map((m) => (
                  <td
                    key={m.yearMonth}
                    className="bg-[#f6e6fc]/60 px-2 py-2 text-right font-bold text-[#7a2899]"
                  >
                    {formatCompact(m.savings)}
                  </td>
                ))}
                <td className="border-l border-[#c5c5ba] bg-[#f6e6fc] px-2.5 py-2 text-right font-bold text-[#7a2899]">
                  {formatCompact(annualTotals.savings)}
                </td>
              </tr>

              <tr className="border-t border-[#282825]">
                <td className="sticky left-0 z-10 border-r border-[#c5c5ba] bg-white px-3 py-2.5 font-sans text-xs font-bold text-[#282825]">
                  {locale === "sv" ? "Netto / Kvar" : "Net Left"}
                </td>
                {monthlyData.map((m) => (
                  <td
                    key={m.yearMonth}
                    onClick={() => onSelectMonthCell(m.yearMonth)}
                    className={`cursor-pointer px-2 py-2.5 text-right font-bold ${
                      m.net >= 0
                        ? "bg-white text-[#057b40]"
                        : "bg-[#fdeeed] text-[#b81a14]"
                    }`}
                  >
                    {formatCompact(m.net)}
                  </td>
                ))}
                <td
                  className={`border-l border-[#c5c5ba] px-2.5 py-2.5 text-right font-bold ${
                    annualTotals.net >= 0
                      ? "bg-[#e7f4eb] text-[#057b40]"
                      : "bg-[#fdeeed] text-[#b81a14]"
                  }`}
                >
                  {formatCompact(annualTotals.net)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </main>
  );
}
