import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  businessName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128),
  includeSampleData: z.boolean().default(false),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128),
});

export const transactionSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "OWNER_DRAW"]),
  amount: z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/),
  description: z.string().trim().min(1).max(240),
  category: z.string().trim().min(1).max(80),
  occurredAt: z.iso.datetime(),
  customerId: z.string().cuid().optional().nullable(),
  dealId: z.string().cuid().optional().nullable(),
});

export const budgetSchema = z.object({
  operationsPercent: z.number().int().min(0).max(100),
  reservePercent: z.number().int().min(0).max(100),
  ownerDrawPercent: z.number().int().min(0).max(100),
}).refine(
  (budget) => budget.operationsPercent + budget.reservePercent + budget.ownerDrawPercent === 100,
  { message: "Budget allocations must total exactly 100%." },
);

export const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
});

export const businessSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z
    .string()
    .min(12, "Use at least 12 characters.")
    .max(128)
    .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
      message: "Include at least one letter and one number.",
    }),
});

export const accountDeleteSchema = z.object({
  password: z.string().min(1).max(128),
  confirmation: z.string().trim().min(1).max(120),
});

export const teamMemberSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z
    .string()
    .min(12, "Use at least 12 characters.")
    .max(128)
    .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
      message: "Include at least one letter and one number.",
    }),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export const customerUpdateSchema = customerSchema.partial().refine(
  (input) => input.name !== undefined || input.email !== undefined,
  { message: "Provide a customer name or email to update." },
);

export const dealStatusSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "PAID", "CANCELLED"]),
});

export const dealSchema = z.object({
  customerId: z.string().cuid(),
  type: z.enum(["QUOTE", "INVOICE"]),
  description: z.string().trim().min(1).max(1000),
  dueAt: z.iso.datetime().optional().nullable(),
  items: z.array(z.object({
    description: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(100000),
    unitAmount: z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/),
  })).min(1).max(50),
});

const taskFields = {
  title: z.string().trim().min(1, "Add a task title.").max(160),
  notes: z.string().trim().max(1000).nullable(),
  scheduledFor: z.iso.datetime(),
  allDay: z.boolean(),
  durationMinutes: z.number().int().min(15, "Tasks must last at least 15 minutes.").max(480),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  assignedToId: z.string().cuid().nullable(),
  status: z.enum(["TODO", "DONE"]),
};

export const taskCreateSchema = z.object({
  title: taskFields.title,
  notes: taskFields.notes.optional(),
  scheduledFor: taskFields.scheduledFor,
  allDay: taskFields.allDay.default(false),
  durationMinutes: taskFields.durationMinutes.default(30),
  priority: taskFields.priority.default("MEDIUM"),
  assignedToId: taskFields.assignedToId.optional(),
});

export const taskUpdateSchema = z
  .object(taskFields)
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Choose at least one task detail to update.",
  });

