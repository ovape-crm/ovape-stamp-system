import { NextRequest, NextResponse } from "next/server";
import {
  getRequestByToken,
  isRequestExpired,
} from "@/app/_domains/_adultVerification/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const { request, admin } = await getRequestByToken(token);
    if (!request) {
      return NextResponse.json({ status: "invalid" }, { status: 404 });
    }

    if (request.status === "pending" && isRequestExpired(request.expires_at)) {
      await admin
        .from("adult_verification_requests")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", request.id);
      return NextResponse.json({ status: "expired" });
    }

    return NextResponse.json({
      status: request.status,
      expiresAt: request.expires_at,
      completedAt: request.completed_at,
    });
  } catch (error) {
    console.error("Failed to read adult verification request", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
