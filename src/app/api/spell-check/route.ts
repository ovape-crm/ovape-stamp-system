import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedStaff } from "@/app/_domains/_adultVerification/server";

const BAREUN_CORRECT_URL =
  "https://api.bareun.ai/bareun.RevisionService/CorrectError";
const BAREUN_ANALYZE_URL =
  "https://api.bareun.ai/bareun.LanguageService/AnalyzeSyntax";
const MAX_CONTENT_LENGTH = 2_000;

type SyntaxAnalysisResponse = {
  sentences?: Array<{ refined?: unknown }>;
};

export async function POST(request: NextRequest) {
  try {
    const staff = await getAuthenticatedStaff(
      request.headers.get("authorization"),
    );
    if (!staff) {
      return NextResponse.json(
        { message: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

    const apiKey = process.env.BAREUN_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { message: "바른AI API 키가 설정되지 않았습니다." },
        { status: 503 },
      );
    }

    const body = (await request.json()) as { content?: unknown };
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json(
        { message: "검사할 특이사항을 입력해 주세요." },
        { status: 400 },
      );
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        {
          message: `특이사항은 ${MAX_CONTENT_LENGTH.toLocaleString("ko-KR")}자 이하로 검사할 수 있습니다.`,
        },
        { status: 400 },
      );
    }

    const headers = {
      "Content-Type": "application/json",
      "api-key": apiKey,
    };
    const analysisResponse = await fetch(BAREUN_ANALYZE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        document: { content, language: "ko-KR" },
        encoding_type: "UTF32",
        auto_split_sentence: true,
        auto_spacing: true,
        auto_jointing: false,
      }),
      cache: "no-store",
    });

    if (!analysisResponse.ok) {
      console.error("Bareun spacing request failed", analysisResponse.status);
      return NextResponse.json(
        { message: "바른AI 띄어쓰기 검사 요청에 실패했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 502 },
      );
    }

    const analysis = (await analysisResponse.json()) as SyntaxAnalysisResponse;
    const spacingResult = analysis.sentences
      ?.map((sentence) => sentence.refined)
      .filter((sentence): sentence is string => typeof sentence === "string")
      .join("\n");
    if (!spacingResult) {
      return NextResponse.json(
        { message: "바른AI 띄어쓰기 검사 결과를 읽지 못했습니다." },
        { status: 502 },
      );
    }

    const response = await fetch(BAREUN_CORRECT_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        document: { content: spacingResult, language: "ko-KR" },
        encoding_type: "UTF32",
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Bareun spell-check request failed", response.status);
      return NextResponse.json(
        { message: "바른AI 맞춤법 검사 요청에 실패했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 502 },
      );
    }

    const result = (await response.json()) as { revised?: unknown };
    if (typeof result.revised !== "string") {
      return NextResponse.json(
        { message: "바른AI 맞춤법 검사 결과를 읽지 못했습니다." },
        { status: 502 },
      );
    }

    return NextResponse.json({ revised: result.revised || spacingResult });
  } catch (error) {
    console.error("Spell-check API failed", error);
    return NextResponse.json(
      { message: "맞춤법 검사 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
