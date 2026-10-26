import { NextResponse } from "next/server";
import { clearSession, getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { verifyPassword } from "@/lib/password";
import { allowRequest } from "@/lib/rate-limit";
import { accountDeleteSchema } from "@/lib/validation";

export async function DELETE(request: Request) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    if (!allowRequest(`account-delete:${context.userId}`, 3, 60 * 60_000)) {
      return jsonError("Too many attempts. Try again later.", 429);
    }

    const input = accountDeleteSchema.parse(await request.json());
    if (input.confirmation.trim().toLowerCase() !== context.businessName.trim().toLowerCase()) {
      return jsonError("Type your business name exactly to confirm deletion.", 400);
    }

    const user = await db.user.findUnique({
      where: { id: context.userId },
      select: {
        id: true,
        passwordHash: true,
        memberships: { select: { id: true, businessId: true, role: true, business: { select: { id: true } } } },
      },
    });
    if (!user) return jsonError("Sign in is required.", 401);
    if (!(await verifyPassword(input.password, user.passwordHash))) {
      return jsonError("Your password is incorrect.", 401);
    }

    for (const membership of user.memberships) {
      if (membership.role !== "OWNER") continue;
      const otherMembers = await db.membership.count({
        where: { businessId: membership.businessId, userId: { not: user.id } },
      });
      if (otherMembers > 0) {
        return jsonError(
          "This workspace still has team members. Remove them before deleting the workspace, so no one is left without an owner.",
          409,
        );
      }
    }

    await db.$transaction(async (tx) => {
      for (const membership of user.memberships) {
        const otherMembers = await tx.membership.count({
          where: { businessId: membership.businessId, userId: { not: user.id } },
        });
        if (membership.role === "OWNER" && otherMembers === 0) {
          await tx.business.delete({ where: { id: membership.businessId } });
        } else {
          await tx.membership.delete({ where: { id: membership.id } });
        }
      }
      await tx.user.delete({ where: { id: user.id } });
    });

    await clearSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
