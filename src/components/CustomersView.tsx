"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Icon } from "./icons";
import { Avatar, Badge, ConfirmDialog, Dialog, EmptyState } from "./ui";
import { api } from "@/lib/api";
import { formatMinor, relativeTime } from "@/lib/format";
import type { Customer, Transaction } from "@/lib/types";

export function CustomersView({
  customers,
  transactions,
  onRefresh,
  onCreateDeal,
  notify,
}: {
  customers: Customer[];
  transactions: Transaction[];
  onRefresh: () => Promise<void>;
  onCreateDeal: (customerId: string) => void;
  notify: (tone: "success" | "error" | "info", message: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const revenueByCustomer = useMemo(() => {
    const map = new Map<string, { revenue: bigint; payments: number; lastActivity: string | null }>();
    for (const transaction of transactions) {
      if (!transaction.customerId) continue;
      const current = map.get(transaction.customerId) ?? { revenue: 0n, payments: 0, lastActivity: null };
      if (transaction.type === "INCOME") {
        current.revenue += BigInt(transaction.amountMinor);
        current.payments += 1;
      }
      if (!current.lastActivity || transaction.occurredAt > current.lastActivity) {
        current.lastActivity = transaction.occurredAt;
      }
      map.set(transaction.customerId, current);
    }
    return map;
  }, [transactions]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) || customer.email.toLowerCase().includes(query),
    );
  }, [customers, search]);

  const totalRevenue = useMemo(
    () => [...revenueByCustomer.values()].reduce((sum, entry) => sum + entry.revenue, 0n),
    [revenueByCustomer],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    setSaving(true);
    try {
      if (editing === "new") {
        await api.customer.create({ name, email });
        notify("success", `${name} added to your customers.`);
      } else if (editing) {
        await api.customer.update(editing.id, { name, email });
        notify("success", "Customer details updated.");
      }
      setEditing(null);
      await onRefresh();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not save this customer.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.customer.remove(deleting.id);
      notify("success", "Customer deleted.");
      setDeleting(null);
      await onRefresh();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not delete this customer.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="view-stack">
      <section className="summary-strip" aria-label="Customer summary">
        <div><span>Customers</span><strong>{customers.length}</strong></div>
        <div><span>Lifetime revenue linked</span><strong className="income">{formatMinor(totalRevenue)}</strong></div>
        <div><span>With open deals</span><strong>{customers.filter((customer) => customer.deals.some((deal) => deal.status === "SENT" || deal.status === "ACCEPTED")).length}</strong></div>
        <div className="summary-action">
          <button className="button primary" type="button" onClick={() => setEditing("new")}>
            <Icon name="plus" size={17} /> Add customer
          </button>
        </div>
      </section>

      <section className="toolbar">
        <label className="search-field grow">
          <Icon name="search" size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by customer name or email"
            aria-label="Search customers"
          />
        </label>
      </section>

      {filtered.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon="customers"
            title={customers.length === 0 ? "No customers yet" : "No customers match your search"}
            text={customers.length === 0 ? "Add the people and businesses that pay you. You can link income and documents to them." : "Try a different name or email address."}
            action={
              customers.length === 0 ? (
                <button className="button primary" type="button" onClick={() => setEditing("new")}>
                  <Icon name="plus" size={16} /> Add your first customer
                </button>
              ) : undefined
            }
          />
        </section>
      ) : (
        <section className="customer-grid">
          {filtered.map((customer) => {
            const stats = revenueByCustomer.get(customer.id);
            const openDeals = customer.deals.filter((deal) => deal.status === "SENT" || deal.status === "ACCEPTED");
            return (
              <article className="customer-card" key={customer.id}>
                <div className="customer-card-top">
                  <Avatar name={customer.name} />
                  <div className="customer-identity">
                    <strong>{customer.name}</strong>
                    <a href={`mailto:${customer.email}`}>{customer.email}</a>
                  </div>
                  <button className="icon-button" type="button" onClick={() => setEditing(customer)} aria-label={`Edit ${customer.name}`} title="Edit customer">
                    <Icon name="edit" size={16} />
                  </button>
                </div>

                <div className="customer-stats">
                  <div><span>Revenue</span><strong>{formatMinor(stats?.revenue ?? 0n, { cents: false })}</strong></div>
                  <div><span>Deals</span><strong>{customer.deals.length}</strong></div>
                  <div><span>Last activity</span><strong>{stats?.lastActivity ? relativeTime(stats.lastActivity) : "—"}</strong></div>
                </div>

                {openDeals.length > 0 && (
                  <div className="customer-deals">
                    {openDeals.slice(0, 2).map((deal) => (
                      <Badge key={deal.id} tone={deal.type === "INVOICE" ? "info" : "warning"}>
                        {deal.type === "INVOICE" ? "Invoice" : "Quote"} {deal.reference.split("-").slice(-1)[0]}
                      </Badge>
                    ))}
                    {openDeals.length > 2 && <Badge tone="neutral">+{openDeals.length - 2} more</Badge>}
                  </div>
                )}

                <div className="customer-actions">
                  <button className="button secondary small" type="button" onClick={() => onCreateDeal(customer.id)}>
                    <Icon name="plus" size={15} /> New invoice
                  </button>
                  <a className="button ghost small" href={`mailto:${customer.email}`}>
                    <Icon name="mail" size={15} /> Email
                  </a>
                  <button className="icon-button danger" type="button" onClick={() => setDeleting(customer)} aria-label={`Delete ${customer.name}`} title="Delete customer">
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {editing && (
        <Dialog
          title={editing === "new" ? "Add a customer" : "Edit customer"}
          description={editing === "new" ? "Keep the people who pay you in one place." : "Update their contact details."}
          onClose={() => setEditing(null)}
          size="sm"
        >
          <form className="form" onSubmit={handleSubmit}>
            <label>
              Customer or business name
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={editing === "new" ? "" : editing.name}
                placeholder="e.g. Sunrise Market"
                autoComplete="organization"
              />
            </label>
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                defaultValue={editing === "new" ? "" : editing.email}
                placeholder="orders@business.co.za"
                autoComplete="email"
              />
            </label>
            <div className="button-row end">
              <button className="button secondary" type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button className="button primary" disabled={saving}>{saving ? "Saving…" : editing === "new" ? "Add customer" : "Save changes"}</button>
            </div>
          </form>
        </Dialog>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message={
            deleting.deals.length > 0
              ? "This customer has quotes or invoices attached, so POCKET CFO will keep them to protect your records."
              : "This removes the customer from your workspace. Transactions already recorded stay in your ledger without the customer link."
          }
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}

      <p className="fine-print">
        Customer emails are only used when you choose to open an email or share a document. POCKET CFO does not send marketing email.
      </p>
    </div>
  );
}
