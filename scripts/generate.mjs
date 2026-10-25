// Generates the profile graphics in assets/ from live GitHub data.
// Runs daily via .github/workflows/profile.yml — no third-party stat services.
//
//   node scripts/generate.mjs            live data (needs GITHUB_TOKEN)
//   node scripts/generate.mjs --sample   offline preview with sample data
//
// It writes every card in assets/ and README.md itself, so edit the content block below, not README.md.

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ASSETS = path.join(ROOT, "assets");
const LOGIN = process.env.GH_LOGIN || "md-abidhussain";
const TOKEN = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN;
const SAMPLE = process.argv.includes("--sample");

// ---------- profile content: edit here; the script writes README.md and every card from it ----------
const PROFILE = {
  name: "Mohd Abid Hussain",
  lines: [
    "Full-Stack · GenAI · Software Engineering",
    "B.Tech CSE '27 · Jamia Hamdard, New Delhi",
    "Java · SQL · React · Node.js · LLM APIs",
  ],
  footer: "Open to SDE · Full-Stack · GenAI roles",
};

const LINKS = [
  { id: "email", label: "EMAIL", href: "mailto:abidhussain.m47@gmail.com" },
  { id: "linkedin", label: "LINKEDIN", href: "https://www.linkedin.com/in/mohd-abid-hussain" },
  { id: "x", label: "X / TWITTER", href: "https://x.com/md_abid_13" },
];

const ABOUT = [
  "Final-year B.Tech CSE student at Jamia Hamdard, New Delhi (Class of 2027). I build full-stack web applications with GenAI inside them, React and Node.js for the product and LLM APIs for the intelligence, and I ship them live. I practise Data Structures & Algorithms in Java.",
  "Open to Associate Software Engineer / SDE, Full-Stack and GenAI roles: full-time from 2027, and internships now.",
];

const STACK = [
  ["Languages", "Java · JavaScript · Python · SQL"],
  ["Frontend", "React · HTML · CSS · Tailwind CSS · Bootstrap"],
  ["Backend", "Node.js · Express.js · REST APIs · JWT Auth"],
  ["Databases", "MongoDB · MySQL · SQLite"],
  ["GenAI", "LLM APIs (Gemini) · Prompt Engineering · RAG"],
  ["Tools", "Git · GitHub Actions · Vercel · Render"],
  ["Core CS", "DSA (Java) · OOP · DBMS · OS · Computer Networks"],
];

const PROJECTS = [
  {
    id: "gramsetu", name: "GramSetu AI", repo: "https://github.com/md-abidhussain/GramSetu", live: "https://gramsetu-india.vercel.app",
    meta: "GOVTECH · LEAD DEVELOPER, TEAM OF 3 · NXTWAVE IDEA2IMPACT",
    desc: "A platform where citizens, inspectors and officials audit public infrastructure. Photo evidence is verified twice: Gemini Vision for context, and a YOLOv8 segmentation model that measures potholes and cracks in cm². Role-based access with JWT, contractor trust scores and map dashboards.",
    tags: ["React", "Node.js", "Express", "MongoDB", "JWT", "Gemini", "YOLOv8"],
  },
  {
    id: "loanlens", name: "LoanLens AI", repo: "https://github.com/md-abidhussain/LoanLensAI", live: "https://loanlens-ai.onrender.com",
    meta: "FINTECH · AI HACKATHON 2026",
    desc: "Upload a loan agreement as a PDF or image. It extracts the text, flags risky clauses, estimates the effective APR, scores the loan's health and suggests what to negotiate. The LLM returns schema-validated JSON; past scans are stored in SQLite.",
    tags: ["Node.js", "Express", "SQLite", "Gemini", "REST API"],
  },
  {
    id: "interview-coach", name: "AI Interview Coach", repo: "https://github.com/md-abidhussain/AI-Interview-Coach", live: "https://ai-interview-coach-6122005.streamlit.app",
    meta: "EDTECH · EDUNET × MICROSOFT INTERNSHIP PROJECT",
    desc: "Mock interviews for any role. Answer by typing, uploading audio or speaking live. Whisper transcribes, and an LLM scores each answer out of 10 with structured feedback. bcrypt-hashed logins in SQLite.",
    tags: ["Python", "Streamlit", "Gemini", "Whisper", "SQLite"],
  },
  {
    id: "donorx", name: "DonorX", repo: "https://github.com/md-abidhussain/donorx", live: "https://md-abidhussain.github.io/donorx/",
    meta: "HEALTHTECH · TECHNOZOVA 6.0, 24-HOUR HACKATHON",
    desc: "A blood-donor request board that ranks requests by urgency, expires them automatically and uses rule-based checks to hold back fake posts.",
    tags: ["JavaScript", "Bootstrap"],
  },
];

