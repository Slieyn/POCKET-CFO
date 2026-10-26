import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertSameOrigin, handleRouteError, jsonError } from "@/lib/http";
import { allowRequest } from "@/lib/rate-limit";
import { parseTaskRange, serializeTask, taskInclude } from "@/lib/tasks";
import { taskCreateSchema } from "@/lib/validation";
import { dispatchWebhook } from "@/lib/webhooks";

export async function GET(request: Request) {
  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);

    const range = parseTaskRange(new URL(request.url).searchParams);
    if ("error" in range) return jsonError(range.error, 400);

    const [tasks, members] = await Promise.all([
      db.task.findMany({
        where: {
          businessId: context.businessId,
          scheduledFor: { gte: range.from, lt: range.to },
        },
        include: taskInclude,
        orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
        take: 1000,
      }),
      db.membership.findMany({
        where: { businessId: context.businessId },
        orderBy: { user: { name: "asc" } },
        select: {
          role: true,
          userId: true,
          user: { select: { name: true, email: true } },
        },
      }),
    ]);

    return NextResponse.json({
      tasks: tasks.map(serializeTask),
      members: members.map((member) => ({
        id: member.userId,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
      })),
      currentUserId: context.userId,
      role: context.role,
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
    if (!allowRequest(`tasks:write:${context.userId}`, 60, 60_000)) {
      return jsonError("Too many task changes. Please wait a moment and try again.", 429);
    }

    const input = taskCreateSchema.parse(await request.json());

    if (input.assignedToId) {
      const member = await db.membership.findFirst({
        where: { businessId: context.businessId, userId: input.assignedToId },
        select: { id: true },
      });
      if (!member) return jsonError("That teammate is not part of this workspace.", 400);
    }

    const task = await db.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          businessId: context.businessId,
          createdById: context.userId,
          title: input.title,
          notes: input.notes || null,
          scheduledFor: new Date(input.scheduledFor),
          allDay: input.allDay,
          durationMinutes: input.durationMinutes,
          priority: input.priority,
          assignedToId: input.assignedToId || null,
        },
        include: taskInclude,
      });
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "task.created",
          recordType: "Task",
          recordId: created.id,
          details: { title: created.title, scheduledFor: created.scheduledFor.toISOString() },
        },
      });
      return created;
    });

    dispatchWebhook(context.businessId, "task.created", {
      id: task.id,
      title: task.title,
      scheduledFor: task.scheduledFor.toISOString(),
      priority: task.priority,
    });

    return NextResponse.json({ task: serializeTask(task) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
