"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Trash2,
  Calendar,
  Repeat,
  Layers,
  Receipt,
  Sparkles,
  SunSnow,
  Users,
  Target,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  BudgetGroup,
  BudgetGroupKind,
  BudgetItem,
  CostSplit,
  EntryMode,
  Locale,
  RecurrenceInterval,
} from "@/lib/types";
import {
  MONTH_NAMES,
  SHORT_MONTH_NAMES,
  formatCurrency,
  formatYearMonthLabel,
  getRecurrenceLabel,
  translations,
} from "@/lib/i18n";

interface ItemFormModalProps {
  open: boolean;
  editingItem: BudgetItem | null;
  defaultGroupId?: string;
  unexpectedMode?: boolean;
  yearMonth: string;
  groups: BudgetGroup[];
  partnerAName?: string;
  partnerBName?: string;
  currency: string;
  locale: Locale;
  onClose: () => void;
  onSaveItem: (
    data: Omit<BudgetItem, "id" | "household_id" | "sort_order" | "is_active">,
    existingId?: string,
    autoConfirmActual?: number
  ) => Promise<void>;
  onDeleteItem?: (id: string) => Promise<void>;
}

const RECURRENCE_OPTIONS: RecurrenceInterval[] = [1, 2, 3, 4, 6, 12];

