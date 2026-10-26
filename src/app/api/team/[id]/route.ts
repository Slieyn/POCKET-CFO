import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { allowRequest } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, route: RouteContext) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    if (context.role !== "OWNER") {
      return jsonError("Only the workspace owner can remove team members.", 403);
    }
    if (!allowRequest(`team-remove:${context.businessId}`, 20, 60 * 60_000)) {
      return jsonError("Too many team changes. Try again later.", 429);
    }

    const { id } = await route.params;
    const membership = await db.membership.findFirst({
      where: { id, businessId: context.businessId },
      select: {
        id: true,
        role: true,
        userId: true,
        user: {
          select: {
            name: true,
            email: true,
            memberships: { select: { id: true } },
          },
        },
      },
    });
    if (!membership) return jsonError("That team member could not be found.", 404);
    if (membership.role === "OWNER") {
      return jsonError("The workspace owner cannot be removed here.", 400);
    }

    await db.$transaction(async (tx) => {
      await tx.membership.delete({ where: { id: membership.id } });
      if (membership.user.memberships.length <= 1) {
        await tx.user.delete({ where: { id: membership.userId } });
      }
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "team.member_removed",
          recordType: "Membership",
          recordId: membership.id,
          details: { email: membership.user.email, role: membership.role },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
