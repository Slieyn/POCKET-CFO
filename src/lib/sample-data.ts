import type { Prisma } from "@prisma/client";

type SampleDataInput = {
  businessId: string;
  userId: string;
};

export async function addSampleBusinessData(
  tx: Prisma.TransactionClient,
  { businessId, userId }: SampleDataInput,
) {
  const marketCustomer = await tx.customer.create({
    data: { businessId, name: "Sample customer — Sunrise Market", email: "hello@sunrise.example" },
  });
  const cafeCustomer = await tx.customer.create({
    data: { businessId, name: "Sample customer — Corner Cafe", email: "orders@cornercafe.example" },
  });
  const studioCustomer = await tx.customer.create({
    data: { businessId, name: "Sample customer — Indigo Studio", email: "accounts@indigostudio.example" },
  });

  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const invoice = await tx.deal.create({
    data: {
      businessId,
      customerId: marketCustomer.id,
      reference: `SAMPLE-INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      type: "INVOICE",
      status: "PAID",
      description: "Sample weekly market produce order",
      totalMinor: 1250000n,
      dueAt: daysAgo(3),
      items: {
        create: [
          { description: "Seasonal produce boxes", quantity: 10, unitMinor: 85000n },
          { description: "Delivery", quantity: 1, unitMinor: 400000n },
        ],
      },
    },
  });
  await tx.deal.create({
    data: {
      businessId,
      customerId: studioCustomer.id,
      reference: `SAMPLE-QTE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      type: "QUOTE",
      status: "SENT",
      description: "Sample branded packaging quote",
      totalMinor: 840000n,
      dueAt: daysAgo(-7),
      items: {
        create: [{ description: "Branded packaging batch", quantity: 200, unitMinor: 4200n }],
      },
    },
  });

  const entries = [
    { type: "INCOME" as const, amountMinor: 1250000n, description: "[SAMPLE] Market produce order", category: "Sales", days: 3, customerId: marketCustomer.id, dealId: invoice.id },
    { type: "EXPENSE" as const, amountMinor: 480000n, description: "[SAMPLE] Fresh stock and supplies", category: "Inventory", days: 5 },
    { type: "OWNER_DRAW" as const, amountMinor: 150000n, description: "[SAMPLE] Owner draw", category: "Owner draw", days: 7 },
    { type: "INCOME" as const, amountMinor: 840000n, description: "[SAMPLE] Cafe catering order", category: "Sales", days: 18, customerId: cafeCustomer.id },
    { type: "EXPENSE" as const, amountMinor: 620000n, description: "[SAMPLE] Packaging and delivery", category: "Operations", days: 27 },
    { type: "INCOME" as const, amountMinor: 1760000n, description: "[SAMPLE] Weekend market sales", category: "Sales", days: 39 },
    { type: "EXPENSE" as const, amountMinor: 920000n, description: "[SAMPLE] Supplier restock", category: "Inventory", days: 48 },
    { type: "INCOME" as const, amountMinor: 690000n, description: "[SAMPLE] Studio gift order", category: "Sales", days: 64, customerId: studioCustomer.id },
  ];

  await tx.financialTransaction.createMany({
    data: entries.map((entry) => ({
      businessId,
      createdById: userId,
      type: entry.type,
      amountMinor: entry.amountMinor,
      description: entry.description,
      category: entry.category,
      occurredAt: daysAgo(entry.days),
      customerId: entry.customerId ?? null,
      dealId: entry.dealId ?? null,
    })),
  });

  await tx.auditEvent.create({
    data: {
      businessId,
      actorId: userId,
      action: "demo.sample_data_added",
      recordType: "Business",
      recordId: businessId,
      details: { sampleRecords: true, transactionCount: entries.length, customerCount: 3, dealCount: 2 },
    },
  });
}
