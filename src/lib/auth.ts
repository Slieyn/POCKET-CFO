import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

const SESSION_COOKIE = "pocketcfo_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  await db.session.create({
    data: { id: hashSessionToken(token), userId, expiresAt },
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { id: hashSessionToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getBusinessContext() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { id: hashSessionToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            orderBy: { createdAt: "asc" },
            take: 1,
            include: { business: true },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) await db.session.delete({ where: { id: session.id } });
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  const membership = session.user.memberships[0];
  if (!membership) return null;
  return {
    userId: session.user.id,
    userName: session.user.name,
    userEmail: session.user.email,
    membershipId: membership.id,
    role: membership.role,
    businessId: membership.businessId,
    businessName: membership.business.name,
  };
}
