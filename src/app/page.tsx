"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Circle,
  Plus,
  FolderPlus,
  Wallet,
  BarChart3,
  Users,
  CalendarClock,
  CalendarRange,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  PiggyBank,
  Sparkles,
  Moon,
  Sun,
  Settings2,
  FileSpreadsheet,
  CheckCheck,
  Target,
} from "lucide-react";
import {
  BudgetFilter,
  BudgetGroup,
  BudgetGroupKind,
  BudgetItem,
  ComputedItemMonth,
  FutureUpdateDecision,
  Household,
  HouseholdMember,
  Locale,
  MonthlyRecord,
  ThemeMode,
  ViewMode,
} from "@/lib/types";
import {
  formatCurrency,
  formatYearMonthLabel,
  translations,
} from "@/lib/i18n";
import {
  computeMonthlyBudget,
  createStarterDataset,
  getCurrentYearMonth,
  shiftYearMonth,
} from "@/lib/budget-engine";
import { FollowUpSheet } from "@/components/FollowUpSheet";
import { GroupFormModal, ItemFormModal } from "@/components/ItemFormModal";
import { InsightsView } from "@/components/InsightsView";
import { HouseholdView } from "@/components/HouseholdView";
import { AnnualMatrixView } from "@/components/AnnualMatrixView";
import {
  BankImportModal,
  ImportedRowAction,
} from "@/components/BankImportModal";
import { MonthCloseModal } from "@/components/MonthCloseModal";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "bdgt_local_state_v1";

/** Ellipsus-inspired hand-drawn brush underline SVG */
function BrushUnderline({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      preserveAspectRatio="none"
      viewBox="0 0 145 11"
      className={className}
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M30.418 2.112C65.525-.07 100.524.386 135.466 3.902c.058-.332.116-.655.173-.986-1.485-.402-2.971-.788-4.449-1.222-1.337-.394-2.658-.859-3.83-1.694 4.391.158 8.907-.055 12.506 4.161-1.395.41-2.493 1.049-3.541.986-6.332-.379-12.655-.899-18.97-1.403-4.391-.347-8.774-.97-13.174-1.08-15.56-.402-31.12-.749-46.688-.89-8.47-.08-16.947.299-25.424.456-.553.008-1.098-.07-1.651-.11zm40.926 4.463c1.956 0 3.913-.015 5.86 0 5.498.056 10.988.095 16.485.205 9.328.182 18.664.316 27.992.647 7 .244 14 .725 20.983 1.198.809.055 1.56.772 2.336 1.182-.041.284-.083.56-.116.835-1.221.118-2.484.481-3.665.315-2.905-.402-5.761-1.316-8.675-1.544C113.162 7.915 93.731 7.537 74.291 7.6c-.999 0-1.998-.095-2.988-.15l.05-.89z"
      />
    </svg>
  );
}

function getGroupHighlighter(group: BudgetGroup, idx: number) {
  const colorMap: Record<
    string,
    { headerBg: string; badgeBg: string; accentText: string; dot: string }
  > = {
    green: {
      headerBg: "bg-[#e7f4eb]",
      badgeBg: "bg-[#b5e3c4]",
      accentText: "text-[#057b40]",
      dot: "bg-[#529a6a]",
    },
    purple: {
      headerBg: "bg-[#f6e6fc]",
      badgeBg: "bg-[#edc6fb]",
      accentText: "text-[#7a2899]",
      dot: "bg-[#c455eb]",
    },
    blue: {
      headerBg: "bg-[#e1edfe]",
      badgeBg: "bg-[#b8d5ff]",
      accentText: "text-[#2173be]",
      dot: "bg-[#2173be]",
    },
    orange: {
      headerBg: "bg-[#fdeee0]",
      badgeBg: "bg-[#faca9e]",
      accentText: "text-[#b85d10]",
      dot: "bg-[#f09236]",
    },
    coral: {
      headerBg: "bg-[#fdeeed]",
      badgeBg: "bg-[#fbc8c5]",
      accentText: "text-[#b81a14]",
      dot: "bg-[#eb5b55]",
    },
  };

  if (group.color && colorMap[group.color]) {
    return colorMap[group.color];
  }
  if (group.kind === "income") return colorMap.green;
  if (group.kind === "savings") return colorMap.purple;
  const fallbackKeys = ["blue", "orange", "coral"];
  return colorMap[fallbackKeys[idx % fallbackKeys.length]];
}

