/* ごみ収集日データ生成（東京23区・CSVオープンデータの区）
   公式CSVを取得・解析し data/gomi/<code>.json を出力する。実行: node scripts/build-gomi.js
   ※ 出力JSONはコミット済みなのでサイト実行時は不要。新規区は WARDS に追加。
   ※ PDFカレンダー形式の区（港区など）は build-gomi-minato.mjs。
   方針：推測値は入れない。公式CSVの値だけを変換。隔週など本モデルで表せない収集は省く。 */

const fs = require('fs');
const path = require('path');

const WMAP = { '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6 };
const NUM = { '１': 1, '２': 2, '３': 3, '４': 4, '５': 5, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 };

// 収集曜日テキスト → パターン。対応形式：
//  「火・金」「第２木・第４木」（品川）／「火曜日・金曜日」「第1・第3木曜日」（文京・中央）／
//  「火曜日;金曜日」「第2;第4土曜日」（中野, ; 区切り）。隔週・記載なしは null。
function parseDay(s) {
  s = (s || '').trim().replace(/\s/g, '');
  if (!s || s === '-' || s === '−' || s === '―' || s.includes('隔週') || s.includes('なし') || s.includes('未定')) return null;
  if (s.includes('第')) {
    const weeks = []; let m; const re = /第([1-5１-５])/g;
    while ((m = re.exec(s))) weeks.push(NUM[m[1]]);
    let dm = s.match(/([日月火水木金土])曜/) || s.match(/第[1-5１-５]([日月火水木金土])/);
    const day = dm ? WMAP[dm[1]] : null;
    if (day == null || !weeks.length) return null;
    return { t: 'm', w: [...new Set(weeks)].sort((a, b) => a - b), d: day };
  }
  const days = []; let m; const re = /([日月火水木金土])曜/g;
  while ((m = re.exec(s))) days.push(WMAP[m[1]]);
  if (!days.length) { // 曜なし「火・金」形式
    for (const ch of s.split(/[・;／]/)) { const c = (ch.trim()[0]); if (WMAP[c] != null) days.push(WMAP[c]); }
  }
  if (!days.length) return null;
  return { t: 'w', d: [...new Set(days)].sort((a, b) => a - b) };
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

async function fetchText(url, encoding) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  const buf = Buffer.from(await res.arrayBuffer());
  return new TextDecoder(encoding === 'utf8' ? 'utf-8' : 'shift_jis').decode(buf);
}

// 丁目セルの整形：「全域」→空、「1;2;4;5」→「1・2・4・5丁目」、「1丁目」→そのまま
function fmtChome(c) {
  c = (c || '').trim();
  if (!c || c === '全域' || c === '-' || c === '−') return '';
  c = c.replace(/;/g, '・');
  if (/[0-9０-９]$/.test(c)) c += '丁目';
  return c;
}

// 縦持ち(品川: 1行=1地区1種別)の分類名 → メタ
const TYPE_META_LONG = {
  '燃やすごみ': { key: 'burn', em: '🔥', name: '燃やすごみ' },
  '陶器・ガラス・金属ごみ': { key: 'noncomb', em: '🪨', name: '陶器・ガラス・金属ごみ' },
  '資源': { key: 'resource', em: '♻️', name: '資源' },
  'プラスチック': { key: 'plastic', em: '🧴', name: 'プラスチック' },
};

const WARDS = [
  { code: '13109', ward: '品川区', format: 'long', enc: 'sjis',
    url: 'http://www.city.shinagawa.tokyo.jp/ct/other000081600/gomisyusyubi.csv',
    cols: { type: 0, district: 1, day: 3 } },
  { code: '13105', ward: '文京区', format: 'wide', enc: 'sjis',
    url: 'https://www.city.bunkyo.lg.jp/documents/6059/syusyubi.csv',
    cols: { town: 0, chome: 1, types: [
      { col: 2, key: 'burn', em: '🔥', name: '可燃ごみ' },
      { col: 3, key: 'noncomb', em: '🪨', name: '不燃ごみ' },
      { col: 4, key: 'resource', em: '♻️', name: '資源（びん・缶・ペット・古紙）' },
      { col: 5, key: 'plastic', em: '🧴', name: '資源プラスチック' } ] } },
  { code: '13108', ward: '江東区', format: 'wide', enc: 'sjis',
    url: 'https://www.opendata.metro.tokyo.lg.jp/koto/131083_201_kotocity_waste_recycle_collectionday.csv',
    cols: { town: 1, types: [
      { col: 5, key: 'burn', em: '🔥', name: '燃やすごみ' },
      { col: 6, key: 'noncomb', em: '🪨', name: '燃やさないごみ' },
      { col: 3, key: 'resource', em: '♻️', name: '資源' },
      { col: 4, key: 'plastic', em: '🧴', name: 'プラスチック' } ] } },
  { code: '13102', ward: '中央区', format: 'wide', enc: 'sjis',
    url: 'https://www.city.chuo.lg.jp/documents/984/gomitoshigen.csv',
    cols: { town: 2, chome: 3, types: [
      { col: 4, key: 'burn', em: '🔥', name: '燃やすごみ' },
      { col: 5, key: 'noncomb', em: '🪨', name: '燃やさないごみ' },
      { col: 6, key: 'plastic', em: '🧴', name: 'プラマーク（プラ）' },
      { col: 7, key: 'resource', em: '♻️', name: '資源' } ] } },
  { code: '13114', ward: '中野区', format: 'wide', enc: 'utf8',
    url: 'https://www2.wagmap.jp/nakanodatamap/nakanodatamap/opendatafile/map_1/CSV/opendata_550239.csv',
    cols: { town: 4, chome: 5, types: [
      { col: 8, key: 'burn', em: '🔥', name: '燃やすごみ' },
      { col: 9, key: 'noncomb', em: '🪨', name: '陶器・ガラス・金属ごみ' },
      { col: 7, key: 'resource', em: '♻️', name: '資源（びん・ペットボトル）' },
      { col: 6, key: 'plastic', em: '🧴', name: '資源プラスチック' } ] } },
];

function writeWard(w, districts, typesSeen, skipped) {
  const out = {
    ward: w.ward, code: w.code, source: w.url,
    note: '出典：' + w.ward + '公式オープンデータ。祝日・年末年始・臨時変更や隔週収集は反映されません。最終的な収集日は公式でご確認ください。',
    types: [...typesSeen.values()], districts,
  };
  const dir = path.join(__dirname, '..', 'data', 'gomi');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, w.code + '.json'), JSON.stringify(out));
  console.log(`${w.ward}: districts=${Object.keys(districts).length} types=${out.types.map(t => t.name).join('/')} skipped=${skipped}`);
}

