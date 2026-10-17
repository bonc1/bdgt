"use client";

import React, { useState } from "react";
import { X, CheckCircle2, PiggyBank, Sparkles } from "lucide-react";
import { ComputedItemMonth, Locale } from "@/lib/types";
import { formatCurrency } from "@/lib/i18n";

interface MonthCloseModalProps {
  open: boolean;
  yearMonth: string;
  computedItems: ComputedItemMonth[];
  leftToSpend: number;
  currency: string;
  locale: Locale;
  onClose: () => void;
  onBulkConfirmItems: (itemIds: string[]) => Promise<void>;
  onRolloverToSavings: (savingsItemId: string, amount: number) => Promise<void>;
}

export function MonthCloseModal({
  open,
  computedItems,
  leftToSpend,
  currency,
  locale,
  onClose,
  onBulkConfirmItems,
  onRolloverToSavings,
}: MonthCloseModalProps) {
  const [processing, setProcessing] = useState(false);
  const [rolloverInput, setRolloverInput] = useState<string>(
    leftToSpend > 0 ? String(Math.round(leftToSpend)) : "0"
  );

  if (!open) return null;

  const unconfirmedDueBills = computedItems.filter(
    (c) =>
      c.isPaymentMonth &&
      c.record?.status !== "confirmed" &&
      c.item.entry_mode === "single_bill"
  );

  const savingsItems = computedItems.filter((c) => c.group.kind === "savings");
  const [targetSavingsId, setTargetSavingsId] = useState<string>(
    savingsItems[0]?.item.id || ""
  );

  const handleBulkConfirm = async () => {
    if (unconfirmedDueBills.length === 0) return;
    setProcessing(true);
    try {
      await onBulkConfirmItems(unconfirmedDueBills.map((c) => c.item.id));
    } finally {
      setProcessing(false);
    }
  };

  const handleRollover = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(rolloverInput);
    if (!targetSavingsId || isNaN(amt) || amt <= 0) return;
    setProcessing(true);
    try {
      await onRolloverToSavings(targetSavingsId, amt);
      onClose();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#282825]/45 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl border-t border-[#282825] bg-[#f4f4f2] p-5 pb-8 text-[#282825] shadow-sheet max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#c5c5ba]" />

        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-2xl text-[#282825]">
              {locale === "sv"
                ? "Månadsbokslut & Överskott"
                : "Month-End Close & Rollover"}
            </h3>
            <p className="text-xs text-[#64645e]">
              {locale === "sv"
                ? "Bekräfta kvarvarande fasta räkningar och flytta överskott till sparande."
                : "Confirm remaining fixed bills and move your surplus into savings."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#c5c5ba] bg-white p-2 text-[#282825]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step 1: Confirm remaining fixed bills */}
        <div className="mt-4 rounded-2xl border border-[#c5c5ba] bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64645e]">
              {locale === "sv"
                ? "1. Ouppföljda räkningar denna månad"
                : "1. Unconfirmed bills due this month"}
            </span>
            <span className="rounded-full bg-[#fdeee0] px-2.5 py-0.5 font-mono text-xs font-bold text-[#b85d10]">
              {unconfirmedDueBills.length} st
            </span>
          </div>

          {unconfirmedDueBills.length > 0 ? (
            <>
              <div className="max-h-36 space-y-1.5 overflow-y-auto">
                {unconfirmedDueBills.map((c) => (
                  <div
                    key={c.item.id}
                    className="flex items-center justify-between rounded-xl bg-[#f8f8f7] px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-[#282825]">
                      {c.item.name}
                    </span>
                    <span className="font-mono font-bold text-[#282825]">
                      {formatCurrency(c.displayedExpected, currency, locale)}
                    </span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={processing}
                onClick={handleBulkConfirm}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-[#282825] bg-[#b5e3c4] py-3 text-xs font-bold text-[#282825] hover:bg-[#529a6a] hover:text-white transition"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {locale === "sv"
                    ? `Bekräfta alla ${unconfirmedDueBills.length} poster enligt förväntat`
                    : `Confirm all ${unconfirmedDueBills.length} bills as expected`}
                </span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-[#e7f4eb] p-3 text-xs font-semibold text-[#057b40]">
              <Sparkles className="h-4 w-4" />
              <span>
                {locale === "sv"
                  ? "Alla fasta poster för månaden är redan bekräftade!"
                  : "All fixed bills for this month are already confirmed!"}
              </span>
            </div>
          )}
        </div>

        {/* Step 2: Roll over leftover surplus to Savings Goal */}
        {savingsItems.length > 0 && (
          <form
            onSubmit={handleRollover}
            className="mt-4 rounded-2xl border border-[#282825] bg-[#f6e6fc] p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#7a2899]">
                <PiggyBank className="h-4 w-4" />
                {locale === "sv"
                  ? "2. Flytta månadsöverskott till sparmål"
                  : "2. Roll over surplus to savings goal"}
              </span>
              <span className="font-serif text-lg text-[#282825]">
                {formatCurrency(Math.max(0, leftToSpend), currency, locale)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={targetSavingsId}
                onChange={(e) => setTargetSavingsId(e.target.value)}
                className="rounded-full border border-[#282825] bg-white px-3.5 py-2 text-xs font-semibold text-[#282825]"
              >
                {savingsItems.map((s) => (
                  <option key={s.item.id} value={s.item.id}>
                    {s.item.name}
                  </option>
                ))}
              </select>

              <input
                type="number"
                inputMode="decimal"
                value={rolloverInput}
                onChange={(e) => setRolloverInput(e.target.value)}
                placeholder="Belopp"
                className="rounded-full border border-[#282825] bg-white px-3.5 py-2 font-mono text-xs font-bold text-[#282825]"
              />
            </div>

            <button
              type="submit"
              disabled={processing}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0c0d0d] py-3 text-xs font-bold text-white hover:bg-[#282825]"
            >
              <PiggyBank className="h-4 w-4" />
              <span>
                {locale === "sv"
                  ? "Addera till sparmål & spara"
                  : "Add to savings goal & save"}
              </span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