export function ItemFormModal({
  open,
  editingItem,
  defaultGroupId,
  unexpectedMode = false,
  yearMonth,
  groups,
  partnerAName = "Partner A",
  partnerBName = "Partner B",
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
  const [isOneTime, setIsOneTime] = useState<boolean>(false);
  const [recurrence, setRecurrence] = useState<RecurrenceInterval>(1);
  const [anchorMonth, setAnchorMonth] = useState<number>(
    new Date().getMonth() + 1
  );
  const [coverageMonths, setCoverageMonths] = useState<number>(1);
  const [isVariable, setIsVariable] = useState(false);
  const [seasonalMap, setSeasonalMap] = useState<Record<string, number>>({});
  const [showSeasonalGrid, setShowSeasonalGrid] = useState(false);
  const [costSplit, setCostSplit] = useState<CostSplit>("shared");
  const [targetAmount, setTargetAmount] = useState<string>("");
  const [currentSaved, setCurrentSaved] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const [, mStr] = yearMonth.split("-");
    const activeM = parseInt(mStr || "1", 10);

    if (editingItem) {
      setName(editingItem.name);
      setGroupId(editingItem.group_id);
      setExpectedAmount(String(editingItem.expected_amount));
      setEntryMode(editingItem.entry_mode);
      if (editingItem.recurrence_interval_months === 0) {
        setIsOneTime(true);
        setRecurrence(1);
      } else {
        setIsOneTime(false);
        setRecurrence(editingItem.recurrence_interval_months);
      }
      setAnchorMonth(editingItem.anchor_month);
      setCoverageMonths(editingItem.coverage_months);
      setIsVariable(editingItem.is_variable_estimate);
      setSeasonalMap(editingItem.seasonal_amounts || {});
      setShowSeasonalGrid(
        Boolean(
          editingItem.seasonal_amounts &&
            Object.keys(editingItem.seasonal_amounts).length > 0
        )
      );
      setCostSplit(editingItem.cost_split || "shared");
      setTargetAmount(
        editingItem.target_amount ? String(editingItem.target_amount) : ""
      );
      setCurrentSaved(
        editingItem.current_saved ? String(editingItem.current_saved) : ""
      );
    } else {
      const firstExpenseGrp =
        groups.find((g) => g.kind === "expense")?.id || groups[0]?.id || "";
      setName("");
      setGroupId(defaultGroupId || firstExpenseGrp);
      setExpectedAmount("");
      setEntryMode("single_bill");
      setIsOneTime(unexpectedMode);
      setRecurrence(1);
      setAnchorMonth(activeM);
      setCoverageMonths(1);
      setIsVariable(false);
      setSeasonalMap({});
      setShowSeasonalGrid(false);
      setCostSplit("shared");
      setTargetAmount("");
      setCurrentSaved("");
    }
  }, [open, editingItem, defaultGroupId, unexpectedMode, yearMonth, groups]);

  if (!open) return null;

  const selectedGroup = groups.find((g) => g.id === groupId);
  const isSavingsGroup = selectedGroup?.kind === "savings";

  const handleRecurrenceChange = (val: RecurrenceInterval) => {
    setRecurrence(val);
    setCoverageMonths(val || 1);
  };

  const applyWinterCurvePreset = () => {
    const base = parseFloat(expectedAmount) || 2000;
    const factors = [
      1.55, 1.45, 1.1, 0.8, 0.6, 0.48, 0.45, 0.48, 0.65, 1.0, 1.25, 1.5,
    ];
    const next: Record<string, number> = {};
    factors.forEach((f, idx) => {
      next[String(idx + 1)] = Math.round((base * f) / 50) * 50;
    });
    setSeasonalMap(next);
    setShowSeasonalGrid(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(expectedAmount);
    if (!name.trim() || !groupId || isNaN(amount) || amount < 0) return;
    setSaving(true);
    try {
      const finalInterval: RecurrenceInterval = isOneTime ? 0 : recurrence;
      const parsedTarget = parseFloat(targetAmount);
      const parsedSaved = parseFloat(currentSaved);

      await onSaveItem(
        {
          name: name.trim(),
          group_id: groupId,
          expected_amount: amount,
          entry_mode: entryMode,
          recurrence_interval_months: finalInterval,
          one_time_year_month: isOneTime ? yearMonth : null,
          anchor_month: anchorMonth,
          coverage_months: isOneTime ? 1 : coverageMonths,
          is_variable_estimate: isVariable,
          seasonal_amounts:
            isVariable && showSeasonalGrid && Object.keys(seasonalMap).length > 0
              ? seasonalMap
              : null,
          cost_split: costSplit,
          target_amount: !isNaN(parsedTarget) && parsedTarget > 0 ? parsedTarget : null,
          current_saved: !isNaN(parsedSaved) && parsedSaved >= 0 ? parsedSaved : 0,
        },
        editingItem?.id,
        unexpectedMode ? amount : undefined
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const parsedAmt = parseFloat(expectedAmount) || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#282825]/45 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl border-t border-[#282825] bg-[#f4f4f2] p-5 pb-8 text-[#282825] shadow-sheet max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#c5c5ba]" />

        <div className="flex items-center justify-between">
          <h3 className="font-serif text-2xl text-[#282825]">
            {editingItem
              ? t.itemForm.titleEdit
              : unexpectedMode
              ? t.itemForm.titleUnexpected
              : t.itemForm.titleNew}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#c5c5ba] bg-white p-2 text-[#282825] hover:border-[#282825]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-[#282825] mb-1">
              {t.itemForm.name}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                locale === "sv"
                  ? "t.ex. Elräkning, Tandläkare, Bilservice..."
                  : "e.g. Electricity, Dentist, Car repair..."
              }
              className="w-full rounded-full border border-[#c5c5ba] bg-white px-4 py-2.5 text-sm text-[#282825] placeholder:text-[#8f8f89] focus:border-[#282825] focus:outline-none"
            />
          </div>

          {/* Group & Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#282825] mb-1">
                {t.itemForm.group}
              </label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full rounded-full border border-[#c5c5ba] bg-white px-3.5 py-2.5 text-sm text-[#282825] focus:border-[#282825] focus:outline-none"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#282825] mb-1">
                {unexpectedMode
                  ? t.itemForm.actualPaidNow
                  : t.itemForm.expectedAmount}{" "}
                ({currency})
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
                className="w-full rounded-full border border-[#c5c5ba] bg-white px-4 py-2.5 font-mono text-sm font-bold text-[#282825] placeholder:text-[#8f8f89] focus:border-[#282825] focus:outline-none"
              />
            </div>
          </div>

          {/* Segmented Toggle: Recurring vs One-Time */}
          {unexpectedMode ? (
            <div className="rounded-2xl border border-[#282825] bg-[#fdeee0] p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#282825]">
                <Sparkles className="h-4 w-4 text-[#b85d10]" />
                <span>{t.itemForm.futurePromptTitle}</span>
              </div>
              <p className="text-[11px] text-[#64645e]">
                {t.itemForm.futurePromptDesc}
              </p>
              <div className="grid grid-cols-1 gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => setIsOneTime(true)}
                  className={`rounded-full py-2 px-3.5 text-left text-xs font-semibold border transition ${
                    isOneTime
                      ? "border-[#282825] bg-[#0c0d0d] text-white"
                      : "border-[#c5c5ba] bg-white text-[#282825]"
                  }`}
                >
                  {t.itemForm.futureKeepOnce} (
                  {formatYearMonthLabel(yearMonth, locale)})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsOneTime(false);
                    handleRecurrenceChange(1);
                  }}
                  className={`rounded-full py-2 px-3.5 text-left text-xs font-semibold border transition ${
                    !isOneTime && recurrence === 1
                      ? "border-[#282825] bg-[#0c0d0d] text-white"
                      : "border-[#c5c5ba] bg-white text-[#282825]"
                  }`}
                >
                  {t.itemForm.futureMakeMonthly}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsOneTime(false);
                    handleRecurrenceChange(3);
                  }}
                  className={`rounded-full py-2 px-3.5 text-left text-xs font-semibold border transition ${
                    !isOneTime && recurrence === 3
                      ? "border-[#282825] bg-[#0c0d0d] text-white"
                      : "border-[#c5c5ba] bg-white text-[#282825]"
                  }`}
                >
                  {t.itemForm.futureMakeQuarterly}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#c5c5ba] bg-white p-3.5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#282825] mb-1.5">
                  {t.itemForm.frequencyType}
                </label>
                <div className="grid grid-cols-2 gap-1.5 rounded-full bg-[#ecece9] p-1 border border-[#c5c5ba]">
                  <button
                    type="button"
                    onClick={() => setIsOneTime(false)}
                    className={`rounded-full py-2 px-3 text-xs font-semibold transition ${
                      !isOneTime
                        ? "bg-[#0c0d0d] text-white"
                        : "text-[#64645e] hover:text-[#282825]"
                    }`}
                  >
                    {t.itemForm.recurringPill}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOneTime(true)}
                    className={`rounded-full py-2 px-3 text-xs font-semibold transition ${
                      isOneTime
                        ? "bg-[#0c0d0d] text-white"
                        : "text-[#64645e] hover:text-[#282825]"
                    }`}
                  >
                    {t.itemForm.oneTimePill} (
                    {formatYearMonthLabel(yearMonth, locale)})
                  </button>
                </div>
              </div>

              {!isOneTime && (
                <>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-[#282825] mb-1">
                      <Repeat className="h-3.5 w-3.5 text-[#057b40]" />
                      {t.itemForm.recurrence}
                    </label>
                    <select
                      value={recurrence}
                      onChange={(e) =>
                        handleRecurrenceChange(
                          Number(e.target.value) as RecurrenceInterval
                        )
                      }
                      className="w-full rounded-full border border-[#c5c5ba] bg-[#f8f8f7] px-3.5 py-2 text-sm text-[#282825] focus:border-[#282825] focus:outline-none"
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
                        <label className="flex items-center gap-1 text-xs font-medium text-[#64645e] mb-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {t.itemForm.anchorMonth}
                        </label>
                        <select
                          value={anchorMonth}
                          onChange={(e) =>
                            setAnchorMonth(Number(e.target.value))
                          }
                          className="w-full rounded-full border border-[#c5c5ba] bg-[#f8f8f7] px-3 py-2 text-xs text-[#282825]"
                        >
                          {MONTH_NAMES[locale].map((mName, idx) => (
                            <option key={idx + 1} value={idx + 1}>
                              {mName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#64645e] mb-1">
                          {t.itemForm.coverageMonths}
                        </label>
                        <select
                          value={coverageMonths}
                          onChange={(e) =>
                            setCoverageMonths(Number(e.target.value))
                          }
                          className="w-full rounded-full border border-[#c5c5ba] bg-[#f8f8f7] px-3 py-2 text-xs text-[#282825]"
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
                    <div className="rounded-xl bg-[#e7f4eb] border border-[#b5e3c4] px-3 py-2 text-xs font-medium text-[#057b40]">
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
                </>
              )}
            </div>
          )}

          {/* Partner Split Selector */}
          <div className="rounded-2xl border border-[#c5c5ba] bg-white p-3.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#282825] mb-2">
              <Users className="h-3.5 w-3.5 text-[#2173be]" />
              {locale === "sv"
                ? "Kostnadsfördelning i hushållet"
                : "Household cost split"}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  {
                    id: "shared" as CostSplit,
                    label: locale === "sv" ? "Gemensam" : "Shared",
                  },
                  { id: "personal_a" as CostSplit, label: partnerAName },
                  { id: "personal_b" as CostSplit, label: partnerBName },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCostSplit(opt.id)}
                  className={`rounded-full border py-1.5 px-2 text-xs font-semibold transition ${
                    costSplit === opt.id
                      ? "border-[#282825] bg-[#e1edfe] text-[#2173be]"
                      : "border-[#c5c5ba] bg-[#f8f8f7] text-[#64645e]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Savings Goal Tracker Fields (shown when group is savings) */}
          {isSavingsGroup && (
            <div className="rounded-2xl border border-[#282825] bg-[#f6e6fc] p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#7a2899]">
                <Target className="h-4 w-4" />
                <span>
                  {locale === "sv"
                    ? "Sparmål & Nuvarande saldo (Valfritt)"
                    : "Savings Goal & Current Balance (Optional)"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[#282825] mb-1">
                    {locale === "sv" ? "Målbelopp" : "Target goal"} ({currency})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    placeholder="50000"
                    className="w-full rounded-full border border-[#c5c5ba] bg-white px-3 py-1.5 font-mono text-xs font-bold text-[#282825]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#282825] mb-1">
                    {locale === "sv" ? "Redan sparat" : "Saved so far"} (
                    {currency})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={currentSaved}
                    onChange={(e) => setCurrentSaved(e.target.value)}
                    placeholder="25000"
                    className="w-full rounded-full border border-[#c5c5ba] bg-white px-3 py-1.5 font-mono text-xs font-bold text-[#282825]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Entry mode: Single Bill vs Multi Entry */}
          {!unexpectedMode && (
            <div>
              <label className="block text-xs font-semibold text-[#282825] mb-1.5">
                {t.itemForm.entryMode}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEntryMode("single_bill")}
                  className={`flex items-start gap-2 rounded-2xl border p-3 text-left text-xs transition ${
                    entryMode === "single_bill"
                      ? "border-[#282825] bg-[#e7f4eb] font-semibold text-[#282825]"
                      : "border-[#c5c5ba] bg-white text-[#64645e]"
                  }`}
                >
                  <Receipt className="h-4 w-4 shrink-0 text-[#057b40] mt-0.5" />
                  <span>{t.itemForm.singleBill}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEntryMode("multi_entry")}
                  className={`flex items-start gap-2 rounded-2xl border p-3 text-left text-xs transition ${
                    entryMode === "multi_entry"
                      ? "border-[#282825] bg-[#fdeee0] font-semibold text-[#282825]"
                      : "border-[#c5c5ba] bg-white text-[#64645e]"
                  }`}
                >
                  <Layers className="h-4 w-4 shrink-0 text-[#b85d10] mt-0.5" />
                  <span>{t.itemForm.multiEntry}</span>
                </button>
              </div>
            </div>
          )}

          {/* Seasonal variable checkbox + Monthly Curve Grid */}
          {!isOneTime && (
            <div className="space-y-2.5">
              <label className="flex items-center gap-2.5 text-xs font-medium text-[#282825] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVariable}
                  onChange={(e) => {
                    setIsVariable(e.target.checked);
                    if (e.target.checked && Object.keys(seasonalMap).length > 0) {
                      setShowSeasonalGrid(true);
                    }
                  }}
                  className="h-4 w-4 rounded border-[#282825] accent-[#057b40]"
                />
                <span>{t.itemForm.variableEstimate}</span>
              </label>

              {isVariable && (
                <div className="rounded-2xl border border-[#c5c5ba] bg-white p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[#282825]">
                      <SunSnow className="h-4 w-4 text-[#2173be]" />
                      {locale === "sv"
                        ? "Säsongskurva per månad (Jan–Dec)"
                        : "Seasonal monthly curve (Jan–Dec)"}
                    </span>
                    <button
                      type="button"
                      onClick={applyWinterCurvePreset}
                      className="rounded-full bg-[#e1edfe] px-2.5 py-1 text-[11px] font-bold text-[#2173be] hover:bg-[#b8d5ff]"
                    >
                      {locale === "sv"
                        ? "Auto: Vinterhöjd el"
                        : "Preset: Winter peak"}
                    </button>
                  </div>

                  {showSeasonalGrid && (
                    <div className="grid grid-cols-3 gap-2">
                      {SHORT_MONTH_NAMES[locale].map((mShort, idx) => {
                        const mKey = String(idx + 1);
                        const val =
                          seasonalMap[mKey] ??
                          (parseFloat(expectedAmount) || 0);
                        return (
                          <div
                            key={mKey}
                            className="rounded-xl bg-[#f8f8f7] px-2.5 py-1.5 border border-[#ecece9]"
                          >
                            <div className="text-[10px] font-bold uppercase text-[#64645e]">
                              {mShort}
                            </div>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={val}
                              onChange={(e) =>
                                setSeasonalMap((prev) => ({
                                  ...prev,
                                  [mKey]: parseFloat(e.target.value) || 0,
                                }))
                              }
                              className="w-full bg-transparent font-mono text-xs font-bold text-[#282825] focus:outline-none"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-2">
            {editingItem && onDeleteItem ? (
              <button
                type="button"
                onClick={async () => {
                  await onDeleteItem(editingItem.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#fdeeed] border border-[#eb5b55] px-4 py-2.5 text-xs font-semibold text-[#b81a14] hover:bg-[#fbc8c5]"
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
                className="rounded-full border border-[#282825] bg-white px-4 py-2.5 text-xs font-semibold text-[#282825] hover:bg-[#ecece9]"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-[#0c0d0d] px-6 py-2.5 text-xs font-semibold text-white hover:bg-[#282825] disabled:opacity-50"
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
  editingGroup?: BudgetGroup | null;
  locale: Locale;
  onClose: () => void;
  onSaveGroup: (
    name: string,
    kind: BudgetGroupKind,
    color: string,
    existingId?: string
  ) => Promise<void>;
  onDeleteGroup?: (id: string) => Promise<void>;
  onMoveGroup?: (id: string, direction: "up" | "down") => Promise<void>;
}

const HIGHLIGHTER_COLORS = [
  { id: "green", labelSv: "Grön", labelEn: "Green", swatch: "bg-[#b5e3c4]" },
  { id: "blue", labelSv: "Blå", labelEn: "Blue", swatch: "bg-[#b8d5ff]" },
  { id: "orange", labelSv: "Orange", labelEn: "Orange", swatch: "bg-[#faca9e]" },
  { id: "coral", labelSv: "Korall", labelEn: "Coral", swatch: "bg-[#fbc8c5]" },
  { id: "purple", labelSv: "Lila", labelEn: "Purple", swatch: "bg-[#edc6fb]" },
];

export function GroupFormModal({
  open,
  editingGroup,
  locale,
  onClose,
  onSaveGroup,
  onDeleteGroup,
  onMoveGroup,
}: GroupFormModalProps) {
  const t = translations[locale];
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BudgetGroupKind>("expense");
  const [color, setColor] = useState("blue");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingGroup) {
      setName(editingGroup.name);
      setKind(editingGroup.kind);
      setColor(editingGroup.color || "blue");
    } else {
      setName("");
      setKind("expense");
      setColor("blue");
    }
  }, [open, editingGroup]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSaveGroup(name.trim(), kind, color, editingGroup?.id);
      setName("");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#282825]/45 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl border-t border-[#282825] bg-[#f4f4f2] p-5 pb-8 text-[#282825] shadow-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#c5c5ba]" />
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-2xl text-[#282825]">
            {editingGroup
              ? locale === "sv"
                ? "Redigera grupp"
                : "Edit group"
              : t.groupForm.titleNew}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#c5c5ba] bg-white p-2 text-[#282825]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#282825] mb-1">
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
              className="w-full rounded-full border border-[#c5c5ba] bg-white px-4 py-2.5 text-sm text-[#282825] placeholder:text-[#8f8f89] focus:border-[#282825] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#282825] mb-1.5">
              {t.groupForm.kind}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["expense", "income", "savings"] as BudgetGroupKind[]).map(
                (k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`rounded-full border py-2.5 text-xs font-semibold transition ${
                      kind === k
                        ? "border-[#282825] bg-[#e7f4eb] text-[#057b40]"
                        : "border-[#c5c5ba] bg-white text-[#64645e]"
                    }`}
                  >
                    {t.groupForm[k]}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Ellipsus Highlighter Color Picker */}
          <div>
            <label className="block text-xs font-semibold text-[#282825] mb-1.5">
              {t.groupForm.color}
            </label>
            <div className="flex flex-wrap gap-2">
              {HIGHLIGHTER_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    color === c.id
                      ? "border-[#282825] bg-white shadow-xs"
                      : "border-[#c5c5ba] bg-[#f8f8f7]"
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full ${c.swatch}`} />
                  <span>{locale === "sv" ? c.labelSv : c.labelEn}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reorder buttons when editing */}
          {editingGroup && onMoveGroup && (
            <div className="flex items-center justify-between rounded-2xl bg-white p-3 border border-[#c5c5ba]">
              <span className="text-xs font-semibold text-[#64645e]">
                {locale === "sv" ? "Ändra ordning" : "Change group order"}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onMoveGroup(editingGroup.id, "up")}
                  className="inline-flex items-center gap-1 rounded-full border border-[#282825] bg-[#f8f8f7] px-3 py-1 text-xs font-semibold"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  {locale === "sv" ? "Upp" : "Up"}
                </button>
                <button
                  type="button"
                  onClick={() => onMoveGroup(editingGroup.id, "down")}
                  className="inline-flex items-center gap-1 rounded-full border border-[#282825] bg-[#f8f8f7] px-3 py-1 text-xs font-semibold"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                  {locale === "sv" ? "Ner" : "Down"}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            {editingGroup && onDeleteGroup ? (
              <button
                type="button"
                onClick={async () => {
                  await onDeleteGroup(editingGroup.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#fdeeed] border border-[#eb5b55] px-4 py-2.5 text-xs font-semibold text-[#b81a14]"
              >
                <Trash2 className="h-4 w-4" />
                {t.actions.delete}
              </button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[#282825] bg-white px-4 py-2.5 text-xs font-semibold text-[#282825]"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-[#0c0d0d] px-6 py-2.5 text-xs font-semibold text-white"
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
