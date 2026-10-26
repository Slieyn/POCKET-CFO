import { NextResponse } from "next/server";
import { createSession, getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";
import { allowRequest } from "@/lib/rate-limit";
import { passwordChangeSchema } from "@/lib/validation";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    if (!allowRequest(`password:${context.userId}`, 5, 15 * 60_000)) {
      return jsonError("Too many password attempts. Try again shortly.", 429);
    }

    const input = passwordChangeSchema.parse(await request.json());
    const user = await db.user.findUnique({
      where: { id: context.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) return jsonError("Sign in is required.", 401);
    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) return jsonError("Your current password is incorrect.", 401);

    const passwordHash = await hashPassword(input.newPassword);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: user.id,
          action: "account.password_changed",
          recordType: "User",
          recordId: user.id,
        },
      });
    });

    await createSession(user.id);
    return NextResponse.json({ ok: true, message: "Password updated. Other sessions have been signed out." });
  } catch (error) {
    return handleRouteError(error);
  }
}
