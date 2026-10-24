// Cloudflare Worker: a CORS proxy for Kazu Hub only. Allow-listed target
// hosts, allow-listed origin, GET only. Deploy: see README.md.
const ALLOWED_TARGETS = [
  'steamcommunity.com',
  'letterboxd.com',
  'www.youtube.com',
  'myanimelist.net',
  'api.jikan.moe',
  'zenquotes.io',
  'discord.com',
];
const ALLOWED_ORIGINS = ['https://kazuhani.github.io', 'http://localhost:5501'];

function allowedTarget(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { return null; }
  if (u.protocol !== 'https:' || ALLOWED_TARGETS.indexOf(u.hostname) === -1) return null;
  return u;
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0],
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'GET' }, cors) });
    }
    if (request.method !== 'GET' || ALLOWED_ORIGINS.indexOf(origin) === -1) {
      return new Response('forbidden', { status: 403, headers: cors });
    }
    const target = allowedTarget(new URL(request.url).searchParams.get('url'));
    if (!target) return new Response('target not allowed', { status: 400, headers: cors });
    const upstream = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KazuHubProxy/1.0)', Accept: '*/*' },
      cf: { cacheTtl: 30, cacheEverything: true },
    });
    const headers = new Headers(cors);
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'text/plain');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};

export { allowedTarget };
