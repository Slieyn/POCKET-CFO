export type IntegrationCategory = "Money" | "Payments" | "Automation" | "Accounting";

export type IntegrationField = {
  key: string;
  label: string;
  type: "text" | "password" | "url" | "select";
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
};

export type IntegrationProvider = {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  /** Built-in providers work without any third-party account. */
  builtIn?: boolean;
  fields: IntegrationField[];
  note?: string;
  docsUrl?: string;
  events?: string[];
};

export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  {
    id: "bank_csv",
    name: "Bank statement import",
    category: "Money",
    description:
      "Import a CSV statement from any South African bank. POCKET CFO detects columns, previews every row and skips duplicates automatically.",
    builtIn: true,
    fields: [],
    note: "No credentials required. Works with FNB, Standard Bank, Absa, Nedbank, Capitec and more.",
  },
  {
    id: "webhook",
    name: "Real-time webhooks",
    category: "Automation",
    description:
      "Send signed events to Slack, Make, Zapier or your own endpoint whenever money moves or a document changes.",
    fields: [
      {
        key: "url",
        label: "HTTPS endpoint",
        type: "url",
        required: true,
        placeholder: "https://hooks.example.com/pocketcfo",
        help: "We send a POST with an HMAC-SHA256 signature in the X-PocketCFO-Signature header.",
      },
      {
        key: "secret",
        label: "Signing secret",
        type: "password",
        secret: true,
        required: true,
        placeholder: "At least 16 characters",
        help: "Used to sign every delivery so your endpoint can verify it came from POCKET CFO.",
      },
    ],
    events: ["transaction.created", "transaction.updated", "deal.created", "deal.status_updated", "customer.created", "task.created", "task.completed"],
  },
  {
    id: "payfast",
    name: "PayFast",
    category: "Payments",
    description:
      "Store your PayFast merchant details securely so invoices can be paid online. Credentials are encrypted with AES-256-GCM.",
    fields: [
      { key: "merchantId", label: "Merchant ID", type: "text", required: true, placeholder: "10000100" },
      { key: "merchantKey", label: "Merchant key", type: "text", required: true, placeholder: "46f0cd69…" },
      { key: "passphrase", label: "Passphrase", type: "password", secret: true, required: true },
      {
        key: "mode",
        label: "Environment",
        type: "select",
        required: true,
        options: [
          { value: "sandbox", label: "Sandbox (testing)" },
          { value: "live", label: "Live payments" },
        ],
      },
    ],
    note: "Payment links are generated only after PayFast confirms your merchant details.",
  },
];

export function getIntegrationProvider(id: string) {
  return INTEGRATION_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export const INTEGRATION_STATUSES = ["DISCONNECTED", "CONNECTED", "ERROR"] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const WEBHOOK_EVENTS = INTEGRATION_PROVIDERS.find((provider) => provider.id === "webhook")?.events ?? [];
