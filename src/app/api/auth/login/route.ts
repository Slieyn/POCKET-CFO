import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";
import { allowRequest } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

let dummyHash: Promise<string> | null = null;
function getDummyHash() {
  dummyHash ??= hashPassword("pocketcfo-timing-equaliser-9f3c");
  return dummyHash;
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowRequest(`login:${ip}`, 8)) return jsonError("Too many sign-in attempts. Try again shortly.", 429);

  try {
    const input = loginSchema.parse(await request.json());
    const user = await db.user.findUnique({ where: { email: input.email } });
    const valid = user
      ? await verifyPassword(input.password, user.passwordHash)
      : await verifyPassword(input.password, await getDummyHash());
    if (!user || !valid) return jsonError("Email or password is incorrect.", 401);
    await createSession(user.id);
    return NextResponse.json({ user: { name: user.name, email: user.email } });
  } catch (error) {
    return handleRouteError(error);
  }
}
