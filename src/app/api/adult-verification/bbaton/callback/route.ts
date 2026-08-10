import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getRequestByToken,
  isRequestExpired,
} from "@/app/_domains/_adultVerification/server";

type BBatonTokenResponse = {
  access_token?: string;
  token_type?: string;
};

type BBatonUserResponse = {
  user_id?: string;
  adult_flag?: "Y" | "N";
};

const resultUrl = (request: NextRequest, state: string, result: string) =>
  new URL(`/v/${encodeURIComponent(state)}?result=${result}`, request.url);

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const state = request.nextUrl.searchParams.get("state") ?? "";

  try {
    if (!code || !state) return NextResponse.redirect(resultUrl(request, state || "error", "invalid"));

    const { request: verificationRequest, admin } = await getRequestByToken(state);
    if (!verificationRequest || verificationRequest.status !== "pending") {
      return NextResponse.redirect(resultUrl(request, state, "invalid"));
    }
    if (isRequestExpired(verificationRequest.expires_at)) {
      await admin
        .from("adult_verification_requests")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", verificationRequest.id);
      return NextResponse.redirect(resultUrl(request, state, "expired"));
    }

    const clientId = process.env.BBATON_CLIENT_ID;
    const clientSecret = process.env.BBATON_CLIENT_SECRET;
    const redirectUri = process.env.BBATON_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.redirect(resultUrl(request, state, "unavailable"));
    }

    const tokenResponse = await fetch("https://bauth.bbaton.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) throw new Error(`BBaton token error: ${tokenResponse.status}`);
    const tokenData = (await tokenResponse.json()) as BBatonTokenResponse;
    if (!tokenData.access_token) throw new Error("BBaton access token missing");

    const profileResponse = await fetch("https://bapi.bbaton.com/v2/user/me", {
      headers: {
        Authorization: `${tokenData.token_type || "Bearer"} ${tokenData.access_token}`,
      },
      cache: "no-store",
    });
    if (!profileResponse.ok) throw new Error(`BBaton profile error: ${profileResponse.status}`);
    const profile = (await profileResponse.json()) as BBatonUserResponse;

    if (profile.adult_flag !== "Y") {
      await admin
        .from("adult_verification_requests")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", verificationRequest.id)
        .eq("status", "pending");
      return NextResponse.redirect(resultUrl(request, state, "rejected"));
    }

    const now = new Date().toISOString();
    const providerUserHash = profile.user_id
      ? createHash("sha256").update(profile.user_id).digest("hex")
      : null;
    const { data: completed, error: completionError } = await admin.rpc(
      "complete_adult_verification_request",
      {
        p_request_id: verificationRequest.id,
        p_provider_user_hash: providerUserHash,
        p_completed_at: now,
      },
    );
    if (completionError || completed !== true) {
      throw completionError ?? new Error("Request already used or expired");
    }

    return NextResponse.redirect(resultUrl(request, state, "success"));
  } catch (error) {
    console.error("Failed to complete BBaton verification", error);
    return NextResponse.redirect(resultUrl(request, state || "error", "error"));
  }
}
