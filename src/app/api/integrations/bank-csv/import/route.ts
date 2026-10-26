import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { parseBankRows, parseCsv, suggestMapping, type BankMapping } from "@/lib/bank-import";
import { allowRequest } from "@/lib/rate-limit";
import { dispatchWebhook } from "@/lib/webhooks";

const MAX_CSV_BYTES = 2_000_000;
const MAX_ROWS = 2_000;

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    if (!allowRequest(`bank-import:${context.userId}`, 8, 10 * 60_000)) {
      return jsonError("Too many imports in a short time. Try again shortly.", 429);
    }

    const body = (await request.json()) as {
      csv?: string;
      fileName?: string;
      mapping?: Partial<BankMapping>;
    };
    if (typeof body.csv !== "string" || body.csv.trim().length === 0) {
      return jsonError("Choose a CSV statement to import.", 400);
    }
    if (body.csv.length > MAX_CSV_BYTES) {
      return jsonError("That file is larger than 2 MB. Split it into smaller statements.", 413);
    }

    const table = parseCsv(body.csv);
    if (table.headers.length === 0) return jsonError("The file does not contain a readable header row.", 400);
    if (table.rows.length > MAX_ROWS) {
      return jsonError(`That statement has ${table.rows.length} rows. Import up to ${MAX_ROWS} rows at a time.`, 413);
    }

    const suggested = suggestMapping(table.headers);
    const mapping: BankMapping = {
      date: body.mapping?.date ?? suggested.date,
      description: body.mapping?.description ?? suggested.description,
      amount: body.mapping?.amount ?? suggested.amount,
      debit: body.mapping?.debit ?? suggested.debit,
      credit: body.mapping?.credit ?? suggested.credit,
      type: body.mapping?.type ?? suggested.type,
      category: body.mapping?.category ?? suggested.category,
    };
    for (const [key, value] of Object.entries(mapping)) {
      if (value && !table.headers.includes(value)) {
        return jsonError(`The ${key} column "${value}" was not found in this file.`, 400);
      }
    }
    if (!mapping.date || !mapping.description || (!mapping.amount && !mapping.debit && !mapping.credit)) {
      return jsonError("Date, description and amount columns are required.", 400);
    }

    const parsed = parseBankRows(table, mapping);
    const valid = parsed.filter(
      (row) => !row.error && row.date && row.amountMinor && row.type && row.externalId,
    );
    if (valid.length === 0) {
      return jsonError("No valid rows were found. Check the column mapping and try again.", 400);
    }

    const fileName = (body.fileName || "bank-statement.csv").slice(0, 200);
    const result = await db.$transaction(async (tx) => {
      const created = await tx.financialTransaction.createMany({
        data: valid.map((row) => ({
          businessId: context.businessId,
          createdById: context.userId,
          type: row.type as "INCOME" | "EXPENSE" | "OWNER_DRAW",
          amountMinor: BigInt(row.amountMinor as string),
          description: row.description,
          category: row.category,
          occurredAt: new Date(row.date as string),
          source: "BANK_CSV",
          externalId: row.externalId,
        })),
        skipDuplicates: true,
      });
      const batch = await tx.importBatch.create({
        data: {
          businessId: context.businessId,
          provider: "BANK_CSV",
          fileName,
          rowsRead: parsed.length,
          rowsImported: created.count,
          rowsSkipped: parsed.length - created.count,
        },
      });
      await tx.integration.upsert({
        where: { businessId_provider: { businessId: context.businessId, provider: "bank_csv" } },
        create: { businessId: context.businessId, provider: "bank_csv", status: "CONNECTED", lastSyncedAt: new Date() },
        update: { status: "CONNECTED", lastSyncedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "bank_statement.imported",
          recordType: "ImportBatch",
          recordId: batch.id,
          details: { fileName, rowsImported: created.count, rowsSkipped: parsed.length - created.count },
        },
      });
      return { batch, imported: created.count };
    });

    dispatchWebhook(context.businessId, "transaction.created", {
      source: "BANK_CSV",
      imported: result.imported,
      fileName,
    });

    return NextResponse.json({
      imported: result.imported,
      skipped: parsed.length - result.imported,
      rowsRead: parsed.length,
      batch: {
        id: result.batch.id,
        fileName: result.batch.fileName,
        createdAt: result.batch.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
