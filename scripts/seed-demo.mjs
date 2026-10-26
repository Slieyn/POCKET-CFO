import "dotenv/config";
import { createHash, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const scrypt = promisify(scryptCallback);
const client = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://genura:genura_dev_only@127.0.0.1:5432/postgres?schema=public",
});

const BUSINESS_NAME = "Thandi's Fresh Produce";
const DEMO_ACCOUNTS = [
  {
    name: "Thandi Mokoena",
    email: "owner@pocketcfo.demo",
    password: "PocketCfoDemo2026!",
    role: "OWNER",
  },
  {
    name: "Sipho Ndlovu",
    email: "admin@pocketcfo.demo",
    password: "PocketCfoAdmin2026!",
    role: "ADMIN",
  },
  {
    name: "Lerato Khumalo",
    email: "staff@pocketcfo.demo",
    password: "PocketCfoStaff2026!",
    role: "MEMBER",
  },
];

const id = () => `c${randomBytes(12).toString("hex")}`;
const now = new Date();
const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

function monthDate(monthsAgo, day, hour = 10) {
  const date = new Date(now.getFullYear(), now.getMonth() - monthsAgo, day, hour, 0, 0, 0);
  return date > now ? new Date(now.getTime() - 60 * 60 * 1000) : date;
}

function monthLabel(monthsAgo) {
  const date = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

function dayAt(offsetDays, hour = 9, minute = 0) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, hour, minute, 0, 0);
}

// Must stay identical to the fingerprint in src/lib/bank-import.ts, so the bank
// rows seeded here are recognised as duplicates when samples/*.csv is imported.
function statementFingerprint(date, description, amountMinor, type) {
  const calendarDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
  return createHash("sha256").update(`${calendarDate}|${description}|${amountMinor}|${type}`).digest("hex");
}

async function addTransaction({
  businessId,
  createdById,
  type,
  amountMinor,
  description,
  category,
  occurredAt,
  customerId = null,
  dealId = null,
  source = "MANUAL",
  externalId = null,
}) {
  await client.query(
    `INSERT INTO "FinancialTransaction"
      ("id", "businessId", "type", "amountMinor", "currency", "description", "category",
       "occurredAt", "customerId", "dealId", "source", "externalId", "createdById", "createdAt", "updatedAt")
     VALUES ($1, $2, $3::"TransactionType", $4, 'ZAR', $5, $6, $7, $8, $9, $10, $11, $12, now(), now())`,
    [
      id(),
      businessId,
      type,
      String(amountMinor),
      description,
      category,
      occurredAt,
      customerId,
      dealId,
      source,
      externalId,
      createdById,
    ],
  );
}

async function addDeal({
  businessId,
  customerId,
  reference,
  type,
  status,
  description,
  dueAt,
  createdAt,
  items,
}) {
  const dealId = id();
  const totalMinor = items.reduce((sum, item) => sum + item.quantity * item.unitMinor, 0);
  await client.query(
    `INSERT INTO "Deal"
      ("id", "businessId", "customerId", "reference", "type", "status", "description",
       "totalMinor", "currency", "dueAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5::"DealType", $6::"DealStatus", $7, $8, 'ZAR', $9, $10, now())`,
    [dealId, businessId, customerId, reference, type, status, description, String(totalMinor), dueAt, createdAt],
  );
  for (const item of items) {
    await client.query(
      `INSERT INTO "DealItem" ("id", "dealId", "description", "quantity", "unitMinor")
       VALUES ($1, $2, $3, $4, $5)`,
      [id(), dealId, item.description, item.quantity, String(item.unitMinor)],
    );
  }
  return { dealId, totalMinor };
}

