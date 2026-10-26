import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, jsonError } from "@/lib/http";

export async function GET() {
  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);

    const [business, transactions, customers, deals, budget, auditEvents, integrations] = await Promise.all([
      db.business.findUnique({ where: { id: context.businessId }, select: { id: true, name: true, createdAt: true } }),
      db.financialTransaction.findMany({
        where: { businessId: context.businessId },
        orderBy: { occurredAt: "desc" },
        include: { customer: { select: { name: true, email: true } } },
      }),
      db.customer.findMany({
        where: { businessId: context.businessId },
        orderBy: { name: "asc" },
        include: { deals: { select: { reference: true, type: true, status: true, totalMinor: true } } },
      }),
      db.deal.findMany({
        where: { businessId: context.businessId },
        orderBy: { createdAt: "desc" },
        include: { customer: { select: { name: true, email: true } }, items: true },
      }),
      db.budget.findUnique({ where: { businessId: context.businessId }, select: { operationsPercent: true, reservePercent: true, ownerDrawPercent: true, updatedAt: true } }),
      db.auditEvent.findMany({
        where: { businessId: context.businessId },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      db.integration.findMany({
        where: { businessId: context.businessId },
        select: { provider: true, status: true, lastSyncedAt: true, lastTestedAt: true },
      }),
    ]);

    const payload = {
      format: "pocketcfo-backup-v1",
      exportedAt: new Date().toISOString(),
      exportedBy: { name: context.userName, email: context.userEmail },
      business,
      budget,
      transactions: transactions.map((row) => ({
        id: row.id,
        type: row.type,
        amountMinor: row.amountMinor.toString(),
        currency: row.currency,
        description: row.description,
        category: row.category,
        occurredAt: row.occurredAt.toISOString(),
        customer: row.customer,
        source: row.source,
        externalId: row.externalId,
        createdAt: row.createdAt.toISOString(),
      })),
      customers: customers.map((customer) => ({
        ...customer,
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
        deals: customer.deals.map((deal) => ({ ...deal, totalMinor: deal.totalMinor.toString() })),
      })),
      deals: deals.map((deal) => ({
        ...deal,
        totalMinor: deal.totalMinor.toString(),
        createdAt: deal.createdAt.toISOString(),
        updatedAt: deal.updatedAt.toISOString(),
        dueAt: deal.dueAt?.toISOString() ?? null,
        items: deal.items.map((item) => ({ ...item, unitMinor: item.unitMinor.toString() })),
      })),
      auditEvents: auditEvents.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
      integrations,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="pocketcfo-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