export default function BudgetAppPage() {
  const supabase = useMemo(() => createClient(), []);

  const [locale, setLocale] = useState<Locale>("sv");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [activeTab, setActiveTab] = useState<
    "budget" | "matrix" | "insights" | "household"
  >("budget");
  const [yearMonth, setYearMonth] = useState<string>(() =>
    getCurrentYearMonth()
  );
  const [viewMode, setViewMode] = useState<ViewMode>("cashflow");
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilter>("all");
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<
    Record<string, boolean>
  >({});

  // Core state
  const [household, setHousehold] = useState<Household>(() =>
    createStarterDataset("local-household", "sv").household
  );
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [groups, setGroups] = useState<BudgetGroup[]>(() =>
    createStarterDataset("local-household", "sv").groups
  );
  const [items, setItems] = useState<BudgetItem[]>(() =>
    createStarterDataset("local-household", "sv").items
  );
  const [records, setRecords] = useState<MonthlyRecord[]>(() =>
    createStarterDataset("local-household", "sv").records
  );

  // Auth & DB status
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState<boolean>(false);

  // Modals / Bottom sheets
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [unexpectedMode, setUnexpectedMode] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [defaultGroupIdForNew, setDefaultGroupIdForNew] = useState<
    string | undefined
  >(undefined);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<BudgetGroup | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [monthCloseModalOpen, setMonthCloseModalOpen] = useState(false);

  const t = translations[locale];

  // Apply theme attribute to <html>
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  // 1. Load local state on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.locale) setLocale(parsed.locale);
        if (parsed.theme) setTheme(parsed.theme);
        if (parsed.household) setHousehold(parsed.household);
        if (parsed.groups?.length) setGroups(parsed.groups);
        if (parsed.items?.length) setItems(parsed.items);
        if (parsed.records) setRecords(parsed.records);
      }
    } catch {
      // Ignore corrupt storage
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || userId) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          locale,
          theme,
          household,
          groups,
          items,
          records,
        })
      );
    } catch {
      // Ignore quota errors
    }
  }, [hydrated, userId, locale, theme, household, groups, items, records]);

  // 2. Load from Supabase when authenticated
  const loadCloudData = useCallback(
    async (uid: string, email: string | null) => {
      const { data: memberRows, error: memberErr } = await supabase
        .from("household_members")
        .select("household_id, role, member_email, id, user_id")
        .eq("user_id", uid);

      if (memberErr) {
        setDbReady(false);
        return;
      }
      setDbReady(true);

      let activeHouseholdId = memberRows?.[0]?.household_id;

      if (!activeHouseholdId) {
        const starter = createStarterDataset("temp", locale);
        const { data: newHh, error: hhErr } = await supabase
          .from("households")
          .insert({
            name: starter.household.name,
            currency: starter.household.currency,
            default_locale: locale,
            created_by: uid,
          })
          .select()
          .single();

        if (hhErr || !newHh) return;
        activeHouseholdId = newHh.id;

        await supabase.from("household_members").insert({
          household_id: activeHouseholdId,
          user_id: uid,
          member_email: email,
          role: "owner",
        });

        const groupInsertPayload = starter.groups.map((g) => ({
          household_id: activeHouseholdId,
          name: g.name,
          kind: g.kind,
          icon: g.icon,
          color: g.color,
          sort_order: g.sort_order,
        }));
        const { data: insertedGroups } = await supabase
          .from("budget_groups")
          .insert(groupInsertPayload)
          .select();

        if (insertedGroups && insertedGroups.length > 0) {
          const oldToNewGroup = new Map<string, string>();
          starter.groups.forEach((og, idx) => {
            if (insertedGroups[idx]) {
              oldToNewGroup.set(og.id, insertedGroups[idx].id);
            }
          });

          const itemInsertPayload = starter.items.map((it) => ({
            household_id: activeHouseholdId,
            group_id: oldToNewGroup.get(it.group_id) || insertedGroups[0].id,
            name: it.name,
            entry_mode: it.entry_mode,
            expected_amount: it.expected_amount,
            recurrence_interval_months: it.recurrence_interval_months,
            anchor_month: it.anchor_month,
            coverage_months: it.coverage_months,
            is_variable_estimate: it.is_variable_estimate,
            seasonal_amounts: it.seasonal_amounts || null,
            cost_split: it.cost_split || "shared",
            target_amount: it.target_amount || null,
            current_saved: it.current_saved || 0,
            is_active: true,
            sort_order: it.sort_order,
          }));
          await supabase.from("budget_items").insert(itemInsertPayload);
        }
      }

      const [hhRes, memRes, grpRes, itmRes, recRes, txRes] = await Promise.all([
        supabase
          .from("households")
          .select("*")
          .eq("id", activeHouseholdId)
          .single(),
        supabase
          .from("household_members")
          .select("*")
          .eq("household_id", activeHouseholdId),
        supabase
          .from("budget_groups")
          .select("*")
          .eq("household_id", activeHouseholdId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("budget_items")
          .select("*")
          .eq("household_id", activeHouseholdId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("monthly_records")
          .select("*")
          .eq("household_id", activeHouseholdId),
        supabase
          .from("record_transactions")
          .select("*")
          .eq("household_id", activeHouseholdId)
          .order("spent_on", { ascending: false }),
      ]);

      if (hhRes.data) {
        setHousehold(hhRes.data as Household);
        if (hhRes.data.default_locale) {
          setLocale(hhRes.data.default_locale as Locale);
        }
      }
      if (memRes.data) setMembers(memRes.data as HouseholdMember[]);
      if (grpRes.data) setGroups(grpRes.data as BudgetGroup[]);
      if (itmRes.data) setItems(itmRes.data as BudgetItem[]);
      if (recRes.data) {
        const txsByRecord = new Map<string, typeof txRes.data>();
        (txRes.data || []).forEach((tx) => {
          const list = txsByRecord.get(tx.monthly_record_id) || [];
          list.push(tx);
          txsByRecord.set(tx.monthly_record_id, list);
        });
        const enrichedRecords: MonthlyRecord[] = recRes.data.map((r) => ({
          ...(r as MonthlyRecord),
          expected_snapshot: Number(r.expected_snapshot),
          actual_amount:
            r.actual_amount !== null ? Number(r.actual_amount) : null,
          transactions: txsByRecord.get(r.id) || [],
        }));
        setRecords(enrichedRecords);
      }
    },
    [supabase, locale]
  );

  useEffect(() => {
    let mounted = true;
    async function initAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const { error: probeError } = await supabase
        .from("households")
        .select("id")
        .limit(1);
      if (mounted) {
        setDbReady(!probeError);
      }

      if (session?.user && mounted) {
        setUserId(session.user.id);
        setUserEmail(session.user.email ?? null);
        await loadCloudData(session.user.id, session.user.email ?? null);
      }
    }
    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email ?? null);
        await loadCloudData(session.user.id, session.user.email ?? null);
      } else {
        setUserId(null);
        setUserEmail(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadCloudData]);

  const computedItems = useMemo(
    () =>
      computeMonthlyBudget(
        groups,
        items,
        records,
        yearMonth,
        viewMode,
        locale
      ),
    [groups, items, records, yearMonth, viewMode, locale]
  );

  // Filtered computed items for the Budget tab
  const filteredComputedItems = useMemo(() => {
    if (budgetFilter === "unconfirmed") {
      return computedItems.filter(
        (c) => c.isPaymentMonth && c.record?.status !== "confirmed"
      );
    }
    if (budgetFilter === "due_now") {
      return computedItems.filter((c) => c.isPaymentMonth);
    }
    return computedItems;
  }, [computedItems, budgetFilter]);

  const selectedComputed = useMemo(
    () => computedItems.find((c) => c.item.id === selectedItemId) || null,
    [computedItems, selectedItemId]
  );

  const summary = useMemo(() => {
    let expectedIncome = 0;
    let effectiveIncome = 0;
    let expectedExpense = 0;
    let effectiveExpense = 0;
    let expectedSavings = 0;
    let effectiveSavings = 0;

    let dueItemsCount = 0;
    let confirmedCount = 0;

    for (const c of computedItems) {
      if (c.isPaymentMonth) {
        dueItemsCount++;
        if (c.record?.status === "confirmed") {
          confirmedCount++;
        }
      }

      if (c.group.kind === "income") {
        expectedIncome += c.displayedExpected;
        effectiveIncome += c.effectiveAmount;
      } else if (c.group.kind === "savings") {
        expectedSavings += c.displayedExpected;
        effectiveSavings += c.effectiveAmount;
      } else {
        expectedExpense += c.displayedExpected;
        effectiveExpense += c.effectiveAmount;
      }
    }

    const leftToSpend = effectiveIncome - effectiveExpense - effectiveSavings;
    const expectedLeft = expectedIncome - expectedExpense - expectedSavings;

    return {
      expectedIncome,
      effectiveIncome,
      expectedExpense,
      effectiveExpense,
      expectedSavings,
      effectiveSavings,
      leftToSpend,
      expectedLeft,
      dueItemsCount,
      confirmedCount,
    };
  }, [computedItems]);

  const handleConfirmActual = async (
    itemId: string,
    actualAmount: number,
    notes: string,
    futureDecision?: FutureUpdateDecision
  ) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    if (futureDecision) {
      const itemUpdates: Partial<BudgetItem> = {};
      if (futureDecision.updateExpectedAmount !== undefined) {
        itemUpdates.expected_amount = futureDecision.updateExpectedAmount;
      }
      if (
        futureDecision.makeRecurringInterval !== undefined &&
        futureDecision.makeRecurringInterval > 0
      ) {
        itemUpdates.recurrence_interval_months =
          futureDecision.makeRecurringInterval;
        itemUpdates.one_time_year_month = null;
        itemUpdates.coverage_months = futureDecision.makeRecurringInterval;
      }

      if (Object.keys(itemUpdates).length > 0) {
        if (userId && dbReady) {
          await supabase
            .from("budget_items")
            .update(itemUpdates)
            .eq("id", itemId);
        }
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId ? { ...it, ...itemUpdates } : it
          )
        );
      }
    }

    const existingRec = records.find(
      (r) => r.item_id === itemId && r.year_month === yearMonth
    );

    if (userId && dbReady) {
      const payload = {
        household_id: household.id,
        item_id: itemId,
        year_month: yearMonth,
        expected_snapshot: targetItem.expected_amount,
        actual_amount: actualAmount,
        status: "confirmed" as const,
        notes: notes || null,
        confirmed_by: userId,
        confirmed_at: new Date().toISOString(),
      };

      const { data } = await supabase
        .from("monthly_records")
        .upsert(payload, { onConflict: "item_id,year_month" })
        .select()
        .single();

      if (data) {
        setRecords((prev) => {
          const filtered = prev.filter(
            (r) => !(r.item_id === itemId && r.year_month === yearMonth)
          );
          return [
            ...filtered,
            {
              ...(data as MonthlyRecord),
              actual_amount: Number(data.actual_amount),
              expected_snapshot: Number(data.expected_snapshot),
              transactions: existingRec?.transactions || [],
            },
          ];
        });
        return;
      }
    }

    const updatedRecord: MonthlyRecord = {
      id: existingRec?.id || `rec-${Date.now()}`,
      household_id: household.id,
      item_id: itemId,
      year_month: yearMonth,
      expected_snapshot: targetItem.expected_amount,
      actual_amount: actualAmount,
      status: "confirmed",
      notes: notes || null,
      confirmed_at: new Date().toISOString(),
      transactions: existingRec?.transactions || [],
    };

    setRecords((prev) => [
      ...prev.filter(
        (r) => !(r.item_id === itemId && r.year_month === yearMonth)
      ),
      updatedRecord,
    ]);
  };

  // Inline 1-Tap Quick-Confirm toggle directly from the dashboard list!
  const handleQuickToggleConfirm = async (
    e: React.MouseEvent,
    c: ComputedItemMonth
  ) => {
    e.stopPropagation();
    const isConfirmed = c.record?.status === "confirmed";
    if (isConfirmed) {
      await handleResetPending(c.item.id);
    } else {
      const txSum = (c.record?.transactions || []).reduce(
        (s, tx) => s + Number(tx.amount),
        0
      );
      const amtToConfirm = txSum > 0 ? txSum : c.displayedExpected;
      await handleConfirmActual(c.item.id, amtToConfirm, c.record?.notes || "");
    }
  };

  const handleBulkConfirmItems = async (itemIds: string[]) => {
    for (const id of itemIds) {
      const comp = computedItems.find((c) => c.item.id === id);
      if (comp) {
        await handleConfirmActual(id, comp.displayedExpected, "");
      }
    }
  };

  const handleRolloverToSavings = async (
    savingsItemId: string,
    amount: number
  ) => {
    const target = items.find((i) => i.id === savingsItemId);
    if (!target) return;
    const nextSaved = Number(target.current_saved || 0) + amount;
    if (userId && dbReady) {
      await supabase
        .from("budget_items")
        .update({ current_saved: nextSaved })
        .eq("id", savingsItemId);
    }
    setItems((prev) =>
      prev.map((i) =>
        i.id === savingsItemId ? { ...i, current_saved: nextSaved } : i
      )
    );
  };

  const handleImportRows = async (rows: ImportedRowAction[]) => {
    // Group existing_item rows by targetItemId so multiple receipts (e.g. ICA + Willys) sum cleanly
    const byTargetItem = new Map<string, ImportedRowAction[]>();

    for (const row of rows) {
      if (row.actionType === "skip") continue;
      if (row.actionType === "existing_item" && row.targetItemId) {
        const list = byTargetItem.get(row.targetItemId) || [];
        list.push(row);
        byTargetItem.set(row.targetItemId, list);
      } else if (
        (row.actionType === "new_once" || row.actionType === "new_monthly") &&
        row.targetGroupId
      ) {
        const [, mStr] = yearMonth.split("-");
        const activeM = parseInt(mStr || "1", 10);
        await handleSaveItem(
          {
            name: row.description,
            group_id: row.targetGroupId,
            expected_amount: row.amount,
            entry_mode: "single_bill",
            recurrence_interval_months:
              row.actionType === "new_once" ? 0 : 1,
            one_time_year_month:
              row.actionType === "new_once" ? yearMonth : null,
            anchor_month: activeM,
            coverage_months: 1,
            is_variable_estimate: false,
            cost_split: "shared",
          },
          undefined,
          row.amount
        );
      }
    }

    for (const [targetItemId, itemRows] of byTargetItem.entries()) {
      const target = items.find((i) => i.id === targetItemId);
      if (!target) continue;
      const existingRec = records.find(
        (r) => r.item_id === targetItemId && r.year_month === yearMonth
      );
      const hasExistingTxs = (existingRec?.transactions?.length || 0) > 0;

      if (
        itemRows.length === 1 &&
        target.entry_mode === "single_bill" &&
        !hasExistingTxs
      ) {
        const only = itemRows[0];
        await handleConfirmActual(
          target.id,
          only.amount,
          `Import: ${only.description}`
        );
      } else {
        for (const r of itemRows) {
          await handleAddTransaction(
            target.id,
            r.amount,
            r.description,
            r.date
          );
        }
      }
    }
  };

  const handleResetPending = async (itemId: string) => {
    const existingRec = records.find(
      (r) => r.item_id === itemId && r.year_month === yearMonth
    );
    if (!existingRec) return;

    if (userId && dbReady) {
      await supabase
        .from("monthly_records")
        .update({ status: "pending", actual_amount: null })
        .eq("id", existingRec.id);
    }

    setRecords((prev) =>
      prev.map((r) =>
        r.id === existingRec.id
          ? { ...r, status: "pending", actual_amount: null }
          : r
      )
    );
  };

  const handleAddTransaction = async (
    itemId: string,
    amount: number,
    description: string,
    customSpentOn?: string
  ) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const spentOn = customSpentOn || new Date().toISOString().slice(0, 10);

    if (userId && dbReady) {
      let existingRec = records.find(
        (r) => r.item_id === itemId && r.year_month === yearMonth
      );
      if (!existingRec) {
        const { data: createdRec } = await supabase
          .from("monthly_records")
          .upsert(
            {
              household_id: household.id,
              item_id: itemId,
              year_month: yearMonth,
              expected_snapshot: targetItem.expected_amount,
              status: "pending",
            },
            { onConflict: "item_id,year_month" }
          )
          .select()
          .single();
        if (createdRec) {
          existingRec = { ...(createdRec as MonthlyRecord), transactions: [] };
        }
      }

      if (existingRec) {
        const { data: newTx } = await supabase
          .from("record_transactions")
          .insert({
            household_id: household.id,
            monthly_record_id: existingRec.id,
            amount,
            description,
            spent_on: spentOn,
            created_by: userId,
          })
          .select()
          .single();

        if (newTx) {
          setRecords((prev) => {
            const current = prev.find(
              (r) => r.item_id === itemId && r.year_month === yearMonth
            );
            const prevTxs = current?.transactions || [];
            const updatedRec: MonthlyRecord = {
              ...(current || existingRec!),
              transactions: [newTx, ...prevTxs],
            };
            return [
              ...prev.filter(
                (r) => !(r.item_id === itemId && r.year_month === yearMonth)
              ),
              updatedRec,
            ];
          });
          return;
        }
      }
    }

    const newTxId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setRecords((prev) => {
      const current = prev.find(
        (r) => r.item_id === itemId && r.year_month === yearMonth
      );
      const recId =
        current?.id ||
        `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newTx = {
        id: newTxId,
        household_id: household.id,
        monthly_record_id: recId,
        amount,
        description,
        spent_on: spentOn,
      };
      const nextRecord: MonthlyRecord = current
        ? {
            ...current,
            transactions: [newTx, ...(current.transactions || [])],
          }
        : {
            id: recId,
            household_id: household.id,
            item_id: itemId,
            year_month: yearMonth,
            expected_snapshot: targetItem.expected_amount,
            actual_amount: null,
            status: "pending",
            transactions: [newTx],
          };
      return [
        ...prev.filter(
          (r) => !(r.item_id === itemId && r.year_month === yearMonth)
        ),
        nextRecord,
      ];
    });
  };

  const handleDeleteTransaction = async (itemId: string, txId: string) => {
    if (userId && dbReady) {
      await supabase.from("record_transactions").delete().eq("id", txId);
    }
    setRecords((prev) =>
      prev.map((r) =>
        r.item_id === itemId && r.year_month === yearMonth
          ? {
              ...r,
              transactions: (r.transactions || []).filter(
                (tx) => tx.id !== txId
              ),
            }
          : r
      )
    );
  };

  const handleSaveItem = async (
    data: Omit<BudgetItem, "id" | "household_id" | "sort_order" | "is_active">,
    existingId?: string,
    autoConfirmActual?: number
  ) => {
    if (existingId) {
      if (userId && dbReady) {
        await supabase.from("budget_items").update(data).eq("id", existingId);
      }
      setItems((prev) =>
        prev.map((it) => (it.id === existingId ? { ...it, ...data } : it))
      );
    } else {
      let createdItemId = `itm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (userId && dbReady) {
        const { data: inserted } = await supabase
          .from("budget_items")
          .insert({
            ...data,
            household_id: household.id,
            is_active: true,
            sort_order: items.length + 1,
          })
          .select()
          .single();
        if (inserted) {
          createdItemId = inserted.id;
          setItems((prev) => [...prev, inserted as BudgetItem]);
        } else {
          const fallbackItem: BudgetItem = {
            ...data,
            id: createdItemId,
            household_id: household.id,
            is_active: true,
            sort_order: items.length + 1,
          };
          setItems((prev) => [...prev, fallbackItem]);
        }
      } else {
        const newItem: BudgetItem = {
          ...data,
          id: createdItemId,
          household_id: household.id,
          is_active: true,
          sort_order: items.length + 1,
        };
        setItems((prev) => [...prev, newItem]);
      }

      if (autoConfirmActual !== undefined) {
        if (userId && dbReady) {
          const { data: recData } = await supabase
            .from("monthly_records")
            .upsert(
              {
                household_id: household.id,
                item_id: createdItemId,
                year_month: yearMonth,
                expected_snapshot: data.expected_amount,
                actual_amount: autoConfirmActual,
                status: "confirmed",
                confirmed_by: userId,
                confirmed_at: new Date().toISOString(),
              },
              { onConflict: "item_id,year_month" }
            )
            .select()
            .single();
          if (recData) {
            setRecords((prev) => [
              ...prev,
              {
                ...(recData as MonthlyRecord),
                expected_snapshot: Number(recData.expected_snapshot),
                actual_amount: Number(recData.actual_amount),
                transactions: [],
              },
            ]);
            return;
          }
        }

        const autoRec: MonthlyRecord = {
          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          household_id: household.id,
          item_id: createdItemId,
          year_month: yearMonth,
          expected_snapshot: data.expected_amount,
          actual_amount: autoConfirmActual,
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          transactions: [],
        };
        setRecords((prev) => [...prev, autoRec]);
      }
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (userId && dbReady) {
      await supabase.from("budget_items").delete().eq("id", id);
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selectedItemId === id) setSelectedItemId(null);
  };

  const handleSaveGroup = async (
    name: string,
    kind: BudgetGroupKind,
    color: string,
    existingId?: string
  ) => {
    if (existingId) {
      if (userId && dbReady) {
        await supabase
          .from("budget_groups")
          .update({ name, kind, color })
          .eq("id", existingId);
      }
      setGroups((prev) =>
        prev.map((g) => (g.id === existingId ? { ...g, name, kind, color } : g))
      );
      return;
    }

    if (userId && dbReady) {
      const { data: inserted } = await supabase
        .from("budget_groups")
        .insert({
          household_id: household.id,
          name,
          kind,
          icon: "Folder",
          color,
          sort_order: groups.length + 1,
        })
        .select()
        .single();
      if (inserted) {
        setGroups((prev) => [...prev, inserted as BudgetGroup]);
        return;
      }
    }

    const newGrp: BudgetGroup = {
      id: `grp-${Date.now()}`,
      household_id: household.id,
      name,
      kind,
      icon: "Folder",
      color,
      sort_order: groups.length + 1,
    };
    setGroups((prev) => [...prev, newGrp]);
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (userId && dbReady) {
      await supabase.from("budget_groups").delete().eq("id", groupId);
    }
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setItems((prev) => prev.filter((i) => i.group_id !== groupId));
  };

  const handleMoveGroup = async (
    groupId: string,
    direction: "up" | "down"
  ) => {
    const idx = groups.findIndex((g) => g.id === groupId);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= groups.length) return;
    const next = [...groups];
    const [removed] = next.splice(idx, 1);
    next.splice(swapIdx, 0, removed);
    const reordered = next.map((g, i) => ({ ...g, sort_order: i + 1 }));
    setGroups(reordered);

    if (userId && dbReady) {
      for (const g of reordered) {
        await supabase
          .from("budget_groups")
          .update({ sort_order: g.sort_order })
          .eq("id", g.id);
      }
    }
  };

  const handleUpdateHousehold = async (patch: Partial<Household>) => {
    if (userId && dbReady) {
      await supabase.from("households").update(patch).eq("id", household.id);
    }
    setHousehold((prev) => ({ ...prev, ...patch }));
  };

  const handleJoinHouseholdByCode = async (code: string) => {
    if (!userId || !dbReady) {
      throw new Error(
        locale === "sv"
          ? "Logga in på ditt konto först för att gå med i ett hushåll."
          : "Please sign in first to join a shared household."
      );
    }
    const { error } = await supabase.rpc("join_household_by_code", {
      p_invite_code: code,
    });
    if (error) throw new Error(error.message);
    await loadCloudData(userId, userEmail);
  };

  const handleChangeCurrency = async (cur: string) => {
    await handleUpdateHousehold({ currency: cur });
  };

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[#f4f4f2] px-4 pt-5 text-[#282825]">
      {/* Top Editorial Masthead */}
      <header className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#282825] bg-white font-serif text-2xl italic text-[#282825] shadow-xs">
            b.
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-2xl tracking-tight text-[#282825] leading-none">
                {household.name}
              </h1>
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  userId && dbReady ? "bg-[#529a6a]" : "bg-[#f09236]"
                }`}
                title={
                  userId && dbReady ? "Cloud Synced" : "Local Preview Mode"
                }
              />
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-[#64645e]">
              {t.tagline}
            </p>
          </div>
        </div>

        {/* Theme + Language + Quick Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTheme((th) => (th === "light" ? "dark" : "light"))}
            className="rounded-full border border-[#c5c5ba] bg-white p-1.5 text-[#282825] hover:border-[#282825] transition"
            title={
              theme === "light"
                ? "Switch to Ellipsus Deep Ink Dark Mode"
                : "Switch to Warm Paper Mode"
            }
          >
            {theme === "light" ? (
              <Moon className="h-3.5 w-3.5" />
            ) : (
              <Sun className="h-3.5 w-3.5 text-[#f09236]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setLocale((l) => (l === "sv" ? "en" : "sv"))}
            className="rounded-full border border-[#c5c5ba] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#282825] hover:border-[#282825] transition"
          >
            {locale === "sv" ? "SV" : "EN"}
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingItem(null);
              setUnexpectedMode(true);
              setDefaultGroupIdForNew(
                groups.find((g) => g.kind === "expense")?.id || groups[0]?.id
              );
              setItemModalOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-[#282825] bg-[#fdeee0] px-2.5 py-1.5 text-xs font-semibold text-[#282825] hover:bg-[#faca9e] transition"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#b85d10]" />
            <span className="hidden sm:inline">{t.actions.addUnexpected}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingItem(null);
              setUnexpectedMode(false);
              setDefaultGroupIdForNew(groups[0]?.id);
              setItemModalOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-full bg-[#0c0d0d] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#282825] transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{locale === "sv" ? "Post" : "Item"}</span>
          </button>
        </div>
      </header>

      {/* Editorial Month Selector Strip */}
      {(activeTab === "budget" || activeTab === "insights") && (
        <div className="mb-3 flex items-center justify-between rounded-full border border-[#282825] bg-white px-2.5 py-1.5 shadow-editorial">
          <button
            type="button"
            onClick={() => setYearMonth((ym) => shiftYearMonth(ym, -1))}
            className="rounded-full p-1.5 text-[#282825] hover:bg-[#ecece9] transition"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="text-center">
            <div className="font-serif text-xl tracking-wide text-[#282825]">
              {formatYearMonthLabel(yearMonth, locale)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setYearMonth((ym) => shiftYearMonth(ym, 1))}
            className="rounded-full p-1.5 text-[#282825] hover:bg-[#ecece9] transition"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Tab Content */}
      {activeTab === "budget" && (
        <main className="space-y-4 pb-28">
          {/* View Mode Toggle: Payment Month vs Monthly Average (Buffer) */}
          <div className="grid grid-cols-2 gap-1.5 rounded-full bg-[#ecece9] p-1 border border-[#c5c5ba]">
            <button
              type="button"
              onClick={() => setViewMode("cashflow")}
              className={`rounded-full py-2 px-3 text-xs font-semibold transition ${
                viewMode === "cashflow"
                  ? "bg-[#0c0d0d] text-white shadow-xs"
                  : "text-[#64645e] hover:text-[#282825]"
              }`}
            >
              {t.viewMode.cashflow}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("accrual")}
              className={`rounded-full py-2 px-3 text-xs font-semibold transition ${
                viewMode === "accrual"
                  ? "bg-[#0c0d0d] text-white shadow-xs"
                  : "text-[#64645e] hover:text-[#282825]"
              }`}
            >
              {t.viewMode.accrual}
            </button>
          </div>

          {/* Editorial Hero Card */}
          <div className="rounded-3xl border border-[#282825] bg-white p-5 shadow-editorial">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#64645e]">
                  {t.summary.leftToSpend}
                </span>
                <div className="relative inline-block mt-0.5">
                  <div
                    className={`font-serif text-4xl leading-none tracking-tight ${
                      summary.leftToSpend >= 0
                        ? "text-[#282825]"
                        : "text-[#b81a14]"
                    }`}
                  >
                    {formatCurrency(
                      summary.leftToSpend,
                      household.currency,
                      locale
                    )}
                  </div>
                  <BrushUnderline className="mt-1 h-2 w-full text-[#529a6a]" />
                </div>
                <div className="mt-1 font-mono text-[11px] text-[#64645e]">
                  {t.summary.expected}:{" "}
                  {formatCurrency(
                    summary.expectedLeft,
                    household.currency,
                    locale
                  )}
                </div>
              </div>

              {/* Confirmed Bills Highlighter Box (Tappable to open Month Close Wizard!) */}
              <button
                type="button"
                onClick={() => setMonthCloseModalOpen(true)}
                className="rounded-2xl border border-[#282825]/25 bg-[#e7f4eb] px-3.5 py-2.5 text-right hover:border-[#282825] transition"
              >
                <div className="text-[11px] font-semibold text-[#057b40] flex items-center justify-end gap-1">
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>{t.summary.confirmedProgress}</span>
                </div>
                <div className="mt-0.5 font-serif text-xl text-[#282825]">
                  {summary.confirmedCount} {t.summary.of}{" "}
                  {summary.dueItemsCount} {t.summary.done}
                </div>
                <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-white/80 border border-[#057b40]/20">
                  <div
                    className="h-full rounded-full bg-[#529a6a] transition-all"
                    style={{
                      width: `${
                        summary.dueItemsCount > 0
                          ? Math.round(
                              (summary.confirmedCount / summary.dueItemsCount) *
                                100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </button>
            </div>

            {/* 3 Highlighter Summary Pillars: Income, Expenses, Savings */}
            <div className="mt-4 grid grid-cols-3 gap-2 pt-3.5 border-t border-[#ecece9]">
              <div className="rounded-2xl bg-[#e7f4eb] p-2.5 border border-[#b5e3c4]">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-[#057b40]">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  <span>{t.summary.income}</span>
                </div>
                <div className="mt-1 font-serif text-lg text-[#282825] leading-tight">
                  {formatCurrency(
                    summary.effectiveIncome,
                    household.currency,
                    locale
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-[#fdeee0] p-2.5 border border-[#faca9e]">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-[#b85d10]">
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  <span>{t.summary.expenses}</span>
                </div>
                <div className="mt-1 font-serif text-lg text-[#282825] leading-tight">
                  {formatCurrency(
                    summary.effectiveExpense,
                    household.currency,
                    locale
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-[#f6e6fc] p-2.5 border border-[#edc6fb]">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-[#7a2899]">
                  <PiggyBank className="h-3.5 w-3.5" />
                  <span>{t.summary.savings}</span>
                </div>
                <div className="mt-1 font-serif text-lg text-[#282825] leading-tight">
                  {formatCurrency(
                    summary.effectiveSavings,
                    household.currency,
                    locale
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Smart Filter Pills + Bank Import & Month Close Triggers */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-0.5">
            <div className="inline-flex items-center gap-1">
              {(
                [
                  {
                    id: "all" as BudgetFilter,
                    labelSv: "Alla",
                    labelEn: "All",
                  },
                  {
                    id: "unconfirmed" as BudgetFilter,
                    labelSv: "Att följa upp",
                    labelEn: "Unconfirmed",
                  },
                  {
                    id: "due_now" as BudgetFilter,
                    labelSv: "Denna månad",
                    labelEn: "Due now",
                  },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setBudgetFilter(f.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition border ${
                    budgetFilter === f.id
                      ? "border-[#282825] bg-[#0c0d0d] text-white"
                      : "border-[#c5c5ba] bg-white text-[#64645e]"
                  }`}
                >
                  {locale === "sv" ? f.labelSv : f.labelEn}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                className="inline-flex items-center gap-1 rounded-full border border-[#282825] bg-[#e1edfe] px-3 py-1.5 text-xs font-semibold text-[#2173be] hover:bg-[#b8d5ff]"
                title={
                  locale === "sv"
                    ? "Importera Excel / CSV från bank"
                    : "Import bank Excel / CSV"
                }
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>{locale === "sv" ? "Bankimport" : "Import"}</span>
              </button>
            </div>
          </div>

          {/* Groups & Budget Items List */}
          <div className="space-y-4">
            {groups.map((group, idx) => {
              const groupItems = filteredComputedItems.filter(
                (c) => c.group.id === group.id
              );
              if (budgetFilter !== "all" && groupItems.length === 0) {
                return null;
              }
              const groupExpected = groupItems.reduce(
                (s, c) => s + c.displayedExpected,
                0
              );
              const groupEffective = groupItems.reduce(
                (s, c) => s + c.effectiveAmount,
                0
              );
              const groupVariance = groupEffective - groupExpected;
              const dueInGroup = groupItems.filter((c) => c.isPaymentMonth);
              const confirmedInGroup = dueInGroup.filter(
                (c) => c.record?.status === "confirmed"
              );
              const groupProgressPct =
                dueInGroup.length > 0
                  ? Math.round(
                      (confirmedInGroup.length / dueInGroup.length) * 100
                    )
                  : 0;
              const isCollapsed = Boolean(collapsedGroupIds[group.id]);
              const hl = getGroupHighlighter(group, idx);

              return (
                <section
                  key={group.id}
                  className="rounded-3xl border border-[#c5c5ba] bg-white overflow-hidden shadow-editorial"
                >
                  {/* Collapsible Group Highlighter Header + Progress Bar */}
                  <div
                    className={`${hl.headerBg} ${
                      isCollapsed ? "" : "border-b border-[#c5c5ba]/70"
                    }`}
                  >
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedGroupIds((prev) => ({
                              ...prev,
                              [group.id]: !prev[group.id],
                            }))
                          }
                          className="flex items-center gap-1.5 text-left hover:opacity-80 transition min-w-0"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 shrink-0 text-[#282825]" />
                          ) : (
                            <ChevronDown className="h-4 w-4 shrink-0 text-[#282825]" />
                          )}
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${hl.dot}`}
                          />
                          <h2 className="truncate font-serif text-lg tracking-wide text-[#282825]">
                            {group.name}
                          </h2>
                        </button>

                        {dueInGroup.length > 0 && (
                          <span className="ml-1 rounded-full bg-white/80 px-2 py-0.5 font-mono text-[10px] font-bold text-[#282825] border border-[#282825]/15 shrink-0">
                            {confirmedInGroup.length}/{dueInGroup.length} ✓
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setEditingGroup(group);
                            setGroupModalOpen(true);
                          }}
                          className="rounded-full p-1 text-[#64645e] hover:text-[#282825] shrink-0"
                          title={
                            locale === "sv" ? "Redigera grupp" : "Edit group"
                          }
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right font-mono text-xs">
                          <div>
                            <span className="font-bold text-[#282825]">
                              {formatCurrency(
                                groupEffective,
                                household.currency,
                                locale
                              )}
                            </span>
                            <span className="text-[#64645e]">
                              {" "}
                              /{" "}
                              {formatCurrency(
                                groupExpected,
                                household.currency,
                                locale
                              )}
                            </span>
                          </div>
                          {Math.round(groupVariance) !== 0 && (
                            <div
                              className={`text-[10px] font-bold ${
                                group.kind === "income"
                                  ? groupVariance > 0
                                    ? "text-[#057b40]"
                                    : "text-[#b81a14]"
                                  : groupVariance < 0
                                  ? "text-[#057b40]"
                                  : "text-[#b85d10]"
                              }`}
                            >
                              {groupVariance > 0 ? "+" : ""}
                              {formatCurrency(
                                groupVariance,
                                household.currency,
                                locale
                              )}{" "}
                              {locale === "sv" ? "avvikelse" : "var"}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem(null);
                            setUnexpectedMode(false);
                            setDefaultGroupIdForNew(group.id);
                            setItemModalOpen(true);
                          }}
                          className="rounded-full border border-[#282825]/30 bg-white/80 p-1 text-[#282825] hover:bg-white transition"
                          title={t.actions.addItem}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Group Confirmation Progress Bar */}
                    {dueInGroup.length > 0 && (
                      <div className="px-4 pb-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/75 border border-[#282825]/10">
                          <div
                            className={`h-full rounded-full transition-all ${hl.dot}`}
                            style={{ width: `${groupProgressPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Items inside group (when not collapsed) */}
                  {!isCollapsed && (
                    <div className="divide-y divide-[#ecece9]">
                      {groupItems.map((c) => {
                        const {
                          item,
                          record,
                          isPaymentMonth,
                          displayedExpected,
                          displayedActual,
                          variance,
                          coverageLabel,
                        } = c;
                        const isConfirmed = record?.status === "confirmed";
                        const itemTxs = record?.transactions || [];
                        const hasPartialTx = itemTxs.length > 0;
                        const txSum = itemTxs.reduce(
                          (s, tx) => s + Number(tx.amount),
                          0
                        );
                        const txPct =
                          displayedExpected > 0
                            ? Math.min(
                                100,
                                Math.round((txSum / displayedExpected) * 100)
                              )
                            : 0;
                        const hasGoal =
                          item.target_amount && item.target_amount > 0;
                        const goalPct = hasGoal
                          ? Math.min(
                              100,
                              Math.round(
                                ((Number(item.current_saved || 0) +
                                  (isConfirmed ? c.effectiveAmount : 0)) /
                                  Number(item.target_amount)) *
                                  100
                              )
                            )
                          : 0;

                        return (
                          <div
                            key={item.id}
                            onClick={() => setSelectedItemId(item.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                setSelectedItemId(item.id);
                              }
                            }}
                            className={`w-full cursor-pointer px-4 py-3.5 text-left transition hover:bg-[#f8f8f7] active:bg-[#ecece9] ${
                              !isPaymentMonth && viewMode === "cashflow"
                                ? "opacity-55"
                                : ""
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                {/* Inline 1-Tap Quick-Confirm Button */}
                                <button
                                  type="button"
                                  onClick={(e) => handleQuickToggleConfirm(e, c)}
                                  title={
                                    isConfirmed
                                      ? locale === "sv"
                                        ? "Ångra bekräftelse"
                                        : "Undo confirm"
                                      : locale === "sv"
                                      ? "Snabb-bekräfta belopp"
                                      : "1-tap confirm"
                                  }
                                  className="mt-0.5 shrink-0 rounded-full p-0.5 hover:scale-110 transition"
                                >
                                  {isConfirmed ? (
                                    <CheckCircle2 className="h-5 w-5 text-[#057b40]" />
                                  ) : hasPartialTx ? (
                                    <Layers className="h-5 w-5 text-[#f09236]" />
                                  ) : (
                                    <Circle className="h-5 w-5 text-[#c5c5ba] hover:text-[#057b40]" />
                                  )}
                                </button>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-sm font-semibold text-[#282825]">
                                      {item.name}
                                    </span>
                                    {item.cost_split &&
                                      item.cost_split !== "shared" && (
                                        <span className="rounded-full bg-[#e1edfe] px-2 py-0.2 text-[10px] font-bold text-[#2173be]">
                                          {item.cost_split === "personal_a"
                                            ? household.partner_a_name || "A"
                                            : household.partner_b_name || "B"}
                                        </span>
                                      )}
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-[#64645e]">
                                    <CalendarClock className="h-3 w-3 shrink-0 text-[#8f8f89]" />
                                    <span>{coverageLabel}</span>
                                    {hasPartialTx && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fdeee0] px-2 py-0.2 font-sans text-[10px] font-bold text-[#b85d10]">
                                        <Layers className="h-2.5 w-2.5" />
                                        {itemTxs.length}{" "}
                                        {locale === "sv"
                                          ? "delkvitton"
                                          : "receipts"}
                                      </span>
                                    )}
                                    {hasGoal && (
                                      <span className="inline-flex items-center gap-0.5 rounded-full bg-[#f6e6fc] px-2 py-0.2 font-sans text-[10px] font-bold text-[#7a2899]">
                                        <Target className="h-2.5 w-2.5" />
                                        {goalPct}%
                                      </span>
                                    )}
                                    {record?.notes && (
                                      <span className="rounded-full bg-[#ffe81a]/60 px-2 py-0.2 font-sans text-[10px] font-medium text-[#282825]">
                                        {record.notes}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Right Side Amounts */}
                              <div className="shrink-0 text-right">
                                {displayedActual !== null ? (
                                  <>
                                    <div className="font-serif text-lg leading-tight text-[#282825]">
                                      {formatCurrency(
                                        displayedActual,
                                        household.currency,
                                        locale
                                      )}
                                    </div>
                                    <div className="flex items-center justify-end gap-1 font-mono text-[11px]">
                                      <span className="text-[#8f8f89] line-through">
                                        {formatCurrency(
                                          displayedExpected,
                                          household.currency,
                                          locale
                                        )}
                                      </span>
                                      {variance !== null &&
                                        Math.round(variance) !== 0 && (
                                          <span
                                            className={`rounded-full px-1.5 py-0.2 font-sans text-[10px] font-bold ${
                                              variance < 0
                                                ? "bg-[#e7f4eb] text-[#057b40]"
                                                : "bg-[#fdeee0] text-[#b85d10]"
                                            }`}
                                          >
                                            {variance > 0 ? "+" : ""}
                                            {formatCurrency(
                                              variance,
                                              household.currency,
                                              locale
                                            )}
                                          </span>
                                        )}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="font-serif text-lg leading-tight text-[#282825]">
                                      {formatCurrency(
                                        displayedExpected,
                                        household.currency,
                                        locale
                                      )}
                                    </div>
                                    <div className="text-[11px] font-medium text-[#057b40]">
                                      {!isPaymentMonth &&
                                      viewMode === "cashflow"
                                        ? t.status.offMonth
                                        : !isPaymentMonth &&
                                          viewMode === "accrual"
                                        ? t.status.offMonthAccrual
                                        : locale === "sv"
                                        ? "Tryck för utfall →"
                                        : "Tap to confirm →"}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Inline Sub-Entries / Receipt Breakdown Progress Bar & Chips */}
                            {hasPartialTx && (
                              <div className="mt-2.5 pl-8">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#ecece9]">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      txSum > displayedExpected
                                        ? "bg-[#eb5b55]"
                                        : "bg-[#529a6a]"
                                    }`}
                                    style={{ width: `${txPct}%` }}
                                  />
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {itemTxs.slice(0, 4).map((tx) => (
                                    <span
                                      key={tx.id}
                                      className="inline-flex items-center gap-1 rounded-full border border-[#c5c5ba]/70 bg-[#f8f8f7] px-2 py-0.5 text-[10px] font-medium text-[#64645e]"
                                    >
                                      <span className="truncate max-w-[110px] text-[#282825]">
                                        {tx.description}
                                      </span>
                                      <span className="font-mono font-bold text-[#282825]">
                                        {formatCurrency(
                                          tx.amount,
                                          household.currency,
                                          locale
                                        )}
                                      </span>
                                    </span>
                                  ))}
                                  {itemTxs.length > 4 && (
                                    <span className="rounded-full bg-[#ecece9] px-2 py-0.5 font-mono text-[10px] text-[#64645e]">
                                      +{itemTxs.length - 4}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {/* Bottom Action Strip: Add Item, Add Group */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setUnexpectedMode(false);
                setDefaultGroupIdForNew(groups[0]?.id);
                setItemModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 rounded-full bg-[#0c0d0d] py-3 text-xs font-semibold text-white hover:bg-[#282825] transition"
            >
              <Plus className="h-4 w-4" />
              {t.actions.addItem}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingGroup(null);
                setGroupModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 rounded-full border border-[#282825] bg-white py-3 text-xs font-semibold text-[#282825] hover:bg-[#ecece9] transition"
            >
              <FolderPlus className="h-4 w-4" />
              {t.actions.addGroup}
            </button>
          </div>
        </main>
      )}

      {activeTab === "matrix" && (
        <AnnualMatrixView
          groups={groups}
          items={items}
          records={records}
          activeYearMonth={yearMonth}
          viewMode={viewMode}
          currency={household.currency}
          locale={locale}
          onChangeViewMode={setViewMode}
          onSelectMonthCell={(ym, itemId) => {
            setYearMonth(ym);
            setActiveTab("budget");
            if (itemId) {
              setSelectedItemId(itemId);
            }
          }}
        />
      )}

      {activeTab === "insights" && (
        <InsightsView
          household={household}
          groups={groups}
          items={items}
          records={records}
          computedItems={computedItems}
          yearMonth={yearMonth}
          viewMode={viewMode}
          currency={household.currency}
          locale={locale}
        />
      )}

      {activeTab === "household" && (
        <HouseholdView
          household={household}
          members={members}
          userEmail={userEmail}
          dbReady={dbReady}
          locale={locale}
          theme={theme}
          currency={household.currency}
          onChangeLocale={setLocale}
          onChangeTheme={setTheme}
          onChangeCurrency={handleChangeCurrency}
          onUpdateHousehold={handleUpdateHousehold}
          onJoinHouseholdByCode={handleJoinHouseholdByCode}
          onSignOut={async () => {
            await supabase.auth.signOut();
          }}
        />
      )}

      {/* Follow-Up Bottom Sheet */}
      <FollowUpSheet
        computed={selectedComputed}
        yearMonth={yearMonth}
        currency={household.currency}
        locale={locale}
        onClose={() => setSelectedItemId(null)}
        onConfirmActual={handleConfirmActual}
        onResetPending={handleResetPending}
        onAddTransaction={handleAddTransaction}
        onDeleteTransaction={handleDeleteTransaction}
        onEditItem={(comp: ComputedItemMonth) => {
          setSelectedItemId(null);
          setEditingItem(comp.item);
          setUnexpectedMode(false);
          setItemModalOpen(true);
        }}
      />

      {/* Add / Edit Budget Item Modal */}
      <ItemFormModal
        open={itemModalOpen}
        editingItem={editingItem}
        defaultGroupId={defaultGroupIdForNew}
        unexpectedMode={unexpectedMode}
        yearMonth={yearMonth}
        groups={groups}
        partnerAName={household.partner_a_name}
        partnerBName={household.partner_b_name}
        currency={household.currency}
        locale={locale}
        onClose={() => {
          setItemModalOpen(false);
          setEditingItem(null);
          setUnexpectedMode(false);
        }}
        onSaveItem={handleSaveItem}
        onDeleteItem={handleDeleteItem}
      />

      {/* Add / Edit Custom Group Modal */}
      <GroupFormModal
        open={groupModalOpen}
        editingGroup={editingGroup}
        locale={locale}
        onClose={() => {
          setGroupModalOpen(false);
          setEditingGroup(null);
        }}
        onSaveGroup={handleSaveGroup}
        onDeleteGroup={handleDeleteGroup}
        onMoveGroup={handleMoveGroup}
      />

      {/* Bank / Credit Card CSV & XLSX Import Modal with Smart Merchant Rules */}
      <BankImportModal
        open={importModalOpen}
        yearMonth={yearMonth}
        groups={groups}
        items={items}
        merchantRules={household.merchant_rules || []}
        currency={household.currency}
        locale={locale}
        onClose={() => setImportModalOpen(false)}
        onImportRows={handleImportRows}
        onSaveMerchantRules={async (nextRules) => {
          await handleUpdateHousehold({ merchant_rules: nextRules });
        }}
      />

      {/* Month-End Close & Rollover Wizard Modal */}
      <MonthCloseModal
        open={monthCloseModalOpen}
        yearMonth={yearMonth}
        computedItems={computedItems}
        leftToSpend={summary.leftToSpend}
        currency={household.currency}
        locale={locale}
        onClose={() => setMonthCloseModalOpen(false)}
        onBulkConfirmItems={handleBulkConfirmItems}
        onRolloverToSavings={handleRolloverToSavings}
      />

      {/* Ellipsus-styled Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#c5c5ba] bg-[#f4f4f2]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-around py-2 px-3">
          <button
            type="button"
            onClick={() => setActiveTab("budget")}
            className={`flex flex-col items-center gap-0.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === "budget"
                ? "bg-[#e7f4eb] text-[#057b40] border border-[#282825]"
                : "text-[#64645e] hover:text-[#282825]"
            }`}
          >
            <Wallet className="h-4 w-4" />
            <span>{t.nav.budget}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("matrix")}
            className={`flex flex-col items-center gap-0.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === "matrix"
                ? "bg-[#f6e6fc] text-[#7a2899] border border-[#282825]"
                : "text-[#64645e] hover:text-[#282825]"
            }`}
          >
            <CalendarRange className="h-4 w-4" />
            <span>{locale === "sv" ? "Årsöversikt" : "Year Matrix"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("insights")}
            className={`flex flex-col items-center gap-0.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === "insights"
                ? "bg-[#fdeee0] text-[#b85d10] border border-[#282825]"
                : "text-[#64645e] hover:text-[#282825]"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>{t.nav.insights}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("household")}
            className={`flex flex-col items-center gap-0.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === "household"
                ? "bg-[#e1edfe] text-[#2173be] border border-[#282825]"
                : "text-[#64645e] hover:text-[#282825]"
            }`}
          >
            <Users className="h-4 w-4" />
            <span>{t.nav.household}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
