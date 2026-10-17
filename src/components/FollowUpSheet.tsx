"use client";

import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  X,
  Plus,
  Trash2,
  CalendarClock,
  Sparkles,
  RotateCcw,
  Settings2,
  Receipt,
  Layers,
} from "lucide-react";
import { ComputedItemMonth, Locale, RecordTransaction } from "@/lib/types";
import { formatCurrency, translations } from "@/lib/i18n";

interface FollowUpSheetProps {
  computed: ComputedItemMonth | null;
  yearMonth: string;
  currency: string;
  locale: Locale;
  onClose: () => void;
  onConfirmActual: (
    itemId: string,
    actualAmount: number,
    notes: string
  ) => Promise<void>;
  onResetPending: (itemId: string) => Promise<void>;
  onAddTransaction: (
    itemId: string,
    amount: number,
    description: string
  ) => Promise<void>;
  onDeleteTransaction: (itemId: string, txId: string) => Promise<void>;
  onEditItem: (computed: ComputedItemMonth) => void;
}

export function FollowUpSheet({
  computed,
  currency,
  locale,
  onClose,
  onConfirmActual,
  onResetPending,
  onAddTransaction,
  onDeleteTransaction,
  onEditItem,
}: FollowUpSheetProps) {
  const t = translations[locale];
  const [actualInput, setActualInput] = useState<string>("");
  const [notesInput, setNotesInput] = useState<string>("");
  const [txAmount, setTxAmount] = useState<string>("");
  const [txDesc, setTxDesc] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!computed) return;
    const { item, record, displayedActual } = computed;
    if (record?.actual_amount !== null && record?.actual_amount !== undefined) {
      setActualInput(String(record.actual_amount));
    } else if (displayedActual !== null) {
      setActualInput(String(displayedActual));
    } else {
      setActualInput(String(item.expected_amount));
    }
    setNotesInput(record?.notes || "");
    setTxAmount("");
    setTxDesc("");
  }, [computed]);

  if (!computed) return null;

  const { item, group, record, isPaymentMonth, coverageLabel } = computed;
  const isConfirmed = record?.status === "confirmed";
  const transactions: RecordTransaction[] = record?.transactions || [];
  const txSum = transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);

  const parsedActual = parseFloat(actualInput);
  const validActual = !isNaN(parsedActual) && parsedActual >= 0;
  const diffFromExpected = validActual
    ? parsedActual - item.expected_amount
    : 0;

  const handleOneTapConfirm = async () => {
    setSaving(true);
    try {
      const amountToConfirm =
        item.entry_mode === "multi_entry" && txSum > 0
          ? txSum
          : item.expected_amount;
      await onConfirmActual(item.id, amountToConfirm, notesInput);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleCustomSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validActual) return;
    setSaving(true);
    try {
      await onConfirmActual(item.id, parsedActual, notesInput);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleAddTx = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(txAmount);
    if (isNaN(val) || val <= 0) return;
    setSaving(true);
    try {
      await onAddTransaction(
        item.id,
        val,
        txDesc.trim() || (locale === "sv" ? "Delköp" : "Expense")
      );
      setTxAmount("");
      setTxDesc("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg rounded-t-3xl border-t border-slate-800 bg-[#111726] p-5 pb-8 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-700/80" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
              <span>{group.name}</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 text-slate-400">
                <CalendarClock className="h-3.5 w-3.5" />
                {coverageLabel}
              </span>
            </div>
            <h3 className="mt-1 text-xl font-bold text-white">{item.name}</h3>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onEditItem(computed)}
              className="rounded-full bg-slate-800/90 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
              title={t.actions.editItem}
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-slate-800/90 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Expected vs Monthly Accrual info banner */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-2xl bg-slate-900/90 p-3.5 border border-slate-800/80">
          <div>
            <div className="text-xs text-slate-400">{t.summary.expected}</div>
            <div className="mt-0.5 text-lg font-bold text-slate-100">
              {formatCurrency(item.expected_amount, currency, locale)}
            </div>
            {item.recurrence_interval_months > 1 && (
              <div className="text-[11px] text-slate-400">
                {locale === "sv" ? "Snitt:" : "Monthly avg:"}{" "}
                {formatCurrency(
                  item.expected_amount / item.recurrence_interval_months,
                  currency,
                  locale
                )}
                /{locale === "sv" ? "mån" : "mo"}
              </div>
            )}
          </div>

          <div className="border-l border-slate-800 pl-3">
            <div className="text-xs text-slate-400">{t.summary.actual}</div>
            <div className="mt-0.5 text-lg font-bold text-emerald-400">
              {isConfirmed && record?.actual_amount !== null
                ? formatCurrency(record.actual_amount, currency, locale)
                : item.entry_mode === "multi_entry" && txSum > 0
                ? formatCurrency(txSum, currency, locale)
                : "—"}
            </div>
            <div className="text-[11px] text-slate-400">
              {isConfirmed
                ? t.status.confirmed
                : !isPaymentMonth
                ? t.status.offMonth
                : t.status.pending}
            </div>
          </div>
        </div>

        {/* Multi-entry partial spend logger (e.g., Groceries) */}
        {item.entry_mode === "multi_entry" && (
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              <span className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-amber-400" />
                {locale === "sv"
                  ? "Loggade delutgifter i månaden"
                  : "Logged partial spends this month"}
              </span>
              <span className="text-slate-200">
                {formatCurrency(txSum, currency, locale)} /{" "}
                {formatCurrency(item.expected_amount, currency, locale)}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800 mb-3">
              <div
                className={`h-full rounded-full transition-all ${
                  txSum > item.expected_amount ? "bg-rose-500" : "bg-amber-400"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    item.expected_amount > 0
                      ? (txSum / item.expected_amount) * 100
                      : 0
                  )}%`,
                }}
              />
            </div>

            {/* Quick add partial spend */}
            <form onSubmit={handleAddTx} className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                placeholder={locale === "sv" ? "Belopp" : "Amount"}
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                className="w-28 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
              <input
                type="text"
                placeholder={
                  locale === "sv" ? "Notering (t.ex. ICA)" : "Note (e.g. Store)"
                }
                value={txDesc}
                onChange={(e) => setTxDesc(e.target.value)}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={saving || !txAmount}
                className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </form>

            {transactions.length > 0 && (
              <div className="mt-3 max-h-36 space-y-1.5 overflow-y-auto pr-1">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-xl bg-slate-950/70 px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-medium text-slate-200">
                        {tx.description}
                      </span>
                      <span className="ml-2 text-slate-500">{tx.spent_on}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-100">
                        {formatCurrency(tx.amount, currency, locale)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteTransaction(item.id, tx.id)}
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick 1-Tap Confirm Expected Button */}
        {!isConfirmed && (
          <div className="mt-4">
            <button
              type="button"
              disabled={saving}
              onClick={handleOneTapConfirm}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 px-4 text-base font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 active:scale-[0.99] transition"
            >
              <CheckCircle2 className="h-5 w-5" />
              {item.entry_mode === "multi_entry" && txSum > 0
                ? `${
                    locale === "sv"
                      ? "Bekräfta loggad summa"
                      : "Confirm logged total"
                  } (${formatCurrency(txSum, currency, locale)})`
                : `${t.actions.confirmExpected} (${formatCurrency(
                    item.expected_amount,
                    currency,
                    locale
                  )})`}
            </button>
          </div>
        )}

        {/* Custom Actual Amount Form */}
        <form onSubmit={handleCustomSave} className="mt-4 space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-slate-400" />
                {t.actions.enterActual} ({currency})
              </label>
              {validActual && diffFromExpected !== 0 && (
                <span
                  className={`text-xs font-semibold ${
                    group.kind === "income"
                      ? diffFromExpected > 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                      : diffFromExpected < 0
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  {diffFromExpected > 0 ? "+" : ""}
                  {formatCurrency(diffFromExpected, currency, locale)}{" "}
                  {locale === "sv" ? "mot förväntat" : "vs expected"}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={actualInput}
                onChange={(e) => setActualInput(e.target.value)}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-base font-semibold text-white focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={saving || !validActual}
                className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-white disabled:opacity-50"
              >
                {t.actions.saveActual}
              </button>
            </div>
          </div>

          <div>
            <input
              type="text"
              placeholder={
                locale === "sv"
                  ? "Valfri kommentar (t.ex. kall månad / hög förbrukning)"
                  : "Optional note (e.g. cold month / higher kWh)"
              }
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </form>

        {/* Reopen button if already confirmed */}
        {isConfirmed && (
          <div className="mt-4 flex justify-between items-center pt-3 border-t border-slate-800/80">
            <span className="text-xs text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {locale === "sv"
                ? "Denna post är markerad som klar för månaden"
                : "Marked as confirmed for this month"}
            </span>
            <button
              type="button"
              onClick={async () => {
                await onResetPending(item.id);
                onClose();
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t.actions.reopen}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
