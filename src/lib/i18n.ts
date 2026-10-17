import { Locale, RecurrenceInterval } from "./types";

export const translations = {
  sv: {
    appName: "bdgt",
    tagline: "Smart uppföljning av din privatekonomi",
    nav: {
      budget: "Budget",
      insights: "Analys",
      household: "Hushåll",
    },
    viewMode: {
      cashflow: "Betalningsmånad",
      accrual: "Månadssnitt (Buffert)",
      cashflowDesc: "Visar fakturor den månad de faktiskt betalas",
      accrualDesc: "Fördelar kvartals- och årsfakturor jämnt per månad",
    },
    summary: {
      income: "Inkomst",
      expenses: "Utgifter",
      savings: "Sparande",
      leftToSpend: "Kvar i månaden",
      expected: "Förväntat",
      actual: "Utfall",
      confirmedProgress: "Uppföljda poster",
      of: "av",
      done: "klara",
      bufferTransfer: "Avsättning till sällanräkningar",
    },
    status: {
      pending: "Inväntar utfall",
      confirmed: "Bekräftad",
      skipped: "Hoppades över",
      offMonth: "Betalas ej denna månad",
      offMonthAccrual: "Avsättning",
    },
    actions: {
      confirmExpected: "Bekräfta förväntat",
      enterActual: "Ange faktiskt utfall",
      saveActual: "Spara utfall",
      addExpenseLog: "Lägg till delutgift",
      addItem: "Ny budgetpost",
      addUnexpected: "Oväntad utgift",
      addGroup: "Ny grupp",
      editItem: "Redigera post",
      delete: "Ta bort",
      cancel: "Avbryt",
      save: "Spara",
      markDone: "Markera som klar",
      reopen: "Öppna igen",
    },
    itemForm: {
      titleNew: "Ny budgetpost",
      titleUnexpected: "Lägg till oväntad utgift",
      titleEdit: "Redigera budgetpost",
      name: "Namn (t.ex. Elräkning, Tandläkare, Mat)",
      group: "Grupp",
      expectedAmount: "Förväntat belopp",
      actualPaidNow: "Belopp att bokföra nu",
      entryMode: "Typ av uppföljning",
      singleBill: "Enstaka räkning / fast post (bekräfta 1 gång)",
      multiEntry: "Löpande pott (t.ex. Mat – logga delköp eller månadssumma)",
      frequencyType: "Är kostnaden återkommande eller engångs?",
      recurringPill: "Återkommande",
      oneTimePill: "Endast en gång",
      recurrence: "Intervall för återkommande post",
      anchorMonth: "Vilken månad betalas den?",
      coverageMonths: "Avser hur många månader bakåt?",
      variableEstimate: "Varierar efter säsong (t.ex. el eller uppvärmning)",
      futurePromptTitle: "Använd i framtida månader?",
      futurePromptDesc:
        "Detta var en ny/oväntad post. Vill du att den bara gäller denna månad eller läggas in i budgeten framöver?",
      futureKeepOnce: "Endast denna månad",
      futureMakeMonthly: "Varje månad framöver",
      futureMakeQuarterly: "Var 3:e månad framöver",
    },
    followUpPrompt: {
      diffTitle: "Använd detta belopp i framtiden?",
      diffDesc:
        "Utfallet skiljer sig från ditt förväntade belopp. Ska framtida månader uppdateras till detta belopp?",
      onlyThisMonth: "Nej, endast denna månad",
      updateFutureExpected: "Ja, uppdatera förväntat framöver",
      oneTimeTitle: "Ska denna engångspost bli återkommande?",
      oneTimeKeep: "Behåll som engångspost",
      oneTimeMakeMonthly: "Gör återkommande (Varje månad)",
      oneTimeMakeQuarterly: "Gör återkommande (Kvartalsvis)",
    },
    groupForm: {
      titleNew: "Skapa ny grupp",
      name: "Gruppnamn (t.ex. Boende & Drift)",
      kind: "Kategori",
      income: "Inkomst",
      expense: "Utgift",
      savings: "Sparande",
      color: "Färgtema",
    },
    household: {
      title: "Hushåll & Inställningar",
      sharedDesc: "Dela budgeten i realtid med din partner eller familj.",
      inviteCode: "Inbjudningskod",
      copyCode: "Kopiera kod",
      copied: "Kopierad!",
      joinHousehold: "Gå med i ett annat hushåll",
      enterInviteCode: "Ange 8-siffrig kod",
      joinBtn: "Gå med",
      language: "Språk",
      currency: "Valuta",
      members: "Medlemmar",
      authStatus: "Konto & Synkning",
      signInTitle: "Logga in eller skapa konto",
      signInSubtitle:
        "Synka din budget säkert i molnet och dela med ditt hushåll.",
      emailPlaceholder: "din@epost.se",
      passwordPlaceholder: "Lösenord (minst 6 tecken)",
      signInBtn: "Logga in",
      signUpBtn: "Skapa konto",
      magicLinkBtn: "Skicka magisk länk",
      googleBtn: "Fortsätt med Google",
      signOutBtn: "Logga ut",
      demoModeBanner:
        "Demoläge (Lokalt sparat på enheten) – Logga in under Hushåll för molnsynk",
      dbSetupNeeded: "Supabase-tabeller saknas i projektet",
      dbSetupHelp:
        "Kör vår SQL-migration i Supabase SQL Editor eller via CLI för att aktivera molnsynk.",
    },
    insights: {
      title: "Uppföljning & Analys",
      subtitle: "Jämför förväntad budget mot faktiskt utfall",
      varianceByGroup: "Förväntat vs Utfall per grupp",
      biggestDeviations: "Största avvikelserna denna månad",
      upcomingRareBills: "Kommande kvartals- & årsräkningar",
      underBudget: "under budget",
      overBudget: "över budget",
      onTarget: "exakt på budget",
      monthlyReserveTip:
        "Totalt att sätta undan varje månad för sällanräkningar:",
    },
  },
  en: {
    appName: "bdgt",
    tagline: "Smart private economy & budget follow-up",
    nav: {
      budget: "Budget",
      insights: "Insights",
      household: "Household",
    },
    viewMode: {
      cashflow: "Payment Month",
      accrual: "Monthly Average (Buffer)",
      cashflowDesc: "Shows bills in the month they are actually paid",
      accrualDesc: "Spreads quarterly & annual bills evenly across months",
    },
    summary: {
      income: "Income",
      expenses: "Expenses",
      savings: "Savings",
      leftToSpend: "Left this month",
      expected: "Expected",
      actual: "Actual",
      confirmedProgress: "Confirmed items",
      of: "of",
      done: "done",
      bufferTransfer: "Set aside for non-monthly bills",
    },
    status: {
      pending: "Awaiting actual",
      confirmed: "Confirmed",
      skipped: "Skipped",
      offMonth: "Not due this month",
      offMonthAccrual: "Buffer accrual",
    },
    actions: {
      confirmExpected: "Confirm expected",
      enterActual: "Enter actual amount",
      saveActual: "Save actual",
      addExpenseLog: "Add partial spend",
      addItem: "New budget item",
      addUnexpected: "Unexpected cost",
      addGroup: "New group",
      editItem: "Edit item",
      delete: "Delete",
      cancel: "Cancel",
      save: "Save",
      markDone: "Mark as confirmed",
      reopen: "Reopen",
    },
    itemForm: {
      titleNew: "New budget item",
      titleUnexpected: "Log unexpected cost",
      titleEdit: "Edit budget item",
      name: "Name (e.g. Electricity, Dentist, Groceries)",
      group: "Group",
      expectedAmount: "Expected amount",
      actualPaidNow: "Amount to record now",
      entryMode: "Follow-up style",
      singleBill: "Single bill / fixed item (confirm once)",
      multiEntry:
        "Running budget (e.g. Groceries – log partial spends or monthly total)",
      frequencyType: "Is this recurring or a one-time cost?",
      recurringPill: "Recurring",
      oneTimePill: "Just once",
      recurrence: "Billing frequency",
      anchorMonth: "Payment month (or cycle anchor month)",
      coverageMonths: "Covers how many past months?",
      variableEstimate: "Varies by season (e.g. electricity or heating)",
      futurePromptTitle: "Use this cost in the future?",
      futurePromptDesc:
        "Since this is an unexpected cost, should it only apply this month or be added to future months?",
      futureKeepOnce: "This month only",
      futureMakeMonthly: "Every month going forward",
      futureMakeQuarterly: "Every 3 months going forward",
    },
    followUpPrompt: {
      diffTitle: "Use this amount in the future?",
      diffDesc:
        "The actual amount differs from your expected budget. Should future months use this new amount?",
      onlyThisMonth: "No, this month only",
      updateFutureExpected: "Yes, update future expected",
      oneTimeTitle: "Use this one-time cost in the future?",
      oneTimeKeep: "Keep as one-time only",
      oneTimeMakeMonthly: "Make recurring (Monthly)",
      oneTimeMakeQuarterly: "Make recurring (Quarterly)",
    },
    groupForm: {
      titleNew: "Create new group",
      name: "Group name (e.g. Housing & Utilities)",
      kind: "Category type",
      income: "Income",
      expense: "Expense",
      savings: "Savings",
      color: "Color theme",
    },
    household: {
      title: "Household & Settings",
      sharedDesc: "Share your budget in real time with your partner or family.",
      inviteCode: "Invite Code",
      copyCode: "Copy code",
      copied: "Copied!",
      joinHousehold: "Join an existing household",
      enterInviteCode: "Enter 8-character code",
      joinBtn: "Join",
      language: "Language",
      currency: "Currency",
      members: "Members",
      authStatus: "Account & Cloud Sync",
      signInTitle: "Sign in or create account",
      signInSubtitle:
        "Sync your budget securely in the cloud and share with your household.",
      emailPlaceholder: "you@example.com",
      passwordPlaceholder: "Password (min 6 chars)",
      signInBtn: "Sign in",
      signUpBtn: "Create account",
      magicLinkBtn: "Send Magic Link",
      googleBtn: "Continue with Google",
      signOutBtn: "Sign out",
      demoModeBanner:
        "Local Preview Mode – Sign in under Household for cloud sync",
      dbSetupNeeded: "Supabase tables not initialized yet",
      dbSetupHelp:
        "Run our SQL migration in the Supabase SQL Editor or CLI to enable cloud sync.",
    },
    insights: {
      title: "Follow-Up & Insights",
      subtitle: "Compare expected budget against actual outcome",
      varianceByGroup: "Expected vs Actual by Group",
      biggestDeviations: "Largest variances this month",
      upcomingRareBills: "Upcoming quarterly & annual bills",
      underBudget: "under budget",
      overBudget: "over budget",
      onTarget: "right on target",
      monthlyReserveTip:
        "Total to set aside each month for non-monthly bills:",
    },
  },
} as const;

