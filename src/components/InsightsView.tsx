"use client";

import React from "react";
import {
  TrendingDown,
  TrendingUp,
  CalendarClock,
  PiggyBank,
  CheckCircle2,
} from "lucide-react";
import { BudgetGroup, ComputedItemMonth, Locale } from "@/lib/types";
import {
  MONTH_NAMES,
  formatCurrency,
  getRecurrenceLabel,
  translations,
} from "@/lib/i18n";
import { getNextPaymentMonth } from "@/lib/budget-engine";

interface InsightsViewProps {
  groups: BudgetGroup[];
  computedItems: ComputedItemMonth[];
  yearMonth: string;
  currency: string;
  locale: Locale;
}

export function InsightsView({
  groups,
  computedItems,
  yearMonth,
  currency,
  locale,
}: InsightsViewProps) {
  const t = translations[locale];
  const [, mStr] = yearMonth.split("-");
  const currentMonth = parseInt(mStr || "1", 10);

  const expenseGroups = groups.filter((g) => g.kind === "expense");

  // Non-monthly bills (quarterly, semi-annual, annual)
  const rareBills = computedItems.filter(
    (c) => c.item.recurrence_interval_months > 1
  );
  const totalMonthlyReserve = rareBills.reduce(
    (sum, c) =>
      sum + c.item.expected_amount / (c.item.recurrence_interval_months || 1),
    0
  );

  // Deviations on confirmed items
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

  return (
    <div className="space-y-5 pb-28">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">{t.insights.title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{t.insights.subtitle}</p>
      </div>

      {/* Sinking Fund / Quarterly & Annual Buffer Card */}
      <div className="rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/50 via-slate-900 to-slate-900 p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <PiggyBank className="h-4 w-4" />
              {t.insights.upcomingRareBills}
            </div>
            <p className="mt-1 text-xs text-slate-300">
              {t.insights.monthlyReserveTip}
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg font-extrabold text-emerald-400">
              {formatCurrency(totalMonthlyReserve, currency, locale)}
              <span className="text-xs font-normal text-slate-400">
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
                  className="flex items-center justify-between rounded-2xl bg-slate-950/60 px-3.5 py-2.5 text-xs border border-slate-800/80"
                >
                  <div>
                    <div className="font-semibold text-slate-100">
                      {item.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                      <CalendarClock className="h-3 w-3 text-emerald-400" />
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
                    <div className="font-bold text-slate-200">
                      {formatCurrency(item.expected_amount, currency, locale)}
                    </div>
                    <div className="text-[11px] text-emerald-400">
                      {formatCurrency(perMonth, currency, locale)}/
                      {locale === "sv" ? "mån" : "mo"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-400">
            {locale === "sv"
              ? "Inga kvartals- eller årsfakturor inlagda ännu."
              : "No quarterly or annual bills added yet."}
          </p>
        )}
      </div>

      {/* Variance by Expense Group */}
      <div className="rounded-3xl border border-slate-800/90 bg-[#111726] p-4 space-y-4">
        <h3 className="text-sm font-bold text-slate-200">
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
                ? Math.min(100, Math.round((effectiveTotal / expectedTotal) * 100))
                : 0;

            return (
              <div key={group.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    {group.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">
                      {formatCurrency(effectiveTotal, currency, locale)} /{" "}
                      {formatCurrency(expectedTotal, currency, locale)}
                    </span>
                    {Math.round(diff) !== 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          diff < 0
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-amber-500/15 text-amber-400"
                        }`}
                      >
                        {diff > 0 ? "+" : ""}
                        {formatCurrency(diff, currency, locale)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      diff > 0 ? "bg-amber-400" : "bg-emerald-500"
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
      <div className="rounded-3xl border border-slate-800/90 bg-[#111726] p-4">
        <h3 className="text-sm font-bold text-slate-200 mb-3">
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
                  className="flex items-center justify-between rounded-2xl bg-slate-900/80 px-3.5 py-2.5 text-xs border border-slate-800/70"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`rounded-xl p-2 ${
                        isCheaper
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-amber-500/15 text-amber-400"
                      }`}
                    >
                      {isCheaper ? (
                        <TrendingDown className="h-4 w-4" />
                      ) : (
                        <TrendingUp className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-white">
                        {c.item.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
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
                    className={`font-bold ${
                      isCheaper ? "text-emerald-400" : "text-amber-400"
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
          <div className="flex items-center gap-2 rounded-2xl bg-slate-900/50 p-3.5 text-xs text-slate-400">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
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
