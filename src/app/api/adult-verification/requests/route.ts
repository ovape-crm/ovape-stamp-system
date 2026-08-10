import { NextRequest, NextResponse } from "next/server";
import {
  createVerificationToken,
  getAuthenticatedStaff,
  hashVerificationToken,
} from "@/app/_domains/_adultVerification/server";
import { createSupabaseAdmin } from "@/libs/supabaseAdmin";

export async function GET(request: NextRequest) {
  try {
    const staff = await getAuthenticatedStaff(request.headers.get("authorization"));
    if (!staff) {
      return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("adult_verification_requests")
      .select("id, request_label, status, expires_at, completed_at, created_at, customer_id")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const now = Date.now();
    return NextResponse.json({
      items: (data ?? []).map((item) => ({
        ...item,
        status:
          item.status === "pending" && new Date(item.expires_at).getTime() <= now
            ? "expired"
            : item.status,
      })),
    });
  } catch (error) {
    console.error("Failed to list adult verification requests", error);
    return NextResponse.json({ message: "인증 요청을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await getAuthenticatedStaff(request.headers.get("authorization"));
    if (!staff) {
      return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = (await request.json()) as { label?: string; customerId?: string };
    const label = body.label?.trim();
    if (!label || label.length > 100) {
      return NextResponse.json({ message: "구분용 이름이나 메모를 100자 이내로 입력해 주세요." }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    let customerId: string | null = null;
    if (body.customerId && /^\d+$/.test(body.customerId)) {
      const { data: customer } = await admin
        .from("customers")
        .select("id")
        .eq("id", body.customerId)
        .maybeSingle();
      if (!customer) {
        return NextResponse.json({ message: "고객을 찾을 수 없습니다." }, { status: 404 });
      }
      customerId = body.customerId;
    }

    const token = createVerificationToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await admin.from("adult_verification_requests").insert({
      customer_id: customerId,
      request_label: label,
      token_hash: hashVerificationToken(token),
      status: "pending",
      expires_at: expiresAt,
      created_by: staff.id,
    });
    if (error) throw error;

    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || request.nextUrl.origin;
    return NextResponse.json({
      url: `${origin}/adult-verify/${token}`,
      expiresAt,
    });
  } catch (error) {
    console.error("Failed to create adult verification request", error);
    return NextResponse.json(
      { message: "인증 링크를 만들지 못했습니다. 서버 설정을 확인해 주세요." },
      { status: 500 },
    );
  }
}
