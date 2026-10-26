import type {
  AuditEvent,
  BankMapping,
  BankPreview,
  BudgetSettings,
  Business,
  Customer,
  Dashboard,
  Deal,
  DealItem,
  DealStatus,
  ImportBatch,
  Integration,
  SessionUser,
  Task,
  TaskInput,
  TasksResponse,
  TaskStatus,
  TeamMember,
  Transaction,
  TransactionType,
  Workspace,
} from "./types";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      (payload as { error?: string }).error || "That request could not be completed.",
      response.status,
    );
  }
  return payload as T;
}

export type SessionResponse = {
  user: SessionUser;
  business: Business;
  role: string;
};

export const api = {
  session: () => apiRequest<SessionResponse>("/api/auth/me"),

  login: (input: { email: string; password: string }) =>
    apiRequest<{ user: SessionUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  register: (input: {
    name: string;
    businessName: string;
    email: string;
    password: string;
    includeSampleData: boolean;
  }) =>
    apiRequest<{ user: SessionUser; sampleDataAdded?: boolean }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  demo: () => apiRequest<{ user: SessionUser; business: Business }>("/api/auth/demo", {
    method: "POST",
    body: "{}",
  }),

  logout: () => apiRequest<{ ok: true }>("/api/auth/logout", { method: "POST", body: "{}" }),

  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    apiRequest<{ ok: true; message: string }>("/api/auth/password", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  deleteAccount: (input: { password: string; confirmation: string }) =>
    apiRequest<{ ok: true }>("/api/account", {
      method: "DELETE",
      body: JSON.stringify(input),
    }),

  workspace: async (): Promise<Workspace | null> => {
    let auth: SessionResponse;
    try {
      auth = await apiRequest<SessionResponse>("/api/auth/me");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
    const [overview, transactions, customers, deals, budget] = await Promise.all([
      apiRequest<Dashboard>("/api/dashboard"),
      apiRequest<{ transactions: Transaction[] }>("/api/transactions"),
      apiRequest<{ customers: Customer[] }>("/api/customers"),
      apiRequest<{ deals: Deal[] }>("/api/deals"),
      apiRequest<{ budget: BudgetSettings | null }>("/api/budget"),
    ]);
    return {
      auth: {
        user: { ...auth.user, demo: auth.user.email.endsWith("@pocketcfo.demo") },
        business: auth.business,
        role: auth.role,
      },
      overview,
      transactions: transactions.transactions,
      customers: customers.customers,
      deals: deals.deals,
      budget: budget.budget,
    };
  },

  dashboard: () => apiRequest<Dashboard>("/api/dashboard"),

  transaction: {
    create: (input: {
      type: TransactionType;
      amount: string;
      description: string;
      category: string;
      occurredAt: string;
      customerId?: string | null;
      dealId?: string | null;
    }) =>
      apiRequest<{ transaction: Transaction }>("/api/transactions", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(input),
      }),
    update: (id: string, input: {
      type: TransactionType;
      amount: string;
      description: string;
      category: string;
      occurredAt: string;
      customerId?: string | null;
      dealId?: string | null;
    }) =>
      apiRequest<{ transaction: Transaction }>(`/api/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      apiRequest<{ ok: true }>(`/api/transactions/${id}`, { method: "DELETE" }),
  },

  budget: {
    save: (input: BudgetSettings) =>
      apiRequest<{ budget: BudgetSettings }>("/api/budget", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
  },

  customer: {
    create: (input: { name: string; email: string }) =>
      apiRequest<{ customer: Customer }>("/api/customers", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: string, input: { name?: string; email?: string }) =>
      apiRequest<{ customer: Customer }>(`/api/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      apiRequest<{ ok: true }>(`/api/customers/${id}`, { method: "DELETE" }),
  },

  deal: {
    create: (input: {
      customerId: string;
      type: "QUOTE" | "INVOICE";
      description: string;
      dueAt?: string | null;
      items: { description: string; quantity: number; unitAmount: string }[];
    }) =>
      apiRequest<{ deal: Deal }>("/api/deals", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    updateStatus: (id: string, status: DealStatus) =>
      apiRequest<{ deal: Partial<Deal> & { id: string; status: DealStatus } }>(`/api/deals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    remove: (id: string) =>
      apiRequest<{ ok: true }>(`/api/deals/${id}`, { method: "DELETE" }),
  },

  business: {
    update: (name: string) =>
      apiRequest<{ business: Business }>("/api/business", {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
  },

  audit: () => apiRequest<{ events: AuditEvent[] }>("/api/audit"),

  task: {
    list: (from: string, to: string) =>
      apiRequest<TasksResponse>(
        `/api/tasks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    create: (input: TaskInput) =>
      apiRequest<{ task: Task }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: string, input: Partial<TaskInput> & { status?: TaskStatus }) =>
      apiRequest<{ task: Task }>(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      apiRequest<{ ok: true }>(`/api/tasks/${id}`, { method: "DELETE" }),
  },

  team: {
    list: () => apiRequest<{ members: TeamMember[]; role: string }>("/api/team"),
    add: (input: { name: string; email: string; password: string; role: "ADMIN" | "MEMBER" }) =>
      apiRequest<{ member: TeamMember }>("/api/team", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      apiRequest<{ ok: true }>(`/api/team/${id}`, { method: "DELETE" }),
  },

  integrations: {
    list: () =>
      apiRequest<{ integrations: Integration[]; role: string; imports: ImportBatch[] }>("/api/integrations"),
    save: (provider: string, config: Record<string, string>) =>
      apiRequest<{ integration: { provider: string; status: string } }>(`/api/integrations/${provider}`, {
        method: "PUT",
        body: JSON.stringify({ config }),
      }),
    disconnect: (provider: string) =>
      apiRequest<{ ok: true }>(`/api/integrations/${provider}`, { method: "DELETE" }),
    test: (provider: string) =>
      apiRequest<{ ok: boolean; message: string }>(`/api/integrations/${provider}/test`, {
        method: "POST",
        body: "{}",
      }),
    previewCsv: (input: { csv: string; mapping?: Partial<BankMapping> }) =>
      apiRequest<BankPreview>("/api/integrations/bank-csv/preview", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    importCsv: (input: { csv: string; fileName: string; mapping: BankMapping }) =>
      apiRequest<{ imported: number; skipped: number; rowsRead: number; batch: ImportBatch }>(
        "/api/integrations/bank-csv/import",
        { method: "POST", body: JSON.stringify(input) },
      ),
  },
};

export type { DealItem };
