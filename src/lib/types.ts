export type Locale = "sv" | "en";

export type ThemeMode = "light" | "dark";

export type BudgetGroupKind = "income" | "expense" | "savings";

export type EntryMode = "single_bill" | "multi_entry";

/** 0 = One-time (single month), 1..12 = Recurring every N months */
export type RecurrenceInterval = 0 | 1 | 2 | 3 | 4 | 6 | 12;

export type RecordStatus = "pending" | "confirmed" | "skipped";

export type ViewMode = "cashflow" | "accrual";

export type CostSplit = "shared" | "personal_a" | "personal_b";

export type BudgetFilter = "all" | "unconfirmed" | "due_now";

export interface MerchantRule {
  id: string;
  pattern: string;
  targetItemId: string;
}

export interface Household {
  id: string;
  name: string;
  currency: string;
  default_locale: Locale;
  invite_code: string;
  created_by?: string | null;
  partner_a_name?: string;
  partner_b_name?: string;
  split_mode?: "equal" | "proportional";
  partner_a_income?: number;
  partner_b_income?: number;
  merchant_rules?: MerchantRule[];
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  member_email?: string | null;
  role: "owner" | "member";
}

export interface BudgetGroup {
  id: string;
  household_id: string;
  name: string;
  kind: BudgetGroupKind;
  icon: string;
  color: string;
  sort_order: number;
}

export interface BudgetItem {
  id: string;
  household_id: string;
  group_id: string;
  name: string;
  entry_mode: EntryMode;
  expected_amount: number;
  recurrence_interval_months: RecurrenceInterval;
  one_time_year_month?: string | null; // YYYY-MM when recurrence_interval_months === 0
  anchor_month: number; // 1..12
  coverage_months: number; // 1..12
  is_variable_estimate: boolean;
  seasonal_amounts?: Record<string, number> | null; // keys "1".."12"
  cost_split?: CostSplit;
  target_amount?: number | null;
  current_saved?: number | null;
  is_active: boolean;
  sort_order: number;
}

export interface RecordTransaction {
  id: string;
  household_id: string;
  monthly_record_id: string;
  amount: number;
  description: string;
  spent_on: string; // YYYY-MM-DD
  created_by?: string | null;
}

export interface MonthlyRecord {
  id: string;
  household_id: string;
  item_id: string;
  year_month: string; // YYYY-MM
  expected_snapshot: number;
  actual_amount: number | null;
  status: RecordStatus;
  notes?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  transactions?: RecordTransaction[];
}

export interface ComputedItemMonth {
  item: BudgetItem;
  group: BudgetGroup;
  record: MonthlyRecord | null;
  isPaymentMonth: boolean;
  cashflowExpected: number;
  accrualExpected: number;
  displayedExpected: number;
  displayedActual: number | null;
  effectiveAmount: number;
  variance: number | null;
  coverageLabel: string;
}

export interface FutureUpdateDecision {
  updateExpectedAmount?: number;
  makeRecurringInterval?: RecurrenceInterval;
}

export interface MonthTrendPoint {
  yearMonth: string;
  shortLabel: string;
  income: number;
  expenses: number;
  savings: number;
  expectedExpenses: number;
}
