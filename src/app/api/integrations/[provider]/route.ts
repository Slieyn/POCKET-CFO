import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { getIntegrationProvider } from "@/lib/integrations";
import { assertSafeWebhookUrl, decryptJson, encryptJson, SECRET_MASK } from "@/lib/secrets";

type RouteContext = { params: Promise<{ provider: string }> };

export async function PUT(request: Request, route: RouteContext) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    if (context.role !== "OWNER") return jsonError("Only the workspace owner can manage integrations.", 403);

    const { provider: providerId } = await route.params;
    const provider = getIntegrationProvider(providerId);
    if (!provider) return jsonError("This integration is not available.", 404);
    if (provider.builtIn) return jsonError("This integration is built in and always available.", 400);

    const body = (await request.json()) as { config?: Record<string, unknown> };
    if (!body.config || typeof body.config !== "object") return jsonError("Integration settings are required.", 400);

    const existing = await db.integration.findUnique({
      where: { businessId_provider: { businessId: context.businessId, provider: providerId } },
      select: { config: true },
    });
    const existingConfig = decryptJson<Record<string, string>>(existing?.config ?? null) ?? {};

    const config: Record<string, string> = {};
    for (const field of provider.fields) {
      const raw = body.config[field.key];
      const value = typeof raw === "string" ? raw.trim() : "";
      if (field.secret && (value === SECRET_MASK || value === "")) {
        if (existingConfig[field.key]) config[field.key] = existingConfig[field.key];
        else if (field.required) return jsonError(`${field.label} is required.`, 400);
        continue;
      }
      if (!value) {
        if (field.required) return jsonError(`${field.label} is required.`, 400);
        continue;
      }
      if (value.length > 500) return jsonError(`${field.label} is too long.`, 400);
      config[field.key] = value;
    }

    if (provider.id === "webhook") {
      const safe = assertSafeWebhookUrl(config.url ?? "");
      if (!safe.ok) return jsonError(safe.reason, 400);
      if ((config.secret ?? "").length < 16) {
        return jsonError("Use a signing secret of at least 16 characters.", 400);
      }
    }
    if (provider.id === "payfast") {
      if (!/^\d{5,12}$/.test(config.merchantId ?? "")) {
        return jsonError("Enter a valid PayFast merchant ID.", 400);
      }
      if (!["sandbox", "live"].includes(config.mode ?? "")) {
        return jsonError("Choose the PayFast environment.", 400);
      }
    }

    const encrypted = encryptJson(config);
    const integration = await db.$transaction(async (tx) => {
      const saved = await tx.integration.upsert({
        where: { businessId_provider: { businessId: context.businessId, provider: providerId } },
        create: {
          businessId: context.businessId,
          provider: providerId,
          status: "CONNECTED",
          config: encrypted,
        },
        update: { status: "CONNECTED", config: encrypted },
        select: { provider: true, status: true, updatedAt: true },
      });
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "integration.updated",
          recordType: "Integration",
          recordId: providerId,
          details: { provider: providerId, connected: true },
        },
      });
      return saved;
    });

    return NextResponse.json({
      integration: { ...integration, updatedAt: integration.updatedAt.toISOString() },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, route: RouteContext) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    if (context.role !== "OWNER") return jsonError("Only the workspace owner can manage integrations.", 403);

    const { provider: providerId } = await route.params;
    const provider = getIntegrationProvider(providerId);
    if (!provider) return jsonError("This integration is not available.", 404);
    if (provider.builtIn) return jsonError("This integration is built in and always available.", 400);

    await db.$transaction(async (tx) => {
      await tx.integration.updateMany({
        where: { businessId: context.businessId, provider: providerId },
        data: { status: "DISCONNECTED", config: null },
      });
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: "integration.disconnected",
          recordType: "Integration",
          recordId: providerId,
          details: { provider: providerId },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
