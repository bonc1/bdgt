"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Plus,
  FolderPlus,
  Wallet,
  BarChart3,
  Users,
  Sparkles,
  CalendarClock,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  PiggyBank,
} from "lucide-react";
import {
  BudgetGroup,
  BudgetGroupKind,
  BudgetItem,
  ComputedItemMonth,
  Household,
  HouseholdMember,
  Locale,
  MonthlyRecord,
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
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "bdgt_local_state_v1";

export default function BudgetAppPage() {
  const supabase = useMemo(() => createClient(), []);

  const [locale, setLocale] = useState<Locale>("sv");
  const [activeTab, setActiveTab] = useState<"budget" | "insights" | "household">(
    "budget"
  );
  const [yearMonth, setYearMonth] = useState<string>(() =>
    getCurrentYearMonth()
  );
  const [viewMode, setViewMode] = useState<ViewMode>("cashflow");

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
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [defaultGroupIdForNew, setDefaultGroupIdForNew] = useState<
    string | undefined
  >(undefined);
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  const t = translations[locale];

  // 1. Load local state on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.locale) setLocale(parsed.locale);
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

  // Save to localStorage whenever state updates in local mode
  useEffect(() => {
    if (!hydrated || userId) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          locale,
          household,
          groups,
          items,
          records,
        })
      );
    } catch {
      // Ignore quota errors
    }
  }, [hydrated, userId, locale, household, groups, items, records]);

  // 2. Load from Supabase when authenticated
  const loadCloudData = useCallback(
    async (uid: string, email: string | null) => {
      // Check if households table exists
      const { data: memberRows, error: memberErr } = await supabase
        .from("household_members")
        .select("household_id, role, member_email, id, user_id")
        .eq("user_id", uid);

      if (memberErr) {
        // Table not migrated yet
        setDbReady(false);
        return;
      }
      setDbReady(true);

      let activeHouseholdId = memberRows?.[0]?.household_id;

      // If user has no household yet, seed one with starter templates!
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

        // Insert starter groups
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
            is_active: true,
            sort_order: it.sort_order,
          }));
          await supabase.from("budget_items").insert(itemInsertPayload);
        }
      }

      // Fetch household, members, groups, items, records, transactions
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

  // Check auth session & probe table readiness
  useEffect(() => {
    let mounted = true;
    async function initAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // Quick table readiness check
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

  // Computed monthly items
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

  const selectedComputed = useMemo(
    () => computedItems.find((c) => c.item.id === selectedItemId) || null,
    [computedItems, selectedItemId]
  );

  // Summary metrics
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

  // Handlers for confirming bills, logging transactions, and CRUD
  const handleConfirmActual = async (
    itemId: string,
    actualAmount: number,
    notes: string
  ) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

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

    // Local update
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
    description: string
  ) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    let existingRec = records.find(
      (r) => r.item_id === itemId && r.year_month === yearMonth
    );

    const spentOn = new Date().toISOString().slice(0, 10);

    if (userId && dbReady) {
      if (!existingRec) {
        const { data: createdRec } = await supabase
          .from("monthly_records")
          .insert({
            household_id: household.id,
            item_id: itemId,
            year_month: yearMonth,
            expected_snapshot: targetItem.expected_amount,
            status: "pending",
          })
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
          const updatedTxs = [
            newTx,
            ...(existingRec.transactions || []),
          ];
          const updatedRec: MonthlyRecord = {
            ...existingRec,
            transactions: updatedTxs,
          };
          setRecords((prev) => [
            ...prev.filter((r) => r.id !== existingRec!.id),
            updatedRec,
          ]);
          return;
        }
      }
    }

    // Local update
    const recId = existingRec?.id || `rec-${Date.now()}`;
    const newTx = {
      id: `tx-${Date.now()}`,
      household_id: household.id,
      monthly_record_id: recId,
      amount,
      description,
      spent_on: spentOn,
    };

    const nextRecord: MonthlyRecord = existingRec
      ? {
          ...existingRec,
          transactions: [newTx, ...(existingRec.transactions || [])],
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

    setRecords((prev) => [
      ...prev.filter(
        (r) => !(r.item_id === itemId && r.year_month === yearMonth)
      ),
      nextRecord,
    ]);
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
    existingId?: string
  ) => {
    if (existingId) {
      if (userId && dbReady) {
        await supabase.from("budget_items").update(data).eq("id", existingId);
      }
      setItems((prev) =>
        prev.map((it) => (it.id === existingId ? { ...it, ...data } : it))
      );
    } else {
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
          setItems((prev) => [...prev, inserted as BudgetItem]);
          return;
        }
      }
      const newItem: BudgetItem = {
        ...data,
        id: `itm-${Date.now()}`,
        household_id: household.id,
        is_active: true,
        sort_order: items.length + 1,
      };
      setItems((prev) => [...prev, newItem]);
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
    color: string
  ) => {
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

  const handleUpdateHouseholdName = async (name: string) => {
    if (!name.trim()) return;
    if (userId && dbReady) {
      await supabase
        .from("households")
        .update({ name: name.trim() })
        .eq("id", household.id);
    }
    setHousehold((prev) => ({ ...prev, name: name.trim() }));
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
    if (userId && dbReady) {
      await supabase
        .from("households")
        .update({ currency: cur })
        .eq("id", household.id);
    }
    setHousehold((prev) => ({ ...prev, currency: cur }));
  };

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[#090d16] px-4 pt-4">
      {/* Top App Bar */}
      <header className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-slate-950 font-black text-lg shadow-md shadow-emerald-500/20">
            b
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-tight text-white">
                {household.name}
              </h1>
              <span
                className={`h-2 w-2 rounded-full ${
                  userId && dbReady ? "bg-emerald-400" : "bg-amber-400"
                }`}
                title={
                  userId && dbReady
                    ? "Cloud Synced"
                    : "Local Preview Mode"
                }
              />
            </div>
            <p className="text-[11px] text-slate-400">{t.tagline}</p>
          </div>
        </div>

        {/* Instant SV / EN Pill + Quick Add */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocale((l) => (l === "sv" ? "en" : "sv"))}
            className="rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white"
          >
            {locale === "sv" ? "🇸🇪 SV" : "🇬🇧 EN"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingItem(null);
              setDefaultGroupIdForNew(groups[0]?.id);
              setItemModalOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-sm hover:bg-emerald-400"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{locale === "sv" ? "Post" : "Item"}</span>
          </button>
        </div>
      </header>

      {/* Month Selector Strip (Shown on Budget & Insights tabs) */}
      {activeTab !== "household" && (
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-slate-800/80 bg-[#111726] px-3 py-2">
          <button
            type="button"
            onClick={() => setYearMonth((ym) => shiftYearMonth(ym, -1))}
            className="rounded-xl p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="text-center">
            <div className="text-sm font-bold text-white">
              {formatYearMonthLabel(yearMonth, locale)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setYearMonth((ym) => shiftYearMonth(ym, 1))}
            className="rounded-xl p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Main Tab Content */}
      {activeTab === "budget" && (
        <main className="space-y-4 pb-28">
          {/* View Mode Toggle: Payment Month vs Monthly Average (Buffer) */}
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-[#111726] p-1 border border-slate-800/90">
            <button
              type="button"
              onClick={() => setViewMode("cashflow")}
              className={`rounded-xl py-2 px-3 text-xs font-bold transition ${
                viewMode === "cashflow"
                  ? "bg-emerald-500 text-slate-950 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.viewMode.cashflow}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("accrual")}
              className={`rounded-xl py-2 px-3 text-xs font-bold transition ${
                viewMode === "accrual"
                  ? "bg-emerald-500 text-slate-950 shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.viewMode.accrual}
            </button>
          </div>

          {/* Hero Overview Card */}
          <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-[#131c31] via-[#111726] to-[#0d1320] p-4.5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-medium text-slate-400">
                  {t.summary.leftToSpend}
                </span>
                <div
                  className={`mt-0.5 text-3xl font-black tracking-tight ${
                    summary.leftToSpend >= 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {formatCurrency(
                    summary.leftToSpend,
                    household.currency,
                    locale
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  {t.summary.expected}:{" "}
                  {formatCurrency(
                    summary.expectedLeft,
                    household.currency,
                    locale
                  )}
                </div>
              </div>

              {/* Confirmed Bills Pill */}
              <div className="rounded-2xl bg-slate-900/90 border border-slate-800 px-3 py-2 text-right">
                <div className="text-[11px] text-slate-400">
                  {t.summary.confirmedProgress}
                </div>
                <div className="mt-0.5 text-sm font-extrabold text-white">
                  {summary.confirmedCount} {t.summary.of}{" "}
                  {summary.dueItemsCount} {t.summary.done}
                </div>
                <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
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
              </div>
            </div>

            {/* 3 Summary Pillars: Income, Expenses, Savings */}
            <div className="mt-4 grid grid-cols-3 gap-2 pt-3.5 border-t border-slate-800/80">
              <div className="rounded-2xl bg-slate-950/50 p-2.5">
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{t.summary.income}</span>
                </div>
                <div className="mt-1 text-sm font-bold text-white">
                  {formatCurrency(
                    summary.effectiveIncome,
                    household.currency,
                    locale
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-950/50 p-2.5">
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />
                  <span>{t.summary.expenses}</span>
                </div>
                <div className="mt-1 text-sm font-bold text-white">
                  {formatCurrency(
                    summary.effectiveExpense,
                    household.currency,
                    locale
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-950/50 p-2.5">
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <PiggyBank className="h-3.5 w-3.5 text-teal-400" />
                  <span>{t.summary.savings}</span>
                </div>
                <div className="mt-1 text-sm font-bold text-white">
                  {formatCurrency(
                    summary.effectiveSavings,
                    household.currency,
                    locale
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Groups & Budget Items List */}
          <div className="space-y-4">
            {groups.map((group) => {
              const groupItems = computedItems.filter(
                (c) => c.group.id === group.id
              );
              const groupExpected = groupItems.reduce(
                (s, c) => s + c.displayedExpected,
                0
              );
              const groupEffective = groupItems.reduce(
                (s, c) => s + c.effectiveAmount,
                0
              );

              return (
                <section
                  key={group.id}
                  className="rounded-3xl border border-slate-800/90 bg-[#111726] overflow-hidden shadow-md"
                >
                  {/* Group Header */}
                  <div className="flex items-center justify-between border-b border-slate-800/70 bg-slate-900/50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          group.kind === "income"
                            ? "bg-emerald-400"
                            : group.kind === "savings"
                            ? "bg-teal-400"
                            : "bg-blue-400"
                        }`}
                      />
                      <h2 className="text-sm font-bold text-white">
                        {group.name}
                      </h2>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="text-right text-xs">
                        <span className="font-bold text-slate-100">
                          {formatCurrency(
                            groupEffective,
                            household.currency,
                            locale
                          )}
                        </span>
                        <span className="text-slate-500">
                          {" "}
                          /{" "}
                          {formatCurrency(
                            groupExpected,
                            household.currency,
                            locale
                          )}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem(null);
                          setDefaultGroupIdForNew(group.id);
                          setItemModalOpen(true);
                        }}
                        className="rounded-lg bg-slate-800 p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
                        title={t.actions.addItem}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Items inside group */}
                  <div className="divide-y divide-slate-800/60">
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
                      const hasPartialTx =
                        item.entry_mode === "multi_entry" &&
                        (record?.transactions?.length || 0) > 0;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedItemId(item.id)}
                          className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-800/40 active:bg-slate-800/70 ${
                            !isPaymentMonth && viewMode === "cashflow"
                              ? "opacity-55"
                              : ""
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="mt-0.5 shrink-0">
                              {isConfirmed ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                              ) : hasPartialTx ? (
                                <Layers className="h-5 w-5 text-amber-400" />
                              ) : (
                                <Circle className="h-5 w-5 text-slate-600" />
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-100">
                                {item.name}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                                <CalendarClock className="h-3 w-3 shrink-0 text-slate-500" />
                                <span>{coverageLabel}</span>
                                {record?.notes && (
                                  <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-300">
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
                                <div className="text-sm font-extrabold text-white">
                                  {formatCurrency(
                                    displayedActual,
                                    household.currency,
                                    locale
                                  )}
                                </div>
                                <div className="flex items-center justify-end gap-1 text-[11px]">
                                  <span className="text-slate-500 line-through">
                                    {formatCurrency(
                                      displayedExpected,
                                      household.currency,
                                      locale
                                    )}
                                  </span>
                                  {variance !== null &&
                                    Math.round(variance) !== 0 && (
                                      <span
                                        className={`font-bold ${
                                          variance < 0
                                            ? "text-emerald-400"
                                            : "text-amber-400"
                                        }`}
                                      >
                                        ({variance > 0 ? "+" : ""}
                                        {formatCurrency(
                                          variance,
                                          household.currency,
                                          locale
                                        )}
                                        )
                                      </span>
                                    )}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="text-sm font-bold text-slate-200">
                                  {formatCurrency(
                                    displayedExpected,
                                    household.currency,
                                    locale
                                  )}
                                </div>
                                <div className="text-[11px] text-emerald-400/90 font-medium">
                                  {!isPaymentMonth && viewMode === "cashflow"
                                    ? t.status.offMonth
                                    : !isPaymentMonth && viewMode === "accrual"
                                    ? t.status.offMonthAccrual
                                    : locale === "sv"
                                    ? "Tryck för utfall"
                                    : "Tap to confirm"}
                                </div>
                              </>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Add Group / Add Item bottom buttons */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setDefaultGroupIdForNew(groups[0]?.id);
                setItemModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-[#111726] py-3 text-xs font-bold text-emerald-400 hover:bg-slate-900"
            >
              <Plus className="h-4 w-4" />
              {t.actions.addItem}
            </button>
            <button
              type="button"
              onClick={() => setGroupModalOpen(true)}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-[#111726] py-3 text-xs font-bold text-slate-300 hover:bg-slate-900"
            >
              <FolderPlus className="h-4 w-4" />
              {t.actions.addGroup}
            </button>
          </div>
        </main>
      )}

      {activeTab === "insights" && (
        <InsightsView
          groups={groups}
          computedItems={computedItems}
          yearMonth={yearMonth}
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
          currency={household.currency}
          onChangeLocale={setLocale}
          onChangeCurrency={handleChangeCurrency}
          onUpdateHouseholdName={handleUpdateHouseholdName}
          onJoinHouseholdByCode={handleJoinHouseholdByCode}
          onSignOut={async () => {
            await supabase.auth.signOut();
          }}
        />
      )}

      {/* Follow-Up Bottom Sheet (when tapping a bill/budget item) */}
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
          setItemModalOpen(true);
        }}
      />

      {/* Add / Edit Budget Item Modal */}
      <ItemFormModal
        open={itemModalOpen}
        editingItem={editingItem}
        defaultGroupId={defaultGroupIdForNew}
        groups={groups}
        currency={household.currency}
        locale={locale}
        onClose={() => {
          setItemModalOpen(false);
          setEditingItem(null);
        }}
        onSaveItem={handleSaveItem}
        onDeleteItem={handleDeleteItem}
      />

      {/* Add Custom Group Modal */}
      <GroupFormModal
        open={groupModalOpen}
        locale={locale}
        onClose={() => setGroupModalOpen(false)}
        onSaveGroup={handleSaveGroup}
      />

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/90 bg-[#090d16]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-around py-2 px-4">
          <button
            type="button"
            onClick={() => setActiveTab("budget")}
            className={`flex flex-col items-center gap-1 rounded-2xl px-5 py-1.5 text-xs font-bold transition ${
              activeTab === "budget"
                ? "text-emerald-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Wallet className="h-5 w-5" />
            <span>{t.nav.budget}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("insights")}
            className={`flex flex-col items-center gap-1 rounded-2xl px-5 py-1.5 text-xs font-bold transition ${
              activeTab === "insights"
                ? "text-emerald-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <BarChart3 className="h-5 w-5" />
            <span>{t.nav.insights}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("household")}
            className={`flex flex-col items-center gap-1 rounded-2xl px-5 py-1.5 text-xs font-bold transition ${
              activeTab === "household"
                ? "text-emerald-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="h-5 w-5" />
            <span>{t.nav.household}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
