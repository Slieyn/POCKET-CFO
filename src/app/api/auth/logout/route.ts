import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { assertSameOrigin, handleRouteError, jsonError } from "@/lib/http";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError("Request origin could not be verified.", 403);
  try {
    await clearSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
