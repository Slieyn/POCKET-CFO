import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertSameOrigin, handleRouteError, jsonError } from "@/lib/http";
import { allowRequest } from "@/lib/rate-limit";
import { serializeTask, taskInclude } from "@/lib/tasks";
import { taskUpdateSchema } from "@/lib/validation";
import { dispatchWebhook } from "@/lib/webhooks";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, route: RouteContext) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    if (!allowRequest(`tasks:write:${context.userId}`, 60, 60_000)) {
      return jsonError("Too many task changes. Please wait a moment and try again.", 429);
    }

    const { id } = await route.params;
    const input = taskUpdateSchema.parse(await request.json());
    const existing = await db.task.findFirst({
      where: { id, businessId: context.businessId },
      select: { id: true, status: true, completedAt: true },
    });
    if (!existing) return jsonError("Task was not found.", 404);

    if (input.assignedToId) {
      const member = await db.membership.findFirst({
        where: { businessId: context.businessId, userId: input.assignedToId },
        select: { id: true },
      });
      if (!member) return jsonError("That teammate is not part of this workspace.", 400);
    }

    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.notes !== undefined) data.notes = input.notes || null;
    if (input.scheduledFor !== undefined) data.scheduledFor = new Date(input.scheduledFor);
    if (input.allDay !== undefined) data.allDay = input.allDay;
    if (input.durationMinutes !== undefined) data.durationMinutes = input.durationMinutes;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.assignedToId !== undefined) data.assignedToId = input.assignedToId;
    if (input.status !== undefined) {
      data.status = input.status;
      data.completedAt =
        input.status === "DONE" ? (existing.completedAt ?? new Date()) : null;
    }

    const completed = input.status === "DONE" && existing.status !== "DONE";
    const reopened = input.status === "TODO" && existing.status === "DONE";
    const action = completed ? "task.completed" : reopened ? "task.reopened" : "task.updated";

    const task = await db.$transaction(async (tx) => {
      const updated = await tx.task.update({ where: { id }, data, include: taskInclude });
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action,
          recordType: "Task",
          recordId: id,
          details: { title: updated.title },
        },
      });
      return updated;
    });

    if (completed) {
      dispatchWebhook(context.businessId, "task.completed", {
        id: task.id,
        title: task.title,
        completedAt: task.completedAt?.toISOString() ?? new Date().toISOString(),
      });
    }

    return NextResponse.json({ task: serializeTask(task) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, route: RouteContext) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    if (!allowRequest(`tasks:write:${context.userId}`, 60, 60_000)) {
      return jsonError("Too many task changes. Please wait a moment and try again.", 429);
    }

    const { id } = await route.params;
    const existing = await db.task.findFirst({
      where: { id, businessId: context.businessId },
      select: { id: true, title: true },
    });
    if (!existing) return jsonError("Task was not found.", 404);

    await db.$transaction(async (tx) => {
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "task.deleted",
          recordType: "Task",
          recordId: id,
          details: { title: existing.title },
        },
      });
      await tx.task.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
