"use client";

import React, { useState, useMemo } from "react";
import {
  TrendingDown,
  TrendingUp,
  CalendarClock,
  PiggyBank,
  CheckCircle2,
  Download,
  Copy,
  Check,
  Users,
  Target,
  BarChart3,
} from "lucide-react";
import {
  BudgetGroup,
  BudgetItem,
  ComputedItemMonth,
  Household,
  Locale,
  MonthlyRecord,
  ViewMode,
} from "@/lib/types";
import {
  MONTH_NAMES,
  formatCurrency,
  getRecurrenceLabel,
  translations,
} from "@/lib/i18n";
import {
  computeMultiMonthTrends,
  generateMonthlyCsv,
  generateMonthlyTextSummary,
  getNextPaymentMonth,
} from "@/lib/budget-engine";

interface InsightsViewProps {
  household: Household;
  groups: BudgetGroup[];
  items: BudgetItem[];
  records: MonthlyRecord[];
  computedItems: ComputedItemMonth[];
  yearMonth: string;
  viewMode: ViewMode;
  currency: string;
  locale: Locale;
}

export function InsightsView({
  household,
  groups,
  items,
  records,
  computedItems,
  yearMonth,
  viewMode,
  currency,
  locale,
}: InsightsViewProps) {
  const t = translations[locale];
  const [, mStr] = yearMonth.split("-");
  const currentMonth = parseInt(mStr || "1", 10);

  const [trendRange, setTrendRange] = useState<6 | 12>(6);
  const [trendItemFilter, setTrendItemFilter] = useState<string>("all");
  const [copiedSummary, setCopiedSummary] = useState(false);

  const expenseGroups = groups.filter((g) => g.kind === "expense");

  // 1. Multi-month trend chart data
  const trendPoints = useMemo(
    () =>
      computeMultiMonthTrends(
        groups,
        items,
        records,
        yearMonth,
        trendRange,
        viewMode,
        locale,
        trendItemFilter === "all" ? undefined : trendItemFilter
      ),
    [
      groups,
      items,
      records,
      yearMonth,
      trendRange,
      viewMode,
      locale,
      trendItemFilter,
    ]
  );

  const maxTrendVal = Math.max(
    1,
    ...trendPoints.map((p) => Math.max(p.expenses, p.expectedExpenses))
  );

  // 2. Savings Goals & Sinking Funds
  const goalItems = computedItems.filter(
    (c) => c.item.target_amount && c.item.target_amount > 0
  );

  // 3. Partner Split Calculation
  const partnerSplitSummary = useMemo(() => {
    const pAName = household.partner_a_name || "Partner A";
    const pBName = household.partner_b_name || "Partner B";
    const incA = Number(household.partner_a_income ?? 25000);
    const incB = Number(household.partner_b_income ?? 25000);
    const totalInc = Math.max(1, incA + incB);
    const ratioA =
      household.split_mode === "equal" ? 0.5 : incA / totalInc;
    const ratioB = 1 - ratioA;

    let sharedTotal = 0;
    let personalA = 0;
    let personalB = 0;

    for (const c of computedItems) {
      if (c.group.kind === "income") continue;
      const split = c.item.cost_split || "shared";
      if (split === "personal_a") personalA += c.effectiveAmount;
      else if (split === "personal_b") personalB += c.effectiveAmount;
      else sharedTotal += c.effectiveAmount;
    }

    return {
      pAName,
      pBName,
      ratioAPct: Math.round(ratioA * 100),
      ratioBPct: Math.round(ratioB * 100),
      sharedTotal,
      shareA: sharedTotal * ratioA,
      shareB: sharedTotal * ratioB,
      personalA,
      personalB,
    };
  }, [household, computedItems]);

  // 4. Non-monthly rare bills
  const rareBills = computedItems.filter(
    (c) => c.item.recurrence_interval_months > 1
  );
  const totalMonthlyReserve = rareBills.reduce(
    (sum, c) =>
      sum + c.item.expected_amount / (c.item.recurrence_interval_months || 1),
    0
  );

  // 5. Largest deviations
  const confirmedWithVariance = computedItems
    .filter(
      (c) =>
        c.displayedActual !== null &&
        c.group.kind === "expense" &&
        Math.round(c.displayedActual - c.displayedExpected) !== 0
    )
    .sort(
      (a, b) =>
        Math.abs((b.displayedActual ?? 0) - b.displayedExpected) -
        Math.abs((a.displayedActual ?? 0) - a.displayedExpected)
    );

  const handleDownloadCsv = () => {
    const csvContent = generateMonthlyCsv(computedItems, yearMonth, currency);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `bdgt-${yearMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopySummary = () => {
    const text = generateMonthlyTextSummary(
      computedItems,
      yearMonth,
      currency,
      locale
    );
    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  return (
    <div className="space-y-5 pb-28">
      {/* Header + Export & Copy Summary Actions */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-serif text-3xl text-[#282825]">
            {t.insights.title}
          </h2>
          <p className="text-xs font-medium text-[#64645e] mt-0.5">
            {t.insights.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopySummary}
            className="inline-flex items-center gap-1 rounded-full border border-[#282825] bg-white px-3 py-1.5 text-xs font-semibold text-[#282825] hover:bg-[#ecece9]"
          >
            {copiedSummary ? (
              <Check className="h-3.5 w-3.5 text-[#057b40]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{locale === "sv" ? "Kopiera" : "Copy"}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1 rounded-full bg-[#0c0d0d] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#282825]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* 6- & 12-Month Trend History Chart */}
      <div className="rounded-3xl border border-[#282825] bg-white p-4.5 shadow-editorial space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-serif text-xl text-[#282825]">
            <BarChart3 className="h-4 w-4 text-[#2173be]" />
            <span>
              {locale === "sv" ? "Historik & Trender" : "Trend History"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <select
              value={trendItemFilter}
              onChange={(e) => setTrendItemFilter(e.target.value)}
              className="rounded-full border border-[#c5c5ba] bg-[#f8f8f7] px-3 py-1 text-xs font-semibold text-[#282825]"
            >
              <option value="all">
                {locale === "sv" ? "Alla utgifter" : "All expenses"}
              </option>
              {items
                .filter((i) => i.is_active)
                .map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                  </option>
                ))}
            </select>

            <div className="inline-flex rounded-full bg-[#ecece9] p-0.5 border border-[#c5c5ba]">
              {([6, 12] as const).map((mCount) => (
                <button
                  key={mCount}
                  type="button"
                  onClick={() => setTrendRange(mCount)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                    trendRange === mCount
                      ? "bg-[#0c0d0d] text-white"
                      : "text-[#64645e]"
                  }`}
                >
                  {mCount}M
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bar chart */}
        <div className="flex h-36 items-end justify-between gap-1.5 pt-4 px-1">
          {trendPoints.map((pt) => {
            const hPct = Math.max(
              8,
              Math.round((pt.expenses / maxTrendVal) * 100)
            );
            const isCurrent = pt.yearMonth === yearMonth;
            return (
              <div
                key={pt.yearMonth}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div className="font-mono text-[9px] text-[#64645e]">
                  {Math.round(pt.expenses / 1000)}k
                </div>
                <div className="flex h-24 w-full items-end justify-center rounded-xl bg-[#f8f8f7] p-0.5">
                  <div
                    className={`w-full rounded-lg transition-all ${
                      isCurrent
                        ? "bg-[#529a6a] border border-[#282825]"
                        : "bg-[#b8d5ff]"
                    }`}
                    style={{ height: `${hPct}%` }}
                  />
                </div>
                <div
                  className={`font-mono text-[10px] ${
                    isCurrent
                      ? "font-bold text-[#282825]"
                      : "text-[#64645e]"
                  }`}
                >
                  {pt.shortLabel}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Savings Goals Progress Tracker */}
      {goalItems.length > 0 && (
        <div className="rounded-3xl border border-[#282825] bg-[#f6e6fc] p-4.5 shadow-editorial space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#7a2899]">
            <Target className="h-4 w-4" />
            <span>
              {locale === "sv"
                ? "Sparmål & Buffertstatus"
                : "Savings Goals & Buffer Progress"}
            </span>
          </div>

          <div className="space-y-2.5">
            {goalItems.map((c) => {
              const target = Number(c.item.target_amount || 1);
              const saved =
                Number(c.item.current_saved || 0) +
                (c.record?.status === "confirmed" ? c.effectiveAmount : 0);
              const pct = Math.min(100, Math.round((saved / target) * 100));
              return (
                <div
                  key={c.item.id}
                  className="rounded-2xl bg-white p-3.5 border border-[#edc6fb] space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#282825]">
                      {c.item.name}
                    </span>
                    <span className="font-mono font-bold text-[#7a2899]">
                      {pct}% ({formatCurrency(saved, currency, locale)} /{" "}
                      {formatCurrency(target, currency, locale)})
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#ecece9]">
                    <div
                      className="h-full rounded-full bg-[#c455eb] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Partner Cost Split Card */}
      <div className="rounded-3xl border border-[#c5c5ba] bg-white p-4.5 shadow-editorial space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-serif text-xl text-[#282825]">
            <Users className="h-4 w-4 text-[#2173be]" />
            <span>
              {locale === "sv"
                ? "Fördelning av gemensamma utgifter"
                : "Shared Household Cost Split"}
            </span>
          </div>
          <span className="rounded-full bg-[#e1edfe] px-2.5 py-0.5 font-mono text-[11px] font-bold text-[#2173be]">
            {partnerSplitSummary.ratioAPct}% / {partnerSplitSummary.ratioBPct}%
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl bg-[#f8f8f7] p-3 border border-[#ecece9]">
            <div className="text-xs font-bold text-[#282825]">
              {partnerSplitSummary.pAName} ({partnerSplitSummary.ratioAPct}%)
            </div>
            <div className="mt-1 font-serif text-2xl text-[#2173be]">
              {formatCurrency(partnerSplitSummary.shareA, currency, locale)}
            </div>
            {partnerSplitSummary.personalA > 0 && (
              <div className="mt-0.5 font-mono text-[10px] text-[#64645e]">
                + {formatCurrency(partnerSplitSummary.personalA, currency, locale)}{" "}
                {locale === "sv" ? "personligt" : "personal"}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-[#f8f8f7] p-3 border border-[#ecece9]">
            <div className="text-xs font-bold text-[#282825]">
              {partnerSplitSummary.pBName} ({partnerSplitSummary.ratioBPct}%)
            </div>
            <div className="mt-1 font-serif text-2xl text-[#057b40]">
              {formatCurrency(partnerSplitSummary.shareB, currency, locale)}
            </div>
            {partnerSplitSummary.personalB > 0 && (
              <div className="mt-0.5 font-mono text-[10px] text-[#64645e]">
                + {formatCurrency(partnerSplitSummary.personalB, currency, locale)}{" "}
                {locale === "sv" ? "personligt" : "personal"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sinking Fund / Quarterly & Annual Buffer Card */}
      <div className="rounded-3xl border border-[#282825] bg-[#e7f4eb] p-4.5 shadow-editorial">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#057b40]">
              <PiggyBank className="h-4 w-4" />
              {t.insights.upcomingRareBills}
            </div>
            <p className="mt-1 text-xs text-[#282825]">
              {t.insights.monthlyReserveTip}
            </p>
          </div>
          <div className="text-right">
            <div className="font-serif text-2xl text-[#282825]">
              {formatCurrency(totalMonthlyReserve, currency, locale)}
              <span className="font-mono text-xs text-[#64645e]">
                /{locale === "sv" ? "mån" : "mo"}
              </span>
            </div>
          </div>
        </div>

        {rareBills.length > 0 ? (
          <div className="mt-3.5 space-y-2">
            {rareBills.map(({ item }) => {
              const nextPayM = getNextPaymentMonth(item, currentMonth);
              const perMonth =
                item.expected_amount / item.recurrence_interval_months;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl bg-white px-3.5 py-2.5 text-xs border border-[#b5e3c4]"
                >
                  <div>
                    <div className="font-semibold text-[#282825]">
                      {item.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-[#64645e]">
                      <CalendarClock className="h-3 w-3 text-[#057b40]" />
                      <span>
                        {getRecurrenceLabel(
                          item.recurrence_interval_months,
                          locale
                        )}
                      </span>
                      <span>•</span>
                      <span>
                        {locale === "sv" ? "Nästa:" : "Next:"}{" "}
                        {MONTH_NAMES[locale][nextPayM - 1]}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-serif text-base text-[#282825]">
                      {formatCurrency(item.expected_amount, currency, locale)}
                    </div>
                    <div className="font-mono text-[11px] font-bold text-[#057b40]">
                      {formatCurrency(perMonth, currency, locale)}/
                      {locale === "sv" ? "mån" : "mo"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-xs text-[#64645e]">
            {locale === "sv"
              ? "Inga kvartals- eller årsfakturor inlagda ännu."
              : "No quarterly or annual bills added yet."}
          </p>
        )}
      </div>

      {/* Variance by Expense Group */}
      <div className="rounded-3xl border border-[#c5c5ba] bg-white p-4.5 space-y-4 shadow-editorial">
        <h3 className="font-serif text-xl text-[#282825]">
          {t.insights.varianceByGroup}
        </h3>

        <div className="space-y-3.5">
          {expenseGroups.map((group) => {
            const gItems = computedItems.filter(
              (c) => c.group.id === group.id
            );
            const expectedTotal = gItems.reduce(
              (s, c) => s + c.displayedExpected,
              0
            );
            const effectiveTotal = gItems.reduce(
              (s, c) => s + c.effectiveAmount,
              0
            );
            const diff = effectiveTotal - expectedTotal;
            const pct =
              expectedTotal > 0
                ? Math.min(
                    100,
                    Math.round((effectiveTotal / expectedTotal) * 100)
                  )
                : 0;

            return (
              <div key={group.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#282825]">
                    {group.name}
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-[#64645e]">
                      {formatCurrency(effectiveTotal, currency, locale)} /{" "}
                      {formatCurrency(expectedTotal, currency, locale)}
                    </span>
                    {Math.round(diff) !== 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 font-sans text-[10px] font-bold ${
                          diff < 0
                            ? "bg-[#e7f4eb] text-[#057b40]"
                            : "bg-[#fdeee0] text-[#b85d10]"
                        }`}
                      >
                        {diff > 0 ? "+" : ""}
                        {formatCurrency(diff, currency, locale)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#ecece9]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      diff > 0 ? "bg-[#f09236]" : "bg-[#529a6a]"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Largest Deviations This Month */}
      <div className="rounded-3xl border border-[#c5c5ba] bg-white p-4.5 shadow-editorial">
        <h3 className="font-serif text-xl text-[#282825] mb-3">
          {t.insights.biggestDeviations}
        </h3>

        {confirmedWithVariance.length > 0 ? (
          <div className="space-y-2">
            {confirmedWithVariance.map((c) => {
              const diff = (c.displayedActual ?? 0) - c.displayedExpected;
              const isCheaper = diff < 0;
              return (
                <div
                  key={c.item.id}
                  className="flex items-center justify-between rounded-2xl bg-[#f8f8f7] px-3.5 py-2.5 text-xs border border-[#ecece9]"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`rounded-full p-2 ${
                        isCheaper
                          ? "bg-[#e7f4eb] text-[#057b40]"
                          : "bg-[#fdeee0] text-[#b85d10]"
                      }`}
                    >
                      {isCheaper ? (
                        <TrendingDown className="h-4 w-4" />
                      ) : (
                        <TrendingUp className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-[#282825]">
                        {c.item.name}
                      </div>
                      <div className="font-mono text-[11px] text-[#64645e]">
                        {t.summary.expected}:{" "}
                        {formatCurrency(c.displayedExpected, currency, locale)}{" "}
                        → {t.summary.actual}:{" "}
                        {formatCurrency(
                          c.displayedActual ?? 0,
                          currency,
                          locale
                        )}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 font-bold ${
                      isCheaper
                        ? "bg-[#e7f4eb] text-[#057b40]"
                        : "bg-[#fdeee0] text-[#b85d10]"
                    }`}
                  >
                    {diff > 0 ? "+" : ""}
                    {formatCurrency(diff, currency, locale)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl bg-[#e7f4eb] p-3.5 text-xs font-medium text-[#057b40]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              {locale === "sv"
                ? "Alla bekräftade poster ligger exakt enligt förväntan hittills."
                : "All confirmed items match your expected budget so far."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
