// scripts/snapshot.js
/**
 * Günlük snapshot üretir:
 * - snapshots/YYYY-MM-DD/fixtures.json   (API'den çekilir)
 * - snapshots/YYYY-MM-DD/predictions.json (yoksa {} oluşturur)
 *
 * İsteğe bağlı: belirli bir günü üretmek için env:
 *   SNAPSHOT_DATE=YYYY-MM-DD node scripts/snapshot.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.APISPORTS_KEY;

// ---- Istanbul (IST) tarihinde YYYY-MM-DD ----
function ymdIST(d = new Date()) {
  // Intl ile timezone doğru hesaplanır (yaz/kış saatinde de)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d); // en-CA => YYYY-MM-DD
}

// Eğer manuel tarih verilmişse onu kullan
function getTargetYmd() {
  const fromEnv = process.env.SNAPSHOT_DATE; // ör: 2025-09-21
  if (fromEnv && /^\d{4}-\d{2}-\d{2}$/.test(fromEnv)) return fromEnv;
  return ymdIST();
}

function httpGetJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`JSON parse error for ${url}: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Bugünün tüm fikstürleri (gerekirse lig filtresi ekleyebilirsin)
async function fetchFixturesForDate(ymd) {
  const url = `${API_BASE}/fixtures?date=${ymd}`;
  const json = await httpGetJSON(url, { 'x-apisports-key': API_KEY });
  const list = json?.response || [];

  // Uygulamanın ihtiyacı olan minimum alanlara düzleştir
  const fixtures = list.map((it) => ({
    fixtureId: it?.fixture?.id,
    leagueId: it?.league?.id,
    season: it?.league?.season,
    homeTeamId: it?.teams?.home?.id,
    awayTeamId: it?.teams?.away?.id,
    homeTeam: it?.teams?.home?.name,
    awayTeam: it?.teams?.away?.name,
    // istersen ileride şunları da ekleyebilirsin:
    // fixtureDate: it?.fixture?.date,
    // leagueName: it?.league?.name,
    // status: it?.fixture?.status?.short
  }));

  // Null/undefined değerleri süz
  return fixtures.filter(
    (f) =>
      f.fixtureId && f.homeTeamId && f.awayTeamId && f.leagueId && f.season
  );
}

async function main() {
  if (!API_KEY) {
    throw new Error('Missing APISPORTS_KEY secret.');
  }

  const ymd = getTargetYmd();
  const dir = path.join('snapshots', ymd);
  fs.mkdirSync(dir, { recursive: true });

  // 1) fixtures.json
  const fixtures = await fetchFixturesForDate(ymd);
  const fixturesPath = path.join(dir, 'fixtures.json');
  fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2));
  console.log(`Wrote ${fixtures.length} fixtures → ${fixturesPath}`);

  // 2) predictions.json (yoksa boş map)
  const predsPath = path.join(dir, 'predictions.json');
  if (!fs.existsSync(predsPath)) {
    fs.writeFileSync(predsPath, JSON.stringify({}, null, 2));
    console.log(`Wrote empty predictions map → ${predsPath}`);
  } else {
    console.log('predictions.json already exists, keeping as is.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
