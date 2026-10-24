# cors-proxy

Own CORS proxy so the live cards stop depending on free public proxies.
Free tier of Cloudflare Workers is plenty (100k requests/day).

Deploy (Julien runs these):

```bash
cd workers/cors-proxy
npx wrangler deploy worker.js --name kazu-cors-proxy --compatibility-date 2024-09-01
```

Then paste the printed `https://kazu-cors-proxy.<account>.workers.dev/` URL into
`CORS_PROXY_URL` in `script.js` (bump the `?v=` on the script tag) and add its
host as a preconnect in `index.html` if you like.

Only the hosts in `ALLOWED_TARGETS`, from the origins in `ALLOWED_ORIGINS`,
GET only. Add a host there before adding a card that needs one.
