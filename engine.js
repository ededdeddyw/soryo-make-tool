/* 共通計算エンジン（index.html ③ と soryo-tool.html で共有）
   ① 料金表＋アフィリ設定（データ）
   ② 発送方法の判定・最安選定・梱包導線などの共通ロジック／表示ヘルパー
   料金やロジックの更新はここ1か所でOK（ドリフト防止）。
   出典（月1で要確認・docs/shipping-sources.md 参照）：
     らくらくメルカリ便 https://jp-news.mercari.com/more/rakuraku-mercari
     ゆうゆうメルカリ便 https://jp-news.mercari.com/more/yuyu-mercari
   最終確認：2026-06-23。料金・サイズは改定されるため目安（専用箱代別）。
   ※ネコポスは2025/11/10にサイズ拡大（長辺34cm・3辺60cm）。ゆうパック60は750円(2023/11改定)。
   ※ 各HTMLの本体 <script> より前に読み込むこと（<script src="engine.js"></script> を先に置く）。
   ※ ページ固有の calc() / 結果レンダリング / renderCompare() は各HTML側に残す。 */

/* ============================ ① データ ============================ */
const FEE_RATE=0.10, LOW_PROFIT=300;
const SMALL=[
  {name:'ゆうパケットポストmini', svc:'ゆうゆう', ship:160, mat:20, matLabel:'専用封筒20円', note:'専用封筒21×17cm・ポスト投函・2kg', limits:{long:21, mid:17, thick:3, w:2000}},
  {name:'ネコポス',            svc:'らくらく', ship:210, mat:0,  matLabel:'',          note:'長辺34cm・3辺60cm・厚さ3cm・1kg（2025/11サイズ拡大）', limits:{long:34, thick:3, sum:60, w:1000}},
  {name:'ゆうパケットポスト',    svc:'ゆうゆう', ship:215, mat:5,  matLabel:'発送用シール5円', note:'ポスト投函・3辺60cm・厚さ3cm・2kg', limits:{long:34, thick:3, sum:60, w:2000}},
  {name:'ゆうパケット',         svc:'ゆうゆう', ship:230, mat:0,  matLabel:'',          note:'3辺60cm・長辺34cm・厚さ3cm・1kg', limits:{long:34, thick:3, sum:60, w:1000}},
  {name:'宅急便コンパクト',      svc:'らくらく', ship:450, mat:70, matLabel:'専用BOX70円', note:'専用BOX2種・厚さ5cmまで・重量制限なし', boxes:[{long:25, mid:20, thick:5},{long:34, mid:24.8, thick:2}]},
  {name:'ゆうパケットプラス',    svc:'ゆうゆう', ship:455, mat:65, matLabel:'専用箱65円', note:'専用箱24×17×7cm・厚さ7cm・2kg', limits:{long:24, mid:17, thick:7, w:2000}},
];
const TAKKYU=[{size:60,max:2000,price:750},{size:80,max:5000,price:850},{size:100,max:10000,price:1050},{size:120,max:15000,price:1200},{size:140,max:20000,price:1450},{size:160,max:25000,price:1700},{size:180,max:30000,price:2100},{size:200,max:30000,price:2500}];
const YUPACK=[{size:60,price:750},{size:80,price:870},{size:100,price:1070},{size:120,price:1200},{size:140,price:1450},{size:160,price:1700},{size:170,price:1900}];
const YUPACK_MAXW=25000;
/* 梱包資材アフィリ：Amazonアソシエイト等のタグを入れると全資材リンクに付与される */
const AFFILIATE = { amazonTag:'' };

/* サイズの目安プリセット（測らずに近いものをタップ） */
const SIZE_PRESETS=[
  {em:'📩',label:'薄い小物',sub:'本・薄手の服',d:[22,15,1],w:150},
  {em:'👕',label:'衣類',sub:'たたんだ服',d:[30,22,4],w:400},
  {em:'📦',label:'小箱',sub:'雑貨・化粧品',d:[25,20,7],w:800},
  {em:'🧴',label:'中箱',sub:'靴・中型雑貨',d:[40,30,20],w:2000},
  {em:'🍳',label:'調理家電',sub:'電子レンジ等',d:[40,35,30],w:5000},
  {em:'🪑',label:'家具・大型',sub:'いす・本棚',d:[100,60,45],w:12000},
];

