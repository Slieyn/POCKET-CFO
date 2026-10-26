import type { Transaction } from "./types";

function safeCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  // Prevent spreadsheet formula injection when a cell starts with a formula character.
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function escapeCell(value: string | number | null | undefined) {
  const text = safeCell(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportTransactionsCsv(transactions: Transaction[], businessName: string) {
  const rows: (string | number | null | undefined)[][] = [
    ["Date", "Type", "Description", "Category", "Customer", "Amount (ZAR)"],
    ...transactions.map((transaction) => [
      new Date(transaction.occurredAt).toISOString().slice(0, 10),
      transaction.type,
      transaction.description,
      transaction.category,
      transaction.customer?.name ?? "",
      (Number(transaction.amountMinor) / 100).toFixed(2),
    ]),
  ];
  const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "pocketcfo";
  downloadCsv(`${slug}-transactions-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}
