import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return jsonError(error.issues.map((issue) => issue.message).join(" "), 400);
  }
  if (error instanceof SyntaxError) {
    return jsonError("Request body must contain valid JSON.", 400);
  }
  if (error instanceof Error && error.name === "DatabaseConfigurationError") {
    console.error("Database configuration is missing", error);
    return jsonError("The database is not configured. Set DATABASE_URL and try again.", 503);
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    if (error.code === "P2002") return jsonError("A record with these details already exists.", 409);
    if (error.code === "P2003") {
      return jsonError("This record is still linked to other records and cannot be removed yet.", 409);
    }
    if (error.code === "P2025") return jsonError("The requested record was not found.", 404);
    if (error.code === "P1001" || error.code === "P1002" || error.code === "P1017") {
      console.error("Database is unavailable", error);
      return jsonError("The service is temporarily unavailable. Please try again shortly.", 503);
    }
  }
  // A dropped database connection rarely arrives with a Prisma code, and users
  // should see "try again shortly" rather than a generic failure.
  if (
    error instanceof Error &&
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|connection terminated|server has closed the connection|terminating connection|can't reach database/i.test(
      error.message,
    )
  ) {
    console.error("Database connection was lost", error);
    return jsonError("The service is temporarily unavailable. Please try again shortly.", 503);
  }
  console.error("Request failed", error);
  return jsonError("The request could not be completed.", 500);
}

export function assertSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}
