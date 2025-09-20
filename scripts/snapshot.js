// scripts/snapshot.js
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.APISPORTS_KEY;

// İstanbul tarihi (YYYY-MM-DD)
function ymdIST(d = new Date()) {
  const tzOffsetMin = -180; // Europe/Istanbul ~ UTC+3
  const local = new Date(d.getTime() + (tzOffsetMin - d.getTimezoneOffset()) * 60000);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function httpGetJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error for ${url}: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchFixturesForDate(ymd) {
  const url = `${API_BASE}/fixtures?date=${ymd}`;
  const json = await httpGetJSON(url, { 'x-apisports-key': API_KEY });
  const list = json?.response || [];
  const fixtures = list.map((it) => ({
    fixtureId: it?.fixture?.id,
    leagueId: it?.league?.id,
    season: it?.league?.season,
    homeTeamId: it?.teams?.home?.id,
    awayTeamId: it?.teams?.away?.id,
    homeTeam: it?.teams?.home?.name,
    awayTeam: it?.teams?.away?.name,
  }));
  return fixtures.filter(f =>
    f.fixtureId && f.homeTeamId && f.awayTeamId && f.leagueId && f.season
  );
}

async function main() {
  if (!API_KEY) throw new Error('Missing APISPORTS_KEY secret.');

  const ymd = ymdIST();
  const dir = path.join('snapshots', ymd);
  fs.mkdirSync(dir, { recursive: true });

  // 1) fixtures.json
  const fixtures = await fetchFixturesForDate(ymd);
  fs.writeFileSync(path.join(dir, 'fixtures.json'), JSON.stringify(fixtures, null, 2));
  console.log(`Wrote ${fixtures.length} fixtures → snapshots/${ymd}/fixtures.json`);

  // 2) predictions.json (şimdilik boş)
  const predsPath = path.join(dir, 'predictions.json');
  if (!fs.existsSync(predsPath)) {
    fs.writeFileSync(predsPath, JSON.stringify({}, null, 2));
    console.log(`Wrote empty predictions map → snapshots/${ymd}/predictions.json`);
  } else {
    console.log('predictions.json already exists, keeping as is.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
