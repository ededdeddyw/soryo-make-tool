/* 渋谷区(13113)ごみ収集日データ生成
   公式PDF「地域別収集日（曜日）一覧表」(表形式・1ページ・曜日のみ)を pdfjs で座標解析。
   表は2段組（左右）×列：町丁名 / 可燃ごみ(週2) / 不燃ごみ(月1) / 資源(週1)。索引・繁華街注記は除外。
   依存: pdfjs-dist。出力 data/gomi/13113.json はコミット済みでサイト実行時は不要。
   方針：推測なし。PDFの値だけを変換。不燃は「第N月曜日」(月1回)=第N週として解釈。 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import path from 'path';
import url from 'url';

const PDF_URL = 'https://files.city.shibuya.tokyo.jp/assets/12995aba8b194961be709ba879857f70/6da4b9a0e1f34a4a8a10fbbf29c03c09/chiikibetushuushuuyoubiitiran2025.pdf';
const WMAP = { '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6 };
const NUM = { '１': 1, '２': 2, '３': 3, '４': 4, '５': 5, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 };

function parseDay(s) {
  s = (s || '').trim().replace(/\s/g, '');
  if (!s) return null;
  const dm = s.match(/[日月火水木金土]/);
  if (!dm) return null;
  if (/[1-5１-５]/.test(s)) { // 第N週（月N回）
    const weeks = []; let m; const re = /[1-5１-５]/g;
    while ((m = re.exec(s))) weeks.push(NUM[m[0]]);
    return { t: 'm', w: [...new Set(weeks)].sort((a, b) => a - b), d: WMAP[dm[0]] };
  }
  const days = []; let m; const re = /[日月火水木金土]/g;
  while ((m = re.exec(s))) days.push(WMAP[m[0]]);
  return { t: 'w', d: [...new Set(days)].sort((a, b) => a - b) };
}

function colL(x) { return x < 55 ? 'idx' : x < 235 ? 'name' : x < 297 ? 'burn' : x < 362 ? 'noncomb' : 'resource'; }
function colR(x) { return x < 452 ? 'idx' : x < 618 ? 'name' : x < 703 ? 'burn' : x < 772 ? 'noncomb' : 'resource'; }
function isNoise(s) {
  return /^[ぁ-ん]$/.test(s) || /繁華街|お問い合わせ|について|指定の場所|詳しく|出しください|朝[0-9０-９7７8８：:]|一部に|清掃|（週|（月|町丁名|可燃|不燃|資源/.test(s);
}

function commit(districts, row) {
  const name = (row.name || '').replace(/\s+/g, '').trim();
  if (!name || !/[町丁目]/.test(name) || /^[（）〔〕～、・0-9０-９目]/.test(name)) return;
  if (/繁華街|お問い合わせ|について|指定|詳しく|出しください|一部地/.test(name)) return;  // 繁華街注記・断片
  if (/丁目[一-龥]/.test(name)) return;  // 「渋谷4丁目松濤1丁目」のような2町合体（丁目の直後に漢字）
  const rb = parseDay(row.burn), rn = parseDay(row.noncomb), rr = parseDay(row.resource);
  if (!rb || !rn || !rr || rn.t !== 'm') return;  // 可燃(週)・不燃(第N)・資源(週)が揃う行のみ
  if (!districts[name]) districts[name] = { burn: rb, noncomb: rn, resource: rr };
}

async function build() {
  const res = await fetch(PDF_URL);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const doc = await getDocument({ data: new Uint8Array(await res.arrayBuffer()), useSystemFonts: true }).promise;
  const districts = {};
  for (let p = 1; p <= doc.numPages; p++) {
    const items = (await (await doc.getPage(p)).getTextContent()).items
      .filter(i => i.str.trim()).map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }));
    for (const side of ['L', 'R']) {
      const its = items.filter(i => side === 'L' ? i.x < 432 : i.x >= 432).sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = []; let cur = [], ly = null;
      for (const it of its) { if (ly === null || Math.abs(it.y - ly) <= 3) cur.push(it); else { lines.push(cur); cur = [it]; } ly = it.y; }
      if (cur.length) lines.push(cur);
      const col = side === 'L' ? colL : colR;
      let row = null;
      for (const ln of lines) {
        const cells = { name: [], burn: [], noncomb: [], resource: [] };
        for (const it of ln) { const c = col(it.x); if (c === 'name' && isNoise(it.s)) continue; if (c in cells) cells[c].push(it.s); }
        const resVal = cells.resource.join('');
        const isData = /^[日月火水木金土]$/.test(resVal) && cells.burn.length && cells.noncomb.length;
        if (isData) {
          if (row) commit(districts, row);
          row = { name: cells.name.join(''), burn: cells.burn.join(''), noncomb: cells.noncomb.join(''), resource: resVal };
        } else if (row && cells.name.length && !cells.burn.length && !cells.noncomb.length && !cells.resource.length) {
          row.name += cells.name.join('');
        }
      }
      if (row) commit(districts, row);
    }
  }
  return districts;
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const districts = await build();
const out = {
  ward: '渋谷区', code: '13113', source: PDF_URL,
  note: '出典：渋谷区公式「地域別収集日（曜日）一覧表」。祝日・年末年始・臨時変更や繁華街地域の時間差は反映されません。最終的な収集日は公式でご確認ください。',
  types: [
    { key: 'burn', em: '🔥', name: '可燃ごみ' },
    { key: 'noncomb', em: '🪨', name: '不燃ごみ' },
    { key: 'resource', em: '♻️', name: '資源' },
  ],
  districts,
};
fs.mkdirSync(path.join(__dirname, '..', 'data', 'gomi'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'data', 'gomi', '13113.json'), JSON.stringify(out));
console.log('渋谷区: districts=' + Object.keys(districts).length);
