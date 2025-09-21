// scripts/snapshot.js
// Node 20+ (GitHub Actions runner) fetch destekli
// GITHUB_TOKEN değil APISPORTS_KEY kullanıyoruz (Actions secrets)

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.APISPORTS_KEY;
if (!API_KEY) {
  console.error('Missing APISPORTS_KEY secret.');
  process.exit(1);
}

// ---- LİG FİLTRESİ (sadece bunlar kalacak) ----
const ALLOWED_LEAGUES = [
  145, 144, 207, 235, 208, 283, 103, 106, 119, 2, 3, 848, 113, 140, 39, 204, 203, 62,
  89, 61, 218, 345, 88, 79, 78, 141, 172, 40, 98, 135, 110, 32, 120, 307, 128, 71,
  169, 253, 136, 419, 210, 244, 107, 94, 95, 179, 292, 705
];

// ---- Yardımcılar ----
function ymdInTZ(tz = 'Europe/Istanbul', date = new Date()) {
  // YYYY-MM-DD string döndürür
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA -> 2025-09-21
  return fmt.format(date);
}

async function fetchJSON(url, params = {}) {
  const u = new URL(url);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.append(k, String(v));
  });
  const res = await fetch(u.toString(), {
    headers: { 'x-apisports-key': API_KEY },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} – ${txt.slice(0, 200)}`);
  }
  return res.json();
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  console.log('Wrote →', p);
}

// ---- Ana akış ----
(async () => {
  const YMD = ymdInTZ('Europe/Istanbul'); // Actions cron 05:31 TR’de çalışıyor
  const outDir = path.join('snapshots', YMD);
  ensureDir(outDir);

  // 1) Bugünün tüm fikstürü (tek çağrı)
  const data = await fetchJSON('https://v3.football.api-sports.io/fixtures', {
    date: YMD,
  });

  const all = Array.isArray(data?.response) ? data.response : [];
  // 2) Lig filtresi
  const allowedSet = new Set(ALLOWED_LEAGUES);
  const filtered = all.filter((it) => allowedSet.has(it?.league?.id));

  // 3) Uygulamanın beklediği düz forma map’le
  const fixtures = filtered.map((it) => {
    const f = it?.fixture || {};
    const lg = it?.league || {};
    const th = it?.teams?.home || {};
    const ta = it?.teams?.away || {};
    return {
      fixtureId: f.id,
      date: f.date,
      kickoffTs: f.timestamp, // saniye
      statusShort: f?.status?.short ?? null,
      elapsed: f?.status?.elapsed ?? null,
      venue: f?.venue?.name ?? null,

      leagueId: lg.id,
      leagueName: lg.name,
      season: lg.season, // API döndürüyor

      homeTeamId: th.id,
      homeTeam: th.name,
      homeLogo: th.logo,

      awayTeamId: ta.id,
      awayTeam: ta.name,
      awayLogo: ta.logo,
    };
  });

  // 4) Dosyaları yaz
  writeJSON(path.join(outDir, 'fixtures.json'), fixtures);
  writeJSON(path.join(outDir, 'predictions.json'), {}); // şimdilik boş map

  // 5) Status + latest
  writeJSON(path.join(outDir, 'status.json'), {
    generatedAt: new Date().toISOString(),
    ok: true,
    source: 'api-sports',
    timezone: 'Europe/Istanbul',
    ymd: YMD,
    leagues: ALLOWED_LEAGUES.length,
    fixtures: fixtures.length,
  });

  // Son gün pointer’ı
  ensureDir(path.join('snapshots'));
  writeJSON(path.join('snapshots', 'latest.json'), {
    ymd: YMD,
    fixtures: fixtures.length,
  });

  console.log(`Snapshot READY: ${YMD} – ${fixtures.length} fixtures (filtered).`);
})().catch((err) => {
  console.error('Snapshot FAILED:', err?.message || err);
  process.exit(1);
});
