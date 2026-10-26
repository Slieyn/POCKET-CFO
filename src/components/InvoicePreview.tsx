"use client";

/* eslint-disable @next/next/no-img-element */

import { formatDate, formatMinor } from "@/lib/format";
import { STATUS_LABELS, isOverdue, statusTone } from "@/lib/deals";
import { Badge } from "./ui";
import type { Deal } from "@/lib/types";

export function InvoicePreview({
  deal,
  businessName,
  businessEmail,
}: {
  deal: Deal;
  businessName: string;
  businessEmail: string;
}) {
  const documentName = deal.type === "INVOICE" ? "Invoice" : "Quote";
  const overdue = isOverdue(deal);

  return (
    <article className="invoice-document" aria-label={`${documentName} ${deal.reference}`}>
      <header className="invoice-header">
        <div className="invoice-issuer">
          <div className="invoice-brand">
            <img src="/pocket-cfo-mark.svg" alt="" width={38} height={38} />
            <span className="brand-word">POCKET <strong>CFO</strong></span>
          </div>
          <h3>{businessName}</h3>
          <a href={`mailto:${businessEmail}`}>{businessEmail}</a>
        </div>
        <div className="invoice-meta">
          <span className={`invoice-type type-${deal.type.toLowerCase()}`}>{documentName}</span>
          <strong>{deal.reference}</strong>
          <span>Issued {formatDate(deal.createdAt, "long")}</span>
          {deal.dueAt && <span>Due {formatDate(deal.dueAt, "long")}</span>}
          <Badge tone={overdue ? "danger" : statusTone(deal.status)}>
            {overdue ? "Overdue" : STATUS_LABELS[deal.status]}
          </Badge>
        </div>
      </header>

      <div className="invoice-parties">
        <div>
          <span className="invoice-label">Prepared for</span>
          <strong>{deal.customer.name}</strong>
          <a href={`mailto:${deal.customer.email}`}>{deal.customer.email}</a>
        </div>
        <div>
          <span className="invoice-label">Summary</span>
          <p>{deal.description}</p>
        </div>
      </div>

      <div className="invoice-table-wrap">
        <table className="invoice-table">
          <thead>
            <tr><th>#</th><th>Item &amp; description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
          </thead>
          <tbody>
            {deal.items.map((item, index) => (
              <tr key={`${item.description}-${index}`}>
                <td>{index + 1}</td>
                <td>{item.description}</td>
                <td>{item.quantity}</td>
                <td>{formatMinor(item.unitMinor)}</td>
                <td>{formatMinor((BigInt(item.unitMinor) * BigInt(item.quantity)).toString())}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="invoice-summary">
        <div className="invoice-total-box">
          <div><span>Subtotal</span><span>{formatMinor(deal.totalMinor)}</span></div>
          <div className="grand"><strong>Total due</strong><strong>{formatMinor(deal.totalMinor)}</strong></div>
        </div>
      </div>

      <footer className="invoice-footer">
        <div>
          <span className="invoice-label">Payment terms</span>
          <span>{deal.dueAt ? `Payment due by ${formatDate(deal.dueAt, "long")}.` : "As agreed with the customer."}</span>
        </div>
        <div>
          <span className="invoice-label">Payment details</span>
          <span>Please use the payment method agreed with {businessName}.</span>
        </div>
      </footer>

      <p className="invoice-note">
        Created with POCKET CFO. This document is a business record, not a tax invoice unless your business is registered for VAT.
      </p>
    </article>
  );
}
