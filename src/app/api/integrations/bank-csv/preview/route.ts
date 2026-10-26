import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { parseBankRows, parseCsv, suggestMapping, type BankMapping } from "@/lib/bank-import";

const MAX_CSV_BYTES = 2_000_000;
const MAX_ROWS = 2_000;

function resolveMapping(headers: string[], requested?: Partial<BankMapping>) {
  const suggested = suggestMapping(headers);
  const mapping: BankMapping = {
    date: requested?.date ?? suggested.date,
    description: requested?.description ?? suggested.description,
    amount: requested?.amount ?? suggested.amount,
    debit: requested?.debit ?? suggested.debit,
    credit: requested?.credit ?? suggested.credit,
    type: requested?.type ?? suggested.type,
    category: requested?.category ?? suggested.category,
  };
  const columns = Object.entries(mapping).filter(([, value]) => Boolean(value));
  for (const [key, value] of columns) {
    if (!headers.includes(value)) {
      throw new Error(`The ${key} column "${value}" was not found in this file.`);
    }
  }
  if (!mapping.date) throw new Error("Choose the column that contains the transaction date.");
  if (!mapping.description) throw new Error("Choose the column that contains the description.");
  if (!mapping.amount && !mapping.debit && !mapping.credit) {
    throw new Error("Choose an amount column, or separate debit and credit columns.");
  }
  return { mapping, suggested };
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);

    const body = (await request.json()) as { csv?: string; mapping?: Partial<BankMapping> };
    if (typeof body.csv !== "string" || body.csv.trim().length === 0) {
      return jsonError("Choose a CSV statement to preview.", 400);
    }
    if (body.csv.length > MAX_CSV_BYTES) {
      return jsonError("That file is larger than 2 MB. Split it into smaller statements.", 413);
    }

    const table = parseCsv(body.csv);
    if (table.headers.length === 0) return jsonError("The file does not contain a readable header row.", 400);
    if (table.rows.length > MAX_ROWS) {
      return jsonError(`That statement has ${table.rows.length} rows. Import up to ${MAX_ROWS} rows at a time.`, 413);
    }

    let resolved: { mapping: BankMapping; suggested: BankMapping };
    try {
      resolved = resolveMapping(table.headers, body.mapping);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Column mapping is incomplete.", 400);
    }

    const parsed = parseBankRows(table, resolved.mapping);
    const externalIds = parsed
      .filter((row) => row.externalId && !row.error)
      .map((row) => row.externalId as string);
    const existing = externalIds.length
      ? await db.financialTransaction.findMany({
          where: { businessId: context.businessId, externalId: { in: externalIds } },
          select: { externalId: true },
        })
      : [];
    const existingIds = new Set(existing.map((row) => row.externalId));

    const preview = parsed.slice(0, 12).map((row) => ({
      ...row,
      duplicate: Boolean(row.externalId && existingIds.has(row.externalId)),
      error: row.error ?? (row.externalId && existingIds.has(row.externalId) ? "Already imported." : undefined),
    }));
    const validRows = parsed.filter(
      (row) => !row.error && row.externalId && !existingIds.has(row.externalId),
    ).length;
    const duplicateRows = parsed.filter((row) => row.externalId && existingIds.has(row.externalId)).length;
    const invalidRows = parsed.filter((row) => row.error && row.error !== "Already imported.").length;

    return NextResponse.json({
      headers: table.headers,
      mapping: resolved.mapping,
      suggestedMapping: resolved.suggested,
      preview,
      totals: {
        rows: parsed.length,
        valid: validRows,
        duplicates: duplicateRows,
        invalid: invalidRows,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
