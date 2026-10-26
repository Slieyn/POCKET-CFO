import { describe, expect, it } from "vitest";
import { parseTaskRange } from "./tasks";
import { taskCreateSchema, taskUpdateSchema } from "./validation";

const TASK = {
  title: "Call the supplier",
  scheduledFor: "2026-10-28T09:00:00.000Z",
};

describe("task input", () => {
  it("fills in sensible planning defaults", () => {
    const parsed = taskCreateSchema.parse(TASK);
    expect(parsed.allDay).toBe(false);
    expect(parsed.durationMinutes).toBe(30);
    expect(parsed.priority).toBe("MEDIUM");
    expect(parsed.notes).toBeUndefined();
    expect(parsed.assignedToId).toBeUndefined();
  });

  it("requires a title and a real duration", () => {
    expect(() => taskCreateSchema.parse({ ...TASK, title: "   " })).toThrow();
    expect(() => taskCreateSchema.parse({ ...TASK, durationMinutes: 5 })).toThrow();
    expect(() => taskCreateSchema.parse({ ...TASK, durationMinutes: 600 })).toThrow();
  });

  it("accepts a status-only update and rejects an empty one", () => {
    expect(taskUpdateSchema.parse({ status: "DONE" })).toEqual({ status: "DONE" });
    expect(() => taskUpdateSchema.parse({})).toThrow();
  });
});

describe("calendar range", () => {
  it("defaults to a predictable window around today", () => {
    const range = parseTaskRange(new URLSearchParams());
    if ("error" in range) throw new Error(range.error);
    const days = (range.to.getTime() - range.from.getTime()) / 86_400_000;
    expect(days).toBe(180);
  });

  it("rejects invalid, inverted and oversized windows", () => {
    expect(parseTaskRange(new URLSearchParams({ from: "not-a-date" }))).toHaveProperty("error");
    expect(
      parseTaskRange(new URLSearchParams({ from: "2026-10-10", to: "2026-10-01" })),
    ).toHaveProperty("error");
    expect(
      parseTaskRange(new URLSearchParams({ from: "2025-01-01", to: "2026-12-31" })),
    ).toHaveProperty("error");
  });
});