/* ============================ 共通ヘルパー ============================ */
const $ = id => document.getElementById(id);
const yen = n => (n<0?'−':'') + '¥' + Math.abs(Math.round(n)).toLocaleString('ja-JP');

/* サイズプリセットのボタンを描画（クリックで入力に反映→calc()）。calc は各ページ側で定義 */
function buildPresets(){
  const el=$('presets'); if(!el) return;
  el.innerHTML=SIZE_PRESETS.map((p,i)=>`<button class="preset" data-i="${i}">${p.em} ${p.label}<span class="pm">${p.sub}</span></button>`).join('');
  el.querySelectorAll('.preset').forEach(b=> b.onclick=()=>{ const p=SIZE_PRESETS[+b.dataset.i]; $('d1').value=p.d[0]; $('d2').value=p.d[1]; $('d3').value=p.d[2]; $('weight').value=p.w; calc(); });
}

/* ============================ ② 判定ロジック ============================ */
function buildDims(){ const a=+$('d1').value||0,b=+$('d2').value||0,c=+$('d3').value||0; const s=[a,b,c].sort((x,y)=>y-x); return {longest:s[0],mid:s[1],thick:s[2],sum:a+b+c}; }
function checkLimits(d,w,L){
  if(L.long && d.longest>L.long) return `長辺${L.long}cm超`;
  if(L.mid && d.mid>L.mid)       return `横${L.mid}cm超`;
  if(L.thick && d.thick>L.thick) return `厚さ${L.thick}cm超`;
  if(L.sum && d.sum>L.sum)       return `3辺合計${L.sum}cm超`;
  if(L.w && w>L.w)               return `重さ${(L.w/1000)}kg超`;
  return null;
}
function checkBoxes(d,boxes){ return boxes.some(b=> !checkLimits(d,0,b)) ? null : '専用BOXに入らない'; }
// 各規格に対する超過項目（厚さ・長辺・3辺合計など）を列挙
function violations(d,w,L){
  const v=[];
  if(L.long && d.longest>L.long) v.push({k:'long',over:d.longest-L.long,lim:L.long});
  if(L.mid && d.mid>L.mid)       v.push({k:'mid',over:d.mid-L.mid,lim:L.mid});
  if(L.thick && d.thick>L.thick) v.push({k:'thick',over:d.thick-L.thick,lim:L.thick});
  if(L.sum && d.sum>L.sum)       v.push({k:'sum',over:d.sum-L.sum,lim:L.sum});
  if(L.w && w>L.w)               v.push({k:'w',over:w-L.w,lim:L.w});
  return v;
}
// 「厚さだけ」がネックで使えていない安い方法を探す（正方形・箱型が厚さで弾かれる対策）
function thicknessTip(d,w,best){
  let tip=null;
  for(const m of SMALL){
    if(m.boxes) continue;                         // 専用BOX系は除外
    const cost=m.ship+m.mat;
    if(best && cost>=best.cost) continue;          // 今の最安より高ければ得しない
    const vio=violations(d,w,m.limits);
    if(vio.length===1 && vio[0].k==='thick'){       // ネックが厚さ1点のみ
      const cand={name:m.name,cost,lim:vio[0].lim,over:vio[0].over,save:best?best.cost-cost:0};
      if(!tip || cand.cost<tip.cost) tip=cand;
    }
  }
  return tip;
}
// 入力サイズ・重さで使える発送方法を一覧化（cost＝送料＋資材／ok＝規格内）
function eligibleMethods(d,w){
  const list=[];
  for(const m of SMALL){
    const reason=m.boxes?checkBoxes(d,m.boxes):checkLimits(d,w,m.limits);
    list.push({name:m.name,svc:m.svc,ship:m.ship,mat:m.mat,matLabel:m.matLabel,cost:m.ship+m.mat,note:m.note,ok:!reason,reason});
  }
  const t=TAKKYU.find(x=> d.sum<=x.size && w<=x.max);
  list.push(t?{name:`宅急便 ${t.size}サイズ`,svc:'らくらく',ship:t.price,mat:0,matLabel:'',cost:t.price,note:'集荷・追跡・補償あり',ok:true,reason:null}
              :{name:'宅急便',svc:'らくらく',ship:0,mat:0,matLabel:'',cost:0,note:'集荷・追跡・補償あり',ok:false,reason:d.sum>200?'3辺合計200cm超':'重さ30kg超'});
  const y=(w<=YUPACK_MAXW)?YUPACK.find(x=> d.sum<=x.size):null;
  list.push(y?{name:`ゆうパック ${y.size}サイズ`,svc:'ゆうゆう',ship:y.price,mat:0,matLabel:'',cost:y.price,note:'集荷/コンビニ持込・追跡',ok:true,reason:null}
              :{name:'ゆうパック',svc:'ゆうゆう',ship:0,mat:0,matLabel:'',cost:0,note:'集荷/コンビニ持込・追跡',ok:false,reason:w>YUPACK_MAXW?'重さ25kg超':'3辺合計170cm超'});
  return list;
}

