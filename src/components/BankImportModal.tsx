"use client";

import React, { useState } from "react";
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
  description: string;
  amount: number;
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

interface ParsedCandidate {
  id: string;
  date: string;
  description: string;
  amount: number;
  rawSignedAmount: number;
  actionType: "existing_item" | "new_once" | "new_monthly" | "skip";
  targetItemId: string;
  targetGroupId: string;
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

  // Normalize all Unicode minus/dash characters to standard ASCII '-'
  str = str.replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D−–—]/g, "-");

  // Detect accounting parentheses e.g. (123,45) or trailing minus e.g. 123,45-
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

  // Strip currency symbols and all whitespace (including non-breaking spaces)
  str = str
    .replace(/[\u00A0\u202F\s]+/g, "")
    .replace(/kr|SEK|EUR|USD|NOK|DKK|GBP/gi, "");

  // Handle thousand separators vs decimal separator:
  // If both '.' and ',' exist: whichever comes last is the decimal separator
  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // 1.234,56 -> 1234.56
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // 1,234.56 -> 1234.56
      str = str.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    // Only comma present: in Swedish/European exports comma is decimal separator
    str = str.replace(",", ".");
  }

  // Strip any remaining non-numeric chars except '.'
  str = str.replace(/[^0-9.]/g, "");
  if (!str) return null;

  const num = parseFloat(str);
  if (isNaN(num)) return null;
  return isNegative ? -num : num;
}

/**
 * Fix truncated worksheet '!ref' range in bank .xlsx exports (e.g. Swedbank / Sparbanken)
 * where <dimension ref="A1:L2"/> is written in XML even though hundreds of rows exist.
 */
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

/**
 * Parse CSV text directly (handles comma, semicolon, tab, quotes, and Swedish encodings)
 */
function parseCsvTextToRows(text: string): string[][] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  // Detect delimiter by checking the first 10 lines
  const sampleLines = lines.slice(0, Math.min(10, lines.length));
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

