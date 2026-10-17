import { formatCurrency, SHORT_MONTH_NAMES } from "./i18n";
import {
  BudgetGroup,
  BudgetItem,
  ComputedItemMonth,
  Household,
  Locale,
  MonthlyRecord,
  MonthTrendPoint,
  ViewMode,
} from "./types";

export function isItemDueInMonth(
  item: BudgetItem,
  monthNumber: number,
  yearMonth?: string
): boolean {
  const interval = item.recurrence_interval_months;
  if (interval === 0) {
    if (!item.one_time_year_month || !yearMonth) return true;
    return item.one_time_year_month === yearMonth;
  }
  if (interval === 1) return true;
  const anchor = item.anchor_month || 1;
  const diff = (((monthNumber - anchor) % interval) + interval) % interval;
  return diff === 0;
}

export function getNextPaymentMonth(
  item: BudgetItem,
  currentMonth: number
): number {
  const interval = item.recurrence_interval_months;
  if (interval === 0 || interval === 1) return currentMonth;
  for (let offset = 0; offset < 12; offset++) {
    const candidate = ((currentMonth - 1 + offset) % 12) + 1;
    if (isItemDueInMonth(item, candidate)) {
      return candidate;
    }
  }
  return item.anchor_month || currentMonth;
}

export function getItemExpectedForMonth(
  item: BudgetItem,
  monthNumber: number
): number {
  if (
    item.is_variable_estimate &&
    item.seasonal_amounts &&
    item.seasonal_amounts[String(monthNumber)] !== undefined
  ) {
    return Number(item.seasonal_amounts[String(monthNumber)]);
  }
  return Number(item.expected_amount);
}

export function getCoverageLabel(
  item: BudgetItem,
  monthNumber: number,
  locale: Locale,
  yearMonth?: string
): string {
  const interval = item.recurrence_interval_months;
  if (interval === 0) {
    return locale === "sv"
      ? "Engångspost • Endast denna månad"
      : "One-time • This month only";
  }

  const coverage = item.coverage_months || interval;
  const due = isItemDueInMonth(item, monthNumber, yearMonth);
  const shortMonths = SHORT_MONTH_NAMES[locale];

  if (interval === 1 && coverage === 1) {
    if (item.is_variable_estimate) {
      const hasCustomSeason =
        item.seasonal_amounts &&
        Object.keys(item.seasonal_amounts).length > 0;
      if (hasCustomSeason) {
        return locale === "sv"
          ? `Säsongskurva (${shortMonths[monthNumber - 1]})`
          : `Seasonal curve (${shortMonths[monthNumber - 1]})`;
      }
      return locale === "sv"
        ? "Månadsvis • Rörlig prognos"
        : "Monthly • Variable estimate";
    }
    return locale === "sv" ? "Varje månad" : "Every month";
  }

  const targetPayMonth = due
    ? monthNumber
    : getNextPaymentMonth(item, monthNumber);
  const startMonth = ((targetPayMonth - 1 - (coverage - 1) + 12) % 12) + 1;
  const startLabel = shortMonths[startMonth - 1];
  const endLabel = shortMonths[targetPayMonth - 1];
  const payLabel = shortMonths[targetPayMonth - 1];

  const freqLabel =
    interval === 3
      ? locale === "sv"
        ? "Var 3:e mån"
        : "Every 3 mos"
      : interval === 12
      ? locale === "sv"
        ? "Årsvis"
        : "Yearly"
      : locale === "sv"
      ? `Var ${interval}:e mån`
      : `Every ${interval} mos`;

  const rangeText = coverage > 1 ? `${startLabel}–${endLabel}` : endLabel;

  if (due) {
    return locale === "sv"
      ? `${freqLabel} • Avser ${rangeText}`
      : `${freqLabel} • Covers ${rangeText}`;
  } else {
    return locale === "sv"
      ? `${freqLabel} • Betalas i ${payLabel} (avser ${rangeText})`
      : `${freqLabel} • Paid in ${payLabel} (covers ${rangeText})`;
  }
}

