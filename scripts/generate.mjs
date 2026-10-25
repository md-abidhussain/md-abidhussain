// Generates the profile graphics in assets/ from live GitHub data.
// Runs daily via .github/workflows/profile.yml — no third-party stat services.
//
//   node scripts/generate.mjs            live data (needs GITHUB_TOKEN)
//   node scripts/generate.mjs --sample   offline preview with sample data

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ASSETS = path.join(ROOT, "assets");
const LOGIN = process.env.GH_LOGIN || "md-abidhussain";
const TOKEN = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN;
const SAMPLE = process.argv.includes("--sample");

// ---------- profile text (edit these) ----------
const PROFILE = {
  name: "Mohd Abid Hussain",
  lines: [
    "full-stack · genai · software engineering",
    "b.tech cse '27 · jamia hamdard, new delhi",
    "national finalist · nxtwave idea2impact",
  ],
  footer: "open to sde · full-stack · genai roles · 2027",
};
const EXCLUDE_LANGS = new Set(["Jupyter Notebook", "Procfile", "Dockerfile", "Makefile", "Batchfile"]);

// ---------- theme ----------
// One black theme: the graphics sit on their own black card, so they look the same in GitHub light and dark mode.
const THEMES = {
  dark: { bg: "#0a0a0a", border: "#262626", fg: "#ededed", muted: "#8f8f8f", faint: "#2e2e2e", fill: "#ededed" },
};
const card = (t, h) => `<rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" rx="14" fill="${t.bg}" stroke="${t.border}"/>`;
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const W = 840;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => n.toLocaleString("en-US");

// ---------- data ----------
async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": LOGIN },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  return json.data;
}

async function liveData() {
  if (!TOKEN) throw new Error("GITHUB_TOKEN is not set (use --sample for an offline preview)");
  const d = await gql(
    `query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
        }
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
          totalCount
          nodes { languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } } }
        }
      }
    }`,
    { login: LOGIN },
  );
  const cal = d.user.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w) => w.contributionDays).map((x) => ({ date: x.date, n: x.contributionCount }));
  const langs = {};
  for (const r of d.user.repositories.nodes)
    for (const e of r.languages.edges) if (!EXCLUDE_LANGS.has(e.node.name)) langs[e.node.name] = (langs[e.node.name] || 0) + e.size;
  return { total: cal.totalContributions, days, langs, repos: d.user.repositories.totalCount };
}

function sampleData() {
  // deterministic pseudo-random year, only for local previews
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const days = [];
  const end = new Date();
  for (let i = 370; i >= 0; i--) {
    const d = new Date(end - i * 864e5);
    const ramp = 0.25 + 0.75 * ((370 - i) / 370);
    const n = rnd() < 0.55 * ramp ? Math.round(rnd() * 9 * ramp) + 1 : 0;
    days.push({ date: d.toISOString().slice(0, 10), n });
  }
  const year = days.slice(-365);
  return {
    total: year.reduce((a, b) => a + b.n, 0),
    days: year,
    langs: { JavaScript: 520e3, Python: 260e3, Java: 190e3, HTML: 120e3, CSS: 70e3 },
    repos: 19,
  };
}

function stats(days) {
  const active = days.filter((d) => d.n > 0).length;
  let longest = 0, run = 0;
  for (const d of days) { run = d.n > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let current = 0;
  const rev = [...days].reverse();
  if (rev[0] && rev[0].n === 0) rev.shift(); // today not done yet doesn't break the streak
  for (const d of rev) { if (d.n > 0) current++; else break; }
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7).reduce((a, b) => a + b.n, 0));
  return { active, longest, current, weeks, bestWeek: Math.max(0, ...weeks) };
}

// ---------- ascii portrait ----------
const COLS = 84, ROWS = 48, CW = 3.3, LH = 5.4; // cell aspect ≈ 0.6 → square-ish portrait
const RAMP = " .'`:,-~=+*o#%@";

// A pre-rendered ASCII portrait (assets/portrait.txt) wins over any image, so the repo can stay text-only.
async function portraitText() {
  try {
    const rows = (await fs.readFile(path.join(ASSETS, "portrait.txt"), "utf8")).replace(/\r/g, "").split("\n").slice(0, ROWS);
    return rows.length === ROWS ? rows.map((r) => r.padEnd(COLS).slice(0, COLS)) : null;
  } catch { return null; }
}

