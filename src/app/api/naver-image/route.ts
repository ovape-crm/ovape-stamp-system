import { NextRequest } from 'next/server';

const isNaverImageHost = (host: string) => host === 'pstatic.net' || host.endsWith('.pstatic.net');

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get('url');
  if (!source) return new Response('이미지 주소가 없습니다.', { status: 400 });

  let imageUrl: URL;
  try {
    imageUrl = new URL(source);
  } catch {
    return new Response('올바른 이미지 주소가 아닙니다.', { status: 400 });
  }

  if (imageUrl.protocol !== 'https:' || !isNaverImageHost(imageUrl.hostname)) {
    return new Response('네이버 이미지 주소만 지원합니다.', { status: 400 });
  }

  try {
    const upstream = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://blog.naver.com/' },
      cache: 'no-store',
    });
    const contentType = upstream.headers.get('content-type') ?? '';
    if (!upstream.ok || !contentType.startsWith('image/')) return new Response('이미지를 불러오지 못했습니다.', { status: 502 });
    return new Response(upstream.body, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' } });
  } catch {
    return new Response('이미지를 불러오지 못했습니다.', { status: 502 });
  }
}