export function computeMonthlyBudget(
  groups: BudgetGroup[],
  items: BudgetItem[],
  records: MonthlyRecord[],
  yearMonth: string,
  viewMode: ViewMode,
  locale: Locale
): ComputedItemMonth[] {
  const [, mStr] = yearMonth.split("-");
  const monthNumber = parseInt(mStr || "1", 10);
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const recordMap = new Map(
    records.filter((r) => r.year_month === yearMonth).map((r) => [r.item_id, r])
  );

  return items
    .filter((item) => {
      if (!item.is_active) return false;
      if (
        item.recurrence_interval_months === 0 &&
        item.one_time_year_month &&
        item.one_time_year_month !== yearMonth
      ) {
        return false;
      }
      return true;
    })
    .map((item) => {
      const group = groupMap.get(item.group_id) || {
        id: item.group_id,
        household_id: item.household_id,
        name: "Övrigt",
        kind: "expense",
        icon: "Folder",
        color: "blue",
        sort_order: 99,
      };
      const record = recordMap.get(item.id) || null;
      const isPaymentMonth = isItemDueInMonth(item, monthNumber, yearMonth);
      const seasonalOrBase = getItemExpectedForMonth(item, monthNumber);
      const baseExpected =
        item.recurrence_interval_months === 0 && item.expected_amount === 0
          ? 0
          : record?.expected_snapshot ?? seasonalOrBase;

      const intervalDivisor =
        item.recurrence_interval_months > 0
          ? item.recurrence_interval_months
          : 1;

      const cashflowExpected = isPaymentMonth ? baseExpected : 0;
      const accrualExpected =
        item.recurrence_interval_months === 0
          ? cashflowExpected
          : baseExpected / intervalDivisor;

      const displayedExpected =
        viewMode === "cashflow" ? cashflowExpected : accrualExpected;

      let displayedActual: number | null = null;
      if (record) {
        if (record.status === "confirmed" && record.actual_amount !== null) {
          displayedActual =
            viewMode === "accrual" && item.recurrence_interval_months > 1
              ? record.actual_amount / intervalDivisor
              : record.actual_amount;
        } else if (
          record.transactions &&
          record.transactions.length > 0
        ) {
          const sum = record.transactions.reduce(
            (acc, t) => acc + Number(t.amount),
            0
          );
          displayedActual = sum;
        } else if (
          record.actual_amount !== null &&
          record.status === "confirmed"
        ) {
          displayedActual = record.actual_amount;
        }
      }

      const effectiveAmount =
        displayedActual !== null ? displayedActual : displayedExpected;

      const variance =
        displayedActual !== null ? displayedActual - displayedExpected : null;

      return {
        item,
        group,
        record,
        isPaymentMonth,
        cashflowExpected,
        accrualExpected,
        displayedExpected,
        displayedActual,
        effectiveAmount,
        variance,
        coverageLabel: getCoverageLabel(item, monthNumber, locale, yearMonth),
      };
    });
}

export interface GroupOverageStat {
  historicalAvg: number;
  monthsCount: number;
  currentOverage: number;
}

export function computeGroupOverageStats(
  groups: BudgetGroup[],
  items: BudgetItem[],
  records: MonthlyRecord[],
  activeYearMonth: string,
  viewMode: ViewMode = "cashflow",
  locale: Locale = "sv"
): Record<string, GroupOverageStat> {
  const allConfirmedMonths = Array.from(
    new Set(
      records
        .filter(
          (r) =>
            (r.status === "confirmed" && r.actual_amount !== null) ||
            (r.transactions && r.transactions.length > 0)
        )
        .map((r) => r.year_month)
    )
  ).sort();

  const priorMonths = allConfirmedMonths.filter((ym) => ym < activeYearMonth);
  const referenceMonths =
    priorMonths.length > 0 ? priorMonths : allConfirmedMonths;

  const stats: Record<string, GroupOverageStat> = {};
  for (const g of groups) {
    stats[g.id] = { historicalAvg: 0, monthsCount: referenceMonths.length, currentOverage: 0 };
  }

  if (referenceMonths.length > 0) {
    const sumByGroup: Record<string, number> = {};
    for (const ym of referenceMonths) {
      const computed = computeMonthlyBudget(groups, items, records, ym, viewMode, locale);
      for (const c of computed) {
        if (c.group.kind !== "expense") continue;
        if (c.displayedActual === null) continue;
        const isOneOff = c.item.recurrence_interval_months === 0;
        const overage = isOneOff
          ? Math.max(0, c.displayedActual)
          : Math.max(0, c.displayedActual - c.displayedExpected);
        if (overage > 0) {
          sumByGroup[c.group.id] = (sumByGroup[c.group.id] || 0) + overage;
        }
      }
    }
    for (const g of groups) {
      const total = sumByGroup[g.id] || 0;
      const rawAvg = total / referenceMonths.length;
      stats[g.id].historicalAvg =
        rawAvg >= 100 ? Math.round(rawAvg / 50) * 50 : Math.round(rawAvg);
    }
  }

  const activeComputed = computeMonthlyBudget(
    groups,
    items,
    records,
    activeYearMonth,
    viewMode,
    locale
  );
  for (const c of activeComputed) {
    if (c.group.kind !== "expense") continue;
    if (c.displayedActual === null) continue;
    const overage = Math.max(0, c.displayedActual - c.displayedExpected);
    if (overage > 0 && stats[c.group.id]) {
      stats[c.group.id].currentOverage += Math.round(overage);
    }
  }

  return stats;
}

