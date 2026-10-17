"use client";

import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  X,
  Upload,
  FileSpreadsheet,
  Check,
  Sparkles,
  AlertCircle,
  Zap,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  Repeat,
  Calendar,
} from "lucide-react";
import {
  BudgetGroup,
  BudgetItem,
  Locale,
  MerchantRule,
} from "@/lib/types";
import { formatCurrency } from "@/lib/i18n";

export interface ImportedRowAction {
  date: string;
  yearMonth: string; // YYYY-MM derived from transaction date
  description: string;
  merchantKey: string;
  amount: number;
  isIncome: boolean;
  actionType: "existing_item" | "new_once" | "new_monthly" | "skip";
  targetItemId?: string;
  targetGroupId?: string;
  rememberRule?: boolean;
  rulePattern?: string;
}

interface BankImportModalProps {
  open: boolean;
  yearMonth: string;
  groups: BudgetGroup[];
  items: BudgetItem[];
  merchantRules: MerchantRule[];
  currency: string;
  locale: Locale;
  onClose: () => void;
  onImportRows: (rows: ImportedRowAction[]) => Promise<void>;
  onSaveMerchantRules: (rules: MerchantRule[]) => Promise<void>;
}

interface RawTransactionRow {
  id: string;
  date: string;
  yearMonth: string;
  merchantName: string;
  detailNote: string;
  amount: number; // positive absolute amount
  rawSignedAmount: number; // negative for expense, positive for income
}

interface MerchantGroupCandidate {
  merchantKey: string;
  displayName: string;
  transactions: RawTransactionRow[];
  distinctMonths: string[];
  isIncome: boolean;
  avgAmount: number;
  latestAmount: number;
  totalAmount: number;
  actionType: "existing_item" | "new_once" | "new_monthly" | "skip";
  targetItemId: string;
  targetGroupId: string;
  suggestedCategoryLabel: string;
  matchedRulePattern?: string;
  rememberRule: boolean;
  rulePattern: string;
}

/**
 * Robust numeric parser for Swedish & international bank formats:
 * - Handles Unicode minus sign (\u2212 '−'), en-dash ('–'), em-dash ('—')
 * - Handles trailing minus ('1 245,00-')
 * - Handles accounting parentheses ('(1 245,00)')
 * - Handles space / non-breaking space thousand separators ('1 245,50' or '1.245,50')
 */
function parseNumericAmount(raw: unknown): number | null {
  if (typeof raw === "number") {
    return isNaN(raw) ? null : raw;
  }
  if (raw === null || raw === undefined) return null;
  let str = String(raw).trim();
  if (!str) return null;

  str = str.replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D−–—]/g, "-");

  let isNegative = false;
  if (/^\(.*\)$/.test(str)) {
    isNegative = true;
    str = str.slice(1, -1);
  } else if (str.endsWith("-")) {
    isNegative = true;
    str = str.slice(0, -1);
  } else if (str.startsWith("-")) {
    isNegative = true;
    str = str.slice(1);
  } else if (str.startsWith("+")) {
    str = str.slice(1);
  }

  str = str
    .replace(/[\u00A0\u202F\s]+/g, "")
    .replace(/kr|SEK|EUR|USD|NOK|DKK|GBP/gi, "");

  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    str = str.replace(",", ".");
  }

  str = str.replace(/[^0-9.]/g, "");
  if (!str) return null;

  const num = parseFloat(str);
  if (isNaN(num)) return null;
  return isNegative ? -num : num;
}

function ensureFullWorksheetRange(ws: XLSX.WorkSheet) {
  let maxRow = 0;
  let maxCol = 0;
  for (const key of Object.keys(ws)) {
    if (key.startsWith("!")) continue;
    const cell = XLSX.utils.decode_cell(key);
    if (cell.r > maxRow) maxRow = cell.r;
    if (cell.c > maxCol) maxCol = cell.c;
  }
  if (maxRow > 0 || maxCol > 0) {
    ws["!ref"] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: maxRow, c: maxCol },
    });
  }
}

function parseCsvTextToRows(text: string): string[][] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const sampleLines = lines.slice(0, Math.min(12, lines.length));
  let bestDelim = ",";
  let bestCount = 0;
  for (const delim of [";", ",", "\t"]) {
    const counts = sampleLines.map((l) => l.split(delim).length);
    const maxCols = Math.max(...counts);
    if (maxCols > bestCount) {
      bestCount = maxCols;
      bestDelim = delim;
    }
  }

  return lines.map((line) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === bestDelim && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  });
}

/**
 * Clean & normalize Sparbanken Referens + Beskrivning into a canonical Merchant Name
 */
function buildCleanMerchantName(
  primaryRef: string,
  secondaryDesc: string
): { merchantName: string; detailNote: string } {
  const cleanRef = primaryRef.replace(/^[,.\s]+|[,.\s]+$/g, "").trim();
  const cleanDesc = secondaryDesc.replace(/^[,.\s]+|[,.\s]+$/g, "").trim();

  // If Referens is empty, use Beskrivning
  if (!cleanRef && cleanDesc) {
    return { merchantName: cleanDesc, detailNote: "" };
  }
  if (cleanRef && !cleanDesc) {
    return { merchantName: cleanRef, detailNote: "" };
  }
  if (cleanRef.toLowerCase() === cleanDesc.toLowerCase()) {
    return { merchantName: cleanRef, detailNote: "" };
  }

  // In Sparbanken, if Referens is a long numeric ID (e.g. "1988123040311281" for Barnbidrag/Dagersättning,
  // or "831398258548919" for Överföring lån, or "831395143459435" for Överföring via internet),
  // Beskrivning is the actual human-readable category!
  if (/^\d{7,}$/.test(cleanRef.replace(/[\s-]/g, "")) && cleanDesc) {
    return { merchantName: cleanDesc, detailNote: cleanRef };
  }
  if (/^\d{7,}$/.test(cleanDesc.replace(/[\s-]/g, "")) && cleanRef) {
    return { merchantName: cleanRef, detailNote: cleanDesc };
  }

  const genericLabels = [
    "kortköp",
    "autogiro",
    "betalning",
    "bankgiro",
    "plusgiro",
    "swish",
  ];
  if (genericLabels.includes(cleanRef.toLowerCase()) && cleanDesc) {
    return { merchantName: cleanDesc, detailNote: cleanRef };
  }
  if (genericLabels.includes(cleanDesc.toLowerCase()) && cleanRef) {
    return { merchantName: cleanRef, detailNote: cleanDesc };
  }

  return { merchantName: cleanRef, detailNote: cleanDesc };
}

