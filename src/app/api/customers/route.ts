import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { customerSchema } from "@/lib/validation";
import { dispatchWebhook } from "@/lib/webhooks";

export async function GET() {
  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    const customers = await db.customer.findMany({
      where: { businessId: context.businessId },
      include: { deals: { select: { id: true, reference: true, type: true, status: true, totalMinor: true, createdAt: true } } },
      orderBy: { name: "asc" },
      take: 200,
    });
    return NextResponse.json({
      customers: customers.map((customer) => ({
        ...customer,
        deals: customer.deals.map((deal) => ({ ...deal, totalMinor: deal.totalMinor.toString() })),
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
    const input = customerSchema.parse(await request.json());
    const customer = await db.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: { businessId: context.businessId, ...input },
        select: { id: true, name: true, email: true, createdAt: true },
      });
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "customer.created",
          recordType: "Customer",
          recordId: created.id,
        },
      });
      return created;
    });
    dispatchWebhook(context.businessId, "customer.created", {
      id: customer.id,
      name: customer.name,
    });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
