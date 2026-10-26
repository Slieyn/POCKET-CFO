import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseMoneyToMinorUnits } from "@/lib/money";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { dealSchema } from "@/lib/validation";
import { dispatchWebhook } from "@/lib/webhooks";

export async function GET() {
  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    const deals = await db.deal.findMany({
      where: { businessId: context.businessId },
      include: { customer: { select: { id: true, name: true, email: true } }, items: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({
      deals: deals.map((deal) => ({
        ...deal,
        totalMinor: deal.totalMinor.toString(),
        items: deal.items.map((item) => ({ ...item, unitMinor: item.unitMinor.toString() })),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    const input = dealSchema.parse(await request.json());
    const customer = await db.customer.findFirst({
      where: { id: input.customerId, businessId: context.businessId },
      select: { id: true },
    });
    if (!customer) return jsonError("Customer was not found for this business.", 404);

    const items = input.items.map((item) => ({
      ...item,
      unitMinor: parseMoneyToMinorUnits(item.unitAmount),
    }));
    const totalMinor = items.reduce((sum, item) => sum + item.unitMinor * BigInt(item.quantity), 0n);
    const referencePrefix = input.type === "QUOTE" ? "QTE" : "INV";
    const reference = `${referencePrefix}-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const deal = await db.$transaction(async (tx) => {
      const created = await tx.deal.create({
        data: {
          businessId: context.businessId,
          customerId: customer.id,
          reference,
          type: input.type,
          description: input.description,
          totalMinor,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          items: { create: items.map(({ description, quantity, unitMinor }) => ({ description, quantity, unitMinor })) },
        },
        include: { customer: { select: { id: true, name: true, email: true } }, items: true },
      });
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "deal.created",
          recordType: "Deal",
          recordId: created.id,
        },
      });
      return created;
    });

    dispatchWebhook(context.businessId, "deal.created", {
      id: deal.id,
      reference: deal.reference,
      type: deal.type,
      status: deal.status,
      totalMinor: deal.totalMinor.toString(),
    });

    return NextResponse.json({
      deal: {
        ...deal,
        totalMinor: deal.totalMinor.toString(),
        items: deal.items.map((item) => ({ ...item, unitMinor: item.unitMinor.toString() })),
      },
    }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
