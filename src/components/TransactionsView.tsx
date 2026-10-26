"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Icon } from "./icons";
import { Badge, ConfirmDialog, EmptyState } from "./ui";
import { api } from "@/lib/api";
import { exportTransactionsCsv } from "@/lib/csv-export";
import { formatDate, formatMinor, formatMonthShort, toDateTimeInput } from "@/lib/format";
import type { Customer, Transaction, TransactionType } from "@/lib/types";

const TYPES: { value: TransactionType; label: string; icon: "trendUp" | "card" | "wallet" }[] = [
  { value: "INCOME", label: "Revenue", icon: "trendUp" },
  { value: "EXPENSE", label: "Expense", icon: "card" },
  { value: "OWNER_DRAW", label: "Owner draw", icon: "wallet" },
];

const TYPE_LABEL: Record<TransactionType, string> = {
  INCOME: "Revenue",
  EXPENSE: "Expense",
  OWNER_DRAW: "Owner draw",
};

const TYPE_TONE: Record<TransactionType, "success" | "danger" | "warning"> = {
  INCOME: "success",
  EXPENSE: "danger",
  OWNER_DRAW: "warning",
};

export function TransactionsView({
  transactions,
  customers,
  businessName,
  onRefresh,
  notify,
}: {
  transactions: Transaction[];
  customers: Customer[];
  businessName: string;
  onRefresh: () => Promise<void>;
  notify: (tone: "success" | "error" | "info", message: string) => void;
}) {
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | TransactionType>("ALL");
  const [monthFilter, setMonthFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [formType, setFormType] = useState<TransactionType>("INCOME");
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) return;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing]);

  const months = useMemo(() => {
    const keys = [...new Set(transactions.map((item) => item.occurredAt.slice(0, 7)))].sort().reverse();
    return keys.map((key) => ({ key, label: formatMonthShort(key) + " " + key.slice(0, 4) }));
  }, [transactions]);

  const categories = useMemo(
    () => [...new Set(transactions.map((item) => item.category))].sort((a, b) => a.localeCompare(b)),
    [transactions],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter((transaction) => {
      if (typeFilter !== "ALL" && transaction.type !== typeFilter) return false;
      if (monthFilter !== "ALL" && !transaction.occurredAt.startsWith(monthFilter)) return false;
      if (categoryFilter !== "ALL" && transaction.category !== categoryFilter) return false;
      if (!query) return true;
      return (
        transaction.description.toLowerCase().includes(query) ||
        transaction.category.toLowerCase().includes(query) ||
        (transaction.customer?.name ?? "").toLowerCase().includes(query)
      );
    });
  }, [categoryFilter, monthFilter, search, transactions, typeFilter]);

  const filteredTotals = useMemo(() => {
    let income = 0n;
    let expenses = 0n;
    let draws = 0n;
    for (const transaction of filtered) {
      if (transaction.type === "INCOME") income += BigInt(transaction.amountMinor);
      else if (transaction.type === "EXPENSE") expenses += BigInt(transaction.amountMinor);
      else draws += BigInt(transaction.amountMinor);
    }
    return { income, expenses, draws, net: income - expenses - draws };
  }, [filtered]);

  const hasFilters = search !== "" || typeFilter !== "ALL" || monthFilter !== "ALL" || categoryFilter !== "ALL";

  function resetFilters() {
    setSearch("");
    setTypeFilter("ALL");
    setMonthFilter("ALL");
    setCategoryFilter("ALL");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    try {
      const payload = {
        type: formType,
        amount: String(data.get("amount") ?? "").trim(),
        description: String(data.get("description") ?? "").trim(),
        category: String(data.get("category") ?? "").trim(),
        occurredAt: new Date(String(data.get("occurredAt"))).toISOString(),
        customerId: String(data.get("customerId") ?? "") || null,
      };
      if (!payload.amount || !/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(payload.amount)) {
        throw new Error("Enter an amount with up to two decimal places, for example 1250.50.");
      }
      if (editing) {
        await api.transaction.update(editing.id, payload);
        notify("success", "Transaction updated.");
      } else {
        await api.transaction.create(payload);
        notify("success", "Transaction recorded.");
      }
      setEditing(null);
      form.reset();
      setFormType("INCOME");
      await onRefresh();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not save the transaction.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.transaction.remove(deleting.id);
      notify("success", "Transaction deleted and recorded in the audit trail.");
      setDeleting(null);
      if (editing?.id === deleting.id) setEditing(null);
      await onRefresh();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not delete the transaction.");
    } finally {
      setDeleteBusy(false);
    }
  }

  function cancelEdit() {
    setEditing(null);
    setFormType("INCOME");
    const form = formRef.current?.querySelector("form");
    form?.reset();
  }

  return (
    <div className="view-stack">
      <section className="toolbar">
        <div className="filter-group">
          <label className="search-field">
            <Icon name="search" size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search description, category or customer"
              aria-label="Search transactions"
            />
          </label>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} aria-label="Filter by type">
            <option value="ALL">All types</option>
            <option value="INCOME">Revenue</option>
            <option value="EXPENSE">Expenses</option>
            <option value="OWNER_DRAW">Owner draws</option>
          </select>
          <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} aria-label="Filter by month">
            <option value="ALL">All months</option>
            {months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter by category">
            <option value="ALL">All categories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          {hasFilters && (
            <button className="text-button" type="button" onClick={resetFilters}>Clear filters</button>
          )}
        </div>
        <button className="button secondary" type="button" onClick={() => exportTransactionsCsv(filtered, businessName)} disabled={filtered.length === 0}>
          <Icon name="download" size={16} /> Export CSV
        </button>
      </section>

      <section className="summary-strip" aria-label="Filtered totals">
        <div><span>Money in</span><strong className="income">{formatMinor(filteredTotals.income)}</strong></div>
        <div><span>Money out</span><strong className="outflow">{formatMinor(filteredTotals.expenses)}</strong></div>
        <div><span>Owner draws</span><strong>{formatMinor(filteredTotals.draws)}</strong></div>
        <div><span>Net movement</span><strong className={filteredTotals.net >= 0n ? "income" : "outflow"}>{formatMinor(filteredTotals.net)}</strong></div>
        <div className="summary-count"><span>Showing</span><strong>{filtered.length} of {transactions.length}</strong></div>
      </section>

      <div ref={formRef} className="composer-anchor" />

      <section className="panel composer-panel">
        <div className="panel-heading">
          <div>
            <h2>{editing ? "Edit transaction" : "Record a transaction"}</h2>
            <p>{editing ? `Updating "${editing.description}".` : "Log money in or out — it takes about ten seconds."}</p>
          </div>
          {editing && <Badge tone="info">Editing</Badge>}
        </div>

        <form className="form transaction-form" onSubmit={handleSubmit} key={editing?.id ?? "new"}>
          <div className="type-toggle" role="group" aria-label="Transaction type">
            {TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                className={formType === type.value ? `active type-${type.value.toLowerCase()}` : ""}
                onClick={() => setFormType(type.value)}
                aria-pressed={formType === type.value}
              >
                <Icon name={type.icon} size={17} />
                {type.label}
              </button>
            ))}
          </div>

          <div className="form-grid">
            <label className="amount-field">
              Amount (R)
              <input
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                required
                pattern="^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$"
                defaultValue={editing ? (Number(editing.amountMinor) / 100).toFixed(2) : ""}
                autoComplete="off"
              />
            </label>
            <label>
              Date
              <input
                name="occurredAt"
                type="datetime-local"
                required
                defaultValue={toDateTimeInput(editing?.occurredAt)}
              />
            </label>
            <label className="span-two">
              Description
              <input
                name="description"
                required
                maxLength={240}
                placeholder={formType === "INCOME" ? "e.g. Saturday market sales" : formType === "EXPENSE" ? "e.g. Fresh stock from supplier" : "e.g. Monthly owner draw"}
                defaultValue={editing?.description ?? ""}
              />
            </label>
            <label>
              Category
              <input
                name="category"
                required
                maxLength={80}
                list="category-suggestions"
                placeholder="e.g. Sales, Stock, Transport"
                defaultValue={editing?.category ?? ""}
              />
              <datalist id="category-suggestions">
                {categories.map((category) => <option key={category} value={category} />)}
              </datalist>
            </label>
            <label>
              Customer <span className="optional">optional</span>
              <select name="customerId" defaultValue={editing?.customerId ?? ""} aria-label="Link to a customer">
                <option value="">No customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </label>
          </div>

          <div className="button-row">
            <button className="button primary" disabled={saving}>
              {saving ? "Saving…" : editing ? "Update transaction" : "Save transaction"}
            </button>
            {editing && <button className="button secondary" type="button" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><h2>Transaction history</h2><p>Newest first. Showing up to 200 records.</p></div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon="transactions"
            title={transactions.length === 0 ? "No transactions yet" : "No matches"}
            text={transactions.length === 0 ? "Record your first sale or expense using the form above." : "Try clearing the filters or searching for something else."}
            action={hasFilters ? <button className="button secondary" type="button" onClick={resetFilters}>Clear filters</button> : undefined}
          />
        ) : (
          <div className="ledger" role="table" aria-label="Transactions">
            <div className="ledger-head" role="row">
              <span role="columnheader">Date</span>
              <span role="columnheader">Details</span>
              <span role="columnheader">Category</span>
              <span role="columnheader">Type</span>
              <span role="columnheader" className="align-right">Amount</span>
              <span role="columnheader" className="align-right">Actions</span>
            </div>
            {filtered.map((transaction) => (
              <div className="ledger-row" role="row" key={transaction.id}>
                <span className="ledger-date" role="cell">{formatDate(transaction.occurredAt)}</span>
                <span className="ledger-details" role="cell">
                  <strong>{transaction.description}</strong>
                  {transaction.customer && <small>{transaction.customer.name}</small>}
                </span>
                <span role="cell"><span className="category-chip">{transaction.category}</span></span>
                <span role="cell" className="ledger-type"><Badge tone={TYPE_TONE[transaction.type]}>{TYPE_LABEL[transaction.type]}</Badge></span>
                <span role="cell" className={`align-right amount ledger-amount ${transaction.type === "INCOME" ? "income" : "outflow"}`}>
                  {transaction.type === "INCOME" ? "+" : "−"}{formatMinor(transaction.amountMinor)}
                </span>
                <span className="ledger-actions" role="cell">
                  <button className="icon-button" type="button" onClick={() => { setFormType(transaction.type); setEditing(transaction); }} aria-label={`Edit ${transaction.description}`} title="Edit">
                    <Icon name="edit" size={16} />
                  </button>
                  <button className="icon-button danger" type="button" onClick={() => setDeleting(transaction)} aria-label={`Delete ${transaction.description}`} title="Delete">
                    <Icon name="trash" size={16} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {deleting && (
        <ConfirmDialog
          title="Delete this transaction?"
          message={`"${deleting.description}" will be removed from your records. The deletion stays in the audit trail.`}
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