function extractCleanMerchantKeyword(desc: string): string {
  const cleaned = desc
    .toLowerCase()
    .replace(/[0-9#*_/\\.,-]+/g, " ")
    .replace(
      /\b(ab|aktiebolag|se|sweden|stockholm|göteborg|malmö|kortköp|autogiro|betalning|swish)\b/g,
      " "
    )
    .trim()
    .replace(/\s+/g, " ");
  const words = cleaned.split(" ").filter((w) => w.length >= 2);
  if (words.length === 0) return desc.toLowerCase().trim().slice(0, 16);
  return words.slice(0, 2).join(" ");
}

/**
 * Suggest the best BudgetGroup and human category hint for a Swedish/Nordic merchant
 */
function suggestGroupAndCategory(
  merchantName: string,
  isIncome: boolean,
  groups: BudgetGroup[],
  locale: Locale
): { groupId: string; categoryHint: string; isInternalTransfer: boolean } {
  const lower = merchantName.toLowerCase();

  const incomeGroup =
    groups.find((g) => g.kind === "income") || groups[0];
  const savingsGroup =
    groups.find((g) => g.kind === "savings") ||
    groups.find((g) => /spar|invest|buffert/i.test(g.name)) ||
    groups[0];
  const housingGroup =
    groups.find((g) => /boende|drift|housing|hem|fast/i.test(g.name)) ||
    groups.find((g) => g.kind === "expense") ||
    groups[0];
  const transportInsGroup =
    groups.find((g) => /transport|försäkring|bil|insurance/i.test(g.name)) ||
    housingGroup;
  const dailyGroup =
    groups.find((g) => /mat|vardag|rörlig|grocer|daily|nöje/i.test(g.name)) ||
    groups.find((g) => g.kind === "expense") ||
    groups[0];

  // 1. Detect internal account transfers ("Överföring via internet", "Överföring", "Insättning")
  // Note: "Överföring lån" is a mortgage/loan payment, NOT an internal skip transfer!
  if (
    /^(överföring via internet|överföring|insättning|egen överföring)$/i.test(
      lower
    )
  ) {
    return {
      groupId: isIncome ? incomeGroup.id : dailyGroup.id,
      categoryHint:
        locale === "sv" ? "Intern överföring" : "Internal transfer",
      isInternalTransfer: true,
    };
  }

  // 2. Income items (Lön, Barnbidrag, Dagersättning, Skatteverket, Ers skada)
  if (
    isIncome ||
    /lön|barnbidrag|dagersättning|föräldrapenning|försäkringskassan|ers skada|återbäring|utdelning/.test(
      lower
    )
  ) {
    return {
      groupId: incomeGroup.id,
      categoryHint: locale === "sv" ? "Inkomst" : "Income",
      isInternalTransfer: false,
    };
  }

  // 3. Savings & Investments (Avanza, Månadsspar, LF Fondliv, Nordnet, Lysa)
  if (
    /avanza|nordnet|månadsspar|fondliv|lysa|opti|isk|sparande|bospar/.test(
      lower
    )
  ) {
    return {
      groupId: savingsGroup.id,
      categoryHint:
        locale === "sv" ? "Sparande & Investering" : "Savings & Investment",
      isInternalTransfer: false,
    };
  }

  // 4. Housing, Loans, Electricity, Broadband, Security, Municipality
  if (
    /överföring lån|bolån|sbab|landshypotek|e\.on|eon|vattenfall|ellevio|tibber|fortum|skånska energi|telia|telenor|bahnhof|tele2|tre |verisure|sector alarm|kävlinge kommun|kommun|hsb|riksbyggen|hyra|badrum/.test(
      lower
    )
  ) {
    const subHint = /lån|bolån/.test(lower)
      ? locale === "sv"
        ? "Bolån / Lån"
        : "Loan / Mortgage"
      : /e\.on|vattenfall|ellevio|tibber|fortum/.test(lower)
      ? locale === "sv"
        ? "El & Energi"
        : "Electricity"
      : /telia|telenor|bahnhof|tele2/.test(lower)
      ? locale === "sv"
        ? "Bredband & Telefoni"
        : "Broadband & Phone"
      : locale === "sv"
      ? "Boende & Drift"
      : "Housing & Utilities";

    return {
      groupId: housingGroup.id,
      categoryHint: subHint,
      isInternalTransfer: false,
    };
  }

  // 5. Insurance, Car, CSN, Loans, Transit
  if (
    /lf motor|lf skåne|länsförsäkringar|swedb försäk|tre kronor|if skade|trygg-hansa|folksam|hedvig|moderna|santander|csn|parkster|easypark|aimo|transportstyrels|skånetrafiken|sl |västtrafik|circle k|okq8|preem/.test(
      lower
    )
  ) {
    const subHint = /lf |försäk|tre kronor|trygg|folksam|hedvig/.test(lower)
      ? locale === "sv"
        ? "Försäkring"
        : "Insurance"
      : /csn|santander/.test(lower)
      ? locale === "sv"
        ? "Lån & CSN"
        : "Loans & CSN"
      : locale === "sv"
      ? "Transport & Bil"
      : "Transport & Car";

    return {
      groupId: transportInsGroup.id,
      categoryHint: subHint,
      isInternalTransfer: false,
    };
  }

  // 6. Union, A-kassa, Gym, Charity, Healthcare, Credit Cards, Groceries
  const subHint = /sv ingenj|union|akassa|a-kassa|fack/.test(lower)
    ? locale === "sv"
      ? "Fack & A-kassa"
      : "Union & Unemployment"
    : /nordicwell|sats|friskis|gym|träning/.test(lower)
    ? locale === "sv"
      ? "Träning & Hälsa"
      : "Fitness & Health"
    : /seb kort|american express|amex|mastercard|kort/.test(lower)
    ? locale === "sv"
      ? "Kreditkortsfaktura"
      : "Credit Card Bill"
    : /rädda barnen|unicef|röda korset|gåva/.test(lower)
    ? locale === "sv"
      ? "Välgörenhet"
      : "Charity"
    : /region skåne|folktandvård|vård|apotek/.test(lower)
    ? locale === "sv"
      ? "Vård & Tandvård"
      : "Healthcare"
    : locale === "sv"
    ? "Mat & Vardag"
    : "Daily & Other";

  return {
    groupId: dailyGroup.id,
    categoryHint: subHint,
    isInternalTransfer: false,
  };
}

function matchItemWithRules(
  merchantName: string,
  items: BudgetItem[],
  rules: MerchantRule[]
): { item?: BudgetItem; matchedRule?: MerchantRule } {
  const lower = merchantName.toLowerCase();

  // 1. Check user's saved Smart Merchant Rules first
  for (const rule of rules) {
    const pat = rule.pattern.trim().toLowerCase();
    if (pat && lower.includes(pat)) {
      const target = items.find((i) => i.id === rule.targetItemId);
      if (target) {
        return { item: target, matchedRule: rule };
      }
    }
  }

  // 2. Direct substring match with existing BudgetItem name
  for (const it of items) {
    const itemLower = it.name.toLowerCase();
    if (itemLower === lower) return { item: it };
    const firstWord = itemLower.split(/[\s/(&,-]+/)[0];
    if (firstWord && firstWord.length >= 3 && lower.includes(firstWord)) {
      return { item: it };
    }
  }

  // 3. Built-in matchers for default starter items
  if (/^lön$/i.test(lower)) {
    return {
      item: items.find((i) => /lön|salary/i.test(i.name)),
    };
  }
  if (/e\.on|eon|vattenfall|ellevio|tibber|fortum/.test(lower)) {
    return {
      item: items.find((i) => /\bel|elräkning|electr/i.test(i.name)),
    };
  }
  if (/telia|telenor|bahnhof/.test(lower)) {
    return {
      item: items.find((i) => /bredband|broadband|fiber|mobil/i.test(i.name)),
    };
  }
  if (/överföring lån|bolån/.test(lower)) {
    return {
      item: items.find((i) => /boendekostnad|bolån|hyra|mortgage/i.test(i.name)),
    };
  }
  if (/avanza|månadsspar|nordnet/.test(lower)) {
    return {
      item: items.find((i) => /månadsspar|sparande|isk|buffer/i.test(i.name)),
    };
  }
  if (/ica|willys|coop|hemköp|lidl|mathem/.test(lower)) {
    return {
      item: items.find(
        (i) =>
          i.entry_mode === "multi_entry" ||
          /mat|dagligvaror|grocer/i.test(i.name)
      ),
    };
  }

  return {};
}

export function BankImportModal({
  open,
  yearMonth,
  groups,
  items,
  merchantRules,
  currency,
  locale,
  onClose,
  onImportRows,
  onSaveMerchantRules,
}: BankImportModalProps) {
  const [rawGrid, setRawGrid] = useState<unknown[][]>([]);
  const [headerRowIdx, setHeaderRowIdx] = useState<number>(0);
  const [dateColIdx, setDateColIdx] = useState<number>(0);
  const [descColIdx, setDescColIdx] = useState<number>(1);
  const [secondaryDescColIdx, setSecondaryDescColIdx] = useState<number>(-1);
  const [amountColIdx, setAmountColIdx] = useState<number>(2);
  const [showColumnMapper, setShowColumnMapper] = useState<boolean>(false);

  const [merchantGroups, setMerchantGroups] = useState<
    MerchantGroupCandidate[]
  >([]);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [monthScope, setMonthScope] = useState<"all" | string>("all");
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Smart rules drawer state
  const [showRulesDrawer, setShowRulesDrawer] = useState(false);
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleItemId, setNewRuleItemId] = useState(items[0]?.id || "");

  // Distinct YYYY-MM months present across all parsed transactions
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const mg of merchantGroups) {
      for (const tx of mg.transactions) {
        set.add(tx.yearMonth);
      }
    }
    return Array.from(set).sort().reverse();
  }, [merchantGroups]);

  if (!open) return null;

  const defaultItemId = items[0]?.id || "";

  const buildGroupedCandidatesFromColumns = (
    rows: unknown[][],
    startRow: number,
    dCol: number,
    tCol: number,
    tCol2: number,
    aCol: number
  ) => {
    const rawTxs: RawTransactionRow[] = [];

    for (let i = startRow; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 2) continue;

      const primaryText = String(r[tCol] ?? "").trim();
      const secondaryText =
        tCol2 !== -1 && tCol2 !== tCol ? String(r[tCol2] ?? "").trim() : "";

      const { merchantName, detailNote } = buildCleanMerchantName(
        primaryText,
        secondaryText
      );

      const rawAmt = parseNumericAmount(r[aCol]);
      if (!merchantName || rawAmt === null || rawAmt === 0) continue;

      if (/^(belopp|amount|summa|totalt|saldo)$/i.test(merchantName)) {
        continue;
      }

      const absAmount = Math.abs(rawAmt);
      const rawDate = String(r[dCol] ?? "").trim();
      const dateMatch = rawDate.match(/(\d{4}[-/.]\d{2}[-/.]\d{2})/);
      const cleanDate = dateMatch
        ? dateMatch[1].replace(/[/.]/g, "-")
        : `${yearMonth}-15`;
      const txYearMonth = cleanDate.slice(0, 7);

      rawTxs.push({
        id: `tx-${i}`,
        date: cleanDate,
        yearMonth: txYearMonth,
        merchantName,
        detailNote,
        amount: absAmount,
        rawSignedAmount: rawAmt,
      });
    }

    if (rawTxs.length === 0) {
      setErrorMsg(
        locale === "sv"
          ? "Kunde inte hitta några transaktionsrader med dessa kolumnval. Prova att justera kolumnerna nedan."
          : "Could not find transaction rows with these column selections. Try adjusting the columns below."
      );
      setShowColumnMapper(true);
      setMerchantGroups([]);
      return;
    }

    setErrorMsg(null);

    // Group transactions by normalized (merchantName + isIncome) so recurring bills are categorized ONCE!
    const groupedMap = new Map<string, RawTransactionRow[]>();
    for (const tx of rawTxs) {
      const isInc = tx.rawSignedAmount > 0;
      const normKey = `${isInc ? "INC" : "EXP"}::${tx.merchantName
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()}`;
      const list = groupedMap.get(normKey) || [];
      list.push(tx);
      groupedMap.set(normKey, list);
    }

    const groupedCandidates: MerchantGroupCandidate[] = [];

    for (const [normKey, txList] of groupedMap.entries()) {
      const first = txList[0];
      const isIncome = first.rawSignedAmount > 0;
      const distinctMonths = Array.from(
        new Set(txList.map((t) => t.yearMonth))
      ).sort();
      const totalAmount = txList.reduce((s, t) => s + t.amount, 0);
      const avgAmount = Math.round(totalAmount / distinctMonths.length);
      const latestAmount = txList[0].amount;

      const { item: matchedItem, matchedRule } = matchItemWithRules(
        first.merchantName,
        items,
        merchantRules
      );

      const { groupId, categoryHint, isInternalTransfer } =
        suggestGroupAndCategory(first.merchantName, isIncome, groups, locale);

      // Determine smart default action:
      // 1. If internal transfer ("Överföring via internet", "Överföring", "Insättning") -> default to "skip"
      // 2. If matched to an existing item -> "existing_item"
      // 3. If appears across >= 2 months OR is a known monthly bill -> "new_monthly"
      // 4. Otherwise -> "new_once"
      const knownRecurringPattern =
        /lf |försäk|csn|santander|telia|telenor|e\.on|vattenfall|verisure|kävlinge kommun|nordicwell|union|sv ingenj|rädda barnen|avanza|månadsspar|barnbidrag|lön|hsb|tre kronor/i.test(
          first.merchantName
        );
      const isRecurring =
        distinctMonths.length >= 2 ||
        txList.length >= 2 ||
        knownRecurringPattern;

      let defaultAction: MerchantGroupCandidate["actionType"] = "new_once";
      if (isInternalTransfer) {
        defaultAction = "skip";
      } else if (matchedItem) {
        defaultAction = "existing_item";
      } else if (isRecurring) {
        defaultAction = "new_monthly";
      }

      groupedCandidates.push({
        merchantKey: normKey,
        displayName: first.merchantName,
        transactions: txList,
        distinctMonths,
        isIncome,
        avgAmount,
        latestAmount,
        totalAmount,
        actionType: defaultAction,
        targetItemId: matchedItem?.id || defaultItemId,
        targetGroupId: matchedItem?.group_id || groupId,
        suggestedCategoryLabel: categoryHint,
        matchedRulePattern: matchedRule?.pattern,
        rememberRule: Boolean(matchedItem && !matchedRule),
        rulePattern: extractCleanMerchantKeyword(first.merchantName),
      });
    }

    // Sort: recurring & multi-row merchants first, skipped internal transfers at the bottom
    groupedCandidates.sort((a, b) => {
      if (a.actionType === "skip" && b.actionType !== "skip") return 1;
      if (a.actionType !== "skip" && b.actionType === "skip") return -1;
      if (b.distinctMonths.length !== a.distinctMonths.length) {
        return b.distinctMonths.length - a.distinctMonths.length;
      }
      return b.transactions.length - a.transactions.length;
    });

    setMerchantGroups(groupedCandidates);
    setMonthScope("all");
  };

  const processRawRows = (rows: unknown[][]) => {
    setErrorMsg(null);
    const nonEmptyRows = (rows || []).filter(
      (r) =>
        Array.isArray(r) &&
        r.some((cell) => String(cell ?? "").trim() !== "")
    );

    if (nonEmptyRows.length === 0) {
      setErrorMsg(
        locale === "sv"
          ? "Filen verkar vara tom."
          : "The uploaded file appears to be empty."
      );
      return;
    }

    setRawGrid(nonEmptyRows);

    let detectedHeaderRow = -1;
    let dCol = 0;
    let tCol = 1;
    let tCol2 = -1;
    let aCol = 2;

    for (let r = 0; r < Math.min(30, nonEmptyRows.length); r++) {
      const row = nonEmptyRows[r].map((c) =>
        String(c ?? "")
          .toLowerCase()
          .trim()
      );

      // Prefer Transaktionsdag over Bokföringsdag so end-of-month bills stay in their transaction month
      const txDayIdx = row.findIndex((h) => /^transaktionsdag$/.test(h));
      const dIdx =
        txDayIdx !== -1
          ? txDayIdx
          : row.findIndex(
              (h) =>
                /^(bokföringsdag|bokf\.?dag|valutadag|datum|date|köpdag)$/.test(
                  h
                ) || /bokföringsdag|transaktionsdag|datum|date/.test(h)
            );

      const refIdx = row.findIndex((h) =>
        /^(referens|mottagare|specifikation|text|merchant|butik|inköpsställe)$/.test(
          h
        )
      );
      const descIdx = row.findIndex(
        (h, idx) =>
          idx !== dIdx &&
          idx !== refIdx &&
          /^(beskrivning|text|rubrik|description|transaktion|meddelande|notering)$/.test(
            h
          )
      );

      const aIdx = row.findIndex(
        (h) =>
          !/saldo|balance/.test(h) &&
          /^(belopp|amount|summa|utgift|utgifter|debit|kostnad|insättning\/uttag)$/.test(
            h
          )
      );
      const fallbackAIdx =
        aIdx !== -1
          ? aIdx
          : row.findIndex(
              (h) =>
                !/saldo|balance/.test(h) && /belopp|amount|summa/.test(h)
            );

      const primaryTextIdx = refIdx !== -1 ? refIdx : descIdx;
      const secondaryTextIdx =
        refIdx !== -1 && descIdx !== -1 ? descIdx : -1;

      if (primaryTextIdx !== -1 && fallbackAIdx !== -1) {
        detectedHeaderRow = r;
        dCol = dIdx !== -1 ? dIdx : 0;
        tCol = primaryTextIdx;
        tCol2 = secondaryTextIdx;
        aCol = fallbackAIdx;
        break;
      }
    }

    if (detectedHeaderRow === -1) {
      for (let r = 0; r < Math.min(15, nonEmptyRows.length); r++) {
        const row = nonEmptyRows[r].map((c) => String(c ?? "").trim());
        if (row.length < 2) continue;
        const foundDateCol = row.findIndex((val) =>
          /^\d{4}[-/.]\d{2}[-/.]\d{2}/.test(val)
        );
        const numCols: number[] = [];
        row.forEach((val, idx) => {
          if (idx === foundDateCol) return;
          if (/^\d{4}[-/.]\d{2}[-/.]\d{2}$/.test(val)) return;
          const parsedNum = parseNumericAmount(val);
          if (
            parsedNum !== null &&
            (/[-−,.\s]/.test(val) || Math.abs(parsedNum) < 1000000)
          ) {
            numCols.push(idx);
          }
        });

        if (foundDateCol !== -1 && numCols.length > 0) {
          detectedHeaderRow = Math.max(0, r - 1);
          dCol = foundDateCol;
          aCol =
            numCols.length >= 2
              ? numCols[numCols.length - 2]
              : numCols[0];
          const candidateTextCols = row
            .map((val, idx) => ({ val, idx }))
            .filter(
              (x) =>
                x.idx > dCol &&
                x.idx !== aCol &&
                x.val.length > 1 &&
                !/^\d{4}[-/.]\d{2}[-/.]\d{2}$/.test(x.val) &&
                parseNumericAmount(x.val) === null
            );
          if (candidateTextCols.length > 0) {
            tCol = candidateTextCols[0].idx;
            tCol2 =
              candidateTextCols.length > 1 ? candidateTextCols[1].idx : -1;
          }
          break;
        }
      }
    }

    const startRow = detectedHeaderRow !== -1 ? detectedHeaderRow + 1 : 0;
    setHeaderRowIdx(Math.max(0, detectedHeaderRow));
    setDateColIdx(dCol);
    setDescColIdx(tCol);
    setSecondaryDescColIdx(tCol2);
    setAmountColIdx(aCol);

    buildGroupedCandidatesFromColumns(
      nonEmptyRows,
      startRow,
      dCol,
      tCol,
      tCol2,
      aCol
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setErrorMsg(null);

    try {
      const buffer = await file.arrayBuffer();
      const lowerName = file.name.toLowerCase();

      if (lowerName.endsWith(".csv") || lowerName.endsWith(".txt")) {
        let text = new TextDecoder("utf-8").decode(buffer);
        if (text.includes("\uFFFD")) {
          text = new TextDecoder("iso-8859-1").decode(buffer);
        }
        const csvRows = parseCsvTextToRows(text);
        processRawRows(csvRows);
        return;
      }

      const workbook = XLSX.read(buffer, { type: "array", raw: false });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      ensureFullWorksheetRange(worksheet);

      const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        defval: "",
        blankrows: false,
      });
      processRawRows(rows);
    } catch {
      setErrorMsg(
        locale === "sv"
          ? "Kunde inte läsa filen. Prova en .xlsx eller .csv-fil."
          : "Could not parse file. Please upload a valid .xlsx or .csv file."
      );
    }
  };

  const handleLoadSample = () => {
    setFileName("Transaktioner_Hushallskonto_Sparbanken.csv");
    processRawRows([
      ["Transaktioner Hushållskonto", "", "", "", "", "", "", ""],
      [
        "Radnummer",
        "Bokföringsdag",
        "Transaktionsdag",
        "Valutadag",
        "Referens",
        "Beskrivning",
        "Belopp",
        "Bokfört saldo",
      ],
      ["2", "2026-10-16", "2026-10-20", "2026-10-21", "1988123040311281", "Barnbidrag", "625", "48723.47"],
      ["3", "2026-10-16", "2026-10-20", "2026-10-21", "1994072020281281", "Barnbidrag", "625", "48098.47"],
      ["9", "2026-10-01", "2026-10-01", "2026-10-01", "LF MOTOR", "LF MOTOR", "-751", "111857.47"],
      ["10", "2026-10-01", "2026-10-01", "2026-10-01", "LF Skåne", "LF Skåne", "-595", "112608.47"],
      ["11", "2026-10-01", "2026-10-01", "2026-10-01", "LF Skåne", "LF Skåne", "-307", "113203.47"],
      ["15", "2026-09-30", "2026-09-30", "2026-09-30", "CSN", "CSN", "-1541", "113737.47"],
      ["17", "2026-09-30", "2026-09-30", "2026-09-30", "831398258548919", "Överföring lån", "-4314", "115373.47"],
      ["18", "2026-09-30", "2026-09-30", "2026-09-30", "831398258548901", "Överföring lån", "-3814", "119687.47"],
      ["20", "2026-09-30", "2026-09-30", "2026-09-30", "Santander", "Santander", "-3372", "23501.47"],
      ["22", "2026-09-30", "2026-09-30", "2026-09-30", "Kävlinge kommun", "Kävlinge kommun", "-752", "27263.47"],
      ["23", "2026-09-30", "2026-09-30", "2026-09-30", "Verisure Sverige", "Verisure Sverige", "-1587", "28015.47"],
      ["24", "2026-09-30", "2026-09-30", "2026-09-30", "Telia bredband,", "Telia bredband,", "-749", "29602.47"],
      ["26", "2026-09-28", "2026-09-28", "2026-09-28", "AVANZA BANK", "AVANZA BANK", "-2000", "30621.47"],
      ["32", "2026-09-28", "2026-09-28", "2026-09-28", "E.ON", "E.ON", "-1983", "89756.82"],
      ["38", "2026-09-24", "2026-09-25", "2026-09-25", "", "Lön", "22678", "62294.82"],
      ["39", "2026-09-24", "2026-09-25", "2026-09-25", "", "Lön", "27957.85", "39616.82"],
      ["43", "2026-09-01", "2026-09-01", "2026-09-01", "LF MOTOR", "LF MOTOR", "-728", "5008.97"],
      ["49", "2026-08-31", "2026-08-31", "2026-08-30", "CSN", "CSN", "-1541", "6887.97"],
      ["55", "2026-08-31", "2026-08-31", "2026-08-30", "Telia bredband,", "Telia bredband,", "-749", "39980.99"],
      ["66", "2026-08-28", "2026-08-28", "2026-08-28", "E.ON", "E.ON", "-1963", "79116.29"],
    ]);
  };

  const updateMerchantGroup = (
    merchantKey: string,
    patch: Partial<MerchantGroupCandidate>
  ) => {
    setMerchantGroups((prev) =>
      prev.map((mg) =>
        mg.merchantKey === merchantKey ? { ...mg, ...patch } : mg
      )
    );
  };

  const handleAddManualRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newRulePattern.trim().toLowerCase();
    if (!clean || !newRuleItemId) return;
    const nextRules: MerchantRule[] = [
      ...merchantRules.filter((r) => r.pattern.toLowerCase() !== clean),
      {
        id: `rule-${Date.now()}`,
        pattern: clean,
        targetItemId: newRuleItemId,
      },
    ];
    await onSaveMerchantRules(nextRules);
    setNewRulePattern("");
  };

  const handleDeleteRule = async (ruleId: string) => {
    const nextRules = merchantRules.filter((r) => r.id !== ruleId);
    await onSaveMerchantRules(nextRules);
  };

  // Filter transactions by selected monthScope ("all" or specific "YYYY-MM")
  const visibleMerchantGroups = merchantGroups
    .map((mg) => {
      const filteredTxs =
        monthScope === "all"
          ? mg.transactions
          : mg.transactions.filter((tx) => tx.yearMonth === monthScope);
      return {
        ...mg,
        filteredTxs,
      };
    })
    .filter((mg) => mg.filteredTxs.length > 0);

  const activeGroupsCount = visibleMerchantGroups.filter(
    (mg) => mg.actionType !== "skip"
  ).length;
  const activeTransactionsCount = visibleMerchantGroups
    .filter((mg) => mg.actionType !== "skip")
    .reduce((sum, mg) => sum + mg.filteredTxs.length, 0);

  const headerLabels: string[] =
    rawGrid.length > headerRowIdx
      ? (rawGrid[headerRowIdx] || []).map((c, idx) => {
          const txt = String(c ?? "").trim();
          return txt ? `${idx + 1}: ${txt}` : `Kolumn ${idx + 1}`;
        })
      : [];

  const handleConfirmImport = async () => {
    if (activeTransactionsCount === 0) return;
    setImporting(true);
    try {
      // 1. Save any new Smart Merchant Rules for existing_item mappings
      const updatedRules = [...merchantRules];
      let rulesChanged = false;

      for (const mg of visibleMerchantGroups) {
        if (
          mg.actionType === "existing_item" &&
          mg.rememberRule &&
          mg.rulePattern.trim() &&
          mg.targetItemId
        ) {
          const cleanPat = mg.rulePattern.trim().toLowerCase();
          const existingIdx = updatedRules.findIndex(
            (r) => r.pattern.toLowerCase() === cleanPat
          );
          if (existingIdx !== -1) {
            if (updatedRules[existingIdx].targetItemId !== mg.targetItemId) {
              updatedRules[existingIdx] = {
                ...updatedRules[existingIdx],
                targetItemId: mg.targetItemId,
              };
              rulesChanged = true;
            }
          } else {
            updatedRules.push({
              id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              pattern: cleanPat,
              targetItemId: mg.targetItemId,
            });
            rulesChanged = true;
          }
        }
      }

      if (rulesChanged) {
        await onSaveMerchantRules(updatedRules);
      }

      // 2. Flatten grouped merchant decisions into ImportedRowAction[]
      const actions: ImportedRowAction[] = [];
      for (const mg of visibleMerchantGroups) {
        if (mg.actionType === "skip") continue;
        for (const tx of mg.filteredTxs) {
          actions.push({
            date: tx.date,
            yearMonth: tx.yearMonth,
            description: mg.displayName,
            merchantKey: mg.merchantKey,
            amount: tx.amount,
            isIncome: mg.isIncome,
            actionType: mg.actionType,
            targetItemId: mg.targetItemId,
            targetGroupId: mg.targetGroupId,
            rememberRule: mg.rememberRule,
            rulePattern: mg.rulePattern,
          });
        }
      }

      await onImportRows(actions);
      setMerchantGroups([]);
      setRawGrid([]);
      setFileName(null);
      onClose();
    } finally {
      setImporting(false);
    }
  };

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
          <div>
            <h3 className="font-serif text-2xl text-[#282825]">
              {locale === "sv"
                ? "Bankimport & Auto-Gruppering"
                : "Bank Import & Auto-Grouping"}
            </h3>
            <p className="text-xs text-[#64645e]">
              {locale === "sv"
                ? "Samma betalningsmottagare grupperas automatiskt så du bara kategoriserar dem en gång."
                : "Recurring merchants are grouped automatically so you only categorize them once."}
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

        {/* Smart Merchant Rules Collapsible Drawer */}
        <div className="mt-3 rounded-2xl border border-[#c5c5ba] bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setShowRulesDrawer((v) => !v)}
            className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold text-[#282825] hover:bg-[#f8f8f7]"
          >
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-[#7a2899]" />
              <span>
                {locale === "sv"
                  ? `Smarta butiksregler (${merchantRules.length})`
                  : `Smart Merchant Rules (${merchantRules.length})`}
              </span>
            </span>
            {showRulesDrawer ? (
              <ChevronDown className="h-4 w-4 text-[#64645e]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[#64645e]" />
            )}
          </button>

          {showRulesDrawer && (
            <div className="border-t border-[#ecece9] p-3 space-y-2.5 bg-[#f8f8f7]">
              <form onSubmit={handleAddManualRule} className="flex gap-1.5">
                <input
                  type="text"
                  placeholder={
                    locale === "sv"
                      ? "Sökord (t.ex. ica, tibber)"
                      : "Keyword (e.g. ica, uber)"
                  }
                  value={newRulePattern}
                  onChange={(e) => setNewRulePattern(e.target.value)}
                  className="w-36 rounded-full border border-[#c5c5ba] bg-white px-3 py-1.5 text-xs text-[#282825] focus:border-[#282825] focus:outline-none"
                />
                <select
                  value={newRuleItemId || defaultItemId}
                  onChange={(e) => setNewRuleItemId(e.target.value)}
                  className="flex-1 rounded-full border border-[#c5c5ba] bg-white px-3 py-1.5 text-xs font-semibold text-[#282825]"
                >
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-full bg-[#0c0d0d] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#282825]"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </form>

              {merchantRules.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {merchantRules.map((r) => {
                    const target = items.find((i) => i.id === r.targetItemId);
                    return (
                      <span
                        key={r.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#edc6fb] bg-[#f6e6fc] px-2.5 py-1 text-[11px] font-semibold text-[#7a2899]"
                      >
                        <span className="font-mono">&ldquo;{r.pattern}&rdquo;</span>
                        <span>→</span>
                        <span className="text-[#282825]">
                          {target?.name || "—"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(r.id)}
                          className="ml-0.5 text-[#7a2899] hover:text-[#b81a14]"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Upload Dropzone */}
        <div className="mt-3 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#282825]/40 bg-white p-4 text-center">
          <FileSpreadsheet className="h-6 w-6 text-[#057b40] mb-1.5" />
          <p className="text-xs font-semibold text-[#282825]">
            {fileName
              ? fileName
              : locale === "sv"
              ? "Välj en Excel (.xlsx / .xls) eller CSV-fil från din bank"
              : "Choose an Excel (.xlsx / .xls) or CSV statement file"}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#0c0d0d] px-4 py-2 text-xs font-semibold text-white hover:bg-[#282825]">
              <Upload className="h-3.5 w-3.5" />
              <span>
                {locale === "sv" ? "Välj fil (.xlsx / .csv)" : "Select file"}
              </span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={handleLoadSample}
              className="inline-flex items-center gap-1 rounded-full border border-[#282825] bg-[#e7f4eb] px-3.5 py-2 text-xs font-semibold text-[#057b40]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                {locale === "sv"
                  ? "Testa Sparbanken-exempel"
                  : "Load sample rows"}
              </span>
            </button>
          </div>
        </div>

        {/* Manual Column Mapping Adjuster */}
        {rawGrid.length > 0 && headerLabels.length > 1 && (
          <div className="mt-3 rounded-2xl border border-[#c5c5ba] bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#282825] flex items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#057b40]" />
                {locale === "sv"
                  ? "Identifierade kolumner i filen"
                  : "Detected file columns"}
              </span>
              <button
                type="button"
                onClick={() => setShowColumnMapper((v) => !v)}
                className="text-[11px] font-semibold text-[#2173be] underline"
              >
                {showColumnMapper
                  ? locale === "sv"
                    ? "Dölj"
                    : "Hide"
                  : locale === "sv"
                  ? "Ändra kolumner"
                  : "Change columns"}
              </button>
            </div>

            {showColumnMapper && (
              <div className="mt-2.5 grid grid-cols-3 gap-2 pt-2 border-t border-[#ecece9] text-[11px]">
                <div>
                  <label className="block font-semibold text-[#64645e] mb-1">
                    {locale === "sv" ? "Datum" : "Date"}
                  </label>
                  <select
                    value={dateColIdx}
                    onChange={(e) => {
                      const nextD = Number(e.target.value);
                      setDateColIdx(nextD);
                      buildGroupedCandidatesFromColumns(
                        rawGrid,
                        headerRowIdx + 1,
                        nextD,
                        descColIdx,
                        secondaryDescColIdx,
                        amountColIdx
                      );
                    }}
                    className="w-full rounded-xl border border-[#c5c5ba] bg-[#f8f8f7] px-2 py-1.5 text-[#282825]"
                  >
                    {headerLabels.map((lbl, idx) => (
                      <option key={idx} value={idx}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#64645e] mb-1">
                    {locale === "sv" ? "Referens / Text" : "Merchant / Text"}
                  </label>
                  <select
                    value={descColIdx}
                    onChange={(e) => {
                      const nextT = Number(e.target.value);
                      setDescColIdx(nextT);
                      buildGroupedCandidatesFromColumns(
                        rawGrid,
                        headerRowIdx + 1,
                        dateColIdx,
                        nextT,
                        secondaryDescColIdx,
                        amountColIdx
                      );
                    }}
                    className="w-full rounded-xl border border-[#c5c5ba] bg-[#f8f8f7] px-2 py-1.5 text-[#282825]"
                  >
                    {headerLabels.map((lbl, idx) => (
                      <option key={idx} value={idx}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#64645e] mb-1">
                    {locale === "sv" ? "Belopp" : "Amount"}
                  </label>
                  <select
                    value={amountColIdx}
                    onChange={(e) => {
                      const nextA = Number(e.target.value);
                      setAmountColIdx(nextA);
                      buildGroupedCandidatesFromColumns(
                        rawGrid,
                        headerRowIdx + 1,
                        dateColIdx,
                        descColIdx,
                        secondaryDescColIdx,
                        nextA
                      );
                    }}
                    className="w-full rounded-xl border border-[#c5c5ba] bg-[#f8f8f7] px-2 py-1.5 text-[#282825]"
                  >
                    {headerLabels.map((lbl, idx) => (
                      <option key={idx} value={idx}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-[#fdeeed] border border-[#eb5b55] p-3 text-xs font-medium text-[#b81a14]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Grouped Merchants List */}
        {merchantGroups.length > 0 && (
          <div className="mt-4 space-y-3">
            {/* Multi-month Filter Pills when statement spans multiple months */}
            {availableMonths.length > 1 && (
              <div className="rounded-2xl border border-[#c5c5ba] bg-white p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#64645e] mb-1.5">
                  <Calendar className="h-3.5 w-3.5 text-[#057b40]" />
                  <span>
                    {locale === "sv"
                      ? `Filen innehåller ${availableMonths.length} månader — välj vad som ska importeras:`
                      : `Statement spans ${availableMonths.length} months — choose scope:`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMonthScope("all")}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold border transition ${
                      monthScope === "all"
                        ? "border-[#282825] bg-[#0c0d0d] text-white"
                        : "border-[#c5c5ba] bg-[#f8f8f7] text-[#282825]"
                    }`}
                  >
                    {locale === "sv"
                      ? `Alla månader (${availableMonths[availableMonths.length - 1]} – ${availableMonths[0]})`
                      : `All months (${availableMonths.length})`}
                  </button>
                  {availableMonths.map((ym) => (
                    <button
                      key={ym}
                      type="button"
                      onClick={() => setMonthScope(ym)}
                      className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold border transition ${
                        monthScope === ym
                          ? "border-[#282825] bg-[#0c0d0d] text-white"
                          : "border-[#c5c5ba] bg-[#f8f8f7] text-[#282825]"
                      }`}
                    >
                      {ym}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs font-semibold text-[#64645e]">
              <span>
                {locale === "sv"
                  ? `${visibleMerchantGroups.length} unika mottagare (${activeTransactionsCount} rader)`
                  : `${visibleMerchantGroups.length} unique merchants (${activeTransactionsCount} rows)`}
              </span>
              <span>
                {activeGroupsCount}{" "}
                {locale === "sv" ? "aktiva grupper" : "active groups"}
              </span>
            </div>

            <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
              {visibleMerchantGroups.map((mg) => {
                const isExpanded = Boolean(expandedKeys[mg.merchantKey]);
                const txCount = mg.filteredTxs.length;
                const filteredSum = mg.filteredTxs.reduce(
                  (s, t) => s + t.amount,
                  0
                );
                const isRecurringGroup = mg.distinctMonths.length >= 2;

                return (
                  <div
                    key={mg.merchantKey}
                    className={`rounded-2xl border p-3.5 text-xs transition ${
                      mg.actionType === "skip"
                        ? "border-[#c5c5ba] bg-[#ecece9] opacity-60"
                        : "border-[#282825] bg-white"
                    }`}
                  >
                    {/* Row 1: Merchant Title (breaks lines naturally) + Amount */}
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-serif text-lg leading-snug break-words text-[#282825] flex-1">
                        {mg.displayName}
                      </h4>

                      <div className="text-right shrink-0">
                        <div
                          className={`font-serif text-lg leading-none ${
                            mg.isIncome ? "text-[#057b40]" : "text-[#282825]"
                          }`}
                        >
                          {mg.isIncome ? "+" : ""}
                          {formatCurrency(mg.latestAmount, currency, locale)}
                        </div>
                        {txCount > 1 && (
                          <div className="mt-0.5 font-mono text-[10px] text-[#64645e]">
                            {locale === "sv" ? "Totalt:" : "Total:"}{" "}
                            {formatCurrency(filteredSum, currency, locale)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Clean Metadata Strip */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          mg.isIncome
                            ? "bg-[#e7f4eb] text-[#057b40]"
                            : "bg-[#fdeee0] text-[#b85d10]"
                        }`}
                      >
                        {mg.suggestedCategoryLabel}
                      </span>

                      {isRecurringGroup && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#e1edfe] px-2 py-0.5 text-[10px] font-bold text-[#2173be]">
                          <Repeat className="h-2.5 w-2.5" />
                          {locale === "sv"
                            ? `${mg.distinctMonths.length} mån`
                            : `${mg.distinctMonths.length} mos`}
                        </span>
                      )}

                      {mg.matchedRulePattern && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#f6e6fc] px-2 py-0.5 text-[10px] font-bold text-[#7a2899]">
                          <Zap className="h-2.5 w-2.5" />
                          {mg.matchedRulePattern}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedKeys((prev) => ({
                            ...prev,
                            [mg.merchantKey]: !prev[mg.merchantKey],
                          }))
                        }
                        className="ml-auto inline-flex items-center gap-0.5 font-sans text-[11px] font-semibold text-[#2173be] hover:underline"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <span>
                          {txCount}{" "}
                          {locale === "sv"
                            ? txCount === 1
                              ? "rad"
                              : "rader"
                            : txCount === 1
                            ? "row"
                            : "rows"}
                        </span>
                      </button>
                    </div>

                    {/* Expandable individual transactions list */}
                    {isExpanded && (
                      <div className="mt-2 rounded-xl bg-[#f8f8f7] p-2.5 space-y-1 border border-[#ecece9]">
                        {mg.filteredTxs.map((tx) => (
                          <div
                            key={tx.id}
                            className="flex items-center justify-between font-mono text-[11px] text-[#64645e]"
                          >
                            <span className="break-words">
                              {tx.date}
                              {tx.detailNote ? ` (${tx.detailNote})` : ""}
                            </span>
                            <span className="font-bold text-[#282825] shrink-0 ml-2">
                              {formatCurrency(tx.amount, currency, locale)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Row 3: Action + Category/Target Item Selector */}
                    <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <select
                        value={mg.actionType}
                        onChange={(e) =>
                          updateMerchantGroup(mg.merchantKey, {
                            actionType: e.target
                              .value as MerchantGroupCandidate["actionType"],
                          })
                        }
                        className="w-full rounded-xl border border-[#c5c5ba] bg-[#f8f8f7] px-3 py-2 text-xs font-semibold text-[#282825]"
                      >
                        <option value="new_monthly">
                          {locale === "sv"
                            ? "🔄 Återkommande månadspost"
                            : "🔄 Recurring monthly item"}
                        </option>
                        <option value="existing_item">
                          {locale === "sv"
                            ? "🔗 Koppla till befintlig post"
                            : "🔗 Match existing item"}
                        </option>
                        <option value="new_once">
                          {locale === "sv"
                            ? "1️⃣ Engångspost"
                            : "1️⃣ One-time item"}
                        </option>
                        <option value="skip">
                          {locale === "sv" ? "⏭️ Hoppa över" : "⏭️ Skip"}
                        </option>
                      </select>

                      {mg.actionType === "existing_item" && (
                        <select
                          value={mg.targetItemId}
                          onChange={(e) =>
                            updateMerchantGroup(mg.merchantKey, {
                              targetItemId: e.target.value,
                              rememberRule: true,
                            })
                          }
                          className="w-full rounded-xl border border-[#c5c5ba] bg-[#e7f4eb] px-3 py-2 text-xs font-semibold text-[#057b40]"
                        >
                          {items.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.name}
                            </option>
                          ))}
                        </select>
                      )}

                      {(mg.actionType === "new_once" ||
                        mg.actionType === "new_monthly") && (
                        <select
                          value={mg.targetGroupId}
                          onChange={(e) =>
                            updateMerchantGroup(mg.merchantKey, {
                              targetGroupId: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-[#c5c5ba] bg-[#fdeee0] px-3 py-2 text-xs font-semibold text-[#b85d10]"
                        >
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={importing || activeTransactionsCount === 0}
                onClick={handleConfirmImport}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0c0d0d] py-3.5 px-5 text-xs font-bold text-white hover:bg-[#282825] disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                <span>
                  {locale === "sv"
                    ? `Importera ${activeGroupsCount} poster (${activeTransactionsCount} transaktioner)`
                    : `Import ${activeGroupsCount} items (${activeTransactionsCount} transactions)`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
