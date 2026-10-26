import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { handleRouteError } from "@/lib/http";

export async function GET() {
  try {
    const context = await getBusinessContext();
    if (!context) return NextResponse.json({ user: null, error: "Sign in is required." }, { status: 401 });
    return NextResponse.json({
      user: { name: context.userName, email: context.userEmail },
      business: { id: context.businessId, name: context.businessName },
      role: context.role,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
