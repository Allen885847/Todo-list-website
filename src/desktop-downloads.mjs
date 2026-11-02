import manifest from '../desktop-shortcut/downloads.json' with { type: 'json' };

export async function handleDesktopDownload(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/desktop-downloads' && request.method === 'GET') {
    return Response.json({ version: manifest.version, files: manifest.files.map(({ arch, filename, size, sha256, url }) => ({ arch, filename, size, sha256, url })) }, { headers: { 'Cache-Control': 'no-cache' } });
  }
  if (!url.pathname.startsWith('/downloads/')) return null;
  const file = [...manifest.files, ...(manifest.legacyFiles || [])].find(file => url.pathname === file.url);
  if (!file || !['GET','HEAD'].includes(request.method)) return new Response('Download not found.', { status: 404 });
  const object = await env.BUCKET.get(file.objectKey);
  if (!object) return new Response('This download is temporarily unavailable. Please try again.', { status: 503 });
  return new Response(request.method === 'HEAD' ? null : object.body, { headers: {
    'Content-Type': 'application/zip',
    'Content-Length': String(object.size),
    'Content-Disposition': `attachment; filename="${file.filename}"`,
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'X-Checksum-SHA256': file.sha256,
  } });
}