async function addAudit({ businessId, actorId, action, recordType, recordId, details, createdAt }) {
  await client.query(
    `INSERT INTO "AuditEvent"
      ("id", "businessId", "actorId", "action", "recordType", "recordId", "details", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [id(), businessId, actorId, action, recordType, recordId, JSON.stringify(details ?? {}), createdAt],
  );
}

async function addTask({
  businessId,
  createdById,
  assignedToId = null,
  title,
  notes = null,
  scheduledFor,
  allDay = false,
  durationMinutes = 30,
  priority = "MEDIUM",
  status = "TODO",
  completedAt = null,
}) {
  const taskId = id();
  await client.query(
    `INSERT INTO "Task"
      ("id", "businessId", "title", "notes", "scheduledFor", "allDay", "durationMinutes",
       "priority", "status", "assignedToId", "createdById", "completedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::"TaskPriority", $9::"TaskStatus", $10, $11, $12, now(), now())`,
    [
      taskId,
      businessId,
      title,
      notes,
      scheduledFor,
      allDay,
      durationMinutes,
      priority,
      status,
      assignedToId,
      createdById,
      completedAt,
    ],
  );
  return taskId;
}

async function main() {
  await client.connect();
  console.log("Seeding POCKET CFO demo workspace…");

  await client.query("BEGIN");
  try {
    // Remove every previous demo workspace so this script can be re-run safely.
    const demoUsers = await client.query(
      `SELECT "id" FROM "User" WHERE "email" ILIKE '%@pocketcfo.demo' OR "email" ILIKE '%@genura.demo'`,
    );
    for (const user of demoUsers.rows) {
      const owned = await client.query(
        `SELECT "businessId" FROM "Membership" WHERE "userId" = $1 AND "role" = 'OWNER'`,
        [user.id],
      );
      const businessIds = owned.rows.map((row) => row.businessId);
      if (businessIds.length > 0) {
        await client.query(`DELETE FROM "Deal" WHERE "businessId" = ANY($1::text[])`, [businessIds]);
        await client.query(`DELETE FROM "Business" WHERE "id" = ANY($1::text[])`, [businessIds]);
      }
    }
    await client.query(
      `DELETE FROM "User" WHERE "email" ILIKE '%@pocketcfo.demo' OR "email" ILIKE '%@genura.demo'`,
    );

    const businessId = id();
    await client.query(
      `INSERT INTO "Business" ("id", "name", "createdAt") VALUES ($1, $2, $3)`,
      [businessId, BUSINESS_NAME, monthDate(8, 1)],
    );
    await client.query(
      `INSERT INTO "Budget"
        ("id", "businessId", "operationsPercent", "reservePercent", "ownerDrawPercent", "updatedAt")
       VALUES ($1, $2, 55, 25, 20, now())`,
      [id(), businessId],
    );

    const users = {};
    for (const account of DEMO_ACCOUNTS) {
      const userId = id();
      const passwordHash = await hashPassword(account.password);
      await client.query(
        `INSERT INTO "User" ("id", "email", "name", "passwordHash", "createdAt")
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, account.email, account.name, passwordHash, monthDate(8, 1)],
      );
      await client.query(
        `INSERT INTO "Membership" ("id", "userId", "businessId", "role", "createdAt")
         VALUES ($1, $2, $3, $4, $5)`,
        [id(), userId, businessId, account.role, monthDate(8, 1)],
      );
      users[account.role] = { id: userId, ...account };
    }

    const ownerId = users.OWNER.id;

    const customerRows = [
      ["sunrise", "Sunrise Market", "orders@sunrisemarket.co.za"],
      ["corner", "Corner Cafe", "hello@cornercafe.co.za"],
      ["indigo", "Indigo Studio", "accounts@indigostudio.co.za"],
      ["khumalo", "Khumalo Events", "events@khumaloevents.co.za"],
      ["green", "Green Route Deli", "orders@greenroute.co.za"],
      ["coop", "Township Fresh Co-op", "buyers@townshipfresh.co.za"],
    ];
    const customers = {};
    for (const [key, name, email] of customerRows) {
      const customerId = id();
      await client.query(
        `INSERT INTO "Customer" ("id", "businessId", "name", "email", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, now())`,
        [customerId, businessId, name, email, monthDate(7, 12)],
      );
      customers[key] = customerId;
    }

    // Six months of trading activity, including a slower start-up month.
    const plan = [
      { monthsAgo: 5, scale: 0.8 },
      { monthsAgo: 4, scale: 0.92 },
      { monthsAgo: 3, scale: 0.87 },
      { monthsAgo: 2, scale: 1.06 },
      { monthsAgo: 1, scale: 1.0 },
      { monthsAgo: 0, scale: 0.74 },
    ];
    const amount = (base, scale) => Math.round(base * scale);

    for (const { monthsAgo, scale } of plan) {
      const label = monthLabel(monthsAgo);
      const lastDay = monthsAgo === 0 ? Math.min(now.getDate() - 1, 21) : 27;
      const day = (wanted) => Math.min(wanted, Math.max(lastDay, 1));

      await addTransaction({
        businessId, createdById: ownerId, type: "INCOME",
        amountMinor: amount(1_250_000, scale),
        description: `Wholesale order — Sunrise Market (${label})`,
        category: "Wholesale orders", occurredAt: monthDate(monthsAgo, day(4)),
        customerId: customers.sunrise,
      });
      await addTransaction({
        businessId, createdById: ownerId, type: "INCOME",
        amountMinor: amount(540_000, scale),
        description: `Market day sales — Saturday stall (${label})`,
        category: "Market sales", occurredAt: monthDate(monthsAgo, day(8)),
      });
      await addTransaction({
        businessId, createdById: ownerId, type: "INCOME",
        amountMinor: amount(385_000, scale),
        description: `Veg box subscriptions — Green Route Deli (${label})`,
        category: "Subscriptions", occurredAt: monthDate(monthsAgo, day(12)),
        customerId: customers.green,
      });
      await addTransaction({
        businessId, createdById: ownerId, type: "INCOME",
        amountMinor: amount(460_000, scale),
        description: `Cafe supply order — Corner Cafe (${label})`,
        category: "Wholesale orders", occurredAt: monthDate(monthsAgo, day(16)),
        customerId: customers.corner,
      });
      if (monthsAgo === 4 || monthsAgo === 2) {
        await addTransaction({
          businessId, createdById: ownerId, type: "INCOME",
          amountMinor: amount(780_000, scale),
          description: `Event produce — Khumalo Events (${label})`,
          category: "Events & catering", occurredAt: monthDate(monthsAgo, day(20)),
          customerId: customers.khumalo,
        });
      }

      await addTransaction({
        businessId, createdById: ownerId, type: "EXPENSE",
        amountMinor: amount(690_000, scale),
        description: "Fresh produce stock — City Deep market",
        category: "Stock & supplies", occurredAt: monthDate(monthsAgo, day(3)),
      });
      await addTransaction({
        businessId, createdById: ownerId, type: "EXPENSE",
        amountMinor: amount(165_000, scale),
        description: "Fuel and delivery route",
        category: "Transport", occurredAt: monthDate(monthsAgo, day(6)),
      });
      await addTransaction({
        businessId, createdById: ownerId, type: "EXPENSE",
        amountMinor: amount(78_000, scale),
        description: "Packaging, boxes and labels",
        category: "Packaging", occurredAt: monthDate(monthsAgo, day(9)),
      });
      await addTransaction({
        businessId, createdById: ownerId, type: "EXPENSE",
        amountMinor: amount(95_000, scale),
        description: "Market stall rental",
        category: "Premises", occurredAt: monthDate(monthsAgo, day(1)),
      });
      await addTransaction({
        businessId, createdById: ownerId, type: "EXPENSE",
        amountMinor: amount(42_000, scale),
        description: "Airtime, data and card machine fees",
        category: "Admin & fees", occurredAt: monthDate(monthsAgo, day(14)),
      });
      await addTransaction({
        businessId, createdById: ownerId, type: "EXPENSE",
        amountMinor: amount(88_000, scale),
        description: "Electricity and cold-room power",
        category: "Utilities", occurredAt: monthDate(monthsAgo, day(10)),
      });
      if (monthsAgo !== 0) {
        await addTransaction({
          businessId, createdById: ownerId, type: "EXPENSE",
          amountMinor: amount(210_000, scale),
          description: "Casual packing and delivery wages",
          category: "Wages", occurredAt: monthDate(monthsAgo, day(25)),
        });
      }
      if (monthsAgo === 3) {
        await addTransaction({
          businessId, createdById: ownerId, type: "EXPENSE",
          amountMinor: 130_000,
          description: "Cold-room repair and service",
          category: "Equipment", occurredAt: monthDate(monthsAgo, 19),
        });
      }

      await addTransaction({
        businessId, createdById: ownerId, type: "OWNER_DRAW",
        amountMinor: amount(450_000, scale),
        description: `Owner draw — ${label}`,
        category: "Owner draw",
        occurredAt: monthDate(monthsAgo, monthsAgo === 0 ? day(21) : 28),
      });
    }

    const invoiceOne = await addDeal({
      businessId, customerId: customers.sunrise,
      reference: `INV-${now.getFullYear()}-001`, type: "INVOICE", status: "PAID",
      description: "Weekly vegetable boxes and delivery for Sunrise Market.",
      dueAt: monthDate(1, 20),
      createdAt: monthDate(2, 18),
      items: [
        { description: "Weekly vegetable boxes (40 boxes)", quantity: 40, unitMinor: 18_500 },
        { description: "Delivery to Mowbray", quantity: 1, unitMinor: 45_000 },
      ],
    });
    const invoiceTwo = await addDeal({
      businessId, customerId: customers.corner,
      reference: `INV-${now.getFullYear()}-002`, type: "INVOICE", status: "SENT",
      description: "Fresh produce and herbs for the cafe kitchen.",
      dueAt: new Date(now.getTime() + 10 * 86_400_000),
      createdAt: monthDate(0, 3),
      items: [
        { description: "Fresh produce — cafe supply", quantity: 6, unitMinor: 89_000 },
        { description: "Herbs and salad mixes", quantity: 10, unitMinor: 15_000 },
      ],
    });
    const invoiceThree = await addDeal({
      businessId, customerId: customers.khumalo,
      reference: `INV-${now.getFullYear()}-003`, type: "INVOICE", status: "SENT",
      description: "Produce for the Khumalo corporate launch event.",
      dueAt: monthDate(0, 10),
      createdAt: monthDate(1, 8),
      items: [
        { description: "Event catering produce", quantity: 1, unitMinor: 380_000 },
        { description: "Delivery and setup", quantity: 1, unitMinor: 47_500 },
      ],
    });
    await addDeal({
      businessId, customerId: customers.indigo,
      reference: `QUO-${now.getFullYear()}-004`, type: "QUOTE", status: "SENT",
      description: "Brand launch shoot — produce styling and sourcing.",
      dueAt: new Date(now.getTime() + 14 * 86_400_000),
      createdAt: monthDate(0, 5),
      items: [
        { description: "Produce styling and sourcing", quantity: 1, unitMinor: 895_000 },
        { description: "Delivery and setup", quantity: 1, unitMinor: 120_000 },
        { description: "Speciality sourcing fee", quantity: 1, unitMinor: 480_000 },
      ],
    });
    await addDeal({
      businessId, customerId: customers.green,
      reference: `QUO-${now.getFullYear()}-005`, type: "QUOTE", status: "DRAFT",
      description: "Monthly office fruit boxes for Green Route Deli.",
      dueAt: null,
      createdAt: monthDate(0, 7),
      items: [
        { description: "Monthly office fruit boxes", quantity: 5, unitMinor: 65_000 },
      ],
    });

    // A payment linked to the paid invoice, so provenance is visible in the ledger.
    await addTransaction({
      businessId, createdById: ownerId, type: "INCOME",
      amountMinor: invoiceOne.totalMinor,
      description: `Payment received — ${`INV-${now.getFullYear()}-001`}`,
      category: "Invoice payments", occurredAt: monthDate(1, 22),
      customerId: customers.sunrise, dealId: invoiceOne.dealId,
    });

    // A working week of tasks so the calendar opens with a realistic plan.
    const overdueTaskId = await addTask({
      businessId, createdById: ownerId, assignedToId: ownerId,
      title: "Chase the outstanding payment for INV-002",
      notes: "Call Corner Cafe accounts and confirm the payment date.",
      scheduledFor: dayAt(-1, 15, 0), durationMinutes: 30, priority: "HIGH",
    });
    await addTask({
      businessId, createdById: ownerId, assignedToId: users.MEMBER.id,
      title: "Pack and label the Sunrise Market order",
      notes: "40 boxes · include the delivery note and allergen sheet.",
      scheduledFor: dayAt(0, 9, 0), durationMinutes: 60, priority: "MEDIUM",
    });
    await addTask({
      businessId, createdById: ownerId, assignedToId: ownerId,
      title: "Call Corner Cafe about next week's herbs",
      scheduledFor: dayAt(0, 11, 0), durationMinutes: 30, priority: "MEDIUM",
    });
    await addTask({
      businessId, createdById: ownerId, assignedToId: users.ADMIN.id,
      title: "Send invoice follow-up to Khumalo Events",
      notes: "Reference INV-003 · due this week.",
      scheduledFor: dayAt(0, 14, 0), durationMinutes: 30, priority: "HIGH",
    });
    await addTask({
      businessId, createdById: ownerId, assignedToId: users.MEMBER.id,
      title: "Confirm Saturday market stall stock",
      scheduledFor: dayAt(0, 16, 30), durationMinutes: 30, priority: "LOW",
    });
    await addTask({
      businessId, createdById: ownerId, assignedToId: ownerId,
      title: "Check today's produce prices at City Deep",
      scheduledFor: dayAt(0, 7, 30), durationMinutes: 30, priority: "HIGH",
      status: "DONE", completedAt: dayAt(0, 8, 5),
    });
    await addTask({
      businessId, createdById: ownerId, assignedToId: users.ADMIN.id,
      title: "Collect packaging order from the supplier",
      scheduledFor: dayAt(1, 8, 0), durationMinutes: 45, priority: "MEDIUM",
    });
    await addTask({
      businessId, createdById: ownerId, assignedToId: ownerId,
      title: "Team check-in: plan the week ahead",
      notes: "15 minutes standing up. Bring delivery bottlenecks.",
      scheduledFor: dayAt(1, 10, 0), durationMinutes: 30, priority: "LOW",
    });
    await addTask({
      businessId, createdById: users.ADMIN.id, assignedToId: users.ADMIN.id,
      title: "Review the monthly budget split",
      scheduledFor: dayAt(3, 9, 30), durationMinutes: 45, priority: "MEDIUM",
    });
    await addTask({
      businessId, createdById: ownerId, assignedToId: ownerId,
      title: "Deliver veg boxes to Green Route Deli",
      notes: "Five office boxes · leave with reception.",
      scheduledFor: dayAt(6, 7, 0), durationMinutes: 90, priority: "HIGH",
    });
    const completedTaskId = await addTask({
      businessId, createdById: ownerId,
      title: "Order fresh stock for the week",
      scheduledFor: dayAt(-2, 10, 0), durationMinutes: 45, priority: "MEDIUM",
      status: "DONE", completedAt: dayAt(-2, 11, 15),
    });
    await addTask({
      businessId, createdById: users.ADMIN.id, assignedToId: users.ADMIN.id,
      title: "Prepare the Indigo Studio launch quote",
      scheduledFor: dayAt(8, 11, 0), durationMinutes: 60, priority: "MEDIUM",
    });

    // Two rows that arrived through the bank CSV importer. The descriptions,
    // amounts and fingerprints match samples/capitec-october-2026.csv, so a demo
    // re-import of that statement is correctly recognised as already recorded.
    const bankRows = [
      {
        type: "INCOME", amountMinor: 965_000,
        description: "Card settlement - Yoco",
        category: "Card settlements", day: 2,
      },
      {
        type: "EXPENSE", amountMinor: 428_550,
        description: "City Deep produce stock",
        category: "Stock & supplies", day: 3,
      },
    ];
    for (const row of bankRows) {
      const occurredAt = monthDate(0, row.day);
      await addTransaction({
        businessId, createdById: ownerId, type: row.type, amountMinor: row.amountMinor,
        description: row.description, category: row.category,
        occurredAt, source: "BANK_CSV",
        externalId: statementFingerprint(
          occurredAt,
          row.description,
          String(row.amountMinor),
          row.type,
        ),
      });
    }

    await client.query(
      `INSERT INTO "ImportBatch"
        ("id", "businessId", "provider", "fileName", "rowsRead", "rowsImported", "rowsSkipped", "createdAt")
       VALUES ($1, $2, 'BANK_CSV', 'capitec-october-2026.csv', 7, 2, 5, $3)`,
      [id(), businessId, monthDate(0, 8)],
    );

    // A readable starting audit trail.
    await addAudit({
      businessId, actorId: ownerId, action: "business.created", recordType: "Business",
      recordId: businessId, details: { name: BUSINESS_NAME }, createdAt: monthDate(8, 1),
    });
    await addAudit({
      businessId, actorId: ownerId, action: "team.member_added", recordType: "Membership",
      recordId: businessId, details: { email: users.ADMIN.email, role: "ADMIN" },
      createdAt: monthDate(7, 15),
    });
    await addAudit({
      businessId, actorId: ownerId, action: "team.member_added", recordType: "Membership",
      recordId: businessId, details: { email: users.MEMBER.email, role: "MEMBER" },
      createdAt: monthDate(6, 4),
    });
    await addAudit({
      businessId, actorId: ownerId, action: "invoice.sent", recordType: "Deal",
      recordId: invoiceTwo.dealId, details: { reference: `INV-${now.getFullYear()}-002` },
      createdAt: monthDate(0, 3),
    });
    await addAudit({
      businessId, actorId: ownerId, action: "invoice.sent", recordType: "Deal",
      recordId: invoiceThree.dealId, details: { reference: `INV-${now.getFullYear()}-003` },
      createdAt: monthDate(1, 8),
    });
    await addAudit({
      businessId, actorId: ownerId, action: "import.completed", recordType: "ImportBatch",
      recordId: businessId, details: { fileName: "capitec-october-2026.csv", imported: 2, skipped: 5 },
      createdAt: monthDate(0, 8),
    });
    await addAudit({
      businessId, actorId: users.ADMIN.id, action: "budget.updated", recordType: "Budget",
      recordId: businessId, details: { operationsPercent: 55, reservePercent: 25, ownerDrawPercent: 20 },
      createdAt: monthDate(2, 11),
    });
    await addAudit({
      businessId, actorId: ownerId, action: "task.created", recordType: "Task",
      recordId: overdueTaskId,
      details: { title: "Chase the outstanding payment for INV-002", priority: "HIGH" },
      createdAt: dayAt(-1, 9),
    });
    await addAudit({
      businessId, actorId: users.MEMBER.id, action: "task.completed", recordType: "Task",
      recordId: completedTaskId,
      details: { title: "Order fresh stock for the week" },
      createdAt: dayAt(-2, 11, 15),
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  console.log("Demo workspace ready.\n");
  console.log(`Business: ${BUSINESS_NAME}`);
  console.log("Sign in with any of these accounts:\n");
  for (const account of DEMO_ACCOUNTS) {
    console.log(`  ${account.role.padEnd(6)} ${account.email.padEnd(22)} ${account.password}`);
  }
  console.log("\nChange these passwords after testing. The accounts are local demo data only.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