export function computeMultiMonthTrends(
  groups: BudgetGroup[],
  items: BudgetItem[],
  records: MonthlyRecord[],
  endYearMonth: string,
  monthsCount: number,
  viewMode: ViewMode,
  locale: Locale,
  filterItemId?: string
): MonthTrendPoint[] {
  const points: MonthTrendPoint[] = [];
  for (let i = monthsCount - 1; i >= 0; i--) {
    const ym = shiftYearMonth(endYearMonth, -i);
    const [, mStr] = ym.split("-");
    const mNum = parseInt(mStr || "1", 10);
    const shortLabel = SHORT_MONTH_NAMES[locale][mNum - 1];
    const computed = computeMonthlyBudget(
      groups,
      items,
      records,
      ym,
      viewMode,
      locale
    );

    let income = 0;
    let expenses = 0;
    let savings = 0;
    let expectedExpenses = 0;

    for (const c of computed) {
      if (filterItemId && c.item.id !== filterItemId) continue;
      if (filterItemId) {
        expenses += c.effectiveAmount;
        expectedExpenses += c.displayedExpected;
      } else if (c.group.kind === "income") {
        income += c.effectiveAmount;
      } else if (c.group.kind === "savings") {
        savings += c.effectiveAmount;
      } else {
        expenses += c.effectiveAmount;
        expectedExpenses += c.displayedExpected;
      }
    }

    if (!filterItemId) {
      for (const g of groups) {
        if (g.kind === "expense" && g.overage_budget && g.overage_budget > 0) {
          expectedExpenses += g.overage_budget;
        }
      }
    }

    points.push({
      yearMonth: ym,
      shortLabel,
      income: Math.round(income),
      expenses: Math.round(expenses),
      savings: Math.round(savings),
      expectedExpenses: Math.round(expectedExpenses),
    });
  }
  return points;
}

export function generateMonthlyCsv(
  computedItems: ComputedItemMonth[],
  yearMonth: string,
  currency: string
): string {
  const header = [
    "YearMonth",
    "Group",
    "CategoryKind",
    "ItemName",
    "ExpectedAmount",
    "ActualAmount",
    "EffectiveAmount",
    "Variance",
    "Status",
    "Split",
    "Currency",
  ];
  const rows = computedItems.map((c) => [
    yearMonth,
    `"${c.group.name.replace(/"/g, '""')}"`,
    c.group.kind,
    `"${c.item.name.replace(/"/g, '""')}"`,
    Math.round(c.displayedExpected),
    c.displayedActual !== null ? Math.round(c.displayedActual) : "",
    Math.round(c.effectiveAmount),
    c.variance !== null ? Math.round(c.variance) : 0,
    c.record?.status || "pending",
    c.item.cost_split || "shared",
    currency,
  ]);
  return "\uFEFF" + [header.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
}

export function generateMonthlyTextSummary(
  computedItems: ComputedItemMonth[],
  yearMonth: string,
  currency: string,
  locale: Locale
): string {
  let inc = 0;
  let exp = 0;
  let sav = 0;
  for (const c of computedItems) {
    if (c.group.kind === "income") inc += c.effectiveAmount;
    else if (c.group.kind === "savings") sav += c.effectiveAmount;
    else exp += c.effectiveAmount;
  }
  const left = inc - exp - sav;
  if (locale === "sv") {
    return [
      `📊 bdgt sammanfattning (${yearMonth})`,
      `• Inkomst: ${formatCurrency(inc, currency, locale)}`,
      `• Utgifter: ${formatCurrency(exp, currency, locale)}`,
      `• Sparande: ${formatCurrency(sav, currency, locale)}`,
      `• Kvar i månaden: ${formatCurrency(left, currency, locale)}`,
    ].join("\n");
  }
  return [
    `📊 bdgt Summary (${yearMonth})`,
    `• Income: ${formatCurrency(inc, currency, locale)}`,
    `• Expenses: ${formatCurrency(exp, currency, locale)}`,
    `• Savings: ${formatCurrency(sav, currency, locale)}`,
    `• Left this month: ${formatCurrency(left, currency, locale)}`,
  ].join("\n");
}

export function getCurrentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1 + deltaMonths, 1);
  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, "0");
  return `${ny}-${nm}`;
}

