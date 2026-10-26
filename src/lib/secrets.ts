import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function encryptionKey() {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!secret || secret.length < 24) {
    const error = new Error("INTEGRATION_ENCRYPTION_KEY is not configured.");
    error.name = "IntegrationKeyError";
    throw error;
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), payload.toString("base64")].join(":");
}

export function decryptJson<T = Record<string, unknown>>(value: string | null): T | null {
  if (!value) return null;
  const [version, iv, tag, payload] = value.split(":");
  if (version !== VERSION || !iv || !tag || !payload) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const decoded = Buffer.concat([decipher.update(Buffer.from(payload, "base64")), decipher.final()]);
    return JSON.parse(decoded.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export const SECRET_MASK = "••••••••";

export function maskConfig(
  config: Record<string, string> | null,
  secretFields: string[],
): Record<string, string> {
  if (!config) return {};
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      secretFields.includes(key) && value ? SECRET_MASK : value,
    ]),
  );
}

/** Prevent server-side request forgery when admins configure outbound webhooks. */
export function assertSafeWebhookUrl(input: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "Enter a valid webhook URL." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "Webhook URLs must use HTTPS." };
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return { ok: false, reason: "Webhook URLs cannot point at a local or internal host." };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    const isPrivate =
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0;
    if (isPrivate) return { ok: false, reason: "Webhook URLs cannot point at a private network address." };
  }
  if (host === "[::1]" || host.startsWith("fc") || host.startsWith("fd")) {
    return { ok: false, reason: "Webhook URLs cannot point at a private network address." };
  }
  return { ok: true, url };
}
