
/** Arb Streamer Pro v15 — GitHub Pages (Cloudflare Proxy Enabled)
 * Live Polymarket ↔ Kalshi comparison with title matching + edge calc.
 * Uses your Cloudflare Worker to bypass CORS restrictions.
 */

const CORS_PROXY = "https://arb-proxy.davidladjevic.workers.dev/?url="; // already configured
const $ = (sel) => document.querySelector(sel);
const fmtPct = (p) => (p==null ? '—' : (p*100).toFixed(1)+'%');
const nowHHMMSS = () => new Date().toLocaleTimeString();

let loop = null;

async function fetchKalshi() {
  const url = "https://api.elections.kalshi.com/trade-api/v2/markets";
  const r = await fetch(CORS_PROXY + encodeURIComponent(url));
  if (!r.ok) throw new Error("Kalshi HTTP " + r.status);
  const j = await r.json();
  const arr = j.markets || j.data || j;
  return (arr || []).filter(m => {
    const s = String(m.status||"").toLowerCase();
    return s !== "closed" && s !== "settled";
  }).map(m => {
    let yes = (typeof m.yes_bid === "number" ? m.yes_bid :
               (typeof m.last_yes_price==="number" ? m.last_yes_price :
               (typeof m.last_price==="number" ? m.last_price : null)));
    let no  = (typeof m.no_bid  === "number" ? m.no_bid  :
               (yes!=null ? 100-yes : null));
    if (yes!=null && yes>1) yes = yes/100;
    if (no !=null && no >1) no  = no/100;
    return {
      venue: "kalshi",
      id: m.ticker || m.id,
      title: m.title || m.name || m.ticker,
      yes: (typeof yes === "number") ? yes : null,
      no:  (typeof no  === "number") ? no  : null
    };
  });
}

async function fetchPolymarket() {
  const url = "https://gamma-api.polymarket.com/markets?limit=500&active=true";
  const r = await fetch(CORS_PROXY + encodeURIComponent(url));
  if (!r.ok) throw new Error("Polymarket HTTP " + r.status);
  const j = await r.json();
  const arr = j.markets || j.data || j;
  return (arr || []).map(m => {
    const yes = (typeof m.bestBid === "number") ? m.bestBid :
                (typeof m.yesBid === "number") ? m.yesBid :
                (typeof m.lastPrice === "number") ? m.lastPrice : null;
    const no  = (typeof m.bestAsk === "number") ? (1 - m.bestAsk) :
                (typeof m.noBid === "number") ? m.noBid :
                (yes!=null ? 1-yes : null);
    return {
      venue: "polymarket",
      id: m.id || m.slug || m.question || "",
      title: m.question || m.title || m.slug || "",
      yes: (typeof yes === "number") ? yes : null,
      no:  (typeof no  === "number") ? no  : null
    };
  });
}

// Helpers
function normTitle(t) {
  return (t||"").toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sim(a,b){
  const A = new Set(normTitle(a).split(" "));
  const B = new Set(normTitle(b).split(" "));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach(x => { if (B.has(x)) inter++; });
  return (inter / Math.max(A.size, B.size)) * 100;
}

function computeEdges(kals, polys, minScore, edgeBps) {
  const out = [];
  for (const k of kals) {
    let best = null;
    for (const p of polys) {
      const score = sim(k.title, p.title);
      if (score >= minScore) {
        if (k.yes!=null && p.yes!=null) {
          const edge = Math.abs(k.yes - p.yes) * 10000;
          if (edge >= edgeBps) {
            if (!best || edge > best.edge) {
              best = { kalshi: k, poly: p, score, edge: Math.round(edge) };
            }
          }
        }
      }
    }
    if (best) out.push(best);
  }
  out.sort((a,b)=>b.edge - a.edge);
  return out.slice(0, 50);
}

function renderRaw(kals, polys){
  document.getElementById("kalCount").textContent = kals.length;
  document.getElementById("polyCount").textContent = polys.length;
  const rows = [];
  for (const k of kals.slice(0,50)) {
    rows.push(`<tr><td>Kalshi</td><td class="code">${k.id}</td><td>${k.title}</td><td>${fmtPct(k.yes)}</td><td>${fmtPct(k.no)}</td></tr>`);
  }
  for (const p of polys.slice(0,50)) {
    rows.push(`<tr><td>Polymarket</td><td class="code">${p.id}</td><td>${p.title}</td><td>${fmtPct(p.yes)}</td><td>${fmtPct(p.no)}</td></tr>`);
  }
  document.getElementById("rawRows").innerHTML = rows.join("");
}

function renderArb(edges){
  const rows = edges.map(e => {
    const time = nowHHMMSS();
    const title = e.kalshi.title.length < e.poly.title.length ? e.poly.title : e.kalshi.title;
    return `<tr>
      <td class="small">${time}</td>
      <td>${title}<div class="small">sim: ${e.score.toFixed(0)} / Kalshi: <span class="code">${e.kalshi.id}</span> / Poly: <span class="code">${e.poly.id}</span></div></td>
      <td>${fmtPct(e.kalshi.yes)}</td>
      <td>${fmtPct(e.poly.yes)}</td>
      <td><span class="badge badge-arb">${e.edge} bps</span></td>
    </tr>`;
  });
  document.getElementById("arbRows").innerHTML = rows.join("");
}

function setStatus(text){
  document.getElementById("status").textContent = text;
  document.getElementById("bannerText").textContent = text;
}
function setBar(pct){
  document.getElementById("bar").style.width = Math.max(0, Math.min(100, pct)) + "%";
}
function addError(msg){
  const el = document.getElementById("errors");
  const d = document.createElement("div");
  d.innerHTML = `<span class="err">⚠️ ${msg}</span>`;
  el.prepend(d);
}

async function tick(){
  const refreshSec = Math.max(5, Number(document.getElementById("refreshSec").value||10));
  const minScore   = Math.max(50, Math.min(100, Number(document.getElementById("minScore").value||80)));
  const edgeBps    = Math.max(0, Number(document.getElementById("edgeBps").value||120));

  setStatus("⏳ Fetching...");
  setBar(15);
  let kals=[], polys=[];
  try {
    kals = await fetchKalshi();
  } catch(e) {
    addError("Kalshi fetch failed: " + e.message);
  }
  setBar(45);
  try {
    polys = await fetchPolymarket();
  } catch(e) {
    addError("Polymarket fetch failed: " + e.message);
  }
  setBar(70);

  renderRaw(kals, polys);
  const edges = computeEdges(kals, polys, minScore, edgeBps);
  renderArb(edges);
  setBar(100);
  setStatus(`✅ Last update: ${nowHHMMSS()} | Edges: ${edges.length}`);

  loop = setTimeout(tick, refreshSec*1000);
}

function start(){
  if (loop) return;
  document.getElementById("errors").innerHTML = "";
  setBar(0);
  tick();
}
function stop(){
  if (loop){
    clearTimeout(loop);
    loop = null;
  }
  setStatus("✅ Idle");
  setBar(0);
}

document.getElementById("startBtn").addEventListener("click", start);
document.getElementById("stopBtn").addEventListener("click", stop);
