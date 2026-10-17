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
} from "lucide-react";
import { BudgetGroup, BudgetItem, Locale } from "@/lib/types";
import { formatCurrency } from "@/lib/i18n";

export interface ImportedRowAction {
  date: string;
  description: string;
  amount: number;
  actionType: "existing_item" | "new_once" | "new_monthly" | "skip";
  targetItemId?: string;
  targetGroupId?: string;
}

interface BankImportModalProps {
  open: boolean;
  yearMonth: string;
  groups: BudgetGroup[];
  items: BudgetItem[];
  currency: string;
  locale: Locale;
  onClose: () => void;
  onImportRows: (rows: ImportedRowAction[]) => Promise<void>;
}

interface ParsedCandidate {
  id: string;
  date: string;
  description: string;
  amount: number;
  actionType: "existing_item" | "new_once" | "new_monthly" | "skip";
  targetItemId: string;
  targetGroupId: string;
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

function guessMatchingItem(
  desc: string,
  items: BudgetItem[]
): BudgetItem | undefined {
  const lower = desc.toLowerCase();
  // 1. Direct substring match with item name
  for (const it of items) {
    const firstWord = it.name.toLowerCase().split(/[\s/(&-]+/)[0];
    if (firstWord && firstWord.length >= 3 && lower.includes(firstWord)) {
      return it;
    }
  }
  // 2. Common Swedish/Nordic merchant heuristics
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
    return items.find(
      (i) =>
        i.entry_mode === "multi_entry" ||
        i.name.toLowerCase().includes("mat") ||
        i.name.toLowerCase().includes("grocer")
    );
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
    return items.find(
      (i) =>
        i.name.toLowerCase().includes("restaurang") ||
        i.name.toLowerCase().includes("dining") ||
        i.entry_mode === "multi_entry"
    );
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
    return items.find(
      (i) =>
        i.name.toLowerCase().includes("el") ||
        i.name.toLowerCase().includes("electr")
    );
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
    return items.find(
      (i) =>
        i.name.toLowerCase().includes("kollektiv") ||
        i.name.toLowerCase().includes("transit") ||
        i.name.toLowerCase().includes("transport")
    );
  }

  return undefined;
}

export function BankImportModal({
  open,
  yearMonth,
  groups,
  items,
  currency,
  locale,
  onClose,
  onImportRows,
}: BankImportModalProps) {
  const [candidates, setCandidates] = useState<ParsedCandidate[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

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

    // Find header row or infer columns
    let dateCol = 0;
    let descCol = 1;
    let amountCol = 2;
    let startRow = 0;

    // Look at first 5 rows for column header names
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

      // Bank statements usually have negative numbers for expenses (e.g., -845.00).
      // Convert expense amounts to positive numbers.
      const absAmount = Math.abs(rawAmt);
      const rawDate = String(r[dateCol] ?? "").trim();
      const cleanDate = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
        ? rawDate.slice(0, 10)
        : `${yearMonth}-15`;

      const matchedItem = guessMatchingItem(rawDesc, items);

      parsed.push({
        id: `imp-${i}`,
        date: cleanDate,
        description: rawDesc,
        amount: absAmount,
        actionType: matchedItem ? "existing_item" : "new_once",
        targetItemId: matchedItem?.id || defaultItemId,
        targetGroupId: matchedItem?.group_id || defaultExpenseGroup,
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
      [`${yearMonth}-04`, "ICA Kvantum", "-1245,00"],
      [`${yearMonth}-09`, "Ellevio / Vattenfall El", "-1920,00"],
      [`${yearMonth}-14`, "Tandläkare Folktandvården", "-1450,00"],
      [`${yearMonth}-18`, "Willys Hemma", "-680,00"],
    ]);
  };

  const updateCandidate = (
    id: string,
    patch: Partial<ParsedCandidate>
  ) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  };

  const activeCount = candidates.filter((c) => c.actionType !== "skip").length;

  const handleConfirmImport = async () => {
    if (activeCount === 0) return;
    setImporting(true);
    try {
      await onImportRows(
        candidates.map((c) => ({
          date: c.date,
          description: c.description,
          amount: c.amount,
          actionType: c.actionType,
          targetItemId: c.targetItemId,
          targetGroupId: c.targetGroupId,
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
                ? "Importera från bank / kort (CSV & XLSX)"
                : "Import Bank / Card Statement (CSV & XLSX)"}
            </h3>
            <p className="text-xs text-[#64645e]">
              {locale === "sv"
                ? "Ladda upp .xlsx eller .csv från din bank och koppla mot budgetposter eller skapa nya."
                : "Upload .xlsx or .csv from your bank and map rows to existing or new budget items."}
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

        {/* Upload Dropzone */}
        <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#282825]/40 bg-white p-5 text-center">
          <FileSpreadsheet className="h-7 w-7 text-[#057b40] mb-2" />
          <p className="text-xs font-semibold text-[#282825]">
            {fileName
              ? fileName
              : locale === "sv"
              ? "Välj en Excel (.xlsx / .xls) eller CSV-fil från din bank"
              : "Choose an Excel (.xlsx / .xls) or CSV statement file"}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
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
                      <div className="truncate font-bold text-[#282825]">
                        {row.description}
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
