import { afterEach, describe, expect, it } from "vitest";
import { assertSameOrigin, handleRouteError } from "./http";

const originalAppOrigin = process.env.APP_ORIGIN;

afterEach(() => {
  if (originalAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = originalAppOrigin;
});

describe("API request helpers", () => {
  it("uses the request origin when APP_ORIGIN is not configured", () => {
    delete process.env.APP_ORIGIN;
    const sameOrigin = new Request("http://localhost:3001/api/budget", {
      method: "PUT",
      headers: { origin: "http://localhost:3001" },
    });
    const foreignOrigin = new Request("http://localhost:3001/api/budget", {
      method: "PUT",
      headers: { origin: "https://example.com" },
    });

    expect(assertSameOrigin(sameOrigin)).toBe(true);
    expect(assertSameOrigin(foreignOrigin)).toBe(false);
  });

  it("uses APP_ORIGIN when it is configured", () => {
    process.env.APP_ORIGIN = "https://app.example.com";
    const request = new Request("https://preview.example.com/api/budget", {
      method: "PUT",
      headers: { origin: "https://app.example.com" },
    });

    expect(assertSameOrigin(request)).toBe(true);
  });

  it("returns JSON errors for malformed input and duplicate records", async () => {
    const malformed = handleRouteError(new SyntaxError("bad JSON"));
    const duplicate = handleRouteError({ code: "P2002" });
    const missingDatabaseUrl = new Error("DATABASE_URL is not configured.");
    missingDatabaseUrl.name = "DatabaseConfigurationError";
    const configurationError = handleRouteError(missingDatabaseUrl);

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Request body must contain valid JSON." });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "A record with these details already exists." });
    expect(configurationError.status).toBe(503);
    expect(await configurationError.json()).toEqual({
      error: "The database is not configured. Set DATABASE_URL and try again.",
    });
  });

  it("treats a dropped database connection as temporarily unavailable", async () => {
    const dropped = handleRouteError(new Error("read ECONNRESET"));
    const terminated = handleRouteError(new Error("Connection terminated unexpectedly"));
    const closed = handleRouteError({ code: "P1017" });

    expect(dropped.status).toBe(503);
    expect(terminated.status).toBe(503);
    expect(closed.status).toBe(503);
    expect(await dropped.json()).toEqual({
      error: "The service is temporarily unavailable. Please try again shortly.",
    });
  });
});
