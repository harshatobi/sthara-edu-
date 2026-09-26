/**
 * Browser-side: a phone photo (often 3–8 MB, sometimes HEIC-decoded) becomes a
 * JPEG of at most 2000px on the long side, ~300–600 KB. Keeps uploads under the
 * server limit and makes handwriting reading faster without losing legibility.
 */
export async function compressPhoto(file: File, maxSide = 2000, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => null);
  if (!bitmap) throw new Error('That file isn’t a photo this browser can open. Use JPG or PNG.');
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser can’t prepare photos.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('The photo couldn’t be prepared.');
  return blob;
}

/** Upload prepared pages, one request each (keeps every request small). Returns storage paths. */
export async function uploadPages(token: string, assignmentId: string, studentId: string, pages: Blob[], onProgress?: (done: number) => void): Promise<string[]> {
  const out: string[] = [];
  for (const [i, blob] of pages.entries()) {
    const form = new FormData();
    form.append('file', new File([blob], `page-${i + 1}.jpg`, { type: 'image/jpeg' }));
    form.append('assignmentId', assignmentId);
    form.append('studentId', studentId);
    form.append('n', String(i + 1));
    const res = await fetch('/api/grading/pages', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d?.error || `Page ${i + 1} didn’t upload.`);
    out.push(d.path);
    onProgress?.(i + 1);
  }
  return out;
}
