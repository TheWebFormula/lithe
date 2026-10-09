let urls = new Map();

export function addUrl(path, lastModified, host) {
  if (!host.trim()) {
    console.error('Missing host config for sitemap, no file created');
    return;
  }
  host = host.trim().replace(/\/$/, '');
  urls.set(path, `
  <url>
    <loc>${host}${path}</loc>
    <lastmod>${lastModified.toISOString().split('T')[0]}</lastmod>
  </url>`);
}

export function getContent() {
  if (urls.size === 0) return;

  let content = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.values().toArray().join()}
</urlset>`;
  urls.clear();
  return content;
}
