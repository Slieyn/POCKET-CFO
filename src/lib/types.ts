export type Tab =
  | "dashboard"
  | "calendar"
  | "transactions"
  | "customers"
  | "deals"
  | "reports"
  | "integrations"
  | "settings";
export type NavigationOrientation = "vertical" | "horizontal";

export type SessionUser = { name: string; email: string; demo?: boolean };
export type Business = { id: string; name: string };
export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | string;
  joinedAt: string;
};
export type BudgetSettings = { operationsPercent: number; reservePercent: number; ownerDrawPercent: number };

export type TransactionType = "INCOME" | "EXPENSE" | "OWNER_DRAW";
export type DealType = "QUOTE" | "INVOICE";
export type DealStatus = "DRAFT" | "SENT" | "ACCEPTED" | "PAID" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type TaskStatus = "TODO" | "DONE";

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  scheduledFor: string;
  allDay: boolean;
  durationMinutes: number;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt: string | null;
  assignedTo: { id: string; name: string } | null;
  createdById: string;
  createdAt: string;
};

export type TaskMember = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type TaskInput = {
  title: string;
  notes?: string | null;
  scheduledFor: string;
  allDay: boolean;
  durationMinutes: number;
  priority: TaskPriority;
  assignedToId?: string | null;
};

export type TasksResponse = {
  tasks: Task[];
  members: TaskMember[];
  currentUserId: string;
  role: string;
};

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: string;
  amountMinor: string;
  description: string;
  category: string;
  occurredAt: string;
  customerId: string | null;
  customer: { name: string; email: string } | null;
};

export type CustomerDeal = {
  id: string;
  reference: string;
  type: DealType;
  status: DealStatus;
  totalMinor: string;
  createdAt: string;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
  deals: CustomerDeal[];
};

export type DealItem = {
  id?: string;
  description: string;
  quantity: number;
  unitMinor: string;
};

export type Deal = {
  id: string;
  reference: string;
  type: DealType;
  status: DealStatus;
  description: string;
  totalMinor: string;
  createdAt: string;
  dueAt: string | null;
  items: DealItem[];
  customer: { id: string; name: string; email: string };
};

export type GuideChecklistItem = {
  id: string;
  label: string;
  hint: string;
  done: boolean;
};

export type Dashboard = {
  business: Business;
  currency: string;
  month: {
    key: string;
    revenueMinor: string;
    expensesMinor: string;
    ownerDrawMinor: string;
    netMinor: string;
    estimatedCashMinor: string;
  };
  previousMonth: {
    key: string;
    revenueMinor: string;
    expensesMinor: string;
    ownerDrawMinor: string;
    netMinor: string;
  };
  budget: null | {
    operationsPercent: number;
    reservePercent: number;
    ownerDrawPercent: number;
    operationsMinor: string;
    reserveMinor: string;
    ownerDrawBudgetMinor: string;
  };
  guide: { score: number; label: string; nextStep: string };
  checklist: GuideChecklistItem[];
  series: {
    month: string;
    label: string;
    fullLabel: string;
    revenueMinor: string;
    expensesMinor: string;
    ownerDrawMinor: string;
    netMinor: string;
  }[];
  categories: { category: string; amountMinor: string; share: number }[];
  topCustomers: { id: string; name: string; revenueMinor: string; count: number }[];
  receivables: {
    outstandingMinor: string;
    overdueMinor: string;
    openCount: number;
    overdueCount: number;
    quoteCount: number;
  };
  runwayMonths: number | null;
  transactionCount: number;
  customerCount: number;
  dealCount: number;
  disclaimer: string;
};

export type AuditEvent = {
  id: string;
  action: string;
  recordType: string;
  recordId: string;
  details: unknown;
  actorName: string;
  createdAt: string;
};

export type Workspace = {
  auth: { user: SessionUser; business: Business; role: string };
  overview: Dashboard;
  transactions: Transaction[];
  customers: Customer[];
  deals: Deal[];
  budget: BudgetSettings | null;
};

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

export type Integration = {
  id: string;
  name: string;
  category: "Money" | "Payments" | "Automation" | "Accounting";
  description: string;
  builtIn: boolean;
  fields: IntegrationField[];
  note?: string;
  events?: string[];
  connected: boolean;
  status: string;
  configured: Record<string, string>;
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  available: boolean;
};

export type ImportBatch = {
  id: string;
  fileName: string;
  rowsRead: number;
  rowsImported: number;
  rowsSkipped: number;
  createdAt: string;
};

export type BankMapping = {
  date: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  type?: string;
  category?: string;
};

export type BankPreviewRow = {
  rowNumber: number;
  date: string | null;
  description: string;
  amountMinor: string | null;
  type: "INCOME" | "EXPENSE" | "OWNER_DRAW" | null;
  category: string;
  externalId: string | null;
  error?: string;
  duplicate?: boolean;
};

export type BankPreview = {
  headers: string[];
  mapping: BankMapping;
  suggestedMapping: BankMapping;
  preview: BankPreviewRow[];
  totals: { rows: number; valid: number; duplicates: number; invalid: number };
};
