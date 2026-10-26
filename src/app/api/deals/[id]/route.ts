import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { dealStatusSchema } from "@/lib/validation";
import { dispatchWebhook } from "@/lib/webhooks";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, route: RouteContext) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    const { id } = await route.params;
    const input = dealStatusSchema.parse(await request.json());
    const existing = await db.deal.findFirst({
      where: { id, businessId: context.businessId },
      select: { id: true, status: true },
    });
    if (!existing) return jsonError("Deal was not found.", 404);

    const deal = await db.$transaction(async (tx) => {
      const updated = await tx.deal.update({
        where: { id },
        data: { status: input.status },
        select: { id: true, reference: true, type: true, status: true, updatedAt: true },
      });
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "deal.status_updated",
          recordType: "Deal",
          recordId: id,
          details: { from: existing.status, to: input.status },
        },
      });
      return updated;
    });

    dispatchWebhook(context.businessId, "deal.status_updated", {
      id: deal.id,
      reference: deal.reference,
      status: deal.status,
    });

    return NextResponse.json({ deal: { ...deal, updatedAt: deal.updatedAt.toISOString() } });
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
    const existing = await db.deal.findFirst({
      where: { id, businessId: context.businessId },
      select: { id: true, reference: true, type: true },
    });
    if (!existing) return jsonError("Deal was not found.", 404);

    await db.$transaction(async (tx) => {
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "deal.deleted",
          recordType: "Deal",
          recordId: id,
          details: { reference: existing.reference, type: existing.type },
        },
      });
      await tx.deal.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
