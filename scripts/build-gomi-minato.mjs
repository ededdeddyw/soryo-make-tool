/* 港区（13103）ごみ収集日データ生成
   - 入力: scripts/minato-map.json（地区→スケジュール対応。公式カレンダーページから自動抽出）
   - 各スケジュールの公式PDF（令和8年度版）を取得し、収集曜日を座標解析（lib-minato-pdf.mjs）
   - 出力: data/gomi/13103.json
   依存: pdfjs-dist（`npm i pdfjs-dist` 済みの場所で実行）。出力JSONはコミット済みのためサイト実行時は不要。
   再生成: node scripts/build-gomi-minato.mjs
   方針: 推測なし。公式PDFの値のみを変換。台場1・2丁目は可燃ごみの収集日が無い（管路収集）。 */
import { parsePDF, patternsOf } from './lib-minato-pdf.mjs';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'minato-map.json'), 'utf8'));

const TYPE_META = {
  burn: { em: '🔥', name: '可燃ごみ' },
  noncomb: { em: '🪨', name: '不燃ごみ' },
  resource: { em: '♻️', name: '資源（古紙・びん・缶・ペット）' },
  plastic: { em: '🧴', name: '資源プラスチック' },
  bincan: { em: '🍶', name: 'びん・かん' },
  ppaper: { em: '📦', name: 'ペットボトル・古紙' },
};
const ORDER = ['burn', 'noncomb', 'resource', 'plastic', 'bincan', 'ppaper'];

const tmp = path.join(__dirname, '_gpdf');
fs.mkdirSync(tmp, { recursive: true });
const districts = {}, used = new Set();
for (const sch of map) {
  const f = path.join(tmp, sch.id + '.pdf');
  execSync(`curl -s "${sch.canon}" -o "${f}"`);
  const { occ } = await parsePDF(f);
  const pat = patternsOf(occ);
  Object.keys(pat).forEach(k => used.add(k));
  for (const d of sch.districts) districts[d] = pat;
  console.log(`${sch.id}: ${Object.entries(pat).map(([k, p]) => k + '=' + (p.t === 'w' ? 'w' + p.d : 'm' + p.w + ':' + p.d)).join(' ')}  (${sch.districts.length}地区)`);
}
fs.rmSync(tmp, { recursive: true, force: true });

const out = {
  ward: '港区', code: '13103',
  source: 'https://www.city.minato.tokyo.jp/unei/2025gomikarenda.html',
  note: '出典：港区公式「家庭ごみ・資源収集日カレンダー（令和8年度版）」。台場1・2丁目は可燃ごみの収集日がありません（管路収集システム）。祝日・年末年始・臨時変更は反映されません。最終的な収集日は公式でご確認ください。',
  types: ORDER.filter(k => used.has(k)).map(k => ({ key: k, em: TYPE_META[k].em, name: TYPE_META[k].name })),
  districts,
};
const outFile = path.join(REPO, 'data', 'gomi', '13103.json');
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(`\n-> ${path.relative(REPO, outFile)}  districts=${Object.keys(districts).length} types=${out.types.map(t => t.key).join('/')}`);
