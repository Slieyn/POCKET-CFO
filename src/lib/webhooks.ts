import { createHmac } from "node:crypto";
import { db } from "./db";
import { decryptJson, assertSafeWebhookUrl } from "./secrets";
import { WEBHOOK_EVENTS } from "./integrations";

type WebhookConfig = { url?: string; secret?: string };

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

async function deliver(businessId: string, event: WebhookEvent, data: Record<string, unknown>) {
  const integration = await db.integration.findUnique({
    where: { businessId_provider: { businessId, provider: "webhook" } },
    select: { id: true, status: true, config: true },
  });
  if (!integration || integration.status !== "CONNECTED") return;

  const config = decryptJson<WebhookConfig>(integration.config);
  if (!config?.url || !config.secret) return;
  const safe = assertSafeWebhookUrl(config.url);
  if (!safe.ok) return;

  const body = JSON.stringify({
    event,
    occurredAt: new Date().toISOString(),
    businessId,
    data,
  });
  const signature = createHmac("sha256", config.secret).update(body).digest("hex");

  try {
    const response = await fetch(safe.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PocketCFO-Webhooks/1.0",
        "X-PocketCFO-Event": event,
        "X-PocketCFO-Signature": `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    await db.integration.update({
      where: { id: integration.id },
      data: { lastSyncedAt: new Date(), status: response.ok ? "CONNECTED" : "ERROR" },
    });
  } catch (error) {
    console.error("Webhook delivery failed", error);
    await db.integration
      .update({ where: { id: integration.id }, data: { status: "ERROR", lastSyncedAt: new Date() } })
      .catch(() => undefined);
  }
}

/** Fire-and-forget delivery so business writes are never blocked by a slow endpoint. */
export function dispatchWebhook(businessId: string, event: WebhookEvent, data: Record<string, unknown>) {
  void deliver(businessId, event, data).catch((error) => console.error("Webhook dispatch failed", error));
}

export function verifyWebhookSignature(body: string, secret: string, signatureHeader: string | null) {
  if (!signatureHeader) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return expected === signatureHeader;
}
