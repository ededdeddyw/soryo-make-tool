// 港区PDFカレンダー → 収集パターン（セルの月ブロック＋日付から実際の曜日・週を算出）
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

// 台場1・2丁目は特殊（可燃ごみの収集日が無い＝管路収集／資源が瓶缶・P紙に分かれる）
const LABELS = { '可燃': 'burn', '不燃': 'noncomb', '資源': 'resource', 'プラ': 'plastic', '瓶缶': 'bincan', 'P紙': 'ppaper', 'Ｐ紙': 'ppaper' };
const ALLKEYS = ['burn', 'noncomb', 'resource', 'plastic', 'bincan', 'ppaper'];

export async function parsePDF(file) {
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const items = (await page.getTextContent()).items
    .filter(i => i.str.trim()).map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }));

  // 月見出し（「月」の直左に月番号があるもの）→ 12個。年度は4〜12月=2026, 1〜3月=2027
  const headers = [];
  for (const m of items.filter(i => i.s === '月')) {
    const num = items.filter(i => /^\d{1,2}$/.test(i.s) && Math.abs(i.y - m.y) < 6 && i.x < m.x && m.x - i.x < 60)
      .sort((a, b) => b.x - a.x)[0];
    if (num) headers.push({ month: +num.s, x: m.x, y: m.y });
  }
  const headerXs = [...new Set(headers.map(h => Math.round(h.x)))].sort((a, b) => a - b); // 3列
  const headerYs = [...new Set(headers.map(h => Math.round(h.y)))].sort((a, b) => b - a); // 4行(上→下)
  const monthAt = (x, y) => {
    // ブロック列＝「左端見出しx以上」の最右ブロック（最近傍だと右端列が隣ブロックに誤割当てされる）
    let ci = 0; for (let i = 0; i < headerXs.length; i++) if (headerXs[i] <= x + 5) ci = i;
    let best = null, bd = Infinity;
    for (const h of headers) { if (Math.round(h.x) !== headerXs[ci]) continue; const dy = h.y - y; if (dy > 0 && dy < bd) { bd = dy; best = h; } }
    return best ? best.month : null;
  };

  const dates = items.filter(i => /^\d{1,2}$/.test(i.s) && +i.s >= 1 && +i.s <= 31)
    .map(i => ({ n: +i.s, x: i.x, y: i.y }));
  // 各日付セルに月→実際の曜日・週を付与
  for (const d of dates) {
    const month = monthAt(d.x, d.y);
    if (!month) { d.wd = null; continue; }
    const year = month >= 4 ? 2026 : 2027;
    const dt = new Date(year, month - 1, d.n);
    // 月跨ぎ(オフセル)ガード：算出した月と一致しなければ無効
    if (dt.getMonth() !== month - 1) { d.wd = null; continue; }
    d.wd = dt.getDay();
    d.wk = Math.floor((d.n - 1) / 7) + 1;
  }

  const occ = Object.fromEntries(ALLKEYS.map(k => [k, []]));
  for (const L of items.filter(i => LABELS[i.s])) {
    let best = null, bestDy = Infinity;
    for (const d of dates) {
      const dy = d.y - L.y;
      if (dy > 0 && dy < 40 && Math.abs(d.x - L.x) < 22 && dy < bestDy) { bestDy = dy; best = d; }
    }
    if (best && best.wd != null) occ[LABELS[L.s]].push({ wd: best.wd, wk: best.wk });
  }
  return { occ };
}

function classify(list) {
  const byWd = {};
  for (const o of list) { const b = byWd[o.wd] = byWd[o.wd] || { count: 0, weeks: {} }; b.count++; b.weeks[o.wk] = (b.weeks[o.wk] || 0) + 1; }
  const active = Object.entries(byWd).filter(([, v]) => v.count >= 8).map(([wd, v]) => ({ wd: +wd, ...v }));
  const weeklyDays = [], monthly = [];
  for (const a of active) {
    const weeks = Object.entries(a.weeks).filter(([, c]) => c >= 3).map(([w]) => +w).sort((x, y) => x - y);
    if (weeks.length >= 4) weeklyDays.push(a.wd); else if (weeks.length) monthly.push({ wd: a.wd, weeks });
  }
  if (weeklyDays.length) return { t: 'w', d: weeklyDays.sort((a, b) => a - b) };
  if (monthly.length) return { t: 'm', w: monthly[0].weeks, d: monthly[0].wd };
  return null;
}

export function patternsOf(occ) {
  const out = {};
  for (const key of Object.keys(occ)) { const p = classify(occ[key]); if (p) out[key] = p; }
  return out;
}

if (process.argv[2]) {
  const WJ = ['日', '月', '火', '水', '木', '金', '土'];
  const fmt = p => p.t === 'w' ? '毎週 ' + p.d.map(x => WJ[x]).join('・') : '第' + p.w.join('・') + ' ' + WJ[p.d];
  const { occ } = await parsePDF(process.argv[2]);
  const pat = patternsOf(occ);
  console.log('counts:', Object.fromEntries(Object.entries(occ).map(([k, v]) => [k, v.length])));
  for (const k of ALLKEYS) if (pat[k]) console.log('  ', k, '→', fmt(pat[k]), JSON.stringify(pat[k]));
}
