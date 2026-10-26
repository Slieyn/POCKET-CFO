import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { budgetSchema } from "@/lib/validation";

export async function GET() {
  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    const budget = await db.budget.findUnique({ where: { businessId: context.businessId } });
    return NextResponse.json({ budget });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    const input = budgetSchema.parse(await request.json());
    const budget = await db.$transaction(async (tx) => {
      const saved = await tx.budget.upsert({
        where: { businessId: context.businessId },
        create: { businessId: context.businessId, ...input },
        update: input,
      });
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "budget.updated",
          recordType: "Budget",
          recordId: saved.id,
          details: input,
        },
      });
      return saved;
    });
    return NextResponse.json({ budget });
  } catch (error) {
    return handleRouteError(error);
  }
}
