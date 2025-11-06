# Arb Streamer Pro v15 — GitHub Pages + Cloudflare Worker

Live **Polymarket ↔ Kalshi** comparison, fully client-side, using your Cloudflare Worker
to bypass CORS. No Netlify needed.

## 1) Deploy the Cloudflare Worker (once)
1. Go to https://workers.cloudflare.com → **Create Worker** → name it **arb-proxy**
2. Paste this code and **Save & Deploy**:

```js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = url.searchParams.get("url");
    if (!target) return new Response("Missing ?url=", { status: 400 });

    const resp = await fetch(target, { headers: { accept: "application/json" } });
    return new Response(resp.body, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("content-type") || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  },
};
```

Your worker endpoint (already wired in `main.js`) is:
```
https://arb-proxy.davidladjevic.workers.dev/?url=
```

## 2) Deploy on GitHub Pages
1. Create a new repo (e.g., `arb-streamer-pro-v15`) and upload these files to the repo root:
   - `index.html`, `main.js`, `style.css`, `.nojekyll`, `README.md`
2. **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main** (root)
3. Visit your site:
```
https://<your-github-username>.github.io/<repo-name>/
```

## 3) Use it
- Click **Start** to begin fetching.
- Adjust **Refresh**, **Min title similarity**, **Edge threshold** as needed.

## Notes
- If either API changes its CORS or payload shape, errors will display at the bottom of the page.
- Matching uses simple token overlap; tune **Min title similarity** to tighten/loosen joins.