/* ごみ収集日データ生成スクリプト（東京23区）
   公式オープンデータ(CSV)を取得・解析し data/gomi/<code>.json を出力する。
   実行: node scripts/build-gomi.js
   ※ 出力JSONはコミット済みなので、サイト実行時にこのスクリプトは不要。
   ※ 新しい区を足すときは WARDS に追加し、必要ならフォーマット用アダプタを実装する。
   方針：推測値は入れない。必ず公式CSVの値だけを変換する。 */

const fs = require('fs');
const path = require('path');

const WMAP = { '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6 };
const NUM = { '１': 1, '２': 2, '３': 3, '４': 4, '５': 5, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 };

// 「火・金」→ {t:'w',d:[2,5]} ／「第２木・第４木」→ {t:'m',w:[2,4],d:4}
function parseDay(s) {
  s = (s || '').trim();
  if (!s) return null;
  if (s.includes('第')) {
    const weeks = []; let day = null;
    for (const p of s.split('・')) {
      const m = p.match(/第\s*([1-5１-５])\s*([日月火水木金土])/);
      if (m) { weeks.push(NUM[m[1]]); day = WMAP[m[2]]; }
    }
    if (day == null || !weeks.length) return null;
    return { t: 'm', w: weeks.sort((a, b) => a - b), d: day };
  }
  const days = s.split('・').map(x => WMAP[x.trim()]).filter(x => x != null);
  if (!days.length) return null;
  return { t: 'w', d: days.sort((a, b) => a - b) };
}

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c === '\r') { /* skip */ }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.length > 1 && r.some(x => x !== ''));
}

async function fetchSJIS(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  const buf = Buffer.from(await res.arrayBuffer());
  return new TextDecoder('shift_jis').decode(buf);
}

// ごみ種別の表示（CSVの分類名 → 絵文字・正規化名）
const TYPE_META = {
  '燃やすごみ': { key: 'burn', em: '🔥', name: '燃やすごみ' },
  '陶器・ガラス・金属ごみ': { key: 'noncomb', em: '🪨', name: '陶器・ガラス・金属ごみ' },
  '資源': { key: 'resource', em: '♻️', name: '資源' },
  'プラスチック': { key: 'plastic', em: '🧴', name: 'プラスチック' },
};

const WARDS = [
  {
    code: '13109', ward: '品川区', format: 'sjis-csv',
    url: 'http://www.city.shinagawa.tokyo.jp/ct/other000081600/gomisyusyubi.csv',
    // 列: 0=ゴミ分類区分,1=地区名,2=英語,3=収集曜日,...
    cols: { type: 0, district: 1, day: 3 },
  },
];

async function buildWard(w) {
  const text = await fetchSJIS(w.url);
  const rows = parseCSV(text);
  rows.shift(); // header
  const typesSeen = new Map();
  const districts = {};
  let skipped = 0;
  for (const r of rows) {
    const rawType = (r[w.cols.type] || '').trim();
    const district = (r[w.cols.district] || '').trim();
    const meta = TYPE_META[rawType];
    const pat = parseDay(r[w.cols.day]);
    if (!meta || !district || !pat) { skipped++; continue; }
    typesSeen.set(meta.key, meta);
    (districts[district] = districts[district] || {})[meta.key] = pat;
  }
  const out = {
    ward: w.ward,
    code: w.code,
    source: w.url,
    note: '出典：' + w.ward + '公式オープンデータ。祝日・年末年始・臨時変更は反映されません。最終的な収集日は公式でご確認ください。',
    types: [...typesSeen.values()],
    districts,
  };
  const dir = path.join(__dirname, '..', 'data', 'gomi');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, w.code + '.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`${w.ward}: districts=${Object.keys(districts).length} types=${out.types.map(t => t.name).join('/')} skipped=${skipped} -> ${path.relative(path.join(__dirname, '..'), file)}`);
  return out;
}

(async () => {
  for (const w of WARDS) {
    try { await buildWard(w); }
    catch (e) { console.error(w.ward + ' FAILED:', e.message); process.exitCode = 1; }
  }
})();
