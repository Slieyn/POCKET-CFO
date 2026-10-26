"use client";

import { useEffect, useState } from "react";
import { CategoryBars, ScoreRing } from "./charts";
import { Icon } from "./icons";
import { Avatar, Badge, EmptyState } from "./ui";
import { api } from "@/lib/api";
import { exportTransactionsCsv } from "@/lib/csv-export";
import { formatMinor, formatMonth, relativeTime } from "@/lib/format";
import type { AuditEvent, Dashboard, Tab, Transaction } from "@/lib/types";

const ACTION_LABELS: Record<string, string> = {
  "transaction.created": "Transaction recorded",
  "transaction.updated": "Transaction updated",
  "transaction.deleted": "Transaction deleted",
  "customer.created": "Customer added",
  "customer.updated": "Customer updated",
  "customer.deleted": "Customer deleted",
  "deal.created": "Quote or invoice created",
  "deal.status_updated": "Document status changed",
  "deal.deleted": "Document deleted",
  "budget.updated": "Budget plan updated",
  "business.updated": "Business profile updated",
  "business.created": "Workspace created",
  "account.password_changed": "Password changed",
  "bank_statement.imported": "Bank statement imported",
  "integration.updated": "Integration connected",
  "integration.tested": "Integration tested",
  "integration.test_failed": "Integration test failed",
  "integration.disconnected": "Integration disconnected",
  "demo.workspace_opened": "Demo workspace opened",
  "demo.sample_data_added": "Sample data added",
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ");
}