/* ============================ 入力の記憶（再訪を速く） ============================ */
const CALC_KEY='shobun-navi.calc', CALC_IDS=['price','d1','d2','d3','weight','material','laborMin','wage','bundle'];
function saveCalc(){ try{ const o={}; CALC_IDS.forEach(id=>o[id]=$(id).value); localStorage.setItem(CALC_KEY, JSON.stringify(o)); }catch(e){} }
function restoreCalc(){ try{ const o=JSON.parse(localStorage.getItem(CALC_KEY)||'null'); if(o) CALC_IDS.forEach(id=>{ if(o[id]!=null && $(id)) $(id).value=o[id]; }); }catch(e){} }

/* ============================ 梱包資材の購入導線（収益化ポイント） ============================ */
function amazonSearch(q){ const u='https://www.amazon.co.jp/s?k='+encodeURIComponent(q); return AFFILIATE.amazonTag ? u+'&tag='+encodeURIComponent(AFFILIATE.amazonTag) : u; }
function materialLink(best){
  const map=[['宅急便コンパクト','宅急便コンパクト 専用box'],['ゆうパケットプラス','ゆうパケットプラス 専用箱'],
    ['ゆうパケットポストmini','ゆうパケットポストmini 専用封筒'],['ゆうパケットポスト','ゆうパケットポスト 発送用シール'],
    ['宅急便','ダンボール 箱 宅配'],['ゆうパック','ダンボール 箱 宅配']];
  const hit=map.find(([n])=> best.name.includes(n));
  const q = hit ? hit[1] : '梱包資材 プチプチ 封筒';
  const label = hit ? hit[1].replace(/ 専用box| 専用箱| 専用封筒| 発送用シール| 箱 宅配/,'').trim() : '梱包資材（プチプチ・封筒）';
  return { label, href:amazonSearch(q) };
}
function matHtml(best){
  if(!best) return '';
  const m=materialLink(best);
  return `<div style="display:flex;gap:9px;align-items:center;font-size:.84rem;background:#fff;border:1px solid var(--line);border-radius:10px;padding:9px 12px;margin:10px 0 4px"><span style="font-size:1.1rem">🛒</span><span><b>${m.label}</b> を準備：<a href="${m.href}" target="_blank" rel="noopener">Amazonで探す ↗</a></span></div>`;
}
function tipHtml(o){
  if(!o.tip) return '';
  return `<div style="display:flex;gap:9px;align-items:flex-start;font-size:.84rem;background:var(--blue-bg);border:1px solid #bcd6ef;border-radius:10px;padding:10px 12px;margin:10px 0 6px">
    <span style="font-size:1.15rem;line-height:1.2">💡</span>
    <span><b>厚さ</b>をあと <b>${o.tip.over.toFixed(1)}cm</b> 薄く（${o.tip.lim}cm以下）にできれば <b>${o.tip.name}</b>（${yen(o.tip.cost)}）${o.best?`が使えて、今の最安より <b>${yen(o.tip.save)}</b> お得。`:'で送れます（今は規格外で送れません）。'}<br>
    <span style="color:var(--muted);font-size:.76rem">正方形・箱型は「厚さ」で安い方法に入らないことが多いです。平たく梱包すると解決できることも。</span></span>
  </div>`;
}

/* ============================ 判定カード・アイコン（表示ヘルパー） ============================ */
function card(cls,ico,t,d){return `<div class="verdict ${cls}"><div class="ico">${ico}</div><div><p class="vt">${t}</p><p class="vd">${d}</p></div></div>`;}
function iconCheck(){return svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>');}
function iconWarn(){return svg('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>');}
function iconAlert(){return svg('<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>');}
function svg(i){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${i}</svg>`;}
