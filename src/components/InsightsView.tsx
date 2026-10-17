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

  const rareBills = computedItems.filter(
    (c) => c.item.recurrence_interval_months > 1
  );
  const totalMonthlyReserve = rareBills.reduce(
    (sum, c) =>
      sum + c.item.expected_amount / (c.item.recurrence_interval_months || 1),
    0
  );

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
        <h2 className="font-serif text-3xl text-[#282825]">
          {t.insights.title}
        </h2>
        <p className="text-xs font-medium text-[#64645e] mt-0.5">
          {t.insights.subtitle}
        </p>
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
