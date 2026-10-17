import { SHORT_MONTH_NAMES } from "./i18n";
import {
  BudgetGroup,
  BudgetItem,
  ComputedItemMonth,
  Household,
  Locale,
  MonthlyRecord,
  ViewMode,
} from "./types";

export function isItemDueInMonth(item: BudgetItem, monthNumber: number): boolean {
  const interval = item.recurrence_interval_months || 1;
  if (interval === 1) return true;
  const anchor = item.anchor_month || 1;
  const diff = (((monthNumber - anchor) % interval) + interval) % interval;
  return diff === 0;
}

export function getNextPaymentMonth(item: BudgetItem, currentMonth: number): number {
  const interval = item.recurrence_interval_months || 1;
  if (interval === 1) return currentMonth;
  for (let offset = 0; offset < 12; offset++) {
    const candidate = ((currentMonth - 1 + offset) % 12) + 1;
    if (isItemDueInMonth(item, candidate)) {
      return candidate;
    }
  }
  return item.anchor_month || currentMonth;
}

export function getCoverageLabel(
  item: BudgetItem,
  monthNumber: number,
  locale: Locale
): string {
  const interval = item.recurrence_interval_months || 1;
  const coverage = item.coverage_months || interval;
  const due = isItemDueInMonth(item, monthNumber);
  const shortMonths = SHORT_MONTH_NAMES[locale];

  if (interval === 1 && coverage === 1) {
    if (item.is_variable_estimate) {
      return locale === "sv" ? "Månadsvis • Rörlig prognos" : "Monthly • Variable estimate";
    }
    return locale === "sv" ? "Varje månad" : "Every month";
  }

  const targetPayMonth = due ? monthNumber : getNextPaymentMonth(item, monthNumber);
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

  const rangeText =
    coverage > 1 ? `${startLabel}–${endLabel}` : endLabel;

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
    .filter((item) => item.is_active)
    .map((item) => {
      const group = groupMap.get(item.group_id) || {
        id: item.group_id,
        household_id: item.household_id,
        name: "Övrigt",
        kind: "expense",
        icon: "Folder",
        color: "slate",
        sort_order: 99,
      };
      const record = recordMap.get(item.id) || null;
      const isPaymentMonth = isItemDueInMonth(item, monthNumber);
      const baseExpected = record?.expected_snapshot ?? item.expected_amount;

      const cashflowExpected = isPaymentMonth ? baseExpected : 0;
      const accrualExpected =
        baseExpected / (item.recurrence_interval_months || 1);

      const displayedExpected =
        viewMode === "cashflow" ? cashflowExpected : accrualExpected;

      // Determine actual amount if confirmed or if multi_entry has transactions
      let displayedActual: number | null = null;
      if (record) {
        if (record.status === "confirmed" && record.actual_amount !== null) {
          displayedActual =
            viewMode === "accrual" && item.recurrence_interval_months > 1
              ? record.actual_amount / item.recurrence_interval_months
              : record.actual_amount;
        } else if (
          item.entry_mode === "multi_entry" &&
          record.transactions &&
          record.transactions.length > 0
        ) {
          const sum = record.transactions.reduce((acc, t) => acc + Number(t.amount), 0);
          displayedActual = sum;
        } else if (record.actual_amount !== null && record.status === "confirmed") {
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
        coverageLabel: getCoverageLabel(item, monthNumber, locale),
      };
    });
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

export function createStarterDataset(householdId: string, locale: Locale): {
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
  };

  const groups: BudgetGroup[] = [
    {
      id: "grp-income",
      household_id: householdId,
      name: locale === "sv" ? "Inkomster" : "Income",
      kind: "income",
      icon: "Wallet",
      color: "emerald",
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
      color: "amber",
      sort_order: 3,
    },
    {
      id: "grp-transport",
      household_id: householdId,
      name: locale === "sv" ? "Transport & Försäkring" : "Transport & Insurance",
      kind: "expense",
      icon: "Car",
      color: "violet",
      sort_order: 4,
    },
    {
      id: "grp-savings",
      household_id: householdId,
      name: locale === "sv" ? "Sparande & Buffert" : "Savings & Buffer",
      kind: "savings",
      icon: "PiggyBank",
      color: "teal",
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
      is_active: true,
      sort_order: 2,
    },
    {
      id: "itm-water-waste",
      household_id: householdId,
      group_id: "grp-housing",
      name: locale === "sv" ? "Vatten & Sophämtning (Kvartal)" : "Water & Waste (Quarterly)",
      entry_mode: "single_bill",
      expected_amount: 1800,
      recurrence_interval_months: 3,
      anchor_month: currentM, // Due in the current month so the user immediately sees a quarterly bill in action!
      coverage_months: 3,
      is_variable_estimate: true,
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
      is_active: true,
      sort_order: 2,
    },
    {
      id: "itm-transit",
      household_id: householdId,
      group_id: "grp-transport",
      name: locale === "sv" ? "Kollektivtrafik / Drivmedel" : "Public Transit / Fuel",
      entry_mode: "single_bill",
      expected_amount: 1200,
      recurrence_interval_months: 1,
      anchor_month: 1,
      coverage_months: 1,
      is_variable_estimate: true,
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
      anchor_month: ((currentM % 12) + 1), // Next month so user can see an upcoming annual bill too
      coverage_months: 12,
      is_variable_estimate: false,
      is_active: true,
      sort_order: 2,
    },
    {
      id: "itm-isk",
      household_id: householdId,
      group_id: "grp-savings",
      name: locale === "sv" ? "Månadssparande (ISK / Buffert)" : "Monthly Investment & Buffer",
      entry_mode: "single_bill",
      expected_amount: 4500,
      recurrence_interval_months: 1,
      anchor_month: 1,
      coverage_months: 1,
      is_variable_estimate: false,
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
