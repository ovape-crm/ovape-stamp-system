import { NextRequest, NextResponse } from "next/server";
import {
  getRequestByToken,
  isRequestExpired,
} from "@/app/_domains/_adultVerification/server";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token") ?? "";
    const clientId = process.env.BBATON_CLIENT_ID;
    const redirectUri = process.env.BBATON_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return NextResponse.redirect(new URL(`/v/${token}?result=unavailable`, request.url));
    }

    const { request: verificationRequest, admin } = await getRequestByToken(token);
    if (!verificationRequest || verificationRequest.status !== "pending") {
      return NextResponse.redirect(new URL(`/v/${token}?result=invalid`, request.url));
    }
    if (isRequestExpired(verificationRequest.expires_at)) {
      await admin
        .from("adult_verification_requests")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", verificationRequest.id);
      return NextResponse.redirect(new URL(`/v/${token}?result=expired`, request.url));
    }

    const authorizeUrl = new URL("https://bauth.bbaton.com/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "read_profile");
    authorizeUrl.searchParams.set("state", token);
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    console.error("Failed to start BBaton verification", error);
    return NextResponse.redirect(new URL("/adult-verify/error?result=error", request.url));
  }
}
