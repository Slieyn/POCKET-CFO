import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, jsonError } from "@/lib/http";

export async function GET() {
  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);

    const events = await db.auditEvent.findMany({
      where: { businessId: context.businessId },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    const actorIds = [...new Set(events.map((event) => event.actorId))];
    const actors = await db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true },
    });
    const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));

    return NextResponse.json({
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        recordType: event.recordType,
        recordId: event.recordId,
        details: event.details,
        actorName: actorNames.get(event.actorId) ?? "Team member",
        createdAt: event.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