export function ReportsView({
  dashboard,
  transactions,
  businessName,
  onNavigate,
  notify,
}: {
  dashboard: Dashboard;
  transactions: Transaction[];
  businessName: string;
  onNavigate: (tab: Tab) => void;
  notify: (tone: "success" | "error" | "info", message: string) => void;
}) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const completed = dashboard.checklist.filter((item) => item.done).length;

  useEffect(() => {
    let active = true;
    api.audit()
      .then((result) => {
        if (active) setEvents(result.events);
      })
      .catch((error: unknown) => {
        if (active) notify("error", error instanceof Error ? error.message : "Could not load the audit trail.");
      })
      .finally(() => {
        if (active) setLoadingAudit(false);
      });
    return () => {
      active = false;
    };
  }, [notify]);

  const month = dashboard.month;
  const previous = dashboard.previousMonth;

  return (
    <div className="view-stack report-view">
      <section className="toolbar">
        <div className="filter-group">
          <span className="report-period"><Icon name="calendar" size={16} />{formatMonth(month.key)}</span>
          <Badge tone="info">Live from your records</Badge>
        </div>
        <div className="button-row wrap">
          <button className="button secondary" type="button" onClick={() => exportTransactionsCsv(transactions, businessName)}>
            <Icon name="download" size={16} /> Transactions CSV
          </button>
          <a className="button secondary" href="/api/export">
            <Icon name="download" size={16} /> Full backup
          </a>
          <button className="button secondary" type="button" onClick={() => window.print()}>
            <Icon name="print" size={16} /> Print report
          </button>
        </div>
      </section>

      <section className="report-hero">
        <div className="report-hero-copy">
          <span className="eyebrow">Funding readiness report · estimate only</span>
          <h2>{dashboard.guide.label}</h2>
          <p>{dashboard.guide.nextStep}</p>
          <div className="report-hero-actions">
            <button className="button primary" type="button" onClick={() => onNavigate("transactions")}>
              <Icon name="plus" size={16} /> Strengthen my records
            </button>
            <span>{completed} of {dashboard.checklist.length} readiness steps complete</span>
          </div>
        </div>
        <ScoreRing score={dashboard.guide.score} size={170} />
      </section>

      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading"><div><h2>This month vs last month</h2><p>A simple profit and cash view.</p></div></div>
          <div className="pnl-table" role="table" aria-label="Monthly profit and cash">
            <div className="pnl-row pnl-head" role="row">
              <span role="columnheader">Line</span>
              <span role="columnheader" className="align-right">{formatMonth(month.key).split(" ")[0]}</span>
              <span role="columnheader" className="align-right">{formatMonth(previous.key).split(" ")[0]}</span>
            </div>
            <div className="pnl-row" role="row">
              <span role="cell">Revenue</span>
              <span role="cell" className="align-right income">{formatMinor(month.revenueMinor)}</span>
              <span role="cell" className="align-right muted">{formatMinor(previous.revenueMinor)}</span>
            </div>
            <div className="pnl-row" role="row">
              <span role="cell">Expenses</span>
              <span role="cell" className="align-right outflow">{formatMinor(month.expensesMinor)}</span>
              <span role="cell" className="align-right muted">{formatMinor(previous.expensesMinor)}</span>
            </div>
            <div className="pnl-row" role="row">
              <span role="cell">Owner draws</span>
              <span role="cell" className="align-right">{formatMinor(month.ownerDrawMinor)}</span>
              <span role="cell" className="align-right muted">{formatMinor(previous.ownerDrawMinor)}</span>
            </div>
            <div className="pnl-row strong" role="row">
              <span role="cell">Net movement</span>
              <span role="cell" className={`align-right ${BigInt(month.netMinor) >= 0n ? "income" : "outflow"}`}>{formatMinor(month.netMinor)}</span>
              <span role="cell" className="align-right muted">{formatMinor(previous.netMinor)}</span>
            </div>
            <div className="pnl-row" role="row">
              <span role="cell">Estimated cash position</span>
              <span role="cell" className="align-right">{formatMinor(month.estimatedCashMinor)}</span>
              <span role="cell" className="align-right muted">—</span>
            </div>
          </div>
          <p className="panel-footnote">Net movement is revenue minus expenses and owner draws for the month. Cash position includes all recorded activity.</p>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><h2>Readiness checklist</h2><p>What strengthens a funding conversation.</p></div><Badge tone={completed === dashboard.checklist.length ? "success" : "warning"}>{completed}/{dashboard.checklist.length}</Badge></div>
          <ul className="report-checklist">
            {dashboard.checklist.map((item) => (
              <li key={item.id} className={item.done ? "done" : ""}>
                <span className="check-dot"><Icon name={item.done ? "check" : "alert"} size={13} /></span>
                <span><strong>{item.label}</strong><small>{item.hint}</small></span>
                <em>{item.done ? "Done" : "To do"}</em>
              </li>
            ))}
          </ul>
          <p className="panel-footnote">{dashboard.disclaimer}</p>
        </article>
      </section>

      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading"><div><h2>Six-month record</h2><p>Revenue, expenses, draws and net.</p></div></div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Month</th><th className="align-right">Revenue</th><th className="align-right">Expenses</th><th className="align-right">Draws</th><th className="align-right">Net</th></tr></thead>
              <tbody>
                {dashboard.series.map((entry) => (
                  <tr key={entry.month}>
                    <td>{entry.fullLabel}</td>
                    <td className="align-right income">{formatMinor(entry.revenueMinor, { cents: false })}</td>
                    <td className="align-right outflow">{formatMinor(entry.expensesMinor, { cents: false })}</td>
                    <td className="align-right">{formatMinor(entry.ownerDrawMinor, { cents: false })}</td>
                    <td className={`align-right ${BigInt(entry.netMinor) >= 0n ? "income" : "outflow"}`}>{formatMinor(entry.netMinor, { cents: false })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <div className="stacked-panels">
          <article className="panel">
            <div className="panel-heading"><div><h2>Expense mix</h2><p>{formatMonth(month.key)}</p></div></div>
            <CategoryBars categories={dashboard.categories} />
          </article>
          <article className="panel">
            <div className="panel-heading"><div><h2>Top customers</h2><p>By income recorded.</p></div></div>
            {dashboard.topCustomers.length === 0 ? (
              <p className="muted">Link income to customers to see this list.</p>
            ) : (
              <ul className="top-customers">
                {dashboard.topCustomers.map((customer) => (
                  <li key={customer.id}>
                    <Avatar name={customer.name} size="sm" />
                    <span><strong>{customer.name}</strong><small>{customer.count} payment{customer.count === 1 ? "" : "s"}</small></span>
                    <b>{formatMinor(customer.revenueMinor, { cents: false })}</b>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      </section>

      <section className="panel audit-panel">
        <div className="panel-heading">
          <div><h2>Audit trail</h2><p>A plain-language history of changes in this workspace.</p></div>
          <Badge tone="neutral"><Icon name="shield" size={13} /> Tamper-evident log</Badge>
        </div>
        {loadingAudit ? (
          <p className="muted">Loading activity…</p>
        ) : events.length === 0 ? (
          <EmptyState icon="clock" title="No activity yet" text="Changes you make will appear here for your records." />
        ) : (
          <ol className="timeline">
            {events.map((event) => (
              <li key={event.id}>
                <span className="timeline-dot"><Icon name="clock" size={13} /></span>
                <div>
                  <strong>{actionLabel(event.action)}</strong>
                  <small>{event.actorName} · {relativeTime(event.createdAt)} · {event.recordType}</small>
                  {typeof (event.details as { fileName?: unknown } | null)?.fileName === "string" && (
                    <span className="timeline-detail">
                      {String((event.details as { fileName?: unknown }).fileName ?? "")}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="fine-print">
        POCKET CFO reports are generated from the transactions and documents you record. They are not audited financial
        statements. Keep supporting documents for tax and funding purposes.
      </p>
    </div>
  );
}