async function buildLong(w) {
  const rows = parseCSV(await fetchText(w.url, w.enc)); rows.shift();
  const typesSeen = new Map(), districts = {}; let skipped = 0;
  for (const r of rows) {
    const meta = TYPE_META_LONG[(r[w.cols.type] || '').trim()];
    const district = (r[w.cols.district] || '').trim();
    const pat = parseDay(r[w.cols.day]);
    if (!meta || !district || !pat) { skipped++; continue; }
    typesSeen.set(meta.key, { key: meta.key, em: meta.em, name: meta.name });
    (districts[district] = districts[district] || {})[meta.key] = pat;
  }
  writeWard(w, districts, typesSeen, skipped);
}

async function buildWide(w) {
  const rows = parseCSV(await fetchText(w.url, w.enc)); rows.shift();
  const typesSeen = new Map(), districts = {}; let skipped = 0;
  for (const r of rows) {
    const town = (r[w.cols.town] || '').trim();
    const name = (town + (w.cols.chome != null ? fmtChome(r[w.cols.chome]) : '')).trim();
    if (!name) { skipped++; continue; }
    const d = districts[name] || {};
    let any = false;
    for (const t of w.cols.types) {
      const pat = parseDay(r[t.col]);
      if (pat) { d[t.key] = pat; typesSeen.set(t.key, { key: t.key, em: t.em, name: t.name }); any = true; }
    }
    if (any) districts[name] = d; else if (!districts[name]) skipped++;
  }
  // 種別はカラム定義順に並べる
  const order = new Map();
  for (const w2 of [w]) for (const t of w2.cols.types) if (typesSeen.has(t.key)) order.set(t.key, typesSeen.get(t.key));
  writeWard(w, districts, order, skipped);
}

(async () => {
  for (const w of WARDS) {
    try { w.format === 'long' ? await buildLong(w) : await buildWide(w); }
    catch (e) { console.error(w.ward + ' FAILED:', e.message); process.exitCode = 1; }
  }
})();