async function portraitSource() {
  if (process.env.PORTRAIT) return fs.readFile(process.env.PORTRAIT);
  for (const f of ["portrait.jpg", "portrait.jpeg", "portrait.png"]) {
    try { return await fs.readFile(path.join(ASSETS, f)); } catch {}
  }
  if (SAMPLE) throw new Error("no assets/portrait.* for the sample preview");
  const res = await fetch(`https://github.com/${LOGIN}.png?size=400`);
  if (!res.ok) throw new Error(`avatar fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function asciiRows(buf, invert) {
  const { data } = await sharp(buf)
    .resize(400, 400, { fit: "cover", position: "attention" })
    .grayscale()
    .normalise()
    .clahe({ width: 48, height: 48, maxSlope: 3 }) // local contrast so eyes/glasses survive the downscale
    .resize(COLS, ROWS, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Background tone = median of the top corners. Glyph density follows how far a pixel is
  // from that tone, so the subject stands out on either theme whatever the photo's backdrop.
  const corner = [];
  for (let y = 0; y < 6; y++) for (const x of [0, 1, 2, 3, COLS - 4, COLS - 3, COLS - 2, COLS - 1]) corner.push(data[y * COLS + x] / 255);
  corner.sort((a, b) => a - b);
  const bg = corner[corner.length >> 1];
  const span = Math.max(bg, 1 - bg) || 1;
  const rows = [];
  for (let y = 0; y < ROWS; y++) {
    let line = "";
    for (let x = 0; x < COLS; x++) {
      // soft circular vignette so the portrait fades out instead of ending in a hard box
      const dx = (x + 0.5) / COLS - 0.5, dy = (y + 0.5) / ROWS - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) / 0.5;
      const fade = r < 0.78 ? 1 : Math.max(0, 1 - (r - 0.78) / 0.22);
      const v = data[y * COLS + x] / 255; // 0 black … 1 white
      // subject mask: anything clearly different from the backdrop tone
      const dist = Math.abs(v - bg) / span;
      const t = Math.min(1, Math.max(0, (dist - 0.06) / 0.14));
      const mask = t * t * (3 - 2 * t);
      // inside the subject: dark theme draws light as ink, light theme draws shadow as ink
      const tone = invert ? 1 - v : v;
      let ink = mask * (0.22 + 0.78 * tone);
      ink = Math.pow(ink, 1.1) * fade;
      line += RAMP[Math.min(RAMP.length - 1, Math.floor(ink * RAMP.length))];
    }
    rows.push(line);
  }
  return rows;
}

// ---------- svgs ----------
function headerSvg(t, rows) {
  const H = 270;
  const px = 30, py = (H - ROWS * LH) / 2 + LH;
  const art = rows
    .map((r, i) => `<text x="${px}" y="${(py + i * LH).toFixed(1)}" textLength="${(COLS * CW).toFixed(1)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${esc(r)}</text>`)
    .join("");
  const tx = px + COLS * CW + 36;
  const lines = PROFILE.lines
    .map((l, i) => `<text x="${tx}" y="${126 + i * 24}" fill="${t.muted}" font-size="15">${esc(l)}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(PROFILE.name)}">
<title>${esc(PROFILE.name)}</title>
<style>text{font-family:${MONO}}</style>
${card(t, H)}
<g fill="${t.fg}" font-size="5.5" opacity="0.95">${art}</g>
<text x="${tx}" y="86" fill="${t.fg}" font-size="32" font-weight="600" letter-spacing="-0.5">${esc(PROFILE.name.toLowerCase())}</text>
${lines}
<line x1="${tx}" y1="${210}" x2="${tx + 40}" y2="${210}" stroke="${t.faint}" stroke-width="2"/>
<text x="${tx}" y="${236}" fill="${t.fg}" font-size="14">${esc(PROFILE.footer)}</text>
</svg>`;
}

function activitySvg(t, data, st) {
  const H = 250;
  // sparkline of weekly totals
  const gx = 20, gy = 92, gw = 520, gh = 70;
  const max = Math.max(1, ...st.weeks);
  const pts = st.weeks.map((v, i) => [gx + (i / Math.max(1, st.weeks.length - 1)) * gw, gy + gh - (v / max) * gh]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${gx + gw} ${gy + gh} L${gx} ${gy + gh} Z`;
  const first = data.days[0]?.date, last = data.days.at(-1)?.date;
  const mon = (d) => new Date(d + "T00:00:00Z").toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).toLowerCase();

  const side = [
    [fmt(st.active), "active days"],
    [fmt(st.longest), "longest streak"],
    [fmt(st.current), "current streak"],
    [fmt(st.bestWeek), "best week"],
  ]
    .map(([v, k], i) => `<text x="600" y="${58 + i * 34}" fill="${t.fg}" font-size="20" font-weight="600">${v}</text><text x="680" y="${58 + i * 34}" fill="${t.muted}" font-size="12">${k}</text>`)
    .join("");

  // language bar
  const entries = Object.entries(data.langs).sort((a, b) => b[1] - a[1]);
  const totalBytes = entries.reduce((a, b) => a + b[1], 0) || 1;
  const top = entries.slice(0, 5);
  const rest = entries.slice(5).reduce((a, b) => a + b[1], 0);
  if (rest > 0) top.push(["other", rest]);
  const shades = [1, 0.72, 0.5, 0.34, 0.22, 0.12];
  let bx = 20;
  const bw = 800, by = 200;
  const bars = [], labels = [];
  let lx = 20;
  top.forEach(([name, size], i) => {
    const w = (size / totalBytes) * bw;
    bars.push(`<rect x="${bx.toFixed(1)}" y="${by}" width="${Math.max(0, w - 2).toFixed(1)}" height="6" rx="1" fill="${t.fill}" fill-opacity="${shades[i]}"/>`);
    bx += w;
    const label = `${name.toLowerCase()} ${Math.round((size / totalBytes) * 100)}%`;
    labels.push(`<rect x="${lx}" y="${by + 21}" width="8" height="8" rx="1" fill="${t.fill}" fill-opacity="${shades[i]}"/><text x="${lx + 14}" y="${by + 29}" fill="${t.muted}" font-size="12">${esc(label)}</text>`);
    lx += 14 + label.length * 7.3 + 22;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${fmt(data.total)} contributions in the last year">
<title>${fmt(data.total)} contributions in the last year</title>
<style>text{font-family:${MONO}}</style>
${card(t, H)}
<text x="20" y="58" fill="${t.fg}" font-size="44" font-weight="600" letter-spacing="-1">${fmt(data.total)}</text>
<text x="${24 + fmt(data.total).length * 26.5}" y="58" fill="${t.muted}" font-size="13">contributions in the last year</text>
<path d="${area}" fill="${t.fill}" fill-opacity="0.08"/>
<path d="${line}" fill="none" stroke="${t.fg}" stroke-width="1.5" stroke-linejoin="round"/>
<line x1="${gx}" y1="${gy + gh + 0.5}" x2="${gx + gw}" y2="${gy + gh + 0.5}" stroke="${t.faint}"/>
<text x="${gx}" y="${gy + gh + 18}" fill="${t.muted}" font-size="11">${first ? mon(first) : ""}</text>
<text x="${gx + gw}" y="${gy + gh + 18}" fill="${t.muted}" font-size="11" text-anchor="end">${last ? mon(last) : ""}</text>
<line x1="575" y1="30" x2="575" y2="168" stroke="${t.faint}"/>
${side}
${bars.join("")}
${labels.join("")}
</svg>`;
}

// ---------- main ----------
const data = SAMPLE ? sampleData() : await liveData();
const st = stats(data.days);
await fs.mkdir(ASSETS, { recursive: true });
const fixed = await portraitText();
const src = fixed ? null : await portraitSource();
for (const [name, t] of Object.entries(THEMES)) {
  const rows = fixed || (await asciiRows(src, false));
  if (process.argv.includes("--export-portrait")) await fs.writeFile(path.join(ASSETS, "portrait.txt"), rows.join("\n") + "\n");
  await fs.writeFile(path.join(ASSETS, `header-${name}.svg`), headerSvg(t, rows));
  await fs.writeFile(path.join(ASSETS, `activity-${name}.svg`), activitySvg(t, data, st));
}
console.log(`ok · ${data.total} contributions · ${st.active} active days · streak ${st.current}/${st.longest} · ${data.repos} repos`);
