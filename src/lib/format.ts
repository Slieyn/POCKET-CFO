const zar = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const decimalSeparator =
  new Intl.NumberFormat("en-ZA").formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ",";

export function formatMinor(value: string | number | bigint | null | undefined, options?: { cents?: boolean }) {
  const minor = BigInt(value ?? "0");
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const major = absolute / 100n;
  const cents = (absolute % 100n).toString().padStart(2, "0");
  const formatted = zar.format(major);
  const withCents = options?.cents === false ? formatted : `${formatted}${decimalSeparator}${cents}`;
  return `${negative ? "-" : ""}${withCents}`;
}

export function formatCompactMoney(value: string | number | bigint | null | undefined) {
  const minor = BigInt(value ?? "0");
  const major = Number(minor) / 100;
  const absolute = Math.abs(major);
  if (absolute >= 1_000_000) return `R${(major / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (absolute >= 1_000) return `R${(major / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `R${Math.round(major)}`;
}

export function formatDate(value: string | null | undefined, style: "short" | "long" = "short") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: style === "long" ? "long" : "short",
    year: "numeric",
  }).format(date);
}

export function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

export function formatMonthShort(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("en-ZA", { month: "short" }).format(new Date(year, month - 1, 1));
}

export function toDateTimeInput(value?: string) {
  if (!value) {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function toDateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} d ago`;
  return formatDate(value);
}

export function percentChange(current: string | number | bigint, previous: string | number | bigint) {
  const currentValue = Number(current);
  const previousValue = Number(previous);
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue) || previousValue === 0) return null;
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

export function daysUntil(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
