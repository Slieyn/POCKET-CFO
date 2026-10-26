const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 400;

type SerializableTask = {
  id: string;
  title: string;
  notes: string | null;
  scheduledFor: Date;
  allDay: boolean;
  durationMinutes: number;
  priority: string;
  status: string;
  completedAt: Date | null;
  createdById: string;
  createdAt: Date;
  assignedTo: { id: string; name: string } | null;
};

export const taskInclude = {
  assignedTo: { select: { id: true, name: true } },
} as const;

export function serializeTask(task: SerializableTask) {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    scheduledFor: task.scheduledFor.toISOString(),
    allDay: task.allDay,
    durationMinutes: task.durationMinutes,
    priority: task.priority,
    status: task.status,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdById: task.createdById,
    createdAt: task.createdAt.toISOString(),
    assignedTo: task.assignedTo,
  };
}

/**
 * The calendar asks for an explicit window so a long-lived workspace never
 * downloads its entire task history. The window is capped to keep queries and
 * responses predictable.
 */
export function parseTaskRange(params: URLSearchParams): { from: Date; to: Date } | { error: string } {
  const now = Date.now();
  const rawFrom = params.get("from");
  const rawTo = params.get("to");
  const from = rawFrom ? new Date(rawFrom) : new Date(now - 60 * DAY_MS);
  const to = rawTo ? new Date(rawTo) : new Date(now + 120 * DAY_MS);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { error: "The calendar date range is not valid." };
  }
  if (to <= from) {
    return { error: "The calendar date range must end after it starts." };
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    return { error: `Choose a calendar range of ${MAX_RANGE_DAYS} days or less.` };
  }
  return { from, to };
}
