import { createHash } from "node:crypto";

export type CsvTable = { headers: string[]; rows: string[][] };

function detectDelimiter(line: string) {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    let count = 0;
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === candidate && !quoted) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const firstLine = text.split("\n").find((line) => line.trim()) ?? "";
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((header, index) => header || `Column ${index + 1}`);
  return { headers, rows: rows.slice(1) };
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const HEADER_HINTS = {
  date: ["date", "transactiondate", "postingdate", "postdate", "valuedate", "datum", "transdate"],
  description: [
    "description",
    "details",
    "narrative",
    "transactiondescription",
    "memo",
    "reference",
    "payee",
    "particulars",
  ],
  amount: ["amount", "transactionamount", "value", "bedrag", "movement"],
  debit: ["debit", "debitamount", "withdrawal", "withdrawals", "moneyout", "payments", "paidout"],
  credit: ["credit", "creditamount", "deposit", "deposits", "moneyin", "receipts", "paidin"],
  type: ["type", "transactiontype", "drcr", "debitcredit", "creditdebit"],
  category: ["category", "classification", "group"],
};

export type BankMapping = {
  date: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  type?: string;
  category?: string;
};

export function suggestMapping(headers: string[]): BankMapping {
  const find = (hints: string[]) =>
    headers.find((header) => hints.includes(normalize(header))) ??
    headers.find((header) => hints.some((hint) => normalize(header).includes(hint))) ??
    "";
  return {
    date: find(HEADER_HINTS.date),
    description: find(HEADER_HINTS.description),
    amount: find(HEADER_HINTS.amount),
    debit: find(HEADER_HINTS.debit),
    credit: find(HEADER_HINTS.credit),
    type: find(HEADER_HINTS.type),
    category: find(HEADER_HINTS.category),
  };
}

export function parseAmountMinor(raw: string): bigint | null {
  const value = raw
    .replace(/\u00a0/g, " ")
    .replace(/[Rr]\s?/g, "")
    .replace(/\s/g, "")
    .replace(/[^\d,.\-()]/g, "");
  if (!value || value === "-" || value === "()") return null;
  let negative = false;
  let working = value;
  if (working.startsWith("(") && working.endsWith(")")) {
    negative = true;
    working = working.slice(1, -1);
  }
  if (working.startsWith("-")) {
    negative = true;
    working = working.slice(1);
  }
  if (working.endsWith("-")) {
    negative = true;
    working = working.slice(0, -1);
  }
  const lastComma = working.lastIndexOf(",");
  const lastDot = working.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      working = working.replace(/\./g, "").replace(",", ".");
    } else {
      working = working.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const decimals = working.length - lastComma - 1;
    working = decimals === 2 ? working.replace(",", ".") : working.replace(/,/g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(working)) return null;
  const [whole, fraction = ""] = working.split(".");
  const minor = BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -minor : minor;
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

export function parseStatementDate(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;
  let match = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return validDate(date, Number(match[1]), Number(match[2]) - 1, Number(match[3])) ? date : null;
  }
  match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    const date = new Date(year, Number(match[2]) - 1, Number(match[1]));
    return validDate(date, year, Number(match[2]) - 1, Number(match[1])) ? date : null;
  }
  match = value.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (match) {
    const month = MONTHS[match[2].toLowerCase()];
    if (month === undefined) return null;
    const date = new Date(Number(match[3]), month, Number(match[1]));
    return validDate(date, Number(match[3]), month, Number(match[1])) ? date : null;
  }
  match = value.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (match) {
    const month = MONTHS[match[1].toLowerCase()];
    if (month === undefined) return null;
    const date = new Date(Number(match[3]), month, Number(match[2]));
    return validDate(date, Number(match[3]), month, Number(match[2])) ? date : null;
  }
  return null;
}

function validDate(date: Date, year: number, month: number, day: number) {
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
  );
}