const EXPERIENCE = [
  {
    role: "AI Engineer Intern", org: "Coding Blocks School of Technology", dates: "JUN – JUL 2026",
    desc: "Gen AI track. Built a telecom customer-churn prediction model, and an AI research-analysis assistant in two versions: a plain LLM pipeline and a tool-using agent.",
  },
  {
    role: "AI Azure Intern", org: "Edunet Foundation × Microsoft × AICTE", dates: "JUN – JUL 2025",
    desc: "4-week AI on Azure program. Final project: AI Interview Coach.",
  },
];

const EXCLUDE_LANGS = new Set(["Jupyter Notebook", "Procfile", "Dockerfile", "Makefile", "Batchfile"]);

// ---------- theme ----------
// One black theme: the graphics sit on their own black card, so they look the same in GitHub light and dark mode.
const THEMES = {
  dark: { bg: "#0a0a0a", border: "#262626", fg: "#ededed", muted: "#8f8f8f", faint: "#2e2e2e", fill: "#ededed", accent: "#7ee787" },
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
const PAD = 32;
const CH = 0.6; // monospace glyph width as a share of font size
const svg = (h, label, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<style>text{font-family:${MONO}}</style>
${body}
</svg>`;

function wrap(text, size, width = W - 2 * PAD) {
  const max = Math.floor(width / (size * CH));
  const out = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > max) { out.push(line); line = word; }
    else line = line ? line + " " + word : word;
  }
  if (line) out.push(line);
  return out;
}

const title = (t, text, y = 42) =>
  `<text x="${PAD}" y="${y}" fill="${t.accent}" font-size="12" font-weight="600" letter-spacing="2.5">${esc(text)}</text>`;

function headerSvg(t, rows) {
  const H = 270;
  const px = 30, py = (H - ROWS * LH) / 2 + LH;
  const art = rows
    .map((r, i) => `<text x="${px}" y="${(py + i * LH).toFixed(1)}" textLength="${(COLS * CW).toFixed(1)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${esc(r)}</text>`)
    .join("");
  const tx = px + COLS * CW + 36;
  const lines = PROFILE.lines
    .map((l, i) => `<text x="${tx}" y="${134 + i * 24}" fill="${t.muted}" font-size="14">${esc(l)}</text>`)
    .join("");
  return svg(H, PROFILE.name, `${card(t, H)}
<g fill="${t.fg}" font-size="5.5" opacity="0.95">${art}</g>
<text x="${tx}" y="62" fill="${t.accent}" font-size="13">$ whoami</text>
<text x="${tx}" y="100" fill="${t.fg}" font-size="31" font-weight="700" letter-spacing="-0.5">${esc(PROFILE.name)}</text>
${lines}
<line x1="${tx}" y1="212" x2="${tx + 40}" y2="212" stroke="${t.faint}" stroke-width="2"/>
<text x="${tx}" y="238" fill="${t.fg}" font-size="13.5" letter-spacing="0.5">${esc(PROFILE.footer.toUpperCase())}</text>`);
}

function pillSvg(t, label) {
  const text = `${label} ↗`;
  const w = Math.round(text.length * 12.5 * CH + 40), h = 34;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<style>text{font-family:${MONO}}</style>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${h / 2}" fill="${t.bg}" stroke="#3a3a3a"/>
<text x="${w / 2}" y="21.5" fill="${t.fg}" font-size="12.5" font-weight="600" letter-spacing="1" text-anchor="middle">${esc(text)}</text>
</svg>`;
}

function aboutSvg(t) {
  const size = 14.5, lh = 24;
  let y = 76;
  const parts = [];
  ABOUT.forEach((p, i) => {
    for (const l of wrap(p, size)) { parts.push(`<text x="${PAD}" y="${y}" fill="${i ? t.muted : t.fg}" font-size="${size}">${esc(l)}</text>`); y += lh; }
    y += 12;
  });
  const H = y + 14;
  return svg(H, "About: " + ABOUT.join(" "), `${card(t, H)}\n${title(t, "ABOUT")}\n${parts.join("\n")}`);
}

function stackSvg(t) {
  const lh = 30;
  const rows = STACK.map(([k, v], i) => {
    const y = 80 + i * lh;
    return `<text x="${PAD}" y="${y}" fill="${t.muted}" font-size="13">${esc(k)}</text><text x="${PAD + 140}" y="${y}" fill="${t.fg}" font-size="14">${esc(v)}</text>`;
  });
  const H = 80 + (STACK.length - 1) * lh + 36;
  return svg(H, "Tech stack: " + STACK.map(([k, v]) => `${k}: ${v}`).join("; "), `${card(t, H)}\n${title(t, "TECH STACK")}\n${rows.join("\n")}`);
}

function sectionSvg(t, text) {
  const H = 56;
  return svg(H, text, `${card(t, H)}\n${title(t, text, 34)}`);
}

function projectSvg(t, p) {
  const size = 14, lh = 22;
  let y = 104;
  const desc = wrap(p.desc, size).map((l) => { const s = `<text x="${PAD}" y="${y}" fill="${t.muted}" font-size="${size}">${esc(l)}</text>`; y += lh; return s; });
  y += 8;
  let x = PAD;
  const tags = p.tags.map((tag) => {
    const w = Math.round(tag.length * 12 * CH + 22);
    const s = `<rect x="${x}" y="${y}" width="${w}" height="24" rx="12" fill="#161616" stroke="${t.border}"/><text x="${x + w / 2}" y="${y + 16}" fill="${t.fg}" font-size="12" text-anchor="middle">${esc(tag)}</text>`;
    x += w + 8;
    return s;
  });
  const H = y + 24 + PAD;
  return svg(H, `${p.name}. ${p.meta}. ${p.desc} Tech: ${p.tags.join(", ")}`, `${card(t, H)}
<text x="${PAD}" y="50" fill="${t.fg}" font-size="21" font-weight="700">${esc(p.name)}</text>
<text x="${W - PAD}" y="50" fill="${t.muted}" font-size="16" text-anchor="end">↗</text>
<text x="${PAD}" y="74" fill="${t.accent}" font-size="11.5" letter-spacing="1.2">${esc(p.meta)}</text>
${desc.join("\n")}
${tags.join("\n")}`);
}

function experienceSvg(t) {
  let y = 82;
  const parts = [];
  for (const e of EXPERIENCE) {
    parts.push(`<text x="${PAD}" y="${y}" font-size="16"><tspan fill="${t.fg}" font-weight="700">${esc(e.role)}</tspan><tspan fill="${t.muted}"> · ${esc(e.org)}</tspan></text>`);
    parts.push(`<text x="${W - PAD}" y="${y}" fill="${t.accent}" font-size="11.5" letter-spacing="1.2" text-anchor="end">${esc(e.dates)}</text>`);
    y += 26;
    for (const l of wrap(e.desc, 13.5)) { parts.push(`<text x="${PAD}" y="${y}" fill="${t.muted}" font-size="13.5">${esc(l)}</text>`); y += 22; }
    y += 22;
  }
  const H = y - 4;
  return svg(H, "Experience: " + EXPERIENCE.map((e) => `${e.role}, ${e.org}, ${e.dates}. ${e.desc}`).join(" "), `${card(t, H)}\n${title(t, "EXPERIENCE")}\n${parts.join("\n")}`);
}

function activitySvg(t, data, st) {
  const H = 312, oy = 36;
  const gx = 32, gy = 92, gw = 508, gh = 70;
  const max = Math.max(1, ...st.weeks);
  const pts = st.weeks.map((v, i) => [gx + (i / Math.max(1, st.weeks.length - 1)) * gw, gy + gh - (v / max) * gh]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${gx + gw} ${gy + gh} L${gx} ${gy + gh} Z`;
  const first = data.days[0]?.date, last = data.days.at(-1)?.date;
  const mon = (d) => new Date(d + "T00:00:00Z").toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase();

  const side = [
    [fmt(st.active), "ACTIVE DAYS"],
    [fmt(st.longest), "LONGEST STREAK"],
    [fmt(st.current), "CURRENT STREAK"],
    [fmt(st.bestWeek), "BEST WEEK"],
  ]
    .map(([v, k], i) => `<text x="600" y="${58 + i * 34}" fill="${t.fg}" font-size="20" font-weight="700">${v}</text><text x="672" y="${58 + i * 34}" fill="${t.muted}" font-size="11" letter-spacing="1">${k}</text>`)
    .join("");

  const entries = Object.entries(data.langs).sort((a, b) => b[1] - a[1]);
  const totalBytes = entries.reduce((a, b) => a + b[1], 0) || 1;
  const top = entries.slice(0, 5);
  const rest = entries.slice(5).reduce((a, b) => a + b[1], 0);
  if (rest > 0) top.push(["Other", rest]);
  const shades = [1, 0.72, 0.5, 0.34, 0.22, 0.12];
  let bx = 32;
  const bw = 776, by = 200;
  const bars = [], labels = [];
  let lx = 32;
  top.forEach(([name, size], i) => {
    const w = (size / totalBytes) * bw;
    bars.push(`<rect x="${bx.toFixed(1)}" y="${by}" width="${Math.max(0, w - 2).toFixed(1)}" height="6" rx="1" fill="${i ? t.fill : t.accent}" fill-opacity="${i ? shades[i] : 1}"/>`);
    bx += w;
    const label = `${name} ${Math.round((size / totalBytes) * 100)}%`;
    labels.push(`<rect x="${lx}" y="${by + 21}" width="8" height="8" rx="1" fill="${i ? t.fill : t.accent}" fill-opacity="${i ? shades[i] : 1}"/><text x="${lx + 14}" y="${by + 29}" fill="${t.muted}" font-size="12">${esc(label)}</text>`);
    lx += 14 + label.length * 7.3 + 22;
  });

  return svg(H, `${fmt(data.total)} GitHub contributions in the last year, ${st.active} active days, longest streak ${st.longest} days`, `${card(t, H)}
${title(t, "GITHUB ACTIVITY")}
<g transform="translate(0 ${oy})">
<text x="32" y="58" fill="${t.fg}" font-size="44" font-weight="700" letter-spacing="-1">${fmt(data.total)}</text>
<text x="${36 + fmt(data.total).length * 26.5}" y="58" fill="${t.muted}" font-size="12" letter-spacing="1">CONTRIBUTIONS IN THE LAST YEAR</text>
<path d="${area}" fill="${t.accent}" fill-opacity="0.08"/>
<path d="${line}" fill="none" stroke="${t.accent}" stroke-width="1.5" stroke-linejoin="round"/>
<line x1="${gx}" y1="${gy + gh + 0.5}" x2="${gx + gw}" y2="${gy + gh + 0.5}" stroke="${t.faint}"/>
<text x="${gx}" y="${gy + gh + 18}" fill="${t.muted}" font-size="11">${first ? mon(first) : ""}</text>
<text x="${gx + gw}" y="${gy + gh + 18}" fill="${t.muted}" font-size="11" text-anchor="end">${last ? mon(last) : ""}</text>
<line x1="575" y1="30" x2="575" y2="168" stroke="${t.faint}"/>
${side}
${bars.join("")}
${labels.join("")}
</g>
<text x="32" y="${H - 18}" fill="#5f5f5f" font-size="11">Drawn nightly from the GitHub GraphQL API by a Node.js script in this repo. No third-party stat services.</text>`);
}

// ---------- readme ----------
function readme() {
  const img = (file, alt, extra = 'width="100%"') => `<img src="assets/${file}" ${extra} alt="${esc(alt)}">`;
  const out = [];
  out.push("<!-- Generated by scripts/generate.mjs. Edit the content there, not here. -->");
  out.push(img("header.svg", `${PROFILE.name}. ${PROFILE.lines.join(". ")}. ${PROFILE.footer}.`));
  out.push("");
  out.push("<p>\n" + LINKS.map((l) => `  <a href="${l.href}">${img(`pill-${l.id}.svg`, l.label, 'height="34"')}</a>`).join("\n") + "\n</p>");
  out.push("");
  out.push(img("about.svg", "About: " + ABOUT.join(" ")));
  out.push("");
  out.push(img("stack.svg", "Tech stack: " + STACK.map(([k, v]) => `${k}: ${v}`).join("; ")));
  out.push("");
  out.push(img("section-projects.svg", "Projects"));
  for (const p of PROJECTS) {
    out.push("");
    out.push(`<a href="${p.repo}">${img(`project-${p.id}.svg`, `${p.name}: ${p.desc}`)}</a>`);
    out.push(`<p><a href="${p.live}">${img("pill-live.svg", "Live demo", 'height="34"')}</a> <a href="${p.repo}">${img("pill-code.svg", "Source code", 'height="34"')}</a></p>`);
  }
  out.push("");
  out.push(img("experience.svg", "Experience: " + EXPERIENCE.map((e) => `${e.role}, ${e.org}`).join("; ")));
  out.push("");
  out.push(img("activity.svg", "GitHub activity"));
  out.push("");
  return out.join("\n");
}

// ---------- main ----------
const data = SAMPLE ? sampleData() : await liveData();
const st = stats(data.days);
await fs.mkdir(ASSETS, { recursive: true });
const fixed = await portraitText();
const rows = fixed || (await asciiRows(await portraitSource(), false));
if (process.argv.includes("--export-portrait")) await fs.writeFile(path.join(ASSETS, "portrait.txt"), rows.join("\n") + "\n");
const t = THEMES.dark;
const files = {
  "header.svg": headerSvg(t, rows),
  "about.svg": aboutSvg(t),
  "stack.svg": stackSvg(t),
  "section-projects.svg": sectionSvg(t, "PROJECTS"),
  "experience.svg": experienceSvg(t),
  "activity.svg": activitySvg(t, data, st),
  "pill-live.svg": pillSvg(t, "LIVE DEMO"),
  "pill-code.svg": pillSvg(t, "SOURCE CODE"),
};
for (const l of LINKS) files[`pill-${l.id}.svg`] = pillSvg(t, l.label);
for (const p of PROJECTS) files[`project-${p.id}.svg`] = projectSvg(t, p);
for (const [f, body] of Object.entries(files)) await fs.writeFile(path.join(ASSETS, f), body);
await fs.writeFile(path.join(ROOT, "README.md"), readme());
console.log(`ok · ${data.total} contributions · ${st.active} active days · streak ${st.current}/${st.longest} · ${data.repos} repos · ${Object.keys(files).length} svgs`);
