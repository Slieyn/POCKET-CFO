import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { allowRequest } from "@/lib/rate-limit";
import { addSampleBusinessData } from "@/lib/sample-data";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowRequest(`demo:${ip}`, 4, 15 * 60_000)) {
    return jsonError("You have opened a few demo workspaces already. Try again in a few minutes.", 429);
  }

  try {
    const suffix = crypto.randomUUID().slice(0, 10);
    const email = `demo-${suffix}@pocketcfo.demo`;
    const passwordHash = await hashPassword(crypto.randomUUID());

    const result = await db.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email, name: "Thandi Mokoena", passwordHash },
      });
      const business = await tx.business.create({
        data: { name: "Thandi's Fresh Produce" },
      });
      await tx.membership.create({
        data: { userId: createdUser.id, businessId: business.id, role: "OWNER" },
      });
      await tx.budget.create({ data: { businessId: business.id } });
      await tx.auditEvent.create({
        data: {
          businessId: business.id,
          actorId: createdUser.id,
          action: "demo.workspace_opened",
          recordType: "Business",
          recordId: business.id,
        },
      });
      await addSampleBusinessData(tx, { businessId: business.id, userId: createdUser.id });
      return { user: createdUser, business };
    });

    await createSession(result.user.id);
    return NextResponse.json({
      user: { name: "Thandi Mokoena", email },
      business: { id: result.business.id, name: result.business.name },
      demo: true,
    }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