export function createStarterDataset(
  householdId: string,
  locale: Locale
): {
  household: Household;
  groups: BudgetGroup[];
  items: BudgetItem[];
  records: MonthlyRecord[];
} {
  const currentYM = getCurrentYearMonth();
  const [, currentM] = currentYM.split("-").map(Number);

  const household: Household = {
    id: householdId,
    name: locale === "sv" ? "Vårt Hushåll" : "Our Household",
    currency: "SEK",
    default_locale: locale,
    invite_code: "BDGT2026",
    partner_a_name: "Partner A",
    partner_b_name: "Partner B",
    split_mode: "proportional",
    partner_a_income: 36500,
    partner_b_income: 31000,
    merchant_rules: [
      { id: "rule-ica", pattern: "ica", targetItemId: "itm-groceries" },
      { id: "rule-willys", pattern: "willys", targetItemId: "itm-groceries" },
      { id: "rule-coop", pattern: "coop", targetItemId: "itm-groceries" },
      { id: "rule-vattenfall", pattern: "vattenfall", targetItemId: "itm-electricity" },
      { id: "rule-ellevio", pattern: "ellevio", targetItemId: "itm-electricity" },
    ],
  };

  const groups: BudgetGroup[] = [
    {
      id: "grp-income",
      household_id: householdId,
      name: locale === "sv" ? "Inkomster" : "Income",
      kind: "income",
      icon: "Wallet",
      color: "green",
      sort_order: 1,
    },
    {
      id: "grp-housing",
      household_id: householdId,
      name: locale === "sv" ? "Boende & Drift" : "Housing & Utilities",
      kind: "expense",
      icon: "Home",
      color: "blue",
      sort_order: 2,
    },
    {
      id: "grp-daily",
      household_id: householdId,
      name: locale === "sv" ? "Mat & Vardag" : "Groceries & Daily",
      kind: "expense",
      icon: "ShoppingBag",
      color: "orange",
      sort_order: 3,
    },
    {
      id: "grp-transport",
      household_id: householdId,
      name:
        locale === "sv" ? "Transport & Försäkring" : "Transport & Insurance",
      kind: "expense",
      icon: "Car",
      color: "coral",
      sort_order: 4,
    },
    {
      id: "grp-savings",
      household_id: householdId,
      name: locale === "sv" ? "Sparande & Buffert" : "Savings & Buffer",
      kind: "savings",
      icon: "PiggyBank",
      color: "purple",
      sort_order: 5,
    },
  ];

  const items: BudgetItem[] = [
    {
      id: "itm-salary",
      household_id: householdId,
      group_id: "grp-income",
      name: locale === "sv" ? "Lön efter skatt" : "Net Salary",
      entry_mode: "single_bill",
      expected_amount: 36500,
      recurrence_interval_months: 1,
      anchor_month: 1,
      coverage_months: 1,
      is_variable_estimate: false,
      cost_split: "shared",
      is_active: true,
      sort_order: 1,
    },
    {
      id: "itm-mortgage",
      household_id: householdId,
      group_id: "grp-housing",
      name: locale === "sv" ? "Boendekostnad / Hyra & Bolån" : "Rent / Mortgage",
      entry_mode: "single_bill",
      expected_amount: 9500,
      recurrence_interval_months: 1,
      anchor_month: 1,
      coverage_months: 1,
      is_variable_estimate: false,
      cost_split: "shared",
      is_active: true,
      sort_order: 1,
    },
    {
      id: "itm-electricity",
      household_id: householdId,
      group_id: "grp-housing",
      name: locale === "sv" ? "Elräkning (Nät + Handel)" : "Electricity Bill",
      entry_mode: "single_bill",
      expected_amount: 2000,
      recurrence_interval_months: 1,
      anchor_month: 1,
      coverage_months: 1,
      is_variable_estimate: true,
      seasonal_amounts: {
        "1": 3100,
        "2": 2900,
        "3": 2200,
        "4": 1600,
        "5": 1200,
        "6": 950,
        "7": 900,
        "8": 950,
        "9": 1300,
        "10": 2000,
        "11": 2500,
        "12": 3000,
      },
      cost_split: "shared",
      is_active: true,
      sort_order: 2,
    },
    {
      id: "itm-water-waste",
      household_id: householdId,
      group_id: "grp-housing",
      name:
        locale === "sv"
          ? "Vatten & Sophämtning (Kvartal)"
          : "Water & Waste (Quarterly)",
      entry_mode: "single_bill",
      expected_amount: 1800,
      recurrence_interval_months: 3,
      anchor_month: currentM,
      coverage_months: 3,
      is_variable_estimate: true,
      cost_split: "shared",
      is_active: true,
      sort_order: 3,
    },
    {
      id: "itm-broadband",
      household_id: householdId,
      group_id: "grp-housing",
      name: locale === "sv" ? "Bredband & Streaming" : "Broadband & Streaming",
      entry_mode: "single_bill",
      expected_amount: 649,
      recurrence_interval_months: 1,
      anchor_month: 1,
      coverage_months: 1,
      is_variable_estimate: false,
      cost_split: "shared",
      is_active: true,
      sort_order: 4,
    },
    {
      id: "itm-groceries",
      household_id: householdId,
      group_id: "grp-daily",
      name: locale === "sv" ? "Mat & Dagligvaror" : "Groceries & Supermarket",
      entry_mode: "multi_entry",
      expected_amount: 6000,
      recurrence_interval_months: 1,
      anchor_month: 1,
      coverage_months: 1,
      is_variable_estimate: true,
      cost_split: "shared",
      is_active: true,
      sort_order: 1,
    },
    {
      id: "itm-dining",
      household_id: householdId,
      group_id: "grp-daily",
      name: locale === "sv" ? "Restaurang & Utekaffe" : "Dining Out & Coffee",
      entry_mode: "multi_entry",
      expected_amount: 1500,
      recurrence_interval_months: 1,
      anchor_month: 1,
      coverage_months: 1,
      is_variable_estimate: true,
      cost_split: "personal_a",
      is_active: true,
      sort_order: 2,
    },
    {
      id: "itm-transit",
      household_id: householdId,
      group_id: "grp-transport",
      name:
        locale === "sv"
          ? "Kollektivtrafik / Drivmedel"
          : "Public Transit / Fuel",
      entry_mode: "single_bill",
      expected_amount: 1200,
      recurrence_interval_months: 1,
      anchor_month: 1,
      coverage_months: 1,
      is_variable_estimate: true,
      cost_split: "shared",
      is_active: true,
      sort_order: 1,
    },
    {
      id: "itm-home-insurance",
      household_id: householdId,
      group_id: "grp-transport",
      name: locale === "sv" ? "Hemförsäkring (Helår)" : "Home Insurance (Annual)",
      entry_mode: "single_bill",
      expected_amount: 2400,
      recurrence_interval_months: 12,
      anchor_month: (currentM % 12) + 1,
      coverage_months: 12,
      is_variable_estimate: false,
      cost_split: "shared",
      is_active: true,
      sort_order: 2,
    },
    {
      id: "itm-isk",
      household_id: householdId,
      group_id: "grp-savings",
      name:
        locale === "sv"
          ? "Månadssparande (Buffert & ISK)"
          : "Monthly Investment & Buffer",
      entry_mode: "single_bill",
      expected_amount: 4500,
      recurrence_interval_months: 1,
      anchor_month: 1,
      coverage_months: 1,
      is_variable_estimate: false,
      cost_split: "shared",
      target_amount: 60000,
      current_saved: 34500,
      is_active: true,
      sort_order: 1,
    },
  ];

  const records: MonthlyRecord[] = [
    {
      id: "rec-salary-cur",
      household_id: householdId,
      item_id: "itm-salary",
      year_month: currentYM,
      expected_snapshot: 36500,
      actual_amount: 36500,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    },
    {
      id: "rec-mortgage-cur",
      household_id: householdId,
      item_id: "itm-mortgage",
      year_month: currentYM,
      expected_snapshot: 9500,
      actual_amount: 9500,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    },
    {
      id: "rec-groceries-cur",
      household_id: householdId,
      item_id: "itm-groceries",
      year_month: currentYM,
      expected_snapshot: 6000,
      actual_amount: null,
      status: "pending",
      transactions: [
        {
          id: "tx-1",
          household_id: householdId,
          monthly_record_id: "rec-groceries-cur",
          amount: 1420,
          description: "ICA Maxi storhandling",
          spent_on: `${currentYM}-05`,
        },
        {
          id: "tx-2",
          household_id: householdId,
          monthly_record_id: "rec-groceries-cur",
          amount: 890,
          description: "Willys",
          spent_on: `${currentYM}-12`,
        },
      ],
    },
  ];

  return { household, groups, items, records };
}
