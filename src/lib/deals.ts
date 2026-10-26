import { formatDate, formatMinor } from "./format";
import type { Deal, DealStatus } from "./types";

export const STATUS_LABELS: Record<DealStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

export function statusTone(status: DealStatus): "neutral" | "info" | "success" | "warning" | "danger" {
  if (status === "PAID") return "success";
  if (status === "ACCEPTED") return "info";
  if (status === "SENT") return "warning";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}

export function isOverdue(deal: Deal) {
  if (deal.type !== "INVOICE" || !deal.dueAt) return false;
  if (deal.status === "PAID" || deal.status === "CANCELLED" || deal.status === "DRAFT") return false;
  return new Date(deal.dueAt).getTime() < Date.now();
}

export function dealEmailHref(deal: Deal, businessName: string, businessEmail: string) {
  const lines = deal.items.map(
    (item, index) =>
      `${index + 1}. ${item.description} — ${item.quantity} × ${formatMinor(item.unitMinor)} = ${formatMinor(
        (BigInt(item.unitMinor) * BigInt(item.quantity)).toString(),
      )}`,
  );
  const documentName = deal.type === "INVOICE" ? "invoice" : "quote";
  const body = [
    `Hello ${deal.customer.name},`,
    "",
    `Please find ${documentName} ${deal.reference} from ${businessName}.`,
    "",
    `Date: ${formatDate(deal.createdAt, "long")}`,
    `Description: ${deal.description}`,
    deal.dueAt ? `Due date: ${formatDate(deal.dueAt, "long")}` : "Payment terms: as agreed.",
    "",
    "Items",
    ...lines,
    "",
    `Total: ${formatMinor(deal.totalMinor)}`,
    "",
    `Please reply to this email if you have any questions.`,
    "",
    businessName,
    businessEmail,
  ].join("\n");
  const subject = `${documentName === "invoice" ? "Invoice" : "Quote"} ${deal.reference} from ${businessName}`;
  return `mailto:${encodeURIComponent(deal.customer.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
