const BULY_API_URL = "https://www.buly.kr/api/shoturl.siso";
const BULY_REQUEST_TIMEOUT_MS = 10_000;
const BULY_MAX_ATTEMPTS = 2;

type BulyResponse = {
  result?: string | boolean;
  url?: string;
  message?: string;
};

const isPublicHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1" &&
      url.hostname !== "::1"
    );
  } catch {
    return false;
  }
};

export async function shortenVerificationUrl(originalUrl: string) {
  const customerId = process.env.BULY_CUSTOMER_ID?.trim();
  const partnerApiId = process.env.BULY_PARTNER_API_ID?.trim();

  if (!customerId || !partnerApiId || !isPublicHttpUrl(originalUrl)) {
    return originalUrl;
  }

  for (let attempt = 1; attempt <= BULY_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(BULY_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({
          customer_id: customerId,
          partner_api_id: partnerApiId,
          org_url: originalUrl,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(BULY_REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Buly API returned HTTP ${response.status}`);
      }

      const result = (await response.json()) as BulyResponse;
      const shortenedUrl = result.url?.trim();
      if ((result.result === "Y" || result.result === true) && shortenedUrl && isPublicHttpUrl(shortenedUrl)) {
        return shortenedUrl;
      }

      throw new Error(result.message || "Buly API did not return a shortened URL");
    } catch (error) {
      console.error(`Failed to shorten adult verification URL with Buly (attempt ${attempt}/${BULY_MAX_ATTEMPTS})`, error);

      if (attempt < BULY_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  return originalUrl;
}
