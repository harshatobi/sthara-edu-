import { NextResponse } from 'next/server';
import ytSearch from 'yt-search';

// Simple in-memory cache to prevent YouTube rate limits on chat re-renders
const searchCache = new Map<string, any>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  if (searchCache.has(q)) {
    return NextResponse.json({ videos: searchCache.get(q) });
  }

  try {
    const r = await ytSearch(q);
    const videos = r.videos.slice(0, 3).map((v: any) => ({
      videoId: v.videoId,
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail
    }));

    searchCache.set(q, videos);

    return NextResponse.json({ videos });
  } catch (error: any) {
    console.error('YouTube Search API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch videos' }, { status: 500 });
  }
}
