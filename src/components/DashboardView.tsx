"use client";

import { useState } from "react";
import { CashflowChart, CategoryBars, ScoreRing } from "./charts";
import { Icon } from "./icons";
import { Avatar, Badge, Delta, EmptyState, Stat } from "./ui";
import { formatMinor, formatMonth, percentChange, relativeTime } from "@/lib/format";
import type { BudgetSettings, Dashboard, SessionUser, Tab, Transaction } from "@/lib/types";

export function DashboardView({
  user,
  dashboard,
  transactions,
  budget,
  onNavigate,
  onSaveBudget,
  onAddTransaction,
  onAddCustomer,
  notify,
}: {
  user: SessionUser;
  dashboard: Dashboard;
  transactions: Transaction[];
  budget: BudgetSettings;
  onNavigate: (tab: Tab) => void;
  onSaveBudget: (budget: BudgetSettings) => Promise<void>;
  onAddTransaction: () => void;
  onAddCustomer: () => void;
  notify: (tone: "success" | "error" | "info", message: string) => void;
}) {
  const [draftPlan, setDraftPlan] = useState<BudgetSettings | null>(null);
  const [saving, setSaving] = useState(false);

  const plan = draftPlan ?? budget;
  const totalPercent = plan.operationsPercent + plan.reservePercent + plan.ownerDrawPercent;
  const validPlan = totalPercent === 100;
  const monthly = dashboard.month;
  const previous = dashboard.previousMonth;
  const checklistDone = dashboard.checklist.filter((item) => item.done).length;
  const latestTransaction = transactions.reduce<Transaction | null>(
    (latest, item) =>
      !latest || new Date(item.occurredAt) > new Date(latest.occurredAt) ? item : latest,
    null,
  );
  const latestActivity = latestTransaction ? relativeTime(latestTransaction.occurredAt) : null;

  async function savePlan() {
    if (!validPlan) return;
    setSaving(true);
    try {
      await onSaveBudget(plan);
      setDraftPlan(null);
      notify("success", "Budget plan saved.");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not save the budget plan.");
    } finally {
      setSaving(false);
    }
  }

  const firstName = user.name.split(/\s+/)[0] || "there";
  const recent = transactions.slice(0, 5);

  return (
    <div className="view-stack">
      <section className="welcome-row">
        <div>
          <span className="eyebrow">{formatMonth(monthly.key)} · {dashboard.business.name}</span>
          <h2>Hello, {firstName}. Here is your money story.</h2>
          <p>
            {latestActivity === null
              ? "Start with one transaction and POCKET CFO will begin building your picture."
              : `Your latest entry was ${latestActivity}. A quick update keeps your picture accurate.`}
          </p>
        </div>
        <div className="quick-actions">
          <button className="quick-action" type="button" onClick={onAddTransaction}>
            <Icon name="plus" size={18} /><span>Add transaction</span>
          </button>
          <button className="quick-action" type="button" onClick={() => onNavigate("calendar")}>
            <Icon name="calendar" size={18} /><span>Plan your day</span>
          </button>
          <button className="quick-action" type="button" onClick={() => onNavigate("deals")}>
            <Icon name="deals" size={18} /><span>New invoice</span>
          </button>
          <button className="quick-action" type="button" onClick={onAddCustomer}>
            <Icon name="customers" size={18} /><span>Add customer</span>
          </button>
        </div>
      </section>

      <section className="stats-grid" aria-label="This month's key numbers">
        <Stat
          label="Revenue this month"
          value={formatMinor(monthly.revenueMinor)}
          tone="income"
          icon="trendUp"
          helper={<Delta value={percentChange(monthly.revenueMinor, previous.revenueMinor)} />}
        />
        <Stat
          label="Expenses this month"
          value={formatMinor(monthly.expensesMinor)}
          tone="expense"
          icon="card"
          helper={<Delta value={percentChange(monthly.expensesMinor, previous.expensesMinor)} invert />}
        />
        <Stat
          label="Owner draws"
          value={formatMinor(monthly.ownerDrawMinor)}
          icon="wallet"
          helper={<Delta value={percentChange(monthly.ownerDrawMinor, previous.ownerDrawMinor)} invert />}
        />
        <Stat
          label="Estimated cash"
          value={formatMinor(monthly.estimatedCashMinor)}
          tone="accent"
          icon="bank"
          helper={
            <span className="stat-note">
              {dashboard.runwayMonths === null
                ? "All recorded income minus expenses"
                : `About ${dashboard.runwayMonths} month${dashboard.runwayMonths === 1 ? "" : "s"} of expenses covered`}
            </span>
          }
        />
      </section>

      <section className="split-grid chart-row">
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Cash flow, last six months</h2>
              <p>How money moved in and out of {dashboard.business.name}.</p>
            </div>
            <button className="text-button" type="button" onClick={() => onNavigate("reports")}>
              Open report <Icon name="chevronRight" size={15} />
            </button>
          </div>
          <CashflowChart series={dashboard.series} />
        </article>

        <article className="panel readiness-panel">
          <div className="panel-heading">
            <div>
              <h2>Funding readiness</h2>
              <p>An estimate from your own records.</p>
            </div>
            <Badge tone={dashboard.guide.score >= 75 ? "success" : dashboard.guide.score >= 45 ? "info" : "warning"}>
              {dashboard.guide.score >= 75 ? "Strong" : dashboard.guide.score >= 45 ? "Building" : "Early"}
            </Badge>
          </div>
          <div className="readiness-body">
            <ScoreRing score={dashboard.guide.score} />
            <div className="readiness-copy">
              <strong>{dashboard.guide.label}</strong>
              <p>{dashboard.guide.nextStep}</p>
            </div>
          </div>
          <div className="mini-checklist">
            {dashboard.checklist.slice(0, 4).map((item) => (
              <span key={item.id} className={item.done ? "done" : ""}>
                <Icon name={item.done ? "check" : "clock"} size={14} />
                {item.label}
              </span>
            ))}
          </div>
          <button className="button secondary full-width" type="button" onClick={() => onNavigate("reports")}>
            See the full checklist
          </button>
        </article>
      </section>

      <section className="triple-grid">
        <article className="panel budget-panel">
          <div className="panel-heading">
            <div><h2>Budget plan</h2><p>Split this month&apos;s revenue on purpose.</p></div>
          </div>
          <div className="budget-rows">
            <PercentRow label="Operations" value={plan.operationsPercent} amount={formatMinor(dashboard.budget?.operationsMinor)} tone="ops" onChange={(value) => setDraftPlan({ ...plan, operationsPercent: value })} />
            <PercentRow label="Reserve" value={plan.reservePercent} amount={formatMinor(dashboard.budget?.reserveMinor)} tone="reserve" onChange={(value) => setDraftPlan({ ...plan, reservePercent: value })} />
            <PercentRow label="Owner draw" value={plan.ownerDrawPercent} amount={formatMinor(dashboard.budget?.ownerDrawBudgetMinor)} tone="draw" onChange={(value) => setDraftPlan({ ...plan, ownerDrawPercent: value })} />
          </div>
          <div className={`budget-total ${validPlan ? "valid" : "invalid"}`}>
            <span>Total allocated</span>
            <strong>{totalPercent}%</strong>
          </div>
          <button className="button primary full-width" type="button" onClick={savePlan} disabled={saving || !validPlan}>
            {saving ? "Saving…" : validPlan ? "Save budget plan" : "Adjust to exactly 100%"}
          </button>
          <p className="panel-footnote">Planning amounts only — not separate bank balances.</p>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div><h2>Money owed to you</h2><p>Open invoices and quotes.</p></div>
            <button className="icon-button" type="button" onClick={() => onNavigate("deals")} aria-label="Open quotes and invoices">
              <Icon name="chevronRight" size={17} />
            </button>
          </div>
          <div className="money-owed">
            <div>
              <span>Outstanding</span>
              <strong>{formatMinor(dashboard.receivables.outstandingMinor)}</strong>
              <small>{dashboard.receivables.openCount} open invoice{dashboard.receivables.openCount === 1 ? "" : "s"}</small>
            </div>
            <div className={dashboard.receivables.overdueCount > 0 ? "overdue" : ""}>
              <span>Overdue</span>
              <strong>{formatMinor(dashboard.receivables.overdueMinor)}</strong>
              <small>{dashboard.receivables.overdueCount} invoice{dashboard.receivables.overdueCount === 1 ? "" : "s"} past due</small>
            </div>
          </div>
          <div className="owed-footer">
            <span><Icon name="file" size={15} />{dashboard.receivables.quoteCount} open quote{dashboard.receivables.quoteCount === 1 ? "" : "s"}</span>
            <button className="text-button" type="button" onClick={() => onNavigate("deals")}>Manage <Icon name="chevronRight" size={14} /></button>
          </div>
        </article>

        <article className="panel checklist-panel">
          <div className="panel-heading">
            <div><h2>Next best steps</h2><p>{checklistDone} of {dashboard.checklist.length} complete</p></div>
            <span className="progress-pill">{Math.round((checklistDone / dashboard.checklist.length) * 100)}%</span>
          </div>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${(checklistDone / dashboard.checklist.length) * 100}%` }} />
          </div>
          <ul className="checklist">
            {dashboard.checklist.slice(0, 4).map((item) => (
              <li key={item.id} className={item.done ? "done" : ""}>
                <span className="check-dot"><Icon name={item.done ? "check" : "chevronRight"} size={13} /></span>
                <span><strong>{item.label}</strong><small>{item.hint}</small></span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <div><h2>Recent activity</h2><p>Your five latest transactions.</p></div>
            <button className="text-button" type="button" onClick={() => onNavigate("transactions")}>
              View all <Icon name="chevronRight" size={15} />
            </button>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              icon="transactions"
              title="No transactions yet"
              text="Add your first sale or expense to start the picture."
              action={<button className="button primary" type="button" onClick={onAddTransaction}><Icon name="plus" size={16} />Add transaction</button>}
            />
          ) : (
            <div className="activity-list">
              {recent.map((transaction) => (
                <div className="activity-row" key={transaction.id}>
                  <span className={`activity-icon ${transaction.type.toLowerCase()}`}>
                    <Icon name={transaction.type === "INCOME" ? "trendUp" : transaction.type === "EXPENSE" ? "card" : "wallet"} size={17} />
                  </span>
                  <div>
                    <strong>{transaction.description}</strong>
                    <small>{transaction.category} · {relativeTime(transaction.occurredAt)}</small>
                  </div>
                  <span className={transaction.type === "INCOME" ? "amount income" : "amount outflow"}>
                    {transaction.type === "INCOME" ? "+" : "−"}{formatMinor(transaction.amountMinor)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>

        <div className="stacked-panels">
          <article className="panel">
            <div className="panel-heading">
              <div><h2>Where expenses go</h2><p>This month by category.</p></div>
            </div>
            <CategoryBars categories={dashboard.categories} />
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div><h2>Top customers</h2><p>By income recorded.</p></div>
              <button className="icon-button" type="button" onClick={() => onNavigate("customers")} aria-label="View customers">
                <Icon name="chevronRight" size={17} />
              </button>
            </div>
            {dashboard.topCustomers.length === 0 ? (
              <p className="muted">Link income to a customer to see your best relationships.</p>
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

      <p className="fine-print">{dashboard.disclaimer}</p>
    </div>
  );
}

function PercentRow({
  label,
  value,
  amount,
  tone,
  onChange,
}: {
  label: string;
  value: number;
  amount: string;
  tone: "ops" | "reserve" | "draw";
  onChange: (value: number) => void;
}) {
  return (
    <div className={`percent-row percent-${tone}`}>
      <div className="percent-label">
        <span className="percent-swatch" aria-hidden="true" />
        <span><strong>{label}</strong><small>{amount}</small></span>
      </div>
      <div className="percent-control">
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(event) => onChange(Math.max(0, Math.min(100, Number(event.target.value) || 0)))}
          aria-label={`${label} percentage`}
        />
        <span>%</span>
      </div>
    </div>
  );
}
