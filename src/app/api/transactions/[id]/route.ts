import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { transactionSchema } from "@/lib/validation";
import { parseMoneyToMinorUnits } from "@/lib/money";
import { dispatchWebhook } from "@/lib/webhooks";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, route: RouteContext) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    const { id } = await route.params;
    const input = transactionSchema.parse(await request.json());
    const existing = await db.financialTransaction.findFirst({
      where: { id, businessId: context.businessId },
      select: { id: true },
    });
    if (!existing) return jsonError("Transaction was not found.", 404);
    const amountMinor = parseMoneyToMinorUnits(input.amount);
    if (amountMinor <= 0n) return jsonError("Amount must be greater than zero.", 400);

    const updated = await db.$transaction(async (tx) => {
      if (input.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: input.customerId, businessId: context.businessId },
          select: { id: true },
        });
        if (!customer) return null;
      }
      if (input.dealId) {
        const deal = await tx.deal.findFirst({
          where: { id: input.dealId, businessId: context.businessId },
          select: { id: true },
        });
        if (!deal) return null;
      }
      const transaction = await tx.financialTransaction.update({
        where: { id },
        data: {
          type: input.type,
          amountMinor,
          description: input.description,
          category: input.category,
          occurredAt: new Date(input.occurredAt),
          customerId: input.customerId || null,
          dealId: input.dealId || null,
        },
      });
      await tx.auditEvent.create({
        data: { businessId: context.businessId, actorId: context.userId, action: "transaction.updated", recordType: "FinancialTransaction", recordId: id },
      });
      return transaction;
    });
    if (!updated) return jsonError("Customer or deal was not found for this business.", 400);
    dispatchWebhook(context.businessId, "transaction.updated", {
      id: updated.id,
      type: updated.type,
      amountMinor: updated.amountMinor.toString(),
    });
    return NextResponse.json({
      transaction: { ...updated, amountMinor: updated.amountMinor.toString() },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, route: RouteContext) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    const { id } = await route.params;
    const deleted = await db.$transaction(async (tx) => {
      const existing = await tx.financialTransaction.findFirst({
        where: { id, businessId: context.businessId },
        select: { id: true },
      });
      if (!existing) return false;
      await tx.auditEvent.create({
        data: { businessId: context.businessId, actorId: context.userId, action: "transaction.deleted", recordType: "FinancialTransaction", recordId: id },
      });
      await tx.financialTransaction.delete({ where: { id } });
      return true;
    });
    if (!deleted) return jsonError("Transaction was not found.", 404);
    dispatchWebhook(context.businessId, "transaction.deleted", { id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
