import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMinorUnits, parseMoneyToMinorUnits } from "@/lib/money";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { transactionSchema } from "@/lib/validation";
import { dispatchWebhook } from "@/lib/webhooks";

function serializeTransaction(transaction: {
  id: string; type: string; amountMinor: bigint; description: string; category: string;
  occurredAt: Date; customerId: string | null; customer: { name: string; email: string } | null;
}) {
  return {
    id: transaction.id,
    type: transaction.type,
    amount: formatMinorUnits(transaction.amountMinor),
    amountMinor: transaction.amountMinor.toString(),
    description: transaction.description,
    category: transaction.category,
    occurredAt: transaction.occurredAt.toISOString(),
    customerId: transaction.customerId,
    customer: transaction.customer,
  };
}

export async function GET() {
  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    const transactions = await db.financialTransaction.findMany({
      where: { businessId: context.businessId },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { customer: { select: { name: true, email: true } } },
    });
    return NextResponse.json({ transactions: transactions.map(serializeTransaction) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    const input = transactionSchema.parse(await request.json());
    const amountMinor = parseMoneyToMinorUnits(input.amount);
    if (amountMinor <= 0n) return jsonError("Amount must be greater than zero.", 400);

    const record = await db.$transaction(async (tx) => {
      if (input.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: input.customerId, businessId: context.businessId },
          select: { id: true },
        });
        if (!customer) throw new Error("Customer does not belong to this business.");
      }
      if (input.dealId) {
        const deal = await tx.deal.findFirst({
          where: { id: input.dealId, businessId: context.businessId },
          select: { id: true },
        });
        if (!deal) throw new Error("Deal does not belong to this business.");
      }
      const transaction = await tx.financialTransaction.create({
        data: {
          businessId: context.businessId,
          createdById: context.userId,
          type: input.type,
          amountMinor,
          description: input.description,
          category: input.category,
          occurredAt: new Date(input.occurredAt),
          customerId: input.customerId || null,
          dealId: input.dealId || null,
        },
        include: { customer: { select: { name: true, email: true } } },
      });
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "transaction.created",
          recordType: "FinancialTransaction",
          recordId: transaction.id,
        },
      });
      return transaction;
    });
    dispatchWebhook(context.businessId, "transaction.created", {
      id: record.id,
      type: record.type,
      amountMinor: record.amountMinor.toString(),
      description: record.description,
      category: record.category,
      occurredAt: record.occurredAt.toISOString(),
    });
    return NextResponse.json({ transaction: serializeTransaction(record) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("does not belong")) return jsonError(error.message, 400);
    return handleRouteError(error);
  }
}
