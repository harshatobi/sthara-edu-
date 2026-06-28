import { NextResponse, NextRequest } from 'next/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';

// TTL-based cache: { value, expiresAt }
const searchCache = new Map<string, { videos: any[]; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 200;

function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of searchCache.entries()) {
    if (now > entry.expiresAt) searchCache.delete(key);
  }
  // If still too large, evict oldest entries
  if (searchCache.size > MAX_CACHE_SIZE) {
    const toDelete = searchCache.size - MAX_CACHE_SIZE;
    let deleted = 0;
    for (const key of searchCache.keys()) {
      searchCache.delete(key);
      if (++deleted >= toDelete) break;
    }
  }
}

export async function GET(request: NextRequest) {
  const token = await verifyApiToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  // Check cache (with TTL)
  evictExpired();
  const cached = searchCache.get(q);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json({ videos: cached.videos });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'YouTube API not configured' }, { status: 503 });
  }

  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', q);
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', '3');
    url.searchParams.set('safeSearch', 'strict'); // important for school context
    url.searchParams.set('relevanceLanguage', 'en');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const err = await res.json();
      console.error('YouTube API error:', err);
      return NextResponse.json({ error: 'YouTube search failed', details: err?.error?.message }, { status: res.status });
    }

    const data = await res.json();
    const videos = (data.items ?? []).map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
    }));

    searchCache.set(q, { videos, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ videos });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch videos';
    console.error('YouTube Search Error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
