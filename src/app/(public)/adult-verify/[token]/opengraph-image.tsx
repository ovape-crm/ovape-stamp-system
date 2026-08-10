import { ImageResponse } from "next/og";

export const alt = "베이프 성인 인증";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#f8fafc",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: "white",
          border: "2px solid #e2e8f0",
          borderRadius: 36,
          display: "flex",
          flexDirection: "column",
          padding: "58px 90px",
          width: 960,
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "#2563eb",
            borderRadius: 28,
            color: "white",
            display: "flex",
            fontSize: 82,
            fontWeight: 800,
            height: 140,
            justifyContent: "center",
            width: 140,
          }}
        >
          B
        </div>
        <div
          style={{
            color: "#0f172a",
            display: "flex",
            fontSize: 58,
            fontWeight: 800,
            marginTop: 34,
          }}
        >
          베이프 성인 인증
        </div>
        <div
          style={{
            color: "#475569",
            display: "flex",
            fontSize: 29,
            marginTop: 18,
          }}
        >
          링크를 눌러 안전하게 성인 인증을 진행해 주세요.
        </div>
      </div>
    </div>,
    size,
  );
}
