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
  MonthlyRecord,
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
  records?: MonthlyRecord[];
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
  amount: number; // signed expense/income amount in budget terms (positive = standard for group)
  isIncome: boolean;
  isRefund: boolean;
  fingerprint: string;
  sourceFile?: string;
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
 * Robust numeric parser for Swedish & international bank/card formats
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

/**
 * True state-machine CSV parser that properly handles multi-line quoted fields
 * (Critical for American Express CSV exports which have newlines inside "Adress" and "Ort" quotes!)
 */
function parseCsvTextToRows(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.trim()) return [];

  // Detect delimiter outside quotes from the first ~2000 characters
  const sampleChunk = normalized.slice(0, 2500);
  let semiCount = 0;
  let commaCount = 0;
  let tabCount = 0;
  let inQ = false;
  for (let i = 0; i < sampleChunk.length; i++) {
    const c = sampleChunk[i];
    if (c === '"') inQ = !inQ;
    else if (!inQ) {
      if (c === ";") semiCount++;
      else if (c === ",") commaCount++;
      else if (c === "\t") tabCount++;
    }
  }
  let delim = ",";
  if (semiCount > commaCount && semiCount > tabCount) delim = ";";
  else if (tabCount > commaCount && tabCount > semiCount) delim = "\t";

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
    } else if (ch === "\n" && !inQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parse dates in YYYY-MM-DD, MM/DD/YYYY (Amex), or DD/MM/YYYY
 */
function parseStatementDate(
  rawDate: string,
  preferMonthFirst: boolean
): string | null {
  const clean = rawDate.trim();
  if (!clean) return null;

  // 0. Excel Serial Date Number (e.g. 46204 -> 2026-07-01 in SEB Kort / SAS EuroBonus Mastercard .xlsx files)
  const serialMatch = clean.match(/^(\d{5})(?:\.\d+)?$/);
  if (serialMatch) {
    const serial = parseInt(serialMatch[1], 10);
    if (serial >= 35000 && serial <= 60000) {
      const utcMs = Math.round((serial - 25569) * 86400 * 1000);
      return new Date(utcMs).toISOString().slice(0, 10);
    }
  }

  // 1. YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 2. MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    const y = slashMatch[3];
    let m = p1;
    let d = p2;
    if (p1 > 12) {
      d = p1;
      m = p2;
    } else if (p2 > 12) {
      m = p1;
      d = p2;
    } else if (!preferMonthFirst) {
      d = p1;
      m = p2;
    }
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Normalize noisy Amex, SEB/Mastercard & bank merchant names so recurring subscriptions,
 * restaurants, and stores group cleanly into a single merchant entry!
 */
function normalizeMerchantDisplay(rawName: string): string {
  const s = rawName.replace(/\s+/g, " ").trim();
  const upper = s.toUpperCase();

  // Credit card bill payments & card fees
  if (upper.includes("BETALNING MOTTAGEN") || /^INBETALNING$/i.test(upper)) {
    return "Betalning mottagen (Kortinbetalning)";
  }
  if (upper.includes("PERIODENS DEL AV ÅRSAVGIFT")) {
    return "Amex Årsavgift (Månadsdel)";
  }
  if (/AVGIFT ERSÄTTNINGSKORT|^ÅRSAVGIFT/i.test(upper)) {
    return "Kortavgift";
  }

  // Major Subscriptions & Digital Services (strip random invoice/receipt codes)
  if (/^SPOTIFY\b/.test(upper)) return "Spotify";
  if (/^NETFLIX/.test(upper)) return "Netflix";
  if (/^HBOMAX|^HBO MAX/.test(upper)) return "HBO Max";
  if (/^DISNEY PLUS|^DISNEY\+/.test(upper)) return "Disney+";
  if (/^VIAPLAY/.test(upper)) return "Viaplay";
  if (/SKYSHOWTIME/.test(upper)) return "SkyShowtime";
  if (/^TV4 AKTIEBOLAG|^TV4 PLAY/.test(upper)) return "TV4 Play";
  if (/^PRIME VIDEO/.test(upper)) return "Amazon Prime Video";
  if (/^PLEXINC|^PLEX\b/.test(upper)) return "Plex";
  if (/^APPLE\.COM\/BILL|^APPLE\.COM/.test(upper)) return "Apple / iCloud";
  if (/GOOGLE\s*\*GOOGLE ONE/.test(upper)) return "Google One";
  if (/GOOGLE\s*\*GOOGLE PLAY/.test(upper)) return "Google Play";
  if (/GOOGLE\s*\*GOOGLE PHOTOS/.test(upper)) return "Google Photos";
  if (/^WWW\.F1\.COM|^F1\.COM/.test(upper)) return "F1 TV (F1.com)";
  if (/^OMNIPUNKTSE|^OMNI\b/.test(upper)) return "Omni";
  if (/BONNIER-LOCAL|SYDSVENSKAN|DAGENS NYHETER/.test(upper)) return "Bonnier / Nyhetsprenumeration";
  if (/^DOKLAND/.test(upper)) return "Dokland";
  if (/PATREON/.test(upper)) return "Patreon";
  if (/SUBSCRIBESTAR/.test(upper)) return "SubscribeStar";
  if (/CIPSOFT/.test(upper)) return "CipSoft (Spel)";
  if (/MYTHSOFT/.test(upper)) return "MythSoft Tech";
  if (/COMADSOFT/.test(upper)) return "Comadsoft";
  if (/PLAYSTATION/.test(upper)) return "PlayStation";
  if (/FANTASYPRESIDENTCAREER/.test(upper)) return "Fantasy President Career";
  if (/MYAUDI/.test(upper)) return "myAudi (Bilprenumeration)";
  if (/MONTHLY OF SWEDEN/.test(upper)) return "Monthly of Sweden";

  // E-commerce, Pharmacy, Kids & Retail
  if (/^AMAZON PRIME/.test(upper)) return "Amazon Prime";
  if (/^AMAZONMKTPLC|^AMAZONRETAIL|^AMAZON\.SE|^WWW\.AMAZON/.test(upper)) {
    return "Amazon.se";
  }
  if (/BOOZT/.test(upper)) return "Boozt";
  if (/ZALANDO/.test(upper)) return "Zalando";
  if (/^VINTED\b/.test(upper)) return "Vinted";
  if (/^ELLOS\b/.test(upper)) return "Ellos";
  if (/^ZARAHOME|^ZARA\b/.test(upper)) return "Zara / Zara Home";
  if (/^HM\.COM|^H & M HENNES/.test(upper)) return "H&M";
  if (/^ARKET\.COM|^ARKET\b/.test(upper)) return "Arket";
  if (/^AHLENS|^ÅHLENS/.test(upper)) return "Åhléns";
  if (/^LINDEX/.test(upper)) return "Lindex";
  if (/^KAPPAHL/.test(upper)) return "KappAhl";
  if (/^CUBUS\b/.test(upper)) return "Cubus";
  if (/^POLARNOPYRET|^POLARN O\.? PYRET/.test(upper)) return "Polarn O. Pyret";
  if (/^BESTSELLER\b/.test(upper)) return "Bestseller";
  if (/JOLLYROOM/.test(upper)) return "Jollyroom";
  if (/^BABYSAM/.test(upper)) return "BabySam";
  if (/^BABYVAB/.test(upper)) return "BabyVAB";
  if (/^LYKO/.test(upper)) return "Lyko";
  if (/^APOTEK HJARTAT|^APOTEKET|^KRONANS APOTEK|^APOHEM|^W\*MEDS\.SE|^MEDS\.SE/.test(upper)) {
    return "Apotek / Meds / Apohem";
  }
  if (/^BAUHAUS/.test(upper)) return "Bauhaus";
  if (/^HORNBACH/.test(upper)) return "Hornbach";
  if (/^BYGGHEMMA/.test(upper)) return "Bygghemma";
  if (/^COLORAMA/.test(upper)) return "Colorama";
  if (/^JULA\b/.test(upper)) return "Jula";
  if (/^BILTEMA/.test(upper)) return "Biltema";
  if (/^CLAS OHLSON/.test(upper)) return "Clas Ohlson";
  if (/^KJELLCO|^KJELL & CO/.test(upper)) return "Kjell & Company";
  if (/^GOLVPOOLEN/.test(upper)) return "Golvpoolen";
  if (/^NORDICNEST/.test(upper)) return "Nordic Nest";
  if (/^VACKER CENTER/.test(upper)) return "Vacker Center Syd";

  // Groceries, Wholesale & Dining
  if (/^COSTCO.*FUEL/.test(upper)) return "Costco Bensin";
  if (/^COSTCO\b/.test(upper)) return "Costco";
  if (/^MAXI ICA|^ICA MAXI|^ICA KVANTUM|^ICA SUPERMARKET|^ICA NÄRA|^ICA NARA/.test(upper)) {
    return "ICA Maxi / ICA";
  }
  if (/^WILLYS/.test(upper)) return "Willys";
  if (/^COOP\b/.test(upper)) return "Coop";
  if (/^LIDL/.test(upper)) return "Lidl";
  if (/^SYSTEMBOLAGET|^LÖDDEKÖPINGE 1250/.test(upper)) return "Systembolaget";
  if (/^MCD\b|^MCDONALD|^MCDMALMO|^MCDLODDE|^MCDLUND|^MCDHASSLE/.test(upper)) return "McDonald's";
  if (/^MAX BURGERS/.test(upper)) return "Max Burgers";
  if (/^MISTER\s*YORK/.test(upper)) return "Mister York";
  if (/^SALADS AND SMOOTHIES/.test(upper)) return "Salads and Smoothies";
  if (/^ESPRESSO HOUSE/.test(upper)) return "Espresso House";
  if (/^KORT\.CONVINI|^CONVINI/.test(upper)) return "Convini";
  if (/^REITAN|^PRESSBYRÅN|^PRESSBYRAN|\bPRESSBYRÅN/.test(upper)) return "Pressbyrån / 7-Eleven";
  if (/KATJAS\s*PIZZERIA/.test(upper)) return "Katjas Pizzeria";
  if (/^ZORO RESTAURANG/.test(upper)) return "Zoro Restaurang";
  if (/^ANNES KONDITORI/.test(upper)) return "Annes Konditori";
  if (/^BARSEB.*HAMNKROG/.test(upper)) return "Barsebäcks Hamnkrog";

  // Transit, Bridge, Car, Fuel & Parking
  if (/^ORESUNDSBRON|^ÖRESUNDSBRON/.test(upper)) return "Öresundsbron";
  if (/^SKANETRAFIKEN|^SKÅNETRAFIKEN/.test(upper)) return "Skånetrafiken";
  if (/^EASYPARK/.test(upper)) return "EasyPark";
  if (/^AIMO/.test(upper)) return "Aimo Park";
  if (/^PARKSTER/.test(upper)) return "Parkster";
  if (/^WASH WORLD/.test(upper)) return "Wash World (Biltvätt)";
  if (/^TOVEKS BIL/.test(upper)) return "Toveks Bil";
  if (/^CIRCLE K/.test(upper)) return "Circle K";
  if (/^PREEM\b/.test(upper)) return "Preem";
  if (/^ST1\b/.test(upper)) return "St1 Tankning";
  if (/^OKQ8/.test(upper)) return "OKQ8";
  if (/^NYCT PAYGO/.test(upper)) return "NYCT Subway (New York)";

  // Strip Amex 2+ space padded trailing city name (e.g. "BAUHAUS LÖDDEKÖ         LÖDDEKÖPINGE")
  let cleaned = rawName.trim();
  const multiSpaceParts = cleaned.split(/\s{2,}/);
  if (multiSpaceParts.length >= 2 && multiSpaceParts[0].length >= 3) {
    cleaned = multiSpaceParts[0].trim();
  }

  // Strip payment processor prefixes like "TST* ", "ZETTLE *", "ZETTLE_*", "PAYPAL *", "W*", "AVARDA*", "SUMUP *", "KLARNA*"
  cleaned = cleaned
    .replace(
      /^(TST\*\s*|ZETTLE_?\s*\*\s*|PAYPAL\s*\*\s*|SUMUP\s*\*\s*|AVARDA\s*\*\s*|KLARNA\s*\*\s*|MPS\s*\*\s*|MS\s*\*\s*|W\*\s*|SP\s+)/i,
      ""
    )
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .trim();

  return cleaned || s;
}

function buildCleanMerchantName(
  primaryRef: string,
  secondaryDesc: string
): { merchantName: string; detailNote: string } {
  const cleanRef = primaryRef.replace(/^[,.\s]+|[,.\s]+$/g, "").trim();
  const cleanDesc = secondaryDesc.replace(/^[,.\s]+|[,.\s]+$/g, "").trim();

  let rawChosen = cleanRef;
  let note = cleanDesc;

  if (!cleanRef && cleanDesc) {
    rawChosen = cleanDesc;
    note = "";
  } else if (cleanRef && !cleanDesc) {
    rawChosen = cleanRef;
    note = "";
  } else if (cleanRef.toLowerCase() === cleanDesc.toLowerCase()) {
    rawChosen = cleanRef;
    note = "";
  } else if (/^\d{7,}$/.test(cleanRef.replace(/[\s-]/g, "")) && cleanDesc) {
    // Sparbanken numeric reference ID -> use Beskrivning
    rawChosen = cleanDesc;
    note = cleanRef;
  } else if (/^AT\d{10,}$/i.test(cleanRef) && cleanDesc) {
    // Amex reference ID -> use Beskrivning
    rawChosen = cleanDesc;
    note = "";
  } else if (/^AT\d{10,}$/i.test(cleanDesc) && cleanRef) {
    rawChosen = cleanRef;
    note = "";
  } else {
    const genericLabels = [
      "kortköp",
      "autogiro",
      "betalning",
      "bankgiro",
      "plusgiro",
      "swish",
    ];
    if (genericLabels.includes(cleanRef.toLowerCase()) && cleanDesc) {
      rawChosen = cleanDesc;
      note = cleanRef;
    } else if (genericLabels.includes(cleanDesc.toLowerCase()) && cleanRef) {
      rawChosen = cleanRef;
      note = cleanDesc;
    }
  }

  return {
    merchantName: normalizeMerchantDisplay(rawChosen),
    detailNote: note,
  };
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
 * Suggest the best BudgetGroup and human category hint for a Swedish/Nordic/Amex/Mastercard merchant
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

  // 1. Internal transfers & Credit Card bill payments ("Betalning mottagen", "Inbetalning", "Överföring via internet")
  if (
    /^(överföring via internet|överföring|insättning|egen överföring|betalning mottagen|inbetalning)/i.test(
      lower
    )
  ) {
    return {
      groupId: isIncome ? incomeGroup.id : dailyGroup.id,
      categoryHint:
        locale === "sv"
          ? "Kortinbetalning / Överföring"
          : "Card Payment / Transfer",
      isInternalTransfer: true,
    };
  }

  // 2. Income items (Lön, Barnbidrag, Dagersättning)
  if (
    isIncome ||
    /^(lön|barnbidrag|dagersättning|föräldrapenning|försäkringskassan|ers skada|utdelning)$/i.test(
      lower
    )
  ) {
    return {
      groupId: incomeGroup.id,
      categoryHint: locale === "sv" ? "Inkomst" : "Income",
      isInternalTransfer: false,
    };
  }

  // 3. Savings & Investments
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

  // 4. Streaming, Digital Subscriptions & Media
  if (
    /spotify|netflix|hbo|disney|viaplay|skyshowtime|tv4 play|prime video|plex|apple|google one|google play|google photos|f1 tv|f1\.com|omni|bonnier|dokland|patreon|subscribestar|cipsoft|mythsoft|comadsoft|playstation|amazon prime|amex årsavgift|kortavgift/.test(
      lower
    )
  ) {
    return {
      groupId: dailyGroup.id,
      categoryHint:
        locale === "sv"
          ? "Prenumeration & Streaming"
          : "Subscription & Media",
      isInternalTransfer: false,
    };
  }

  // 5. Housing, Renovation, Electricity, Broadband, Security
  if (
    /överföring lån|bolån|sbab|landshypotek|e\.on|eon|vattenfall|ellevio|tibber|fortum|skånska energi|telia|telenor|bahnhof|tele2|verisure|sector alarm|kävlinge kommun|kommun|hsb|riksbyggen|hyra|badrum|bauhaus|hornbach|bygghemma|colorama|golvpoolen|jula|biltema|clas ohlson|granngarden|rusta|impecta/.test(
      lower
    )
  ) {
    const subHint = /bauhaus|hornbach|bygghemma|colorama|golvpoolen|jula|biltema|clas ohlson|badrum|rusta|granngarden/.test(
      lower
    )
      ? locale === "sv"
        ? "Hem, Renovering & Trädgård"
        : "Home & DIY"
      : /lån|bolån/.test(lower)
      ? locale === "sv"
        ? "Bolån / Lån"
        : "Loan / Mortgage"
      : /e\.on|vattenfall|ellevio|tibber|fortum/.test(lower)
      ? locale === "sv"
        ? "El & Energi"
        : "Electricity"
      : locale === "sv"
      ? "Boende & Drift"
      : "Housing & Utilities";

    return {
      groupId: housingGroup.id,
      categoryHint: subHint,
      isInternalTransfer: false,
    };
  }

  // 6. Transport, Bridge, Fuel, Car, Parking, Insurance, CSN
  if (
    /öresundsbron|oresundsbron|skånetrafiken|skanetrafiken|easypark|aimo|parkster|wash world|toveks bil|myaudi|costco bensin|st1|okq8|circle k|preem|sj ab|rejsekort|nyct|uber|lirr|lf motor|lf skåne|länsförsäkringar|swedb försäk|tre kronor|santander|csn|transportstyrels/.test(
      lower
    )
  ) {
    const subHint = /öresundsbron|oresundsbron|skånetrafiken|costco bensin|st1|okq8|circle k|preem|easypark|aimo|parkster|wash world|toveks bil|myaudi|sj |uber|nyct/.test(
      lower
    )
      ? locale === "sv"
        ? "Transport, Bil & Bränsle"
        : "Transit, Car & Fuel"
      : /lf |försäk|tre kronor/.test(lower)
      ? locale === "sv"
        ? "Försäkring"
        : "Insurance"
      : locale === "sv"
      ? "Lån & Transport"
      : "Loans & Transport";

    return {
      groupId: transportInsGroup.id,
      categoryHint: subHint,
      isInternalTransfer: false,
    };
  }

  // 7. Groceries, Restaurants, Shopping, Travel
  const subHint = /ica |costco|willys|coop|hemköp|lidl|systembolaget|fruktaffär/.test(
    lower
  )
    ? locale === "sv"
      ? "Mat & Dagligvaror"
      : "Groceries"
    : /mcdonald|max burgers|mister york|salads|espresso house|convini|pressbyrån|pizzeria|zoro|annes konditori|barsebäck|bella napoli|aioli|aiko sushi|laziza|osteria|vapiano|phuun thai|starbucks|diner|taco|burger|red lobster|chao ban/.test(
        lower
      )
    ? locale === "sv"
      ? "Restaurang & Café"
      : "Dining & Café"
    : /amazon\.se|boozt|zalando|vinted|ellos|zara|bestseller|h&m|arket|åhléns|ahlens|lindex|kappahl|cubus|polarn|jollyroom|babysam|apotek|lyko|vacker|kjell|uniqlo|macys|nordstrom|aritzia|levi|j crew|sephora|kicks/.test(
        lower
      )
    ? locale === "sv"
      ? "Shopping, Barn & Apotek"
      : "Shopping, Kids & Pharmacy"
    : /hotel|waxholmshotell|moxy|cph\.dk|esta|ticketmaster|tickster/.test(lower)
    ? locale === "sv"
      ? "Resor & Upplevelser"
      : "Travel & Events"
    : locale === "sv"
    ? "Vardag & Övrigt"
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

  for (const rule of rules) {
    const pat = rule.pattern.trim().toLowerCase();
    if (pat && lower.includes(pat)) {
      const target = items.find((i) => i.id === rule.targetItemId);
      if (target) {
        return { item: target, matchedRule: rule };
      }
    }
  }

  for (const it of items) {
    const itemLower = it.name.toLowerCase();
    if (itemLower === lower) return { item: it };
    const firstWord = itemLower.split(/[\s/(&,-]+/)[0];
    if (firstWord && firstWord.length >= 3 && lower.includes(firstWord)) {
      return { item: it };
    }
  }

  if (/^lön$/i.test(lower)) {
    return { item: items.find((i) => /lön|salary/i.test(i.name)) };
  }
  if (/e\.on|eon|vattenfall|ellevio|tibber|fortum/.test(lower)) {
    return { item: items.find((i) => /\bel|elräkning|electr/i.test(i.name)) };
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
  if (/ica maxi|ica|willys|coop|hemköp|lidl|mathem/.test(lower)) {
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
  records = [],
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
  const [isCreditCardMode, setIsCreditCardMode] = useState<boolean>(false);
  const [showColumnMapper, setShowColumnMapper] = useState<boolean>(false);

  const [merchantGroups, setMerchantGroups] = useState<
    MerchantGroupCandidate[]
  >([]);
  const [accumulatedRawTxs, setAccumulatedRawTxs] = useState<
    RawTransactionRow[]
  >([]);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [duplicatesSkippedCount, setDuplicatesSkippedCount] =
    useState<number>(0);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Smart rules drawer state
  const [showRulesDrawer, setShowRulesDrawer] = useState(false);
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleItemId, setNewRuleItemId] = useState(items[0]?.id || "");

  // Build fingerprint set of already-imported transactions in the database (O1)
  const existingDbFingerprints = useMemo(() => {
    const set = new Set<string>();
    const itemMap = new Map(items.map((i) => [i.id, i.name.toLowerCase().trim()]));
    for (const rec of records) {
      const txs = rec.transactions || [];
      if (txs.length > 0) {
        const perFileCounts = new Map<string, number>();
        for (const tx of txs) {
          const baseKey = `${tx.spent_on}::${tx.description
            .toLowerCase()
            .trim()}::${Math.round(Number(tx.amount) * 100)}`;
          const occ = perFileCounts.get(baseKey) || 0;
          perFileCounts.set(baseKey, occ + 1);
          set.add(`${baseKey}::${occ}`);
          set.add(baseKey);
        }
      } else if (rec.status === "confirmed" && rec.actual_amount !== null) {
        const itName = itemMap.get(rec.item_id);
        if (itName) {
          set.add(
            `MONTH::${rec.year_month}::${itName}::${Math.round(
              Number(rec.actual_amount) * 100
            )}`
          );
        }
      }
    }
    return set;
  }, [records, items]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const mg of merchantGroups) {
      for (const tx of mg.transactions) {
        set.add(tx.yearMonth);
      }
    }
    return Array.from(set).sort().reverse();
  }, [merchantGroups]);

  const isAllMonthsSelected =
    selectedMonths.length === 0 ||
    selectedMonths.length === availableMonths.length;

  const toggleMonthSelection = (ym: string) => {
    setSelectedMonths((prev) => {
      if (prev.length === 0) {
        return [ym];
      }
      if (prev.includes(ym)) {
        const next = prev.filter((m) => m !== ym);
        return next;
      }
      return [...prev, ym];
    });
  };

  if (!open) return null;

  const defaultItemId = items[0]?.id || "";

  const groupRawTransactionsIntoCandidates = (allTxs: RawTransactionRow[]) => {
    if (allTxs.length === 0) {
      setMerchantGroups([]);
      return;
    }

    const groupedMap = new Map<string, RawTransactionRow[]>();
    for (const tx of allTxs) {
      const normKey = `${tx.isIncome ? "INC" : "EXP"}::${tx.merchantName
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
      const isIncome = first.isIncome;
      const distinctMonths = Array.from(
        new Set(txList.map((t) => t.yearMonth))
      ).sort();
      const rawTotal = txList.reduce((s, t) => s + t.amount, 0);
      const totalAmount = Math.max(0, Math.round(rawTotal * 100) / 100);
      const avgAmount = Math.max(
        0,
        Math.round(totalAmount / Math.max(1, distinctMonths.length))
      );
      const latestPositive =
        txList.find((t) => t.amount > 0)?.amount || Math.abs(first.amount);

      const { item: matchedItem, matchedRule } = matchItemWithRules(
        first.merchantName,
        items,
        merchantRules
      );

      const { groupId, categoryHint, isInternalTransfer } =
        suggestGroupAndCategory(first.merchantName, isIncome, groups, locale);

      const knownRecurringPattern =
        /spotify|netflix|hbo|disney|viaplay|skyshowtime|tv4 play|prime video|plex|apple|google one|f1 tv|omni|bonnier|dokland|patreon|subscribestar|cipsoft|comadsoft|myaudi|amazon prime|amex årsavgift|lf |försäk|csn|santander|telia|telenor|e\.on|vattenfall|verisure|kävlinge kommun|nordicwell|union|sv ingenj|rädda barnen|avanza|månadsspar|barnbidrag|lön|hsb|tre kronor/i.test(
          first.merchantName
        );
      const isRecurring =
        distinctMonths.length >= 2 || knownRecurringPattern;

      let defaultAction: MerchantGroupCandidate["actionType"] = "new_once";
      if (isInternalTransfer || totalAmount === 0) {
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
        latestAmount: latestPositive,
        totalAmount,
        actionType: defaultAction,
        targetItemId: matchedItem?.id || defaultItemId,
        targetGroupId: matchedItem?.group_id || groupId,
        suggestedCategoryLabel: categoryHint,
        matchedRulePattern: matchedRule?.pattern,
        // O4: Auto-create smart rules for both matched items and new_monthly items!
        rememberRule: Boolean(
          (matchedItem && !matchedRule) || defaultAction === "new_monthly"
        ),
        rulePattern: extractCleanMerchantKeyword(first.merchantName),
      });
    }

    groupedCandidates.sort((a, b) => {
      if (a.actionType === "skip" && b.actionType !== "skip") return 1;
      if (a.actionType !== "skip" && b.actionType === "skip") return -1;
      if (b.distinctMonths.length !== a.distinctMonths.length) {
        return b.distinctMonths.length - a.distinctMonths.length;
      }
      return b.totalAmount - a.totalAmount;
    });

    setMerchantGroups(groupedCandidates);
    setSelectedMonths([]);
  };

  const extractRawTransactionsFromColumns = (
    rows: unknown[][],
    startRow: number,
    dCol: number,
    tCol: number,
    tCol2: number,
    aCol: number,
    creditCardSignMode: boolean,
    sourceFileLabel?: string
  ): RawTransactionRow[] => {
    let preferMonthFirst = creditCardSignMode;
    for (let i = startRow; i < Math.min(startRow + 40, rows.length); i++) {
      const r = rows[i];
      if (!r) continue;
      const dStr = String(r[dCol] ?? "").trim();
      const m = dStr.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
      if (m) {
        const p1 = parseInt(m[1], 10);
        const p2 = parseInt(m[2], 10);
        if (p1 <= 12 && p2 > 12) {
          preferMonthFirst = true;
          break;
        }
        if (p1 > 12 && p2 <= 12) {
          preferMonthFirst = false;
          break;
        }
      }
    }

    const rawTxs: RawTransactionRow[] = [];
    const perFileOccMap = new Map<string, number>();
    let currentCardholder = "";

    for (let i = startRow; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 2) continue;

      const firstCellText = String(r[0] ?? "").trim();
      if (
        /^(transaktionssammanfattning|aktivitet utifrån kort|kortmedlem)$/i.test(
          firstCellText
        )
      ) {
        break;
      }

      if (/^\d{4,6}\*{4,8}\d{3,4}$/.test(firstCellText)) {
        const holder = String(r[1] ?? "").trim();
        if (holder) currentCardholder = holder;
        continue;
      }

      const rawDate = String(r[dCol] ?? "").trim();
      const parsedDate = parseStatementDate(rawDate, preferMonthFirst);
      if (!parsedDate) continue;

      const primaryText = String(r[tCol] ?? "").trim();
      const secondaryText =
        tCol2 !== -1 && tCol2 !== tCol
          ? String(r[tCol2] ?? "").trim()
          : currentCardholder;

      const { merchantName, detailNote } = buildCleanMerchantName(
        primaryText,
        secondaryText
      );

      const rawAmt = parseNumericAmount(r[aCol]);
      if (!merchantName || rawAmt === null || rawAmt === 0) continue;

      if (
        /^(belopp|amount|summa|summa köp\/uttag|totalt|totalt belopp|saldo|specifikation|beskrivning)$/i.test(
          merchantName
        )
      ) {
        continue;
      }

      let isIncome = false;
      let isRefund = false;
      let signedExpenseOrIncomeAmt = Math.abs(rawAmt);

      if (creditCardSignMode) {
        isIncome = false;
        if (rawAmt < 0) {
          if (/betalning mottagen|inbetalning/i.test(merchantName)) {
            signedExpenseOrIncomeAmt = Math.abs(rawAmt);
          } else {
            isRefund = true;
            signedExpenseOrIncomeAmt = -Math.abs(rawAmt);
          }
        }
      } else {
        isIncome = rawAmt > 0;
        signedExpenseOrIncomeAmt = Math.abs(rawAmt);
      }

      const txYearMonth = parsedDate.slice(0, 7);
      const baseFingerprint = `${parsedDate}::${merchantName
        .toLowerCase()
        .trim()}::${Math.round(signedExpenseOrIncomeAmt * 100)}`;
      const occIdx = perFileOccMap.get(baseFingerprint) || 0;
      perFileOccMap.set(baseFingerprint, occIdx + 1);
      const fingerprint = `${baseFingerprint}::${occIdx}`;

      rawTxs.push({
        id: `tx-${sourceFileLabel || "f"}-${i}`,
        date: parsedDate,
        yearMonth: txYearMonth,
        merchantName,
        detailNote,
        amount: signedExpenseOrIncomeAmt,
        isIncome,
        isRefund,
        fingerprint,
        sourceFile: sourceFileLabel,
      });
    }

    return rawTxs;
  };

  const buildGroupedCandidatesFromColumns = (
    rows: unknown[][],
    startRow: number,
    dCol: number,
    tCol: number,
    tCol2: number,
    aCol: number,
    creditCardSignMode: boolean
  ) => {
    const extracted = extractRawTransactionsFromColumns(
      rows,
      startRow,
      dCol,
      tCol,
      tCol2,
      aCol,
      creditCardSignMode,
      fileName || "file"
    );

    if (extracted.length === 0) {
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

    // Filter out any transactions already imported in database (O1)
    let skippedDupes = 0;
    const deduplicated = extracted.filter((tx) => {
      const monthKey = `MONTH::${tx.yearMonth}::${tx.merchantName
        .toLowerCase()
        .trim()}::${Math.round(tx.amount * 100)}`;
      if (
        existingDbFingerprints.has(tx.fingerprint) ||
        existingDbFingerprints.has(monthKey)
      ) {
        skippedDupes++;
        return false;
      }
      return true;
    });

    setDuplicatesSkippedCount(skippedDupes);
    const finalTxs = deduplicated.length > 0 ? deduplicated : extracted;
    setAccumulatedRawTxs(finalTxs);
    groupRawTransactionsIntoCandidates(finalTxs);
  };

  const detectColumnsForGrid = (nonEmptyRows: unknown[][]) => {
    let detectedHeaderRow = -1;
    let dCol = 0;
    let tCol = 1;
    let tCol2 = -1;
    let aCol = 2;
    let detectedCreditCard = false;

    for (let r = 0; r < Math.min(25, nonEmptyRows.length); r++) {
      const joined = nonEmptyRows[r].map((c) => String(c ?? "")).join(" ");
      if (
        /amex|american express|kortmedlem|kreditkort|mastercard|totalt övriga händelser|köp\/uttag|summa köp\/uttag|utl\.\s*belopp|\d{4,6}\*{4,8}\d{3,4}/i.test(
          joined
        )
      ) {
        detectedCreditCard = true;
      }
    }

    for (let r = 0; r < Math.min(30, nonEmptyRows.length); r++) {
      const row = nonEmptyRows[r].map((c) =>
        String(c ?? "")
          .toLowerCase()
          .trim()
      );

      if (
        row.some((h) =>
          /kortmedlem|visas på ditt kontoutdrag|utl\.\s*belopp/.test(h)
        )
      ) {
        detectedCreditCard = true;
      }

      const txDayIdx = row.findIndex((h) => /^transaktionsdag$/.test(h));
      const dIdx =
        txDayIdx !== -1
          ? txDayIdx
          : row.findIndex(
              (h) =>
                /^(datum|date|bokföringsdag|bokf\.?dag|valutadag|köpdag)$/.test(
                  h
                ) || /bokföringsdag|transaktionsdag|datum|date/.test(h)
            );

      const descIdx = row.findIndex(
        (h, idx) =>
          idx !== dIdx &&
          /^(beskrivning|specifikation|text|rubrik|description|merchant|butik|mottagare)$/.test(
            h
          )
      );
      const refIdx = row.findIndex(
        (h, idx) => idx !== dIdx && idx !== descIdx && /^referens$/.test(h)
      );
      const cardMemberIdx = row.findIndex((h) => /^kortmedlem$/.test(h));

      const aIdx = row.findIndex(
        (h) =>
          !/saldo|balance|konto\s*#/.test(h) &&
          /^(belopp|amount|summa|utgift|utgifter|debit|kostnad|insättning\/uttag)$/.test(
            h
          )
      );

      let primaryTextIdx = descIdx !== -1 ? descIdx : refIdx;
      let secondaryTextIdx = -1;

      if (detectedCreditCard && descIdx !== -1) {
        primaryTextIdx = descIdx;
        secondaryTextIdx = cardMemberIdx !== -1 ? cardMemberIdx : -1;
      } else if (refIdx !== -1 && descIdx !== -1) {
        primaryTextIdx = refIdx;
        secondaryTextIdx = descIdx;
      }

      if (primaryTextIdx !== -1 && aIdx !== -1) {
        detectedHeaderRow = r;
        dCol = dIdx !== -1 ? dIdx : 0;
        tCol = primaryTextIdx;
        tCol2 = secondaryTextIdx;
        aCol = aIdx;
        break;
      }
    }

    const startRow = detectedHeaderRow !== -1 ? detectedHeaderRow + 1 : 0;
    return {
      detectedHeaderRow,
      startRow,
      dCol,
      tCol,
      tCol2,
      aCol,
      detectedCreditCard,
    };
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
    const {
      detectedHeaderRow,
      startRow,
      dCol,
      tCol,
      tCol2,
      aCol,
      detectedCreditCard,
    } = detectColumnsForGrid(nonEmptyRows);

    setHeaderRowIdx(Math.max(0, detectedHeaderRow));
    setDateColIdx(dCol);
    setDescColIdx(tCol);
    setSecondaryDescColIdx(tCol2);
    setAmountColIdx(aCol);
    setIsCreditCardMode(detectedCreditCard);

    buildGroupedCandidatesFromColumns(
      nonEmptyRows,
      startRow,
      dCol,
      tCol,
      tCol2,
      aCol,
      detectedCreditCard
    );
  };

  const parseSingleFileToGrid = async (file: File): Promise<unknown[][]> => {
    const buffer = await file.arrayBuffer();
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith(".csv") || lowerName.endsWith(".txt")) {
      let text = new TextDecoder("utf-8").decode(buffer);
      if (text.includes("\uFFFD")) {
        text = new TextDecoder("iso-8859-1").decode(buffer);
      }
      return parseCsvTextToRows(text);
    }

    const workbook = XLSX.read(buffer, { type: "array", raw: false });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    ensureFullWorksheetRange(worksheet);

    return XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });
  };

  // F5 + O1: Multi-File Upload & Cross-File + Database Overlap Deduplication!
  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    appendToExisting = false
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const filesArray = Array.from(fileList);
    setErrorMsg(null);

    try {
      if (filesArray.length === 1 && !appendToExisting) {
        const file = filesArray[0];
        setFileName(file.name);
        setUploadedFiles([file.name]);
        const rows = await parseSingleFileToGrid(file);
        processRawRows(rows);
        e.target.value = "";
        return;
      }

      // Multi-file merge or append mode
      const seenFingerprints = new Set<string>();
      const combinedTxs: RawTransactionRow[] = [];
      let totalDuplicatesRemoved = 0;

      if (appendToExisting && accumulatedRawTxs.length > 0) {
        for (const tx of accumulatedRawTxs) {
          seenFingerprints.add(tx.fingerprint);
          combinedTxs.push(tx);
        }
      }

      const nextFileNames = appendToExisting ? [...uploadedFiles] : [];

      for (const file of filesArray) {
        if (!nextFileNames.includes(file.name)) {
          nextFileNames.push(file.name);
        }
        const grid = await parseSingleFileToGrid(file);
        const nonEmptyRows = (grid || []).filter(
          (r) =>
            Array.isArray(r) &&
            r.some((cell) => String(cell ?? "").trim() !== "")
        );
        if (nonEmptyRows.length === 0) continue;

        const {
          detectedHeaderRow,
          startRow,
          dCol,
          tCol,
          tCol2,
          aCol,
          detectedCreditCard,
        } = detectColumnsForGrid(nonEmptyRows);

        setRawGrid(nonEmptyRows);
        setHeaderRowIdx(Math.max(0, detectedHeaderRow));
        setDateColIdx(dCol);
        setDescColIdx(tCol);
        setSecondaryDescColIdx(tCol2);
        setAmountColIdx(aCol);
        setIsCreditCardMode(detectedCreditCard);

        const fileTxs = extractRawTransactionsFromColumns(
          nonEmptyRows,
          startRow,
          dCol,
          tCol,
          tCol2,
          aCol,
          detectedCreditCard,
          file.name
        );

        for (const tx of fileTxs) {
          const monthKey = `MONTH::${tx.yearMonth}::${tx.merchantName
            .toLowerCase()
            .trim()}::${Math.round(tx.amount * 100)}`;

          // Stage 1: Cross-file overlap deduplication (same date + merchant + amount + per-file occurrence)
          if (seenFingerprints.has(tx.fingerprint)) {
            totalDuplicatesRemoved++;
            continue;
          }
          // Stage 2: Already-imported database deduplication
          if (
            existingDbFingerprints.has(tx.fingerprint) ||
            existingDbFingerprints.has(monthKey)
          ) {
            totalDuplicatesRemoved++;
            continue;
          }

          seenFingerprints.add(tx.fingerprint);
          combinedTxs.push(tx);
        }
      }

      setUploadedFiles(nextFileNames);
      setFileName(nextFileNames.join(" + "));
      setDuplicatesSkippedCount(
        (prev) => (appendToExisting ? prev : 0) + totalDuplicatesRemoved
      );
      setAccumulatedRawTxs(combinedTxs);
      groupRawTransactionsIntoCandidates(combinedTxs);
      e.target.value = "";
    } catch {
      setErrorMsg(
        locale === "sv"
          ? "Kunde inte läsa filen/filerna. Prova .xlsx eller .csv."
          : "Could not parse file(s). Please upload valid .xlsx or .csv files."
      );
    }
  };

  const handleLoadAmexSample = () => {
    setFileName("SAS_Amex_Premium_2026.csv");
    setUploadedFiles(["SAS_Amex_Premium_2026.csv"]);
    const sampleCsv = `Transaktionsspecifikationer,"SAS Amex Premium / 01 Jan, 2026 till 31 Dec, 2026"
Datum,Beskrivning,Kortmedlem,Konto #,Belopp,Utökade specifikationer,Visas på ditt kontoutdrag som,Adress,Ort,Postnummer,Land,Referens,Kategori
10/16/2026,DOKLAND VIA STRIPE      STOCKHOLM,A C HEDESTAM,-52009,89,,DOKLAND,"SKEPPARGATAN 65\nSTOCKHOLM",,114 59,SWEDEN,AT262890026000010091837,Miscellaneous-Other
10/15/2026,ORESUNDSBRON.COM        KOPENHAVN,A C HEDESTAM,-52009,268,,ORESUNDSBRON,"KALKBROTTSGATAN 141\nMALMO",,S-216 30,SWEDEN,AT262890026000010087657,Miscellaneous-Other
10/13/2026,GOOGLE *GOOGLE ONE      G.CO/HELPPAY#,A C HEDESTAM,-52009,255,,GOOGLE ONE,"DUBLIN 2",,2,IRELAND,AT262870072000010006515,Miscellaneous-Other
10/08/2026,MAXI ICA STORMARKNAD LO LODDEKOPINGE,A C HEDESTAM,-52009,911.1,,ICA MAXI,"LÖDDEKÖPINGE",,S-246 42,SWEDEN,AT262820028000010086888,Miscellaneous-Other
10/08/2026,MCD 0310 MALMÖ ANNA     MALMÖ,A C HEDESTAM,-52009,123,,MCD,"MALMO",,S-211 19,SWEDEN,AT262820028000010086492,Miscellaneous-Other
10/04/2026,NETFLIX.COM 519485      NL,A C HEDESTAM,-52009,169,,NETFLIX,"AMSTERDAM",,1016 GD,NETHERLANDS,AT262770041000010006441,Miscellaneous-Other
10/02/2026,HBOMAX                  STOCKHOLM,A C HEDESTAM,-52009,149,,HBOMAX,"STOCKHOLM",,S-103 96,SWEDEN,AT262750027000010091900,Miscellaneous-Other
09/29/2026,SPOTIFY P476FC7EF2 6844 STOCKHOLM,A C HEDESTAM,-52009,189,,SPOTIFY,"LONDON",,WC2N 6HT,UK,AT262730072000010007384,Miscellaneous-Other
09/28/2026,"BETALNING MOTTAGEN, TACK",A C HEDESTAM,-52009,-44649.04,,"BETALNING MOTTAGEN",,,,,AT262720083000010024191,
09/21/2026,DISNEY PLUS             HOOFDDORP,A C HEDESTAM,-52009,159,,DISNEY PLUS,"AMSTERDAM",,1101 AX,NETHERLANDS,AT262640028000010084186,Miscellaneous-Other
08/29/2026,SPOTIFY P463CF202F 6844 STOCKHOLM,A C HEDESTAM,-52009,189,,SPOTIFY,"LONDON",,WC2N 6HT,UK,AT262420060000010005384,Miscellaneous-Other
08/04/2026,NETFLIX.COM 519485      NL,A C HEDESTAM,-52009,169,,NETFLIX,"AMSTERDAM",,1016 GD,NETHERLANDS,AT262160047000010007612,Miscellaneous-Other`;
    processRawRows(parseCsvTextToRows(sampleCsv));
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

  const visibleMerchantGroups = merchantGroups
    .map((mg) => {
      const filteredTxs = isAllMonthsSelected
        ? mg.transactions
        : mg.transactions.filter((tx) => selectedMonths.includes(tx.yearMonth));
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

        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-serif text-2xl leading-snug text-[#282825]">
              {locale === "sv"
                ? "Bank- & Kortimport (Sparbanken, Amex m.fl.)"
                : "Bank & Card Import (Amex, Bank CSV/XLSX)"}
            </h3>
            <p className="mt-0.5 text-xs text-[#64645e]">
              {locale === "sv"
                ? "Grupperar automatiskt återkommande köp, prenumerationer och butiker."
                : "Automatically groups recurring subscriptions and merchants."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#c5c5ba] bg-white p-2 text-[#282825] shrink-0"
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
                      ? "Sökord (t.ex. ica, spotify)"
                      : "Keyword (e.g. ica, spotify)"
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

        {/* Upload Dropzone (F5 Multi-File + O1 Duplicate Guard) */}
        <div className="mt-3 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#282825]/40 bg-white p-4 text-center">
          <FileSpreadsheet className="h-6 w-6 text-[#057b40] mb-1.5" />
          <p className="text-xs font-semibold text-[#282825] break-words">
            {uploadedFiles.length > 0
              ? locale === "sv"
                ? `${uploadedFiles.length} fil(er) inlästa`
                : `${uploadedFiles.length} file(s) loaded`
              : locale === "sv"
              ? "Välj en eller flera CSV-/Excel-filer samtidigt (Bank, Amex, Mastercard)"
              : "Select one or multiple CSV/Excel files at once (Bank, Amex, Mastercard)"}
          </p>

          {uploadedFiles.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
              {uploadedFiles.map((fn) => (
                <span
                  key={fn}
                  className="inline-flex items-center gap-1 rounded-full border border-[#b5e3c4] bg-[#e7f4eb] px-2.5 py-0.5 font-mono text-[10px] font-bold text-[#057b40]"
                >
                  <Check className="h-2.5 w-2.5" />
                  <span>{fn}</span>
                </span>
              ))}
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#0c0d0d] px-4 py-2 text-xs font-semibold text-white hover:bg-[#282825]">
              <Upload className="h-3.5 w-3.5" />
              <span>
                {locale === "sv"
                  ? "Välj fil(er) (.csv / .xlsx)"
                  : "Select file(s)"}
              </span>
              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls,.txt"
                onChange={(e) => handleFileChange(e, false)}
                className="hidden"
              />
            </label>

            {merchantGroups.length > 0 && (
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#282825] bg-[#e1edfe] px-3.5 py-2 text-xs font-semibold text-[#2173be] hover:bg-[#b8d5ff]">
                <Plus className="h-3.5 w-3.5" />
                <span>
                  {locale === "sv"
                    ? "Lägg till fler filer"
                    : "Add more files"}
                </span>
                <input
                  type="file"
                  multiple
                  accept=".csv,.xlsx,.xls,.txt"
                  onChange={(e) => handleFileChange(e, true)}
                  className="hidden"
                />
              </label>
            )}

            <button
              type="button"
              onClick={handleLoadAmexSample}
              className="inline-flex items-center gap-1 rounded-full border border-[#282825] bg-[#e7f4eb] px-3.5 py-2 text-xs font-semibold text-[#057b40]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                {locale === "sv" ? "Testa Amex-exempel" : "Load Amex sample"}
              </span>
            </button>
          </div>
        </div>

        {/* O1 Duplicate Guard Banner */}
        {duplicatesSkippedCount > 0 && (
          <div className="mt-2.5 flex items-center gap-2 rounded-2xl border border-[#529a6a] bg-[#e7f4eb] px-3.5 py-2 text-xs font-semibold text-[#057b40]">
            <Check className="h-4 w-4 shrink-0" />
            <span>
              {locale === "sv"
                ? `Dubblettskydd aktivt: ${duplicatesSkippedCount} överlappande eller redan importerade köp filtrerades bort automatiskt.`
                : `Duplicate guard: ${duplicatesSkippedCount} overlapping or already-imported transactions were automatically filtered out.`}
            </span>
          </div>
        )}

        {/* Statement Type & Column Mapping Bar */}
        {rawGrid.length > 0 && headerLabels.length > 1 && (
          <div className="mt-3 rounded-2xl border border-[#c5c5ba] bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#057b40]" />
                <span className="text-xs font-semibold text-[#282825]">
                  {isCreditCardMode
                    ? locale === "sv"
                      ? "Läge: Kreditkort (Amex / Kort)"
                      : "Mode: Credit Card (Amex)"
                    : locale === "sv"
                    ? "Läge: Bankkonto (Sparbanken m.fl.)"
                    : "Mode: Bank Account"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = !isCreditCardMode;
                    setIsCreditCardMode(nextMode);
                    buildGroupedCandidatesFromColumns(
                      rawGrid,
                      headerRowIdx + 1,
                      dateColIdx,
                      descColIdx,
                      secondaryDescColIdx,
                      amountColIdx,
                      nextMode
                    );
                  }}
                  className="rounded-full border border-[#c5c5ba] bg-[#f8f8f7] px-2.5 py-1 text-[11px] font-semibold text-[#282825] hover:border-[#282825]"
                >
                  {locale === "sv" ? "Växla Bank/Kort" : "Switch Bank/Card"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowColumnMapper((v) => !v)}
                  className="text-[11px] font-semibold text-[#2173be] underline"
                >
                  {showColumnMapper
                    ? locale === "sv"
                      ? "Dölj kolumner"
                      : "Hide columns"
                    : locale === "sv"
                    ? "Ändra kolumner"
                    : "Change columns"}
                </button>
              </div>
            </div>

            {showColumnMapper && (
              <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-[#ecece9] text-[11px]">
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
                        amountColIdx,
                        isCreditCardMode
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
                    {locale === "sv" ? "Beskrivning / Butik" : "Description"}
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
                        amountColIdx,
                        isCreditCardMode
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
                        nextA,
                        isCreditCardMode
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
            {availableMonths.length > 1 && (
              <div className="rounded-2xl border border-[#c5c5ba] bg-white p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-semibold text-[#64645e] mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-[#057b40]" />
                    <span>
                      {locale === "sv"
                        ? `Filen har ${availableMonths.length} månader — välj en eller flera:`
                        : `Statement has ${availableMonths.length} months — select one or more:`}
                    </span>
                  </div>
                  {!isAllMonthsSelected && (
                    <span className="rounded-full bg-[#e7f4eb] px-2 py-0.5 text-[10px] font-bold text-[#057b40]">
                      {locale === "sv"
                        ? `${selectedMonths.length} av ${availableMonths.length} valda`
                        : `${selectedMonths.length} of ${availableMonths.length} selected`}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedMonths([])}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold border transition ${
                      isAllMonthsSelected
                        ? "border-[#282825] bg-[#0c0d0d] text-white"
                        : "border-[#c5c5ba] bg-[#f8f8f7] text-[#282825] hover:border-[#282825]"
                    }`}
                  >
                    {locale === "sv"
                      ? `Alla månader (${availableMonths[availableMonths.length - 1]} – ${availableMonths[0]})`
                      : `All months (${availableMonths.length})`}
                  </button>
                  {availableMonths.map((ym) => {
                    const isMonthPicked =
                      !isAllMonthsSelected && selectedMonths.includes(ym);
                    return (
                      <button
                        key={ym}
                        type="button"
                        onClick={() => toggleMonthSelection(ym)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold border transition ${
                          isMonthPicked
                            ? "border-[#282825] bg-[#0c0d0d] text-white"
                            : "border-[#c5c5ba] bg-[#f8f8f7] text-[#282825] hover:border-[#282825]"
                        }`}
                      >
                        {isMonthPicked && <Check className="h-3 w-3" />}
                        <span>{ym}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs font-semibold text-[#64645e]">
              <span>
                {locale === "sv"
                  ? `${visibleMerchantGroups.length} grupperade mottagare (${activeTransactionsCount} köp)`
                  : `${visibleMerchantGroups.length} grouped merchants (${activeTransactionsCount} txs)`}
              </span>
              <span>
                {activeGroupsCount}{" "}
                {locale === "sv" ? "valda" : "selected"}
              </span>
            </div>

            <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
              {visibleMerchantGroups.map((mg) => {
                const isExpanded = Boolean(expandedKeys[mg.merchantKey]);
                const txCount = mg.filteredTxs.length;
                const filteredSum = Math.max(
                  0,
                  Math.round(
                    mg.filteredTxs.reduce((s, t) => s + t.amount, 0) * 100
                  ) / 100
                );
                const filteredDistinctMonths = Array.from(
                  new Set(mg.filteredTxs.map((t) => t.yearMonth))
                );
                const filteredAvg = Math.max(
                  0,
                  Math.round(
                    filteredSum / Math.max(1, filteredDistinctMonths.length)
                  )
                );
                const isMultiMonthFiltered = filteredDistinctMonths.length > 1;
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
                          {formatCurrency(
                            isMultiMonthFiltered ? filteredAvg : filteredSum,
                            currency,
                            locale
                          )}
                          {isMultiMonthFiltered && (
                            <span className="font-sans text-[10px] font-normal text-[#64645e]">
                              /{locale === "sv" ? "mån" : "mo"}
                            </span>
                          )}
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
                            ? `${filteredDistinctMonths.length} mån`
                            : `${filteredDistinctMonths.length} mos`}
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
                              ? "köp"
                              : "köp"
                            : txCount === 1
                            ? "tx"
                            : "txs"}
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
                              {tx.detailNote ? ` • ${tx.detailNote}` : ""}
                            </span>
                            <span
                              className={`font-bold shrink-0 ml-2 ${
                                tx.isRefund
                                  ? "text-[#057b40]"
                                  : "text-[#282825]"
                              }`}
                            >
                              {tx.isRefund ? "Retur " : ""}
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

                    {/* O4: Auto-create Smart Merchant Rule toggle for new_monthly & existing_item */}
                    {(mg.actionType === "new_monthly" ||
                      mg.actionType === "existing_item") && (
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[#64645e]">
                        <label className="inline-flex cursor-pointer items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={mg.rememberRule}
                            onChange={(e) =>
                              updateMerchantGroup(mg.merchantKey, {
                                rememberRule: e.target.checked,
                              })
                            }
                            className="h-3.5 w-3.5 rounded accent-[#7a2899]"
                          />
                          <Zap className="h-3 w-3 text-[#7a2899]" />
                          <span className="font-medium text-[#282825]">
                            {locale === "sv"
                              ? "Spara smart regel för framtida importer:"
                              : "Auto-save rule for future imports:"}
                          </span>
                        </label>
                        {mg.rememberRule && (
                          <input
                            type="text"
                            value={mg.rulePattern}
                            onChange={(e) =>
                              updateMerchantGroup(mg.merchantKey, {
                                rulePattern: e.target.value,
                              })
                            }
                            className="w-28 rounded-lg border border-[#edc6fb] bg-[#f6e6fc]/60 px-2 py-0.5 font-mono text-[10px] font-bold text-[#7a2899] focus:outline-none"
                          />
                        )}
                      </div>
                    )}
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
                    ? `Importera ${activeGroupsCount} poster (${activeTransactionsCount} köp)`
                    : `Import ${activeGroupsCount} items (${activeTransactionsCount} txs)`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
