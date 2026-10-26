import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { allowRequest } from "@/lib/rate-limit";
import { addSampleBusinessData } from "@/lib/sample-data";
import { registerSchema } from "@/lib/validation";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowRequest(`register:${ip}`, 5, 15 * 60_000)) {
    return jsonError("Too many sign-up attempts. Try again shortly.", 429);
  }

  try {
    const input = registerSchema.parse(await request.json());
    const exists = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (exists) return jsonError("Unable to create this account. Check your details or sign in.", 409);

    const passwordHash = await hashPassword(input.password);
    const user = await db.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash },
      });
      const business = await tx.business.create({ data: { name: input.businessName } });
      await tx.membership.create({
        data: { userId: createdUser.id, businessId: business.id, role: "OWNER" },
      });
      await tx.budget.create({ data: { businessId: business.id } });
      await tx.auditEvent.create({
        data: {
          businessId: business.id,
          actorId: createdUser.id,
          action: "business.created",
          recordType: "Business",
          recordId: business.id,
        },
      });
      if (input.includeSampleData) {
        await addSampleBusinessData(tx, { businessId: business.id, userId: createdUser.id });
      }
      return createdUser;
    });

    await createSession(user.id);
    return NextResponse.json({
      user: { name: user.name, email: user.email },
      sampleDataAdded: input.includeSampleData,
    }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
