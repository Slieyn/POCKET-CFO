import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { businessSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    const input = businessSchema.parse(await request.json());

    const business = await db.$transaction(async (tx) => {
      const updated = await tx.business.update({
        where: { id: context.businessId },
        data: { name: input.name },
        select: { id: true, name: true },
      });
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "business.updated",
          recordType: "Business",
          recordId: context.businessId,
          details: { name: input.name },
        },
      });
      return updated;
    });

    return NextResponse.json({ business });
  } catch (error) {
    return handleRouteError(error);
  }
}
