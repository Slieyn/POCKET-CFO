"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "./icons";
import { InvoicePreview } from "./InvoicePreview";
import { Badge, ConfirmDialog, Dialog, EmptyState } from "./ui";
import { api } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { STATUS_LABELS, dealEmailHref, isOverdue, statusTone } from "@/lib/deals";
import { daysUntil, formatDate, formatMinor, toDateInput } from "@/lib/format";
import type { Customer, Deal, DealStatus, DealType, SessionUser } from "@/lib/types";

type DraftItem = { description: string; quantity: number; unitAmount: string };
type Draft = { customerId: string; type: DealType; description: string; dueAt: string };

const EMPTY_DRAFT: Draft = { customerId: "", type: "INVOICE", description: "", dueAt: "" };
const EMPTY_ITEM: DraftItem = { description: "", quantity: 1, unitAmount: "" };

const STATUS_ORDER: DealStatus[] = ["DRAFT", "SENT", "ACCEPTED", "PAID", "CANCELLED"];

export function DealsView({
  deals,
  customers,
  businessName,
  user,
  newDealCustomerId,
  onConsumeNewDeal,
  onNavigateCustomers,
  onRefresh,
  notify,
}: {
  deals: Deal[];
  customers: Customer[];
  businessName: string;
  user: SessionUser;
  newDealCustomerId: string | null;
  onConsumeNewDeal: () => void;
  onNavigateCustomers: () => void;
  onRefresh: () => Promise<void>;
  notify: (tone: "success" | "error" | "info", message: string) => void;
}) {
  const [composerOpen, setComposerOpen] = useState(Boolean(newDealCustomerId));
  const [draft, setDraft] = useState<Draft>(() =>
    newDealCustomerId
      ? { ...EMPTY_DRAFT, customerId: newDealCustomerId, type: "INVOICE" }
      : EMPTY_DRAFT,
  );
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }]);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Deal | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | DealType>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | DealStatus>("ALL");

  useEffect(() => {
    if (!newDealCustomerId) return;
    onConsumeNewDeal();
  }, [newDealCustomerId, onConsumeNewDeal]);

  const selectedDeal = deals.find((deal) => deal.id === selectedId) ?? null;

  const stats = useMemo(() => {
    let outstanding = 0n;
    let overdue = 0n;
    let overdueCount = 0;
    let openQuotes = 0;
    let paid = 0n;
    for (const deal of deals) {
      if (deal.type === "INVOICE" && (deal.status === "SENT" || deal.status === "ACCEPTED")) {
        outstanding += BigInt(deal.totalMinor);
        if (isOverdue(deal)) {
          overdue += BigInt(deal.totalMinor);
          overdueCount += 1;
        }
      }
      if (deal.type === "QUOTE" && (deal.status === "DRAFT" || deal.status === "SENT")) openQuotes += 1;
      if (deal.status === "PAID") paid += BigInt(deal.totalMinor);
    }
    return { outstanding, overdue, overdueCount, openQuotes, paid };
  }, [deals]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return deals.filter((deal) => {
      if (typeFilter !== "ALL" && deal.type !== typeFilter) return false;
      if (statusFilter === "OPEN" && !["DRAFT", "SENT", "ACCEPTED"].includes(deal.status)) return false;
      if (statusFilter !== "ALL" && statusFilter !== "OPEN" && deal.status !== statusFilter) return false;
      if (!query) return true;
      return (
        deal.reference.toLowerCase().includes(query) ||
        deal.customer.name.toLowerCase().includes(query) ||
        deal.description.toLowerCase().includes(query)
      );
    });
  }, [deals, search, statusFilter, typeFilter]);

  function openComposer(type: DealType = "INVOICE") {
    setDraft({ ...EMPTY_DRAFT, type });
    setItems([{ ...EMPTY_ITEM }]);
    setComposerOpen(true);
  }

  function convertToInvoice(deal: Deal) {
    setDraft({
      customerId: deal.customer.id,
      type: "INVOICE",
      description: deal.description,
      dueAt: toDateInput(new Date(Date.now() + 14 * 86_400_000).toISOString()),
    });
    setItems(
      deal.items.length
        ? deal.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitAmount: (Number(item.unitMinor) / 100).toFixed(2),
          }))
        : [{ ...EMPTY_ITEM }],
    );
    setSelectedId(null);
    setComposerOpen(true);
  }

  const draftTotal = items.reduce((sum, item) => {
    const amount = Number(item.unitAmount);
    return sum + (Number.isFinite(amount) ? Math.round(amount * 100) * item.quantity : 0);
  }, 0);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const cleanItems = items
        .map((item) => ({
          description: item.description.trim(),
          quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
          unitAmount: item.unitAmount.trim(),
        }))
        .filter((item) => item.description.length > 0);
      if (!draft.customerId) throw new Error("Choose a customer for this document.");
      if (!draft.description.trim()) throw new Error("Add a short description for the document.");
      if (cleanItems.length === 0) throw new Error("Add at least one line item.");
      if (cleanItems.some((item) => !/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(item.unitAmount) || Number(item.unitAmount) <= 0)) {
        throw new Error("Every line item needs a valid rate greater than zero.");
      }
      await api.deal.create({
        customerId: draft.customerId,
        type: draft.type,
        description: draft.description.trim(),
        dueAt: draft.dueAt ? new Date(`${draft.dueAt}T12:00:00`).toISOString() : null,
        items: cleanItems,
      });
      setComposerOpen(false);
      setDraft(EMPTY_DRAFT);
      setItems([{ ...EMPTY_ITEM }]);
      await onRefresh();
      notify("success", `${draft.type === "INVOICE" ? "Invoice" : "Quote"} created.`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not create the document.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(deal: Deal, status: DealStatus) {
    if (deal.status === status) return;
    setStatusBusy(deal.id);
    try {
      await api.deal.updateStatus(deal.id, status);
      await onRefresh();
      if (status === "PAID") celebrate();
      notify("success", `${deal.reference} marked ${STATUS_LABELS[status].toLowerCase()}.`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not update the status.");
    } finally {
      setStatusBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.deal.remove(deleting.id);
      if (selectedId === deleting.id) setSelectedId(null);
      setDeleting(null);
      await onRefresh();
      notify("success", "Document deleted.");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not delete the document.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="view-stack">
      <section className="summary-strip" aria-label="Document summary">
        <div><span>Outstanding invoices</span><strong className="income">{formatMinor(stats.outstanding)}</strong></div>
        <div><span>Overdue</span><strong className={stats.overdue > 0n ? "outflow" : ""}>{formatMinor(stats.overdue)}</strong><small>{stats.overdueCount} past due</small></div>
        <div><span>Open quotes</span><strong>{stats.openQuotes}</strong></div>
        <div><span>Paid (all time)</span><strong>{formatMinor(stats.paid, { cents: false })}</strong></div>
        <div className="summary-action">
          <button className="button primary" type="button" onClick={() => openComposer("INVOICE")}>
            <Icon name="plus" size={17} /> New document
          </button>
        </div>
      </section>

      <section className="toolbar">
        <div className="filter-group">
          <label className="search-field">
            <Icon name="search" size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reference, customer or description"
              aria-label="Search documents"
            />
          </label>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} aria-label="Filter by document type">
            <option value="ALL">Quotes &amp; invoices</option>
            <option value="QUOTE">Quotes only</option>
            <option value="INVOICE">Invoices only</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filter by status">
            <option value="ALL">All statuses</option>
            <option value="OPEN">Open</option>
            {STATUS_ORDER.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
          </select>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><h2>Your documents</h2><p>{filtered.length} of {deals.length} documents shown.</p></div>
        </div>

        {deals.length === 0 ? (
          <EmptyState
            icon="deals"
            title="No quotes or invoices yet"
            text={customers.length === 0 ? "Add a customer first, then create your first document." : "Create a professional quote or invoice in under a minute."}
            action={
              customers.length === 0 ? (
                <button className="button primary" type="button" onClick={onNavigateCustomers}>Add a customer</button>
              ) : (
                <button className="button primary" type="button" onClick={() => openComposer("INVOICE")}>
                  <Icon name="plus" size={16} /> Create invoice
                </button>
              )
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState icon="search" title="No documents match" text="Try another search or filter." />
        ) : (
          <div className="deal-list">
            {filtered.map((deal) => {
              const overdue = isOverdue(deal);
              const dueIn = daysUntil(deal.dueAt);
              return (
                <article className={`deal-row ${overdue ? "is-overdue" : ""}`} key={deal.id}>
                  <span className={`deal-icon ${deal.type.toLowerCase()}`} aria-hidden="true">
                    <Icon name={deal.type === "INVOICE" ? "file" : "deals"} size={19} />
                  </span>
                  <div className="deal-main">
                    <div className="deal-title">
                      <strong>{deal.reference}</strong>
                      <Badge tone={deal.type === "INVOICE" ? "info" : "warning"}>{deal.type === "INVOICE" ? "Invoice" : "Quote"}</Badge>
                      <Badge tone={overdue ? "danger" : statusTone(deal.status)}>{overdue ? "Overdue" : STATUS_LABELS[deal.status]}</Badge>
                    </div>
                    <span>{deal.customer.name}</span>
                    <small>{deal.description}</small>
                  </div>
                  <div className="deal-due">
                    <span>{deal.dueAt ? formatDate(deal.dueAt) : "No due date"}</span>
                    <small>
                      {overdue
                        ? `${Math.abs(dueIn ?? 0)} day${Math.abs(dueIn ?? 0) === 1 ? "" : "s"} overdue`
                        : dueIn !== null && dueIn >= 0 && ["SENT", "ACCEPTED"].includes(deal.status)
                          ? dueIn === 0 ? "Due today" : `Due in ${dueIn} day${dueIn === 1 ? "" : "s"}`
                          : "—"}
                    </small>
                  </div>
                  <div className="deal-amount">
                    <strong>{formatMinor(deal.totalMinor)}</strong>
                    <small>{deal.items.length} item{deal.items.length === 1 ? "" : "s"}</small>
                  </div>
                  <div className="deal-actions">
                    <select
                      value={deal.status}
                      onChange={(event) => changeStatus(deal, event.target.value as DealStatus)}
                      disabled={statusBusy === deal.id}
                      aria-label={`Status for ${deal.reference}`}
                      className="status-select"
                    >
                      {STATUS_ORDER.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                    </select>
                    <button className="button secondary small" type="button" onClick={() => setSelectedId(deal.id)}>
                      View
                    </button>
                    <a className="icon-button" href={dealEmailHref(deal, businessName, user.email)} aria-label={`Email ${deal.customer.name}`} title="Email customer">
                      <Icon name="mail" size={17} />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {composerOpen && (
        <Dialog
          title={draft.type === "INVOICE" ? "Create an invoice" : "Create a quote"}
          description="Add line items and POCKET CFO calculates the total."
          onClose={() => setComposerOpen(false)}
          size="lg"
        >
          {customers.length === 0 ? (
            <EmptyState
              icon="customers"
              title="Add a customer first"
              text="Documents need a customer so they can be shared and tracked."
              action={<button className="button primary" type="button" onClick={onNavigateCustomers}>Go to customers</button>}
            />
          ) : (
            <form className="form deal-form" onSubmit={handleCreate}>
              <div className="form-grid">
                <label>
                  Customer
                  <select value={draft.customerId} onChange={(event) => setDraft({ ...draft, customerId: event.target.value })} required>
                    <option value="" disabled>Select a customer</option>
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                  </select>
                </label>
                <label>
                  Document type
                  <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as DealType })}>
                    <option value="INVOICE">Invoice — request payment</option>
                    <option value="QUOTE">Quote — propose work</option>
                  </select>
                </label>
                <label className="span-two">
                  Description
                  <input
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    required
                    maxLength={1000}
                    placeholder="e.g. Weekly fresh produce supply"
                  />
                </label>
                <label>
                  Due date <span className="optional">optional</span>
                  <input type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} />
                </label>
              </div>

              <div className="line-items">
                <div className="line-items-head">
                  <span>Line items</span>
                  <button className="text-button" type="button" onClick={() => setItems([...items, { ...EMPTY_ITEM }])}>
                    <Icon name="plus" size={15} /> Add line
                  </button>
                </div>
                <div className="line-item header" aria-hidden="true">
                  <span>Description</span><span>Qty</span><span>Rate (R)</span><span>Amount</span><span />
                </div>
                {items.map((item, index) => (
                  <div className="line-item" key={index}>
                    <input
                      value={item.description}
                      onChange={(event) => updateItem(index, { description: event.target.value })}
                      placeholder="Item or service"
                      maxLength={200}
                      aria-label={`Item ${index + 1} description`}
                    />
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      value={item.quantity}
                      onChange={(event) => updateItem(index, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                      aria-label={`Item ${index + 1} quantity`}
                    />
                    <input
                      inputMode="decimal"
                      value={item.unitAmount}
                      onChange={(event) => updateItem(index, { unitAmount: event.target.value })}
                      placeholder="0.00"
                      aria-label={`Item ${index + 1} rate`}
                    />
                    <span className="line-amount">
                      {formatMinor(
                        (Number.isFinite(Number(item.unitAmount)) ? Math.round(Number(item.unitAmount) * 100) : 0) * item.quantity,
                      )}
                    </span>
                    <button
                      className="icon-button danger"
                      type="button"
                      onClick={() => setItems(items.length === 1 ? [{ ...EMPTY_ITEM }] : items.filter((_, itemIndex) => itemIndex !== index))}
                      aria-label={`Remove item ${index + 1}`}
                      disabled={items.length === 1}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                ))}
                <div className="line-total">
                  <span>Total</span>
                  <strong>{formatMinor(draftTotal)}</strong>
                </div>
              </div>

              <div className="button-row end">
                <button className="button secondary" type="button" onClick={() => setComposerOpen(false)}>Cancel</button>
                <button className="button primary" disabled={saving}>
                  {saving ? "Creating…" : draft.type === "INVOICE" ? "Create invoice" : "Create quote"}
                </button>
              </div>
            </form>
          )}
        </Dialog>
      )}

      {selectedDeal && (
        <Dialog
          title={`${selectedDeal.type === "INVOICE" ? "Invoice" : "Quote"} ${selectedDeal.reference}`}
          onClose={() => setSelectedId(null)}
          size="lg"
          footer={
            <div className="button-row wrap">
              <a className="button primary" href={dealEmailHref(selectedDeal, businessName, user.email)}>
                <Icon name="mail" size={16} /> Email customer
              </a>
              <button className="button secondary" type="button" onClick={() => window.print()}>
                <Icon name="print" size={16} /> Print
              </button>
              {selectedDeal.type === "QUOTE" && (
                <button className="button secondary" type="button" onClick={() => convertToInvoice(selectedDeal)}>
                  <Icon name="refresh" size={16} /> Convert to invoice
                </button>
              )}
              {selectedDeal.status !== "PAID" && selectedDeal.status !== "CANCELLED" && (
                <button className="button secondary" type="button" onClick={() => changeStatus(selectedDeal, "PAID")} disabled={statusBusy === selectedDeal.id}>
                  <Icon name="check" size={16} /> Mark as paid
                </button>
              )}
              <button className="button danger" type="button" onClick={() => setDeleting(selectedDeal)}>
                <Icon name="trash" size={16} /> Delete
              </button>
            </div>
          }
        >
          <InvoicePreview deal={selectedDeal} businessName={businessName} businessEmail={user.email} />
        </Dialog>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.reference}?`}
          message="The document and its line items will be removed. Any transaction already linked to it stays in your ledger."
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
