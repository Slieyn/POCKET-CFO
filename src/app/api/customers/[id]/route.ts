import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { customerUpdateSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, route: RouteContext) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    const { id } = await route.params;
    const input = customerUpdateSchema.parse(await request.json());
    const existing = await db.customer.findFirst({
      where: { id, businessId: context.businessId },
      select: { id: true },
    });
    if (!existing) return jsonError("Customer was not found.", 404);

    const customer = await db.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id },
        data: input,
        select: { id: true, name: true, email: true },
      });
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "customer.updated",
          recordType: "Customer",
          recordId: id,
        },
      });
      return updated;
    });

    return NextResponse.json({ customer });
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
    const customer = await db.customer.findFirst({
      where: { id, businessId: context.businessId },
      select: { id: true, name: true, _count: { select: { deals: true } } },
    });
    if (!customer) return jsonError("Customer was not found.", 404);
    if (customer._count.deals > 0) {
      return jsonError(
        "This customer has quotes or invoices attached. Keep the customer so those documents stay accurate.",
        409,
      );
    }

    await db.$transaction(async (tx) => {
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "customer.deleted",
          recordType: "Customer",
          recordId: id,
          details: { name: customer.name },
        },
      });
      await tx.customer.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
