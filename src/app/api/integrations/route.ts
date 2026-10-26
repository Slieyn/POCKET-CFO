import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, jsonError } from "@/lib/http";
import { INTEGRATION_PROVIDERS, type IntegrationProvider } from "@/lib/integrations";
import { decryptJson, maskConfig } from "@/lib/secrets";

type IntegrationSummary = {
  id: string;
  name: string;
  category: IntegrationProvider["category"];
  description: string;
  builtIn: boolean;
  fields: IntegrationProvider["fields"];
  note?: string;
  events?: string[];
  connected: boolean;
  status: string;
  configured: Record<string, string>;
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
  available: boolean;
};

export async function GET() {
  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);

    const [rows, imports] = await Promise.all([
      db.integration.findMany({
        where: { businessId: context.businessId },
        select: { id: true, provider: true, status: true, config: true, lastTestedAt: true, lastSyncedAt: true },
      }),
      db.importBatch.findMany({
        where: { businessId: context.businessId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, fileName: true, rowsRead: true, rowsImported: true, rowsSkipped: true, createdAt: true },
      }),
    ]);

    const byProvider = new Map(rows.map((row) => [row.provider, row]));

    const integrations: IntegrationSummary[] = INTEGRATION_PROVIDERS.map((provider) => {
      const row = byProvider.get(provider.id);
      const secretFields = provider.fields.filter((field) => field.secret).map((field) => field.key);
      const config = decryptJson<Record<string, string>>(row?.config ?? null);
      const connected = provider.builtIn ? true : row?.status === "CONNECTED";
      return {
        id: provider.id,
        name: provider.name,
        category: provider.category,
        description: provider.description,
        builtIn: Boolean(provider.builtIn),
        fields: provider.fields,
        note: provider.note,
        events: provider.events,
        connected,
        status: provider.builtIn ? "AVAILABLE" : (row?.status ?? "DISCONNECTED"),
        configured: maskConfig(config, secretFields),
        lastTestedAt: row?.lastTestedAt?.toISOString() ?? null,
        lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
        available: true,
      };
    });

    return NextResponse.json({
      integrations,
      role: context.role,
      imports: imports.map((batch) => ({ ...batch, createdAt: batch.createdAt.toISOString() })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
