"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { Icon, type IconName } from "./icons";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export function Badge({ children, tone = "neutral", dot = false }: { children: ReactNode; tone?: Tone; dot?: boolean }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return <span className={`avatar avatar-${size}`} aria-hidden="true">{letters || "G"}</span>;
}

export function EmptyState({
  icon = "sparkles",
  title,
  text,
  action,
}: {
  icon?: IconName;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} size={22} /></span>
      <strong>{title}</strong>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("modal-open");
    const focusTarget = panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
    window.setTimeout(() => focusTarget?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("modal-open");
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        ref={panelRef}
      >
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose} size="sm">
      <p className="confirm-message">{message}</p>
      <div className="button-row end">
        <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
        <button className="button danger" type="button" onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

export type ToastItem = { id: string; tone: "success" | "error" | "info"; message: string };

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), 5200);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.id]);

  return (
    <div className={`toast toast-${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
      <span className="toast-icon">
        <Icon name={toast.tone === "success" ? "check" : toast.tone === "error" ? "alert" : "sparkles"} size={17} />
      </span>
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close" type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

export function Skeleton({ height = "1rem", width = "100%" }: { height?: string; width?: string }) {
  return <span className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

const LOADING_MESSAGES = [
  "Opening your workspace…",
  "Gathering your numbers…",
  "Checking cash flow…",
  "Getting your plan ready…",
];

export function LoadingScreen() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % LOADING_MESSAGES.length);
    }, 1500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-busy="true">
      <span className="loading-orb loading-orb-a" aria-hidden="true" />
      <span className="loading-orb loading-orb-b" aria-hidden="true" />
      <div className="loading-card">
        <div className="loading-mark">
          <span className="loading-halo" aria-hidden="true" />
          <BrandMark size={96} animated title="POCKET CFO" />
        </div>
        <p className="loading-wordmark brand-word">POCKET <strong>CFO</strong></p>
        <p className="loading-tagline">Know your numbers. Grow your business.</p>
        <span className="loading-progress" aria-hidden="true"><span /></span>
        <p className="loading-status" aria-hidden="true">{LOADING_MESSAGES[messageIndex]}</p>
        <span className="sr-only">Loading your POCKET CFO workspace.</span>
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  helper,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper?: ReactNode;
  icon?: IconName;
  tone?: "neutral" | "income" | "expense" | "accent";
}) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-top">
        <span>{label}</span>
        {icon && <span className="stat-icon"><Icon name={icon} size={17} /></span>}
      </div>
      <strong>{value}</strong>
      {helper && <div className="stat-helper">{helper}</div>}
    </article>
  );
}

export function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="delta neutral">No prior month</span>;
  }
  const rounded = Math.round(value);
  if (rounded === 0) return <span className="delta neutral">No change</span>;
  const positive = invert ? rounded < 0 : rounded > 0;
  return (
    <span className={`delta ${positive ? "good" : "bad"}`}>
      <Icon name={rounded > 0 ? "arrowUp" : "arrowDown"} size={13} />
      {Math.abs(rounded)}% vs last month
    </span>
  );
}