export const MONTH_NAMES: Record<Locale, string[]> = {
  sv: [
    "Januari",
    "Februari",
    "Mars",
    "April",
    "Maj",
    "Juni",
    "Juli",
    "Augusti",
    "September",
    "Oktober",
    "November",
    "December",
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
};

export const SHORT_MONTH_NAMES: Record<Locale, string[]> = {
  sv: [
    "jan",
    "feb",
    "mar",
    "apr",
    "maj",
    "jun",
    "jul",
    "aug",
    "sep",
    "okt",
    "nov",
    "dec",
  ],
  en: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
};

export function formatCurrency(
  amount: number,
  currency = "SEK",
  locale: Locale = "sv"
): string {
  const rounded = Math.round(amount);
  const formattedNumber = new Intl.NumberFormat(
    locale === "sv" ? "sv-SE" : "en-US",
    {
      maximumFractionDigits: 0,
    }
  ).format(rounded);

  if (currency === "SEK") {
    return locale === "sv" ? `${formattedNumber} kr` : `${formattedNumber} SEK`;
  }
  return `${formattedNumber} ${currency}`;
}

export function formatYearMonthLabel(
  yearMonth: string,
  locale: Locale
): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const monthIdx = (m || 1) - 1;
  return `${MONTH_NAMES[locale][monthIdx]} ${y}`;
}

export function getRecurrenceLabel(
  interval: RecurrenceInterval,
  locale: Locale
): string {
  const labels: Record<Locale, Record<RecurrenceInterval, string>> = {
    sv: {
      0: "Endast en gång (Engångspost)",
      1: "Varje månad",
      2: "Varannan månad (6 ggr/år)",
      3: "Kvartalsvis (var 3:e månad)",
      4: "Var 4:e månad (3 ggr/år)",
      6: "Halvårsvis (var 6:e månad)",
      12: "Årsvis (1 gång/år)",
    },
    en: {
      0: "One-time only (Single month)",
      1: "Every month",
      2: "Every 2 months",
      3: "Quarterly (every 3 months)",
      4: "Every 4 months",
      6: "Semi-annually (every 6 months)",
      12: "Annually (once a year)",
    },
  };
  return labels[locale][interval] ?? labels[locale][1];
}
