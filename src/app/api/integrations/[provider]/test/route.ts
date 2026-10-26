import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { getBusinessContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleRouteError, assertSameOrigin, jsonError } from "@/lib/http";
import { getIntegrationProvider } from "@/lib/integrations";
import { assertSafeWebhookUrl, decryptJson } from "@/lib/secrets";

type RouteContext = { params: Promise<{ provider: string }> };

export async function POST(request: Request, route: RouteContext) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);

  try {
    const context = await getBusinessContext();
    if (!context) return jsonError("Sign in is required.", 401);
    if (context.role !== "OWNER") return jsonError("Only the workspace owner can test integrations.", 403);

    const { provider: providerId } = await route.params;
    const provider = getIntegrationProvider(providerId);
    if (!provider) return jsonError("This integration is not available.", 404);
    if (provider.builtIn) {
      return NextResponse.json({ ok: true, message: "Bank statement import is ready to use." });
    }

    const integration = await db.integration.findUnique({
      where: { businessId_provider: { businessId: context.businessId, provider: providerId } },
      select: { id: true, status: true, config: true },
    });
    if (!integration || integration.status === "DISCONNECTED") {
      return jsonError("Connect this integration before testing it.", 400);
    }

    const config = decryptJson<Record<string, string>>(integration.config);
    if (!config) return jsonError("Saved credentials could not be read. Reconnect the integration.", 400);

    let ok = false;
    let message = "";

    if (provider.id === "webhook") {
      const safe = assertSafeWebhookUrl(config.url ?? "");
      if (!safe.ok) return jsonError(safe.reason, 400);
      const body = JSON.stringify({
        event: "integration.test",
        occurredAt: new Date().toISOString(),
        businessId: context.businessId,
        data: { message: "POCKET CFO webhook test" },
      });
      const signature = createHmac("sha256", config.secret ?? "").update(body).digest("hex");
      try {
        const response = await fetch(safe.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "PocketCFO-Webhooks/1.0",
            "X-PocketCFO-Event": "integration.test",
            "X-PocketCFO-Signature": `sha256=${signature}`,
          },
          body,
          signal: AbortSignal.timeout(8_000),
        });
        ok = response.ok;
        message = ok
          ? `Test event delivered (HTTP ${response.status}).`
          : `The endpoint responded with HTTP ${response.status}.`;
      } catch {
        ok = false;
        message = "The endpoint could not be reached within 8 seconds.";
      }
    } else if (provider.id === "payfast") {
      ok = Boolean(config.merchantId && config.merchantKey && config.passphrase);
      message = ok
        ? "Credentials are saved. PayFast will verify them on your first checkout."
        : "PayFast credentials are incomplete.";
    } else {
      ok = true;
      message = "Integration settings look complete.";
    }

    await db.$transaction(async (tx) => {
      await tx.integration.update({
        where: { id: integration.id },
        data: { status: ok ? "CONNECTED" : "ERROR", lastTestedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          businessId: context.businessId,
          actorId: context.userId,
          action: ok ? "integration.tested" : "integration.test_failed",
          recordType: "Integration",
          recordId: providerId,
          details: { provider: providerId, ok },
        },
      });
    });

    return NextResponse.json({ ok, message }, { status: ok ? 200 : 502 });
  } catch (error) {
    return handleRouteError(error);
  }
}
