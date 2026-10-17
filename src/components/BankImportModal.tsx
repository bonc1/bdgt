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
  actionType: "existing_item" | "new_once" | "new_monthly" | "skip";
  targetItemId: string;
  targetGroupId: string;
  matchedRulePattern?: string;
  rememberRule: boolean;
  rulePattern: string;
}

function parseNumericAmount(raw: unknown): number | null {
  if (typeof raw === "number") {
    return isNaN(raw) ? null : raw;
  }
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/\u00A0/g, "")
    .replace(/\s+/g, "")
    .replace(/kr|SEK|EUR|USD|NOK|DKK/gi, "")
    .replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractCleanMerchantKeyword(desc: string): string {
  const cleaned = desc
    .toLowerCase()
    .replace(/[0-9#*_/\\.,-]+/g, " ")
    .replace(/\b(ab|aktiebolag|se|sweden|stockholm|göteborg|malmö|kortköp|autogiro|betalning)\b/g, " ")
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

  // 1. Check user's saved Smart Merchant Rules first!
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

  const processRawRows = (rows: unknown[][]) => {
    setErrorMsg(null);
    if (!rows || rows.length === 0) {
      setErrorMsg(
        locale === "sv"
          ? "Filen verkar vara tom."
          : "The uploaded file appears to be empty."
      );
      return;
    }

    let dateCol = 0;
    let descCol = 1;
    let amountCol = 2;
    let startRow = 0;

    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const row = rows[r].map((c) => String(c ?? "").toLowerCase().trim());
      const dIdx = row.findIndex((h) =>
        /datum|date|bokföringsdag|transaktionsdag|valutadag/.test(h)
      );
      const tIdx = row.findIndex((h) =>
        /text|beskrivning|mottagare|rubrik|description|merchant|specifikation|transaktion/.test(
          h
        )
      );
      const aIdx = row.findIndex((h) =>
        /belopp|amount|summa|utgifter|debit|kostnad/.test(h)
      );

      if (tIdx !== -1 && aIdx !== -1) {
        dateCol = dIdx !== -1 ? dIdx : 0;
        descCol = tIdx;
        amountCol = aIdx;
        startRow = r + 1;
        break;
      }
    }

    const parsed: ParsedCandidate[] = [];
    for (let i = startRow; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 2) continue;

      const rawDesc = String(r[descCol] ?? "").trim();
      const rawAmt = parseNumericAmount(r[amountCol]);
      if (!rawDesc || rawAmt === null || rawAmt === 0) continue;

      const absAmount = Math.abs(rawAmt);
      const rawDate = String(r[dateCol] ?? "").trim();
      const cleanDate = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
        ? rawDate.slice(0, 10)
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
          ? "Kunde inte hitta några transaktionsrader med belopp. Kontrollera att filen har kolumner för Text/Beskrivning och Belopp."
          : "Could not find transaction rows with amounts. Make sure the file has Description and Amount columns."
      );
      return;
    }

    setCandidates(parsed.slice(0, 100));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", raw: false });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        defval: "",
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
    setFileName("kontoutdrag_oktober.xlsx (Exempel)");
    processRawRows([
      ["Bokföringsdag", "Specifikation", "Belopp"],
      [`${yearMonth}-04`, "ICA Kvantum Liljeholmen", "-1245,00"],
      [`${yearMonth}-08`, "Coop Konsum", "-540,00"],
      [`${yearMonth}-09`, "Ellevio / Vattenfall El", "-1920,00"],
      [`${yearMonth}-14`, "Tandläkare Folktandvården", "-1450,00"],
      [`${yearMonth}-18`, "Willys Hemma", "-680,00"],
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

  // Group summary preview: show how many rows map to the same existing item
  const groupedItemCounts = candidates.reduce<Record<string, { count: number; sum: number }>>(
    (acc, c) => {
      if (c.actionType === "existing_item" && c.targetItemId) {
        const cur = acc[c.targetItemId] || { count: 0, sum: 0 };
        acc[c.targetItemId] = {
          count: cur.count + 1,
          sum: cur.sum + c.amount,
        };
      }
      return acc;
    },
    {}
  );

  const handleConfirmImport = async () => {
    if (activeCount === 0) return;
    setImporting(true);
    try {
      // 1. Persist any newly checked Smart Merchant Rules
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

      // 2. Import the rows
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
                ? "Ladda upp .xlsx eller .csv. Flera rader mot samma post summeras som delkvitton."
                : "Upload .xlsx or .csv. Multiple rows matched to the same item sum as sub-receipts."}
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
                  ? "Transaktioner vars text innehåller sökordet kopplas automatiskt till rätt budgetpost."
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
                {locale === "sv" ? "Testa med exempelfil" : "Load sample rows"}
              </span>
            </button>
          </div>
        </div>

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
