import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, jsonError } from "@/lib/http";
import { calculateBankabilityGuide } from "@/lib/money";

type LedgerRow = {
  type: "INCOME" | "EXPENSE" | "OWNER_DRAW";
  amountMinor: bigint;
  occurredAt: Date;
  category: string;
  customerId: string | null;
  customer: { id: string; name: string } | null;
};

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

function monthRange(offset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end, key: monthKey(start) };
}

export async function GET() {
  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);

    const now = new Date();
    const current = monthRange(0);
    const previous = monthRange(-1);
    const seriesRanges = Array.from({ length: 6 }, (_, index) => monthRange(index - 5));

    const [ledger, budget, deals, customerCount, dealCount] = await Promise.all([
      db.financialTransaction.findMany({
        where: { businessId: context.businessId },
        select: {
          type: true,
          amountMinor: true,
          occurredAt: true,
          category: true,
          customerId: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: { occurredAt: "desc" },
        take: 5000,
      }) as Promise<LedgerRow[]>,
      db.budget.findUnique({ where: { businessId: context.businessId } }),
      db.deal.findMany({
        where: { businessId: context.businessId },
        select: { id: true, reference: true, type: true, status: true, totalMinor: true, dueAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      db.customer.count({ where: { businessId: context.businessId } }),
      db.deal.count({ where: { businessId: context.businessId } }),
    ]);

    const inRange = (row: LedgerRow, start: Date, end: Date) =>
      row.occurredAt >= start && row.occurredAt < end;
    const sum = (rows: LedgerRow[], type: "INCOME" | "EXPENSE" | "OWNER_DRAW") =>
      rows.filter((row) => row.type === type).reduce((total, row) => total + row.amountMinor, 0n);

    const currentRows = ledger.filter((row) => inRange(row, current.start, current.end));
    const previousRows = ledger.filter((row) => inRange(row, previous.start, previous.end));
    const totalIncome = sum(currentRows, "INCOME");
    const totalExpenses = sum(currentRows, "EXPENSE");
    const totalDraws = sum(currentRows, "OWNER_DRAW");
    const previousIncome = sum(previousRows, "INCOME");
    const previousExpenses = sum(previousRows, "EXPENSE");
    const previousDraws = sum(previousRows, "OWNER_DRAW");
    const cashMinor = ledger.reduce(
      (total, row) => total + (row.type === "INCOME" ? row.amountMinor : -row.amountMinor),
      0n,
    );
    const incomeEntries = ledger.filter((row) => row.type === "INCOME");
    const revenueMonths = new Set(incomeEntries.map((row) => monthKey(row.occurredAt))).size;

    const guide = calculateBankabilityGuide({
      incomeEntries: incomeEntries.length,
      revenueMonths,
      cashMinor,
      budgetConfigured: Boolean(budget),
    });

    const series = seriesRanges.map((range) => {
      const rows = ledger.filter((row) => inRange(row, range.start, range.end));
      const revenueMinor = sum(rows, "INCOME");
      const expensesMinor = sum(rows, "EXPENSE");
      const ownerDrawMinor = sum(rows, "OWNER_DRAW");
      return {
        month: range.key,
        label: new Intl.DateTimeFormat("en-ZA", { month: "short" }).format(range.start),
        fullLabel: new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric" }).format(range.start),
        revenueMinor: revenueMinor.toString(),
        expensesMinor: expensesMinor.toString(),
        ownerDrawMinor: ownerDrawMinor.toString(),
        netMinor: (revenueMinor - expensesMinor - ownerDrawMinor).toString(),
      };
    });

    const categoryTotals = new Map<string, bigint>();
    for (const row of currentRows) {
      if (row.type !== "EXPENSE") continue;
      categoryTotals.set(row.category, (categoryTotals.get(row.category) ?? 0n) + row.amountMinor);
    }
    const categories = [...categoryTotals.entries()]
      .map(([category, amountMinor]) => ({
        category,
        amountMinor: amountMinor.toString(),
        share: totalExpenses > 0n ? Number((amountMinor * 100n) / totalExpenses) : 0,
      }))
      .sort((a, b) => Number(BigInt(b.amountMinor) - BigInt(a.amountMinor)))
      .slice(0, 6);

    const customerTotals = new Map<string, { id: string; name: string; revenueMinor: bigint; count: number }>();
    for (const row of incomeEntries) {
      if (!row.customerId || !row.customer) continue;
      const existing = customerTotals.get(row.customerId) ?? {
        id: row.customerId,
        name: row.customer.name,
        revenueMinor: 0n,
        count: 0,
      };
      existing.revenueMinor += row.amountMinor;
      existing.count += 1;
      customerTotals.set(row.customerId, existing);
    }
    const topCustomers = [...customerTotals.values()]
      .sort((a, b) => Number(b.revenueMinor - a.revenueMinor))
      .slice(0, 4)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        revenueMinor: entry.revenueMinor.toString(),
        count: entry.count,
      }));

    const openInvoices = deals.filter(
      (deal) => deal.type === "INVOICE" && (deal.status === "SENT" || deal.status === "ACCEPTED"),
    );
    const outstandingMinor = openInvoices.reduce((total, deal) => total + deal.totalMinor, 0n);
    const overdueInvoices = openInvoices.filter((deal) => deal.dueAt && deal.dueAt < now);
    const overdueMinor = overdueInvoices.reduce((total, deal) => total + deal.totalMinor, 0n);
    const openQuotes = deals.filter((deal) => deal.type === "QUOTE" && deal.status !== "PAID" && deal.status !== "CANCELLED");

    const expenseMonths = series.filter((entry) => BigInt(entry.expensesMinor) > 0n);
    const averageExpenses =
      expenseMonths.length > 0
        ? expenseMonths.reduce((total, entry) => total + BigInt(entry.expensesMinor), 0n) / BigInt(expenseMonths.length)
        : 0n;
    const runwayMonths =
      averageExpenses > 0n && cashMinor > 0n
        ? Number(cashMinor * 10n / averageExpenses) / 10
        : null;

    const checklist = [
      {
        id: "transaction",
        label: "Record your first transaction",
        hint: "Log money in and out so POCKET CFO can build your cash picture.",
        done: ledger.length > 0,
      },
      {
        id: "income",
        label: "Log business income",
        hint: "Revenue entries show the money your business is earning.",
        done: incomeEntries.length > 0,
      },
      {
        id: "budget",
        label: "Set a 100% budget plan",
        hint: "Split income across operations, reserve and owner draw.",
        done: Boolean(budget),
      },
      {
        id: "customer",
        label: "Add a customer",
        hint: "Keep the people who pay you in one place.",
        done: customerCount > 0,
      },
      {
        id: "deal",
        label: "Create a quote or invoice",
        hint: "Turn customer work into a trackable document.",
        done: dealCount > 0,
      },
      {
        id: "history",
        label: "Build three months of income history",
        hint: "Consistent records make your funding readiness story stronger.",
        done: revenueMonths >= 3,
      },
    ];

    const serialize = (amount: bigint) => amount.toString();

    return NextResponse.json({
      business: { id: context.businessId, name: context.businessName },
      currency: "ZAR",
      month: {
        key: current.key,
        revenueMinor: serialize(totalIncome),
        expensesMinor: serialize(totalExpenses),
        ownerDrawMinor: serialize(totalDraws),
        netMinor: serialize(totalIncome - totalExpenses - totalDraws),
        estimatedCashMinor: serialize(cashMinor),
      },
      previousMonth: {
        key: previous.key,
        revenueMinor: serialize(previousIncome),
        expensesMinor: serialize(previousExpenses),
        ownerDrawMinor: serialize(previousDraws),
        netMinor: serialize(previousIncome - previousExpenses - previousDraws),
      },
      budget: budget
        ? {
            operationsPercent: budget.operationsPercent,
            reservePercent: budget.reservePercent,
            ownerDrawPercent: budget.ownerDrawPercent,
            operationsMinor: serialize((totalIncome * BigInt(budget.operationsPercent)) / 100n),
            reserveMinor: serialize((totalIncome * BigInt(budget.reservePercent)) / 100n),
            ownerDrawBudgetMinor: serialize((totalIncome * BigInt(budget.ownerDrawPercent)) / 100n),
          }
        : null,
      guide,
      checklist,
      series,
      categories,
      topCustomers,
      receivables: {
        outstandingMinor: serialize(outstandingMinor),
        overdueMinor: serialize(overdueMinor),
        openCount: openInvoices.length,
        overdueCount: overdueInvoices.length,
        quoteCount: openQuotes.length,
      },
      runwayMonths,
      transactionCount: ledger.length,
      customerCount,
      dealCount,
      disclaimer: "Readiness guidance is an estimate from your own records. It is not a credit check, bank score, or lending decision.",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