function matchItemWithRules(
  desc: string,
  items: BudgetItem[],
  rules: MerchantRule[]
): { item?: BudgetItem; matchedRule?: MerchantRule } {
  const lower = desc.toLowerCase();

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

  // 2. Direct substring match with item name
  for (const it of items) {
    const firstWord = it.name.toLowerCase().split(/[\s/(&-]+/)[0];
    if (firstWord && firstWord.length >= 3 && lower.includes(firstWord)) {
      return { item: it };
    }
  }

  // 3. Built-in Nordic merchant heuristics
  const groceryKeywords = [
    "ica",
    "willys",
    "coop",
    "hemköp",
    "lidl",
    "city gross",
    "mathem",
    "systembolaget",
  ];
  if (groceryKeywords.some((k) => lower.includes(k))) {
    return {
      item: items.find(
        (i) =>
          i.entry_mode === "multi_entry" ||
          i.name.toLowerCase().includes("mat") ||
          i.name.toLowerCase().includes("grocer")
      ),
    };
  }

  const diningKeywords = [
    "espresso house",
    "foodora",
    "wolt",
    "uber eats",
    "mcdonald",
    "max ",
    "restaurang",
    "cafe",
    "kaffe",
  ];
  if (diningKeywords.some((k) => lower.includes(k))) {
    return {
      item: items.find(
        (i) =>
          i.name.toLowerCase().includes("restaurang") ||
          i.name.toLowerCase().includes("dining") ||
          i.entry_mode === "multi_entry"
      ),
    };
  }

  const elecKeywords = [
    "vattenfall",
    "ellevio",
    "e.on",
    "eon",
    "tibber",
    "fortum",
    "greenely",
    "skånska energi",
  ];
  if (elecKeywords.some((k) => lower.includes(k))) {
    return {
      item: items.find(
        (i) =>
          i.name.toLowerCase().includes("el") ||
          i.name.toLowerCase().includes("electr")
      ),
    };
  }

  const transitKeywords = [
    "sl ",
    "västtrafik",
    "skånetrafiken",
    "sj ",
    "circle k",
    "okq8",
    "preem",
    "st1",
    "easypark",
    "aimo",
  ];
  if (transitKeywords.some((k) => lower.includes(k))) {
    return {
      item: items.find(
        (i) =>
          i.name.toLowerCase().includes("kollektiv") ||
          i.name.toLowerCase().includes("transit") ||
          i.name.toLowerCase().includes("transport")
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

  const [candidates, setCandidates] = useState<ParsedCandidate[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Smart rules drawer state
  const [showRulesDrawer, setShowRulesDrawer] = useState(false);
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleItemId, setNewRuleItemId] = useState(items[0]?.id || "");

  if (!open) return null;

  const defaultExpenseGroup =
    groups.find((g) => g.kind === "expense")?.id || groups[0]?.id || "";
  const defaultItemId = items[0]?.id || "";

  const buildCandidatesFromColumns = (
    rows: unknown[][],
    startRow: number,
    dCol: number,
    tCol: number,
    tCol2: number,
    aCol: number
  ) => {
    const parsed: ParsedCandidate[] = [];

    for (let i = startRow; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 2) continue;

      const primaryText = String(r[tCol] ?? "").trim();
      const secondaryText =
        tCol2 !== -1 && tCol2 !== tCol ? String(r[tCol2] ?? "").trim() : "";

      let rawDesc = primaryText;
      if (secondaryText && !primaryText) {
        rawDesc = secondaryText;
      } else if (
        primaryText &&
        secondaryText &&
        primaryText.toLowerCase() !== secondaryText.toLowerCase()
      ) {
        // E.g. Sparbanken Referens="ICA KVANTUM" + Beskrivning="Kortköp"
        const genericLabels = ["kortköp", "autogiro", "betalning", "överföring", "swish"];
        if (genericLabels.includes(primaryText.toLowerCase())) {
          rawDesc = `${secondaryText} (${primaryText})`;
        } else if (genericLabels.includes(secondaryText.toLowerCase())) {
          rawDesc = primaryText;
        } else {
          rawDesc = `${primaryText} — ${secondaryText}`;
        }
      }

      const rawAmt = parseNumericAmount(r[aCol]);
      if (!rawDesc || rawAmt === null || rawAmt === 0) continue;

      // Skip accidental summary/header rows
      if (
        /^(belopp|amount|summa|totalt|saldo)$/i.test(rawDesc)
      ) {
        continue;
      }

      const absAmount = Math.abs(rawAmt);
      const rawDate = String(r[dCol] ?? "").trim();
      const dateMatch = rawDate.match(/(\d{4}[-/.]\d{2}[-/.]\d{2})/);
      const cleanDate = dateMatch
        ? dateMatch[1].replace(/[/.]/g, "-")
        : `${yearMonth}-15`;

      const { item: matchedItem, matchedRule } = matchItemWithRules(
        rawDesc,
        items,
        merchantRules
      );
      const suggestedPattern = extractCleanMerchantKeyword(rawDesc);

      parsed.push({
        id: `imp-${i}`,
        date: cleanDate,
        description: rawDesc,
        amount: absAmount,
        rawSignedAmount: rawAmt,
        actionType: matchedItem ? "existing_item" : "new_once",
        targetItemId: matchedItem?.id || defaultItemId,
        targetGroupId: matchedItem?.group_id || defaultExpenseGroup,
        matchedRulePattern: matchedRule?.pattern,
        rememberRule: Boolean(matchedItem && !matchedRule),
        rulePattern: suggestedPattern,
      });
    }

    if (parsed.length === 0) {
      setErrorMsg(
        locale === "sv"
          ? "Kunde inte hitta några transaktionsrader med dessa kolumnval. Prova att justera kolumnerna nedan."
          : "Could not find transaction rows with these column selections. Try adjusting the columns below."
      );
      setShowColumnMapper(true);
    } else {
      setErrorMsg(null);
    }

    setCandidates(parsed.slice(0, 250));
  };

  const processRawRows = (rows: unknown[][]) => {
    setErrorMsg(null);
    const nonEmptyRows = (rows || []).filter(
      (r) => Array.isArray(r) && r.some((cell) => String(cell ?? "").trim() !== "")
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

    // Scan up to the first 30 rows to find the table header row
    // (Swedbank / Sparbanken often has metadata rows at the top before the header)
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

      // Date column: match transaktionsdag / bokföringsdag / valutadag / datum / date
      const dIdx = row.findIndex((h) =>
        /^(transaktionsdag|bokföringsdag|bokf\.?dag|valutadag|datum|date|köpdag)$/.test(
          h
        ) || /bokföringsdag|transaktionsdag|datum|date/.test(h)
      );

      // Primary merchant/reference column: in Sparbanken "Referens" holds the merchant name
      // while "Beskrivning" holds "Kortköp" / "Swish" / etc.
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

      // Amount column: match "belopp" (NOT "bokfört saldo" or "saldo")
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
                !/saldo|balance/.test(h) &&
                /belopp|amount|summa/.test(h)
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

    // Fallback heuristic if no named header row matched:
    // Inspect data rows directly to find a date column, a text column, and a numeric amount column
    if (detectedHeaderRow === -1) {
      for (let r = 0; r < Math.min(15, nonEmptyRows.length); r++) {
        const row = nonEmptyRows[r].map((c) => String(c ?? "").trim());
        if (row.length < 2) continue;
        const foundDateCol = row.findIndex((val) =>
          /^\d{4}[-/.]\d{2}[-/.]\d{2}/.test(val)
        );
        // Find numeric columns (excluding date & account number columns)
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
          // In Sparbanken, if there are 2 numeric columns at the end (Belopp, Bokfört saldo),
          // Belopp is the second-to-last or the one before Saldo
          aCol =
            numCols.length >= 2
              ? numCols[numCols.length - 2]
              : numCols[0];
          // Pick text columns between dateCol and amountCol
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

    buildCandidatesFromColumns(
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

      // If CSV or TXT: decode with UTF-8 (fallback to ISO-8859-1 / Windows-1252 used by Swedbank/Sparbanken!)
      if (lowerName.endsWith(".csv") || lowerName.endsWith(".txt")) {
        let text = new TextDecoder("utf-8").decode(buffer);
        if (text.includes("\uFFFD")) {
          // Contains replacement character -> file is ISO-8859-1 / Windows-1252 encoded!
          text = new TextDecoder("iso-8859-1").decode(buffer);
        }
        const csvRows = parseCsvTextToRows(text);
        processRawRows(csvRows);
        return;
      }

      // Excel (.xlsx / .xls)
      const workbook = XLSX.read(buffer, { type: "array", raw: false });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Critical fix for Sparbanken / Swedbank .xlsx files whose '!ref' is truncated to row 1-2
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
    setFileName("sparbanken_transaktioner.csv (Exempel)");
    processRawRows([
      ["* Transaktioner Period 2026-10-01 - 2026-10-31"],
      [
        "Radnummer",
        "Clearingnummer",
        "Kontonummer",
        "Produkt",
        "Valuta",
        "Bokföringsdag",
        "Transaktionsdag",
        "Valutadag",
        "Referens",
        "Beskrivning",
        "Belopp",
        "Bokfört saldo",
      ],
      [
        "1",
        "81234",
        "123456789",
        "Privatkonto",
        "SEK",
        `${yearMonth}-18`,
        `${yearMonth}-18`,
        `${yearMonth}-18`,
        "WILLYS HEMMA",
        "Kortköp",
        "−680,00",
        "24 120,00",
      ],
      [
        "2",
        "81234",
        "123456789",
        "Privatkonto",
        "SEK",
        `${yearMonth}-14`,
        `${yearMonth}-14`,
        `${yearMonth}-14`,
        "FOLKTANDVÅRDEN",
        "Kortköp",
        "−1 450,00",
        "24 800,00",
      ],
      [
        "3",
        "81234",
        "123456789",
        "Privatkonto",
        "SEK",
        `${yearMonth}-09`,
        `${yearMonth}-09`,
        `${yearMonth}-09`,
        "VATTENFALL AB",
        "Autogiro",
        "−1 920,00",
        "26 250,00",
      ],
      [
        "4",
        "81234",
        "123456789",
        "Privatkonto",
        "SEK",
        `${yearMonth}-08`,
        `${yearMonth}-08`,
        `${yearMonth}-08`,
        "COOP KONSUM",
        "Kortköp",
        "−540,00",
        "28 170,00",
      ],
      [
        "5",
        "81234",
        "123456789",
        "Privatkonto",
        "SEK",
        `${yearMonth}-04`,
        `${yearMonth}-04`,
        `${yearMonth}-04`,
        "ICA KVANTUM",
        "Kortköp",
        "−1 245,00",
        "28 710,00",
      ],
    ]);
  };

  const updateCandidate = (id: string, patch: Partial<ParsedCandidate>) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
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

  const activeCount = candidates.filter((c) => c.actionType !== "skip").length;

  const groupedItemCounts = candidates.reduce<
    Record<string, { count: number; sum: number }>
  >((acc, c) => {
    if (c.actionType === "existing_item" && c.targetItemId) {
      const cur = acc[c.targetItemId] || { count: 0, sum: 0 };
      acc[c.targetItemId] = {
        count: cur.count + 1,
        sum: cur.sum + c.amount,
      };
    }
    return acc;
  }, {});

  const headerLabels: string[] =
    rawGrid.length > headerRowIdx
      ? (rawGrid[headerRowIdx] || []).map((c, idx) => {
          const txt = String(c ?? "").trim();
          return txt ? `${idx + 1}: ${txt}` : `Kolumn ${idx + 1}`;
        })
      : [];

  const handleConfirmImport = async () => {
    if (activeCount === 0) return;
    setImporting(true);
    try {
      const updatedRules = [...merchantRules];
      let rulesChanged = false;

      for (const c of candidates) {
        if (
          c.actionType === "existing_item" &&
          c.rememberRule &&
          c.rulePattern.trim() &&
          c.targetItemId
        ) {
          const cleanPat = c.rulePattern.trim().toLowerCase();
          const existingIdx = updatedRules.findIndex(
            (r) => r.pattern.toLowerCase() === cleanPat
          );
          if (existingIdx !== -1) {
            if (updatedRules[existingIdx].targetItemId !== c.targetItemId) {
              updatedRules[existingIdx] = {
                ...updatedRules[existingIdx],
                targetItemId: c.targetItemId,
              };
              rulesChanged = true;
            }
          } else {
            updatedRules.push({
              id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              pattern: cleanPat,
              targetItemId: c.targetItemId,
            });
            rulesChanged = true;
          }
        }
      }

      if (rulesChanged) {
        await onSaveMerchantRules(updatedRules);
      }

      await onImportRows(
        candidates.map((c) => ({
          date: c.date,
          description: c.description,
          amount: c.amount,
          actionType: c.actionType,
          targetItemId: c.targetItemId,
          targetGroupId: c.targetGroupId,
          rememberRule: c.rememberRule,
          rulePattern: c.rulePattern,
        }))
      );
      setCandidates([]);
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
                ? "Bankimport & Smarta Regler"
                : "Bank Import & Smart Rules"}
            </h3>
            <p className="text-xs text-[#64645e]">
              {locale === "sv"
                ? "Stöd för Sparbanken, Swedbank, SEB, Nordea, SHB, ICA m.fl. (.csv & .xlsx)"
                : "Supports Sparbanken, Swedbank, SEB, Nordea, Amex, Revolut (.csv & .xlsx)"}
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
              <p className="text-[11px] text-[#64645e]">
                {locale === "sv"
                  ? "Transaktioner vars text/referens innehåller sökordet kopplas automatiskt till rätt budgetpost."
                  : "Transactions containing the keyword automatically map to the target budget item."}
              </p>

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

        {/* Manual Column Mapping Adjuster (when file is loaded) */}
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
                      buildCandidatesFromColumns(
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
                      buildCandidatesFromColumns(
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
                      buildCandidatesFromColumns(
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

        {/* Parsed Rows Mapping List */}
        {candidates.length > 0 && (
          <div className="mt-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-[#64645e]">
              <span>
                {locale === "sv"
                  ? `Hittade ${candidates.length} transaktioner`
                  : `Found ${candidates.length} transactions`}
              </span>
              <span>
                {activeCount}{" "}
                {locale === "sv" ? "valda att importera" : "selected"}
              </span>
            </div>

            {/* Auto-grouped preview pills when multiple rows target the same item */}
            {Object.entries(groupedItemCounts).some(([, v]) => v.count > 1) && (
              <div className="rounded-2xl border border-[#b5e3c4] bg-[#e7f4eb] p-2.5 text-[11px]">
                <div className="font-bold text-[#057b40] mb-1">
                  {locale === "sv"
                    ? "Auto-gruppering till delkvitton:"
                    : "Auto-grouping into sub-receipts:"}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(groupedItemCounts)
                    .filter(([, v]) => v.count > 1)
                    .map(([itemId, info]) => {
                      const it = items.find((i) => i.id === itemId);
                      return (
                        <span
                          key={itemId}
                          className="rounded-full bg-white px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#282825] border border-[#b5e3c4]"
                        >
                          {it?.name}: {info.count}{" "}
                          {locale === "sv" ? "köp" : "txs"} (
                          {formatCurrency(info.sum, currency, locale)})
                        </span>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {candidates.map((row) => (
                <div
                  key={row.id}
                  className={`rounded-2xl border p-3 text-xs transition ${
                    row.actionType === "skip"
                      ? "border-[#c5c5ba] bg-[#ecece9] opacity-55"
                      : "border-[#282825] bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-bold text-[#282825]">
                          {row.description}
                        </span>
                        {row.matchedRulePattern && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-[#f6e6fc] px-2 py-0.2 text-[10px] font-bold text-[#7a2899] shrink-0">
                            <Zap className="h-2.5 w-2.5" />
                            {row.matchedRulePattern}
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-[#64645e]">
                        {row.date}
                      </div>
                    </div>
                    <div className="font-serif text-lg text-[#282825] shrink-0">
                      {formatCurrency(row.amount, currency, locale)}
                    </div>
                  </div>

                  {/* Action Selector */}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <select
                      value={row.actionType}
                      onChange={(e) =>
                        updateCandidate(row.id, {
                          actionType: e.target
                            .value as ParsedCandidate["actionType"],
                        })
                      }
                      className="rounded-full border border-[#c5c5ba] bg-[#f8f8f7] px-3 py-1.5 text-[11px] font-semibold text-[#282825]"
                    >
                      <option value="existing_item">
                        {locale === "sv"
                          ? "Koppla till befintlig post"
                          : "Match existing item"}
                      </option>
                      <option value="new_once">
                        {locale === "sv"
                          ? "Ny engångsutgift (denna mån)"
                          : "New one-time cost (this month)"}
                      </option>
                      <option value="new_monthly">
                        {locale === "sv"
                          ? "Ny återkommande månadspost"
                          : "New recurring monthly item"}
                      </option>
                      <option value="skip">
                        {locale === "sv" ? "Hoppa över" : "Skip row"}
                      </option>
                    </select>

                    {row.actionType === "existing_item" && (
                      <select
                        value={row.targetItemId}
                        onChange={(e) =>
                          updateCandidate(row.id, {
                            targetItemId: e.target.value,
                            rememberRule: true,
                          })
                        }
                        className="rounded-full border border-[#c5c5ba] bg-[#e7f4eb] px-3 py-1.5 text-[11px] font-semibold text-[#057b40]"
                      >
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name}
                          </option>
                        ))}
                      </select>
                    )}

                    {(row.actionType === "new_once" ||
                      row.actionType === "new_monthly") && (
                      <select
                        value={row.targetGroupId}
                        onChange={(e) =>
                          updateCandidate(row.id, {
                            targetGroupId: e.target.value,
                          })
                        }
                        className="rounded-full border border-[#c5c5ba] bg-[#fdeee0] px-3 py-1.5 text-[11px] font-semibold text-[#b85d10]"
                      >
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Remember Smart Rule Checkbox for existing_item mappings */}
                  {row.actionType === "existing_item" && (
                    <div className="mt-2 flex items-center justify-between gap-2 pt-1.5 border-t border-[#ecece9]">
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#64645e] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.rememberRule}
                          onChange={(e) =>
                            updateCandidate(row.id, {
                              rememberRule: e.target.checked,
                            })
                          }
                          className="rounded border-[#c5c5ba]"
                        />
                        <span>
                          {locale === "sv"
                            ? "Spara smart regel för sökord:"
                            : "Save smart rule for keyword:"}
                        </span>
                      </label>
                      {row.rememberRule && (
                        <input
                          type="text"
                          value={row.rulePattern}
                          onChange={(e) =>
                            updateCandidate(row.id, {
                              rulePattern: e.target.value,
                            })
                          }
                          className="w-32 rounded-full border border-[#c5c5ba] bg-[#f8f8f7] px-2.5 py-0.5 font-mono text-[11px] text-[#282825]"
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={importing || activeCount === 0}
                onClick={handleConfirmImport}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0c0d0d] py-3.5 px-5 text-xs font-bold text-white hover:bg-[#282825] disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                <span>
                  {locale === "sv"
                    ? `Importera ${activeCount} valda rader`
                    : `Import ${activeCount} selected rows`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