export type ParsedBankRow = {
  rowNumber: number;
  date: string | null;
  description: string;
  amountMinor: string | null;
  type: "INCOME" | "EXPENSE" | "OWNER_DRAW" | null;
  category: string;
  externalId: string | null;
  error?: string;
};

function resolveType(raw: string, signedMinor: bigint): "INCOME" | "EXPENSE" | "OWNER_DRAW" | null {
  const value = normalize(raw);
  if (!value) return signedMinor < 0n ? "EXPENSE" : "INCOME";
  if (["income", "credit", "cr", "deposit", "received", "receipt", "in", "moneyin"].includes(value)) return "INCOME";
  if (["expense", "debit", "dr", "payment", "withdrawal", "paid", "out", "moneyout"].includes(value)) return "EXPENSE";
  if (["owner", "ownerdraw", "draw", "drawing", "drawings"].includes(value)) return "OWNER_DRAW";
  return signedMinor < 0n ? "EXPENSE" : "INCOME";
}

export function parseBankRows(table: CsvTable, mapping: BankMapping): ParsedBankRow[] {
  const indexOf = (header: string) => (header ? table.headers.indexOf(header) : -1);
  const dateIndex = indexOf(mapping.date);
  const descriptionIndex = indexOf(mapping.description);
  const amountIndex = indexOf(mapping.amount ?? "");
  const debitIndex = indexOf(mapping.debit ?? "");
  const creditIndex = indexOf(mapping.credit ?? "");
  const typeIndex = indexOf(mapping.type ?? "");
  const categoryIndex = indexOf(mapping.category ?? "");
  const seen = new Set<string>();

  return table.rows.map((row, rowIndex) => {
    const cell = (index: number) => (index >= 0 ? (row[index] ?? "").trim() : "");
    const dateValue = cell(dateIndex);
    const descriptionValue = cell(descriptionIndex);
    const category = (cell(categoryIndex) || "Uncategorised").slice(0, 80);
    const base = {
      rowNumber: rowIndex + 2,
      date: null as string | null,
      description: descriptionValue.slice(0, 240) || "Imported transaction",
      amountMinor: null as string | null,
      type: null as "INCOME" | "EXPENSE" | "OWNER_DRAW" | null,
      category,
      externalId: null as string | null,
      error: undefined as string | undefined,
    };

    const date = parseStatementDate(dateValue);
    if (!date) return { ...base, error: "Date could not be read." };

    let signedMinor: bigint | null = null;
    const amountValue = cell(amountIndex);
    const debitValue = cell(debitIndex);
    const creditValue = cell(creditIndex);
    if (amountIndex >= 0 && amountValue) {
      signedMinor = parseAmountMinor(amountValue);
    } else if (debitValue) {
      const debit = parseAmountMinor(debitValue);
      signedMinor = debit === null ? null : -debit;
    } else if (creditValue) {
      signedMinor = parseAmountMinor(creditValue);
    }
    if (signedMinor === null) return { ...base, error: "Amount could not be read." };
    if (signedMinor === 0n) return { ...base, error: "Amount is zero." };

    const type = resolveType(cell(typeIndex), signedMinor);
    const amountMinor = signedMinor < 0n ? -signedMinor : signedMinor;
    const isoDate = date.toISOString();
    // Hash the calendar date the statement shows, not the UTC slice of a local
    // midnight. Otherwise the same statement gets different fingerprints in
    // different time zones and duplicate detection silently stops working.
    const calendarDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`;
    const externalId = createHash("sha256")
      .update(`${calendarDate}|${base.description}|${amountMinor.toString()}|${type}`)
      .digest("hex");

    if (seen.has(externalId)) {
      return { ...base, date: isoDate, amountMinor: amountMinor.toString(), type, externalId, error: "Duplicate row in this file." };
    }
    seen.add(externalId);

    return {
      ...base,
      date: isoDate,
      amountMinor: amountMinor.toString(),
      type,
      externalId,
      error: undefined,
    };
  });
}
