"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Icon } from "./icons";
import { Badge, ConfirmDialog, EmptyState } from "./ui";
import { api } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import type { Task, TaskMember, TaskPriority, TaskStatus } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const PRIORITY_TONE: Record<TaskPriority, "neutral" | "info" | "warning"> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function timeInput(value: string) {
  const date = new Date(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatLongDay(key: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseDayKey(key));
}

function formatShortDay(key: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parseDayKey(key));
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function suggestedTime(key: string) {
  const today = new Date();
  if (key !== dayKey(today)) return "09:00";
  const next = new Date(today);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() <= 30 ? 30 : 60);
  if (dayKey(next) !== dayKey(today)) return "23:00";
  return `${pad(next.getHours())}:${pad(next.getMinutes())}`;
}

function compareTasks(a: Task, b: Task) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime();
}

function taskDayKey(task: Task) {
  return dayKey(new Date(task.scheduledFor));
}

function plural(count: number, singular: string, pluralWord = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

export function CalendarView({
  notify,
}: {
  notify: (tone: "success" | "error" | "info", message: string) => void;
}) {
  const today = new Date();
  const todayKey = dayKey(today);

  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const dayPanelRef = useRef<HTMLElement>(null);

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  const gridStart = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    return addDays(first, -((first.getDay() + 6) % 7));
  }, [viewYear, viewMonth]);

  const weeks = useMemo(
    () =>
      Array.from({ length: 6 }, (_, week) =>
        Array.from({ length: 7 }, (_, day) => addDays(gridStart, week * 7 + day)),
      ),
    [gridStart],
  );

  const range = useMemo(() => {
    const gridEnd = addDays(gridStart, 42);
    const todayStart = startOfDay(new Date());
    return {
      from: new Date(Math.min(gridStart.getTime(), addDays(todayStart, -35).getTime())),
      to: new Date(Math.max(gridEnd.getTime(), addDays(todayStart, 45).getTime())),
    };
  }, [gridStart]);
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  useEffect(() => {
    let active = true;
    api.task
      .list(fromIso, toIso)
      .then((payload) => {
        if (!active) return;
        setTasks(payload.tasks);
        setMembers(payload.members);
        setCurrentUserId(payload.currentUserId);
        setError("");
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your calendar.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fromIso, toIso, reloadToken]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = taskDayKey(task);
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort(compareTasks);
    return map;
  }, [tasks]);

  const selectedTasks = tasksByDay.get(selectedKey) ?? [];
  const selectedOpen = selectedTasks.filter((task) => task.status === "TODO").length;
  const selectedDone = selectedTasks.length - selectedOpen;
  const selectedPercent = selectedTasks.length === 0 ? 0 : Math.round((selectedDone / selectedTasks.length) * 100);

  const openTasks = useMemo(() => tasks.filter((task) => task.status === "TODO"), [tasks]);
  const overdue = useMemo(
    () =>
      openTasks
        .filter((task) => taskDayKey(task) < todayKey)
        .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()),
    [openTasks, todayKey],
  );
  const todayOpen = (tasksByDay.get(todayKey) ?? []).filter((task) => task.status === "TODO").length;
  const todayTotal = (tasksByDay.get(todayKey) ?? []).length;

  const nextSeven = useMemo(() => {
    const endKey = dayKey(addDays(startOfDay(new Date()), 8));
    return openTasks.filter((task) => {
      const key = taskDayKey(task);
      return key >= todayKey && key < endKey;
    }).length;
  }, [openTasks, todayKey]);

  const monthPrefix = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  const doneThisMonth = useMemo(
    () =>
      tasks.filter(
        (task) => task.status === "DONE" && dayKey(new Date(task.completedAt ?? task.scheduledFor)).startsWith(monthPrefix),
      ).length,
    [monthPrefix, tasks],
  );

  const upcomingGroups = useMemo(() => {
    const start = addDays(startOfDay(new Date()), 1);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(start, index);
      const key = dayKey(date);
      return {
        key,
        label: formatShortDay(key),
        tasks: (tasksByDay.get(key) ?? []).filter((task) => task.status === "TODO").slice(0, 3),
      };
    }).filter((group) => group.tasks.length > 0);
  }, [tasksByDay]);

  const monthLabel = new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric" }).format(
    new Date(viewYear, viewMonth, 1),
  );

  function selectDay(key: string) {
    const date = parseDayKey(key);
    setSelectedKey(key);
    setEditing(null);
    setAllDay(false);
    if (date.getFullYear() !== viewYear || date.getMonth() !== viewMonth) {
      setLoading(true);
      setViewDate(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }

  function goToToday() {
    const now = new Date();
    if (now.getFullYear() !== viewYear || now.getMonth() !== viewMonth) setLoading(true);
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedKey(dayKey(now));
    setEditing(null);
    setAllDay(false);
  }

  function changeMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setLoading(true);
    setViewDate(next);
    const selectedDate = parseDayKey(selectedKey);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    setSelectedKey(dayKey(new Date(next.getFullYear(), next.getMonth(), Math.min(selectedDate.getDate(), lastDay))));
    setEditing(null);
    setAllDay(false);
  }

  function focusComposer() {
    dayPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => titleRef.current?.focus(), 120);
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLButtonElement>, key: string) {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key === "Home") {
      event.preventDefault();
      goToToday();
      window.setTimeout(() => {
        document.querySelector<HTMLButtonElement>(`[data-day="${todayKey}"]`)?.focus();
      }, 60);
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const next = addDays(parseDayKey(key), move);
    selectDay(dayKey(next));
    window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>(`[data-day="${dayKey(next)}"]`)?.focus();
    }, 80);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    if (!title) {
      notify("error", "Add a title for this task.");
      return;
    }

    const scheduled = parseDayKey(selectedKey);
    if (allDay) {
      scheduled.setHours(0, 0, 0, 0);
    } else {
      const [hours, minutes] = String(data.get("time") ?? "09:00").split(":").map(Number);
      scheduled.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    }

    const payload = {
      title,
      notes: String(data.get("notes") ?? "").trim() || null,
      scheduledFor: scheduled.toISOString(),
      allDay,
      durationMinutes: Number(data.get("durationMinutes") ?? 30),
      priority: (String(data.get("priority") ?? "MEDIUM") || "MEDIUM") as TaskPriority,
      assignedToId: String(data.get("assignedToId") ?? "") || null,
    };

    setSaving(true);
    try {
      if (editing) {
        const result = await api.task.update(editing.id, payload);
        setTasks((current) => current.map((task) => (task.id === result.task.id ? result.task : task)));
        notify("success", "Task updated.");
        setEditing(null);
      } else {
        const result = await api.task.create(payload);
        setTasks((current) => [...current, result.task]);
        notify("success", "Task added to your plan.");
      }
      form.reset();
      setAllDay(false);
      window.setTimeout(() => titleRef.current?.focus(), 30);
    } catch (cause) {
      notify("error", cause instanceof Error ? cause.message : "Could not save the task.");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditing(null);
    setAllDay(false);
  }

  async function toggleTask(task: Task) {
    const nextStatus: TaskStatus = task.status === "DONE" ? "TODO" : "DONE";
    try {
      const result = await api.task.update(task.id, { status: nextStatus });
      setTasks((current) => current.map((item) => (item.id === result.task.id ? result.task : item)));
      if (nextStatus === "DONE") celebrate();
    } catch (cause) {
      notify("error", cause instanceof Error ? cause.message : "Could not update the task.");
    }
  }

  async function moveToToday(task: Task) {
    const original = new Date(task.scheduledFor);
    const target = startOfDay(new Date());
    if (task.allDay) {
      target.setHours(0, 0, 0, 0);
    } else {
      target.setHours(original.getHours(), original.getMinutes(), 0, 0);
    }
    try {
      const result = await api.task.update(task.id, { scheduledFor: target.toISOString() });
      setTasks((current) => current.map((item) => (item.id === result.task.id ? result.task : item)));
      notify("success", "Task moved to today.");
    } catch (cause) {
      notify("error", cause instanceof Error ? cause.message : "Could not reschedule the task.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.task.remove(deleting.id);
      setTasks((current) => current.filter((task) => task.id !== deleting.id));
      if (editing?.id === deleting.id) setEditing(null);
      notify("success", "Task deleted.");
      setDeleting(null);
    } catch (cause) {
      notify("error", cause instanceof Error ? cause.message : "Could not delete the task.");
    } finally {
      setDeleteBusy(false);
    }
  }

  const defaultTime = editing && !editing.allDay ? timeInput(editing.scheduledFor) : suggestedTime(selectedKey);
  const formKey = `${editing?.id ?? "new"}-${selectedKey}-${currentUserId}`;

  return (
    <div className="view-stack calendar-view">
      <section className="summary-strip" aria-label="Calendar summary">
        <div>
          <span>Today</span>
          <strong>{todayOpen} open</strong>
          <small>{plural(todayTotal, "task")} planned</small>
        </div>
        <div>
          <span>Overdue</span>
          <strong className={overdue.length ? "outflow" : "income"}>{overdue.length}</strong>
          <small>{overdue.length ? "Needs rescheduling" : "Nothing overdue"}</small>
        </div>
        <div>
          <span>Next 7 days</span>
          <strong>{nextSeven}</strong>
          <small>Open tasks</small>
        </div>
        <div>
          <span>Done this month</span>
          <strong>{doneThisMonth}</strong>
          <small>Tasks completed</small>
        </div>
        <div className="summary-action">
          <button className="button primary" type="button" onClick={focusComposer}>
            <Icon name="plus" size={16} /> New task
          </button>
        </div>
      </section>

      {error && (
        <div className="alert error calendar-error" role="alert">
          <span>{error}</span>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setLoading(true);
              setReloadToken((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}

      <div className="calendar-layout">
        <section className="panel calendar-panel" aria-label="Month calendar" aria-busy={loading}>
          <header className="calendar-toolbar">
            <div>
              <span className="eyebrow">Month view</span>
              <h2>{monthLabel}</h2>
            </div>
            <div className="calendar-nav">
              <button
                className="icon-button"
                type="button"
                aria-label="Previous month"
                title="Previous month"
                onClick={() => changeMonth(-1)}
              >
                <Icon name="chevronRight" size={17} className="flip-x" />
              </button>
              <button className="button secondary small" type="button" onClick={goToToday}>
                Today
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Next month"
                title="Next month"
                onClick={() => changeMonth(1)}
              >
                <Icon name="chevronRight" size={17} />
              </button>
            </div>
          </header>

          <div className="calendar-grid" role="grid" aria-label={`${monthLabel} task calendar`}>
            <div className="calendar-weekdays" role="row">
              {WEEKDAYS.map((day) => (
                <span role="columnheader" key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-cells">
              {weeks.map((week) => (
                <div className="calendar-week" role="row" key={dayKey(week[0])}>
                  {week.map((date) => {
                    const key = dayKey(date);
                    const dayTasks = tasksByDay.get(key) ?? [];
                    const outside = date.getMonth() !== viewMonth;
                    const weekend = date.getDay() === 0 || date.getDay() === 6;
                    const open = dayTasks.filter((task) => task.status === "TODO").length;
                    return (
                      <span role="gridcell" className="calendar-cell" key={key}>
                        <button
                          type="button"
                          data-day={key}
                          className={[
                            "calendar-day",
                            outside ? "outside" : "",
                            weekend ? "weekend" : "",
                            key === todayKey ? "today" : "",
                            key === selectedKey ? "selected" : "",
                          ].filter(Boolean).join(" ")}
                          aria-pressed={key === selectedKey}
                          aria-label={`${formatLongDay(key)}, ${plural(dayTasks.length, "task")}, ${open} open`}
                          onClick={() => selectDay(key)}
                          onKeyDown={(event) => handleGridKeyDown(event, key)}
                        >
                          <span className="calendar-day-number">{date.getDate()}</span>
                          {dayTasks.length > 0 && (
                            <span className="calendar-day-tasks">
                              {dayTasks.slice(0, 2).map((task) => (
                                <span
                                  className={`calendar-task-chip priority-${task.priority.toLowerCase()}${task.status === "DONE" ? " done" : ""}`}
                                  key={task.id}
                                >
                                  <span className="calendar-task-dot" aria-hidden="true" />
                                  <span className="calendar-task-title">{task.title}</span>
                                </span>
                              ))}
                              {dayTasks.length > 2 && (
                                <span className="calendar-task-more">+{dayTasks.length - 2} more</span>
                              )}
                            </span>
                          )}
                        </button>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <footer className="calendar-legend">
            <span><span className="legend-dot priority-low" />Low</span>
            <span><span className="legend-dot priority-medium" />Medium</span>
            <span><span className="legend-dot priority-high" />High</span>
            <span className="calendar-hint">Use arrow keys to move between days.</span>
          </footer>
        </section>

        <aside className="panel day-panel" aria-label="Selected day plan" ref={dayPanelRef}>
          <header className="day-heading">
            <div>
              <span className="eyebrow">{selectedKey === todayKey ? "Today" : "Plan your day"}</span>
              <h2>{formatLongDay(selectedKey)}</h2>
              <p>
                {selectedTasks.length === 0
                  ? "Nothing planned yet."
                  : `${selectedOpen} open · ${selectedDone} done`}
              </p>
            </div>
            {selectedKey !== todayKey && (
              <button className="button secondary small" type="button" onClick={goToToday}>
                Today
              </button>
            )}
          </header>

          {selectedTasks.length > 0 && (
            <div
              className="day-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={selectedPercent}
              aria-label="Tasks completed for this day"
            >
              <span style={{ width: `${selectedPercent}%` }} />
            </div>
          )}

          <form className="form task-form" onSubmit={handleSubmit} key={formKey}>
            <label className="task-title-field">
              <span>{editing ? "Edit task" : "Add a task"}</span>
              <input
                ref={titleRef}
                id="task-title"
                name="title"
                required
                maxLength={160}
                autoComplete="off"
                placeholder={editing ? "Task title" : "e.g. Call the supplier about Friday's order"}
                defaultValue={editing?.title ?? ""}
              />
            </label>

            <div className="task-form-row">
              <label>
                Time
                <input
                  name="time"
                  type="time"
                  required={!allDay}
                  disabled={allDay}
                  defaultValue={defaultTime}
                />
              </label>
              <label>
                Duration
                <select name="durationMinutes" defaultValue={String(editing?.durationMinutes ?? 30)}>
                  {DURATIONS.map((minutes) => (
                    <option value={minutes} key={minutes}>{formatDuration(minutes)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="task-form-row">
              <label>
                Priority
                <select name="priority" defaultValue={editing?.priority ?? "MEDIUM"}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </label>
              <label>
                Assign to
                <select name="assignedToId" defaultValue={editing?.assignedTo?.id ?? currentUserId}>
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option value={member.id} key={member.id}>
                      {member.name}{member.id === currentUserId ? " (you)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="task-allday">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(event) => setAllDay(event.target.checked)}
              />
              All-day task
            </label>

            <label>
              Notes <span className="optional">optional</span>
              <textarea
                name="notes"
                rows={2}
                maxLength={1000}
                placeholder="Add context, a phone number or links…"
                defaultValue={editing?.notes ?? ""}
              />
            </label>

            <div className="button-row">
              <button className="button primary small" type="submit" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Add task"}
              </button>
              {editing && (
                <button className="button ghost small" type="button" onClick={cancelEdit}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="day-tasks">
            <div className="day-tasks-heading">
              <h3>Tasks</h3>
              {loading && <span className="calendar-syncing">Syncing…</span>}
            </div>
            {selectedTasks.length === 0 ? (
              <EmptyState
                icon="calendar"
                title="A clear day"
                text="Add your first task above to start planning this day."
              />
            ) : (
              <ul className="task-list">
                {selectedTasks.map((task) => (
                  <TaskRow
                    task={task}
                    key={task.id}
                    onToggle={() => void toggleTask(task)}
                    onEdit={() => {
                      setEditing(task);
                      setAllDay(task.allDay);
                      window.setTimeout(() => titleRef.current?.focus(), 40);
                    }}
                    onDelete={() => setDeleting(task)}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <div className="calendar-bottom">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Overdue</h2>
              <p>Open tasks from earlier days. Reschedule them to keep your plan honest.</p>
            </div>
            <Badge tone={overdue.length > 0 ? "danger" : "success"} dot>
              {overdue.length > 0 ? `${overdue.length} to clear` : "All clear"}
            </Badge>
          </div>
          {overdue.length === 0 ? (
            <p className="task-empty">No overdue tasks. You are on track.</p>
          ) : (
            <ul className="task-list compact">
              {overdue.slice(0, 6).map((task) => (
                <li className={`task-item priority-${task.priority.toLowerCase()}`} key={task.id}>
                  <button
                    className="task-check"
                    type="button"
                    aria-label={`Complete ${task.title}`}
                    onClick={() => void toggleTask(task)}
                  />
                  <div className="task-body">
                    <div className="task-top"><strong>{task.title}</strong></div>
                    <div className="task-meta">
                      <span><Icon name="calendar" size={13} />{formatShortDay(taskDayKey(task))}</span>
                      <span><Icon name="clock" size={13} />{formatTime(task.scheduledFor)}</span>
                    </div>
                  </div>
                  <button className="text-button" type="button" onClick={() => void moveToToday(task)}>
                    Move to today
                  </button>
                </li>
              ))}
            </ul>
          )}
          {overdue.length > 6 && <p className="panel-footnote">Showing 6 of {overdue.length} overdue tasks.</p>}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Coming up</h2>
              <p>The next seven days, so nothing catches you by surprise.</p>
            </div>
          </div>
          {upcomingGroups.length === 0 ? (
            <p className="task-empty">Nothing scheduled for the next seven days.</p>
          ) : (
            <div className="upcoming-groups">
              {upcomingGroups.map((group) => (
                <div className="upcoming-group" key={group.key}>
                  <button className="upcoming-date" type="button" onClick={() => selectDay(group.key)}>
                    {group.label}
                    <Icon name="chevronRight" size={13} />
                  </button>
                  <ul className="task-list compact">
                    {group.tasks.map((task) => (
                      <li className={`task-item priority-${task.priority.toLowerCase()}`} key={task.id}>
                        <button
                          className="task-check"
                          type="button"
                          aria-label={`Complete ${task.title}`}
                          onClick={() => void toggleTask(task)}
                        />
                        <div className="task-body">
                          <div className="task-top"><strong>{task.title}</strong></div>
                          <div className="task-meta">
                            <span>
                              <Icon name="clock" size={13} />
                              {task.allDay ? "All day" : formatTime(task.scheduledFor)}
                            </span>
                            {task.assignedTo && <span>{task.assignedTo.name}</span>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <p className="fine-print">
        Tasks are shared with everyone in this workspace. Every change is written to the audit trail, and
        completed tasks can wake up your connected automation through the <strong>task.completed</strong> webhook event.
      </p>

      {deleting && (
        <ConfirmDialog
          title="Delete this task?"
          message={`"${deleting.title}" will be removed from the calendar. The deletion stays in the audit trail.`}
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = task.status === "DONE";
  return (
    <li className={`task-item priority-${task.priority.toLowerCase()}${done ? " done" : ""}`}>
      <button
        className="task-check"
        type="button"
        aria-pressed={done}
        aria-label={done ? `Mark ${task.title} as not done` : `Complete ${task.title}`}
        onClick={onToggle}
      >
        {done && <Icon name="check" size={13} />}
      </button>
      <div className="task-body">
        <div className="task-top">
          <strong>{task.title}</strong>
          <Badge tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
        </div>
        <div className="task-meta">
          <span>
            <Icon name="clock" size={13} />
            {task.allDay ? "All day" : formatTime(task.scheduledFor)}
            {!task.allDay && ` · ${formatDuration(task.durationMinutes)}`}
          </span>
          {task.assignedTo && (
            <span className="task-assignee">
              <span className="avatar avatar-sm" aria-hidden="true">
                {task.assignedTo.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}
              </span>
              {task.assignedTo.name}
            </span>
          )}
        </div>
        {task.notes && <p className="task-notes">{task.notes}</p>}
      </div>
      <div className="task-actions">
        <button
          className="icon-button"
          type="button"
          aria-label={`Edit ${task.title}`}
          title="Edit task"
          onClick={onEdit}
        >
          <Icon name="edit" size={15} />
        </button>
        <button
          className="icon-button danger"
          type="button"
          aria-label={`Delete ${task.title}`}
          title="Delete task"
          onClick={onDelete}
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
    </li>
  );
}
