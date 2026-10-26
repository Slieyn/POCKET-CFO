import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { allowRequest } from "@/lib/rate-limit";
import { teamMemberSchema } from "@/lib/validation";

const TEAM_LIMIT = 20;

export async function GET() {
  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    if (context.role !== "OWNER") {
      return jsonError("Only the workspace owner can manage team access.", 403);
    }

    const memberships = await db.membership.findMany({
      where: { businessId: context.businessId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({
      role: context.role,
      members: memberships.map((membership) => ({
        id: membership.id,
        name: membership.user.name,
        email: membership.user.email,
        role: membership.role,
        joinedAt: membership.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    if (context.role !== "OWNER") {
      return jsonError("Only the workspace owner can add team members.", 403);
    }
    if (!allowRequest(`team-add:${context.businessId}`, 10, 60 * 60_000)) {
      return jsonError("Too many team changes. Try again later.", 429);
    }

    const input = teamMemberSchema.parse(await request.json());
    if (input.email === context.userEmail) {
      return jsonError("That is already your own sign-in email.", 400);
    }

    const memberCount = await db.membership.count({ where: { businessId: context.businessId } });
    if (memberCount >= TEAM_LIMIT) {
      return jsonError(`This workspace has reached the ${TEAM_LIMIT}-person team limit.`, 400);
    }

    const existingMembership = await db.membership.findFirst({
      where: { businessId: context.businessId, user: { email: input.email } },
      select: { id: true },
    });
    if (existingMembership) {
      return jsonError("That person already has access to this workspace.", 409);
    }

    const existingUser = await db.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        memberships: { select: { businessId: true } },
      },
    });
    if (existingUser && existingUser.memberships.length > 0) {
      return jsonError(
        "That email already belongs to another workspace. Use the person's own work email instead.",
        409,
      );
    }

    const member = await db.$transaction(async (tx) => {
      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: { name: input.name, passwordHash: await hashPassword(input.password) },
            select: { id: true, name: true, email: true },
          })
        : await tx.user.create({
            data: {
              name: input.name,
              email: input.email,
              passwordHash: await hashPassword(input.password),
            },
            select: { id: true, name: true, email: true },
          });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          businessId: context.businessId,
          role: input.role,
        },
        select: { id: true, role: true, createdAt: true },
      });

      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "team.member_added",
          recordType: "Membership",
          recordId: membership.id,
          details: { email: user.email, role: input.role },
        },
      });

      return {
        id: membership.id,
        name: user.name,
        email: user.email,
        role: membership.role,
        joinedAt: membership.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
