"use client";

import React, { useState, useEffect } from "react";
import { X, Trash2, Calendar, Repeat, Layers, Receipt } from "lucide-react";
import {
  BudgetGroup,
  BudgetGroupKind,
  BudgetItem,
  EntryMode,
  Locale,
  RecurrenceInterval,
} from "@/lib/types";
import {
  MONTH_NAMES,
  formatCurrency,
  getRecurrenceLabel,
  translations,
} from "@/lib/i18n";

interface ItemFormModalProps {
  open: boolean;
  editingItem: BudgetItem | null;
  defaultGroupId?: string;
  groups: BudgetGroup[];
  currency: string;
  locale: Locale;
  onClose: () => void;
  onSaveItem: (
    data: Omit<BudgetItem, "id" | "household_id" | "sort_order" | "is_active">,
    existingId?: string
  ) => Promise<void>;
  onDeleteItem?: (id: string) => Promise<void>;
}

const RECURRENCE_OPTIONS: RecurrenceInterval[] = [1, 2, 3, 4, 6, 12];

export function ItemFormModal({
  open,
  editingItem,
  defaultGroupId,
  groups,
  currency,
  locale,
  onClose,
  onSaveItem,
  onDeleteItem,
}: ItemFormModalProps) {
  const t = translations[locale];
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [expectedAmount, setExpectedAmount] = useState("2000");
  const [entryMode, setEntryMode] = useState<EntryMode>("single_bill");
  const [recurrence, setRecurrence] = useState<RecurrenceInterval>(1);
  const [anchorMonth, setAnchorMonth] = useState<number>(
    new Date().getMonth() + 1
  );
  const [coverageMonths, setCoverageMonths] = useState<number>(1);
  const [isVariable, setIsVariable] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingItem) {
      setName(editingItem.name);
      setGroupId(editingItem.group_id);
      setExpectedAmount(String(editingItem.expected_amount));
      setEntryMode(editingItem.entry_mode);
      setRecurrence(editingItem.recurrence_interval_months);
      setAnchorMonth(editingItem.anchor_month);
      setCoverageMonths(editingItem.coverage_months);
      setIsVariable(editingItem.is_variable_estimate);
    } else {
      setName("");
      setGroupId(defaultGroupId || groups[0]?.id || "");
      setExpectedAmount("");
      setEntryMode("single_bill");
      setRecurrence(1);
      setAnchorMonth(new Date().getMonth() + 1);
      setCoverageMonths(1);
      setIsVariable(false);
    }
  }, [open, editingItem, defaultGroupId, groups]);

  if (!open) return null;

  const handleRecurrenceChange = (val: RecurrenceInterval) => {
    setRecurrence(val);
    setCoverageMonths(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(expectedAmount);
    if (!name.trim() || !groupId || isNaN(amount) || amount < 0) return;
    setSaving(true);
    try {
      await onSaveItem(
        {
          name: name.trim(),
          group_id: groupId,
          expected_amount: amount,
          entry_mode: entryMode,
          recurrence_interval_months: recurrence,
          anchor_month: anchorMonth,
          coverage_months: coverageMonths,
          is_variable_estimate: isVariable,
        },
        editingItem?.id
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const parsedAmt = parseFloat(expectedAmount) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-t-3xl border-t border-slate-800 bg-[#111726] p-5 pb-8 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-700/80" />

        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">
            {editingItem ? t.itemForm.titleEdit : t.itemForm.titleNew}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {t.itemForm.name}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                locale === "sv"
                  ? "t.ex. Elräkning, Vatten & Sop, Mat..."
                  : "e.g. Electricity, Water & Waste, Groceries..."
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Group & Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t.itemForm.group}
              </label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                {t.itemForm.expectedAmount} ({currency})
              </label>
              <input
                type="number"
                inputMode="decimal"
                required
                min="0"
                step="any"
                value={expectedAmount}
                onChange={(e) => setExpectedAmount(e.target.value)}
                placeholder="2000"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Entry mode: Single Bill vs Multi Entry */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t.itemForm.entryMode}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEntryMode("single_bill")}
                className={`flex items-start gap-2 rounded-xl border p-2.5 text-left text-xs transition ${
                  entryMode === "single_bill"
                    ? "border-emerald-500 bg-emerald-500/10 text-white"
                    : "border-slate-800 bg-slate-900/60 text-slate-400"
                }`}
              >
                <Receipt className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <span>{t.itemForm.singleBill}</span>
              </button>

              <button
                type="button"
                onClick={() => setEntryMode("multi_entry")}
                className={`flex items-start gap-2 rounded-xl border p-2.5 text-left text-xs transition ${
                  entryMode === "multi_entry"
                    ? "border-amber-500 bg-amber-500/10 text-white"
                    : "border-slate-800 bg-slate-900/60 text-slate-400"
                }`}
              >
                <Layers className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span>{t.itemForm.multiEntry}</span>
              </button>
            </div>
          </div>

          {/* Recurrence interval */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-3">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300 mb-1">
                <Repeat className="h-3.5 w-3.5 text-emerald-400" />
                {t.itemForm.recurrence}
              </label>
              <select
                value={recurrence}
                onChange={(e) =>
                  handleRecurrenceChange(
                    Number(e.target.value) as RecurrenceInterval
                  )
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                {RECURRENCE_OPTIONS.map((interval) => (
                  <option key={interval} value={interval}>
                    {getRecurrenceLabel(interval, locale)}
                  </option>
                ))}
              </select>
            </div>

            {recurrence > 1 && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="flex items-center gap-1 text-xs text-slate-300 mb-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    {t.itemForm.anchorMonth}
                  </label>
                  <select
                    value={anchorMonth}
                    onChange={(e) => setAnchorMonth(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  >
                    {MONTH_NAMES[locale].map((mName, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        {mName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {t.itemForm.coverageMonths}
                  </label>
                  <select
                    value={coverageMonths}
                    onChange={(e) => setCoverageMonths(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  >
                    {[1, 2, 3, 4, 6, 12].map((c) => (
                      <option key={c} value={c}>
                        {c} {locale === "sv" ? "månader" : "months"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {recurrence > 1 && parsedAmt > 0 && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-300">
                {locale === "sv"
                  ? `Motsvarar ${formatCurrency(
                      parsedAmt / recurrence,
                      currency,
                      locale
                    )}/månad i buffertavsättning.`
                  : `Equals ${formatCurrency(
                      parsedAmt / recurrence,
                      currency,
                      locale
                    )}/month in buffer accrual.`}
              </div>
            )}
          </div>

          {/* Seasonal variable checkbox */}
          <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={isVariable}
              onChange={(e) => setIsVariable(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
            />
            <span>{t.itemForm.variableEstimate}</span>
          </label>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-2">
            {editingItem && onDeleteItem ? (
              <button
                type="button"
                onClick={async () => {
                  await onDeleteItem(editingItem.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/15 px-3.5 py-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/25"
              >
                <Trash2 className="h-4 w-4" />
                {t.actions.delete}
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {t.actions.save}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

interface GroupFormModalProps {
  open: boolean;
  locale: Locale;
  onClose: () => void;
  onSaveGroup: (
    name: string,
    kind: BudgetGroupKind,
    color: string
  ) => Promise<void>;
}

export function GroupFormModal({
  open,
  locale,
  onClose,
  onSaveGroup,
}: GroupFormModalProps) {
  const t = translations[locale];
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BudgetGroupKind>("expense");
  const [color, setColor] = useState("blue");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSaveGroup(name.trim(), kind, color);
      setName("");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-t-3xl border-t border-slate-800 bg-[#111726] p-5 pb-8 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-700/80" />
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{t.groupForm.titleNew}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-800 p-2 text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {t.groupForm.name}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                locale === "sv"
                  ? "t.ex. Fritid & Barn, Sommarstuga..."
                  : "e.g. Kids & Hobbies, Subscriptions..."
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t.groupForm.kind}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["expense", "income", "savings"] as BudgetGroupKind[]).map(
                (k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`rounded-xl border py-2.5 text-xs font-semibold transition ${
                      kind === k
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                        : "border-slate-800 bg-slate-900 text-slate-400"
                    }`}
                  >
                    {t.groupForm[k]}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300"
            >
              {t.actions.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950"
            >
              {t.actions.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
