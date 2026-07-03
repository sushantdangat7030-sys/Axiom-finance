/* Axiom Finance — personal expense splitting + money tracker.
   All data lives in localStorage. No server, no accounts, no tracking. */
'use strict';

const LS_KEY = 'axiom-finance-v1';

/* ---------- default data ---------- */
const DEFAULT_CATEGORIES = [
  { id:'c_groc', name:'Groceries',     emoji:'🛒' },
  { id:'c_dine', name:'Dining out',    emoji:'🍽️' },
  { id:'c_trans',name:'Transport',     emoji:'🚕' },
  { id:'c_home', name:'Rent & housing',emoji:'🏠' },
  { id:'c_util', name:'Utilities',     emoji:'💡' },
  { id:'c_shop', name:'Shopping',      emoji:'🛍️' },
  { id:'c_ent',  name:'Entertainment', emoji:'🎬' },
  { id:'c_trav', name:'Travel',        emoji:'✈️' },
  { id:'c_health',name:'Health',       emoji:'🩺' },
  { id:'c_sub',  name:'Subscriptions', emoji:'🔁' },
  { id:'c_inc',  name:'Income',        emoji:'💰', income:true },
  { id:'c_other',name:'Other',         emoji:'📦' },
];
const ACCOUNT_TYPES = [
  ['checking','Checking / current'],['savings','Savings'],['cash','Cash'],
  ['credit','Credit card'],['investment','Investment'],['loan','Loan'],
];
const CURRENCIES = ['INR','USD','EUR','GBP','JPY','AED','SGD','AUD','CAD','CHF'];
const SERIES = ['var(--s1)','var(--s2)','var(--s3)','var(--s4)','var(--s5)','var(--s6)','var(--s7)','var(--s8)'];
const OTHER_COLOR = 'var(--baseline)';

function defaultData(){
  return {
    version:1,
    settings:{ currency:'INR', theme:'auto' },
    people:[{ id:'me', name:'You' }],
    groups:[],           // {id,name,emoji,members:[personId]}
    splits:[],           // {id,groupId,desc,amount,paidBy,date,shares:{pid:amt}}
    settlements:[],      // {id,groupId,from,to,amount,date}
    accounts:[],         // {id,name,type,start}
    transactions:[],     // {id,accountId,date,payee,catId,amount,notes} amount<0 expense
    categories:DEFAULT_CATEGORIES.map(c=>({...c})),
    budgets:{},          // catId -> monthly amount
  };
}

/* ---------- state ---------- */
let DB = null;
function load(){
  try{ const d = JSON.parse(localStorage.getItem(LS_KEY)); if(d && d.version===1) return d; }catch(e){}
  return null;
}
let warnedNoStore = false;
function save(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(DB)); }
  catch(e){
    if(!warnedNoStore){ warnedNoStore=true; toast('⚠ Storage unavailable — changes won’t survive a reload. Use Settings → Export to save.'); }
  }
}

/* ---------- utils ---------- */
const $ = s=>document.querySelector(s);
const uid = ()=> Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
const esc = s=> String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const r2 = n=> Math.round(n*100)/100;
const todayStr = ()=> new Date().toISOString().slice(0,10);
const monthKey = d=> d.slice(0,7);
const thisMonth = ()=> todayStr().slice(0,7);

function fmtMoney(n, opts={}){
  const cur = DB?.settings.currency || 'INR';
  const loc = cur==='INR' ? 'en-IN' : undefined;
  let v = Math.abs(n) < 0.005 ? 0 : n;
  if(opts.abs) v = Math.abs(v);
  const frac = Math.abs(v % 1) > 0.004 ? 2 : 0;
  return new Intl.NumberFormat(loc,{style:'currency',currency:cur,
    minimumFractionDigits:frac, maximumFractionDigits:frac}).format(v);
}
function fmtCompact(n){
  const cur = DB?.settings.currency || 'INR';
  if(cur==='INR'){ // Intl's en-IN compact uses "T" for thousand, which reads as trillion
    const r = v => String(Math.round(v*10)/10).replace(/\.0$/,'');
    if(n>=1e7) return '₹'+r(n/1e7)+'Cr';
    if(n>=1e5) return '₹'+r(n/1e5)+'L';
    if(n>=1e3) return '₹'+r(n/1e3)+'k';
    return '₹'+Math.round(n);
  }
  return new Intl.NumberFormat('en',{style:'currency',currency:cur,notation:'compact',maximumFractionDigits:1}).format(n);
}
function fmtDate(d){
  const dt = new Date(d+'T00:00:00');
  return dt.toLocaleDateString(undefined,{day:'numeric',month:'short'});
}
function monthLabel(mk){
  const dt = new Date(mk+'-01T00:00:00');
  return dt.toLocaleDateString(undefined,{month:'short',year:'numeric'});
}
function person(id){ return DB.people.find(p=>p.id===id) || {id,name:'?'}; }
function personName(id){ return id==='me' ? 'you' : person(id).name; }
function PersonName(id){ return id==='me' ? 'You' : person(id).name; }
function cat(id){ return DB.categories.find(c=>c.id===id) || {id,name:'Other',emoji:'📦'}; }
function account(id){ return DB.accounts.find(a=>a.id===id); }
function group(id){ return DB.groups.find(g=>g.id===id); }
function initials(name){ return name.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase(); }
function avatarColor(pid){
  const i = Math.max(0, DB.people.findIndex(p=>p.id===pid));
  return SERIES[i % SERIES.length];
}
function avatar(pid){
  const p = person(pid);
  return `<span class="avatar" style="background:${avatarColor(pid)}">${esc(initials(p.name))}</span>`;
}
/* categorical chart color: fixed slot by position among expense categories; ≥8 folds into Other */
function catSlotColor(catId){
  const exp = DB.categories.filter(c=>!c.income);
  const i = exp.findIndex(c=>c.id===catId);
  return (i>=0 && i<8) ? SERIES[i] : null;
}
function toast(msg){
  const t = document.createElement('div'); t.className='toast'; t.textContent=msg;
  $('#toast-root').appendChild(t); setTimeout(()=>t.remove(), 2400);
}

/* ---------- split math ---------- */
function computeNets(filterGroup){ // net>0 → is owed money
  const nets = {};
  const add=(p,v)=>{ nets[p]=(nets[p]||0)+v; };
  for(const e of DB.splits){
    if(filterGroup!==undefined && (e.groupId||'')!==filterGroup) continue;
    add(e.paidBy, e.amount);
    for(const [p,s] of Object.entries(e.shares)) add(p,-s);
  }
  for(const s of DB.settlements){
    if(filterGroup!==undefined && (s.groupId||'')!==filterGroup) continue;
    add(s.from, s.amount); add(s.to, -s.amount);
  }
  for(const k in nets) nets[k]=r2(nets[k]);
  return nets;
}
function simplify(nets){ // → [{from,to,amount}]
  const debt = Object.entries(nets).filter(([,v])=>v<-0.005).map(([p,v])=>({p,v:-v}));
  const cred = Object.entries(nets).filter(([,v])=>v> 0.005).map(([p,v])=>({p,v}));
  debt.sort((a,b)=>b.v-a.v); cred.sort((a,b)=>b.v-a.v);
  const out=[]; let i=0,j=0;
  while(i<debt.length && j<cred.length){
    const amt = r2(Math.min(debt[i].v, cred[j].v));
    if(amt>0.005) out.push({from:debt[i].p, to:cred[j].p, amount:amt});
    debt[i].v=r2(debt[i].v-amt); cred[j].v=r2(cred[j].v-amt);
    if(debt[i].v<=0.005) i++;
    if(cred[j].v<=0.005) j++;
  }
  return out;
}
function equalShares(amount, ids){ // exact to the paisa, remainder to first members
  const cents = Math.round(amount*100), n = ids.length;
  const base = Math.floor(cents/n); let rem = cents - base*n;
  const out={};
  for(const id of ids){ out[id] = (base + (rem>0?1:0))/100; if(rem>0) rem--; }
  return out;
}

/* ---------- money helpers ---------- */
function accountBalance(a){
  return r2(a.start + DB.transactions.filter(t=>t.accountId===a.id).reduce((s,t)=>s+t.amount,0));
}
function netWorth(){ return r2(DB.accounts.reduce((s,a)=>s+accountBalance(a),0)); }
function monthSpend(mk){
  return r2(-DB.transactions.filter(t=>monthKey(t.date)===mk && t.amount<0 && !cat(t.catId).income)
    .reduce((s,t)=>s+t.amount,0));
}
function monthIncome(mk){
  return r2(DB.transactions.filter(t=>monthKey(t.date)===mk && t.amount>0).reduce((s,t)=>s+t.amount,0));
}
function spendByCat(mk){
  const m={};
  for(const t of DB.transactions){
    if(monthKey(t.date)!==mk || t.amount>=0) continue;
    m[t.catId]=(m[t.catId]||0)-t.amount;
  }
  return Object.entries(m).map(([id,v])=>({id,v:r2(v)})).sort((a,b)=>b.v-a.v);
}
function lastMonths(n){
  const out=[]; const d=new Date();
  for(let i=n-1;i>=0;i--){
    const dt=new Date(d.getFullYear(), d.getMonth()-i, 1);
    out.push(dt.toISOString().slice(0,7));
  }
  return out;
}

/* ---------- charts (SVG, hover tooltips via [data-tip]) ---------- */
function donutChart(items){ // items: [{label, value, color}]
  const total = items.reduce((s,d)=>s+d.value,0);
  if(total<=0) return '<div class="empty">No spending yet this month</div>';
  const R=62, C=2*Math.PI*R, W=26, gapPx=2;
  let off=0, segs='';
  for(const d of items){
    const frac=d.value/total;
    const len=Math.max(0, frac*C - (items.length>1?gapPx:0));
    segs += `<circle r="${R}" cx="85" cy="85" fill="none" stroke="${d.color}" stroke-width="${W}"
      stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}"
      data-tip="${esc(d.label)}|${esc(fmtMoney(d.value))} · ${Math.round(frac*100)}%"></circle>`;
    off += frac*C;
  }
  const legend = items.map(d=>`
    <div class="lg-row">
      <span class="lg-swatch" style="background:${d.color}"></span>
      <span class="lg-name">${esc(d.label)}</span>
      <span class="lg-pct">${Math.round(d.value/total*100)}%</span>
      <span class="lg-val">${esc(fmtMoney(d.value))}</span>
    </div>`).join('');
  return `<div class="donut-flex">
    <div class="chart-wrap"><svg viewBox="0 0 170 170" role="img" aria-label="Spending by category">
      <g transform="rotate(-90 85 85)">${segs}</g>
      <text x="85" y="81" text-anchor="middle" class="donut-center-val" fill="var(--ink)">${esc(fmtCompact(total))}</text>
      <text x="85" y="99" text-anchor="middle" class="donut-center-lbl">this month</text>
    </svg></div>
    <div class="legend">${legend}</div>
  </div>`;
}

function barChart(series){ // series: [{label, value, tip}] — single measure, blue
  const W=560, H=190, padL=46, padB=24, padT=14;
  const max = Math.max(...series.map(d=>d.value), 1);
  const nice = niceMax(max);
  const iw=(W-padL-8)/series.length, bw=Math.min(34, iw*0.55);
  const y = v => padT + (H-padT-padB)*(1-v/nice);
  const maxIdx = series.reduce((mi,d,i)=>d.value>series[mi].value?i:mi,0);
  let bars='', labels='';
  const ticks=[0, nice/2, nice];
  const grid = ticks.map(t=>`
    <line x1="${padL}" x2="${W-4}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)" stroke-width="1"></line>
    <text x="${padL-6}" y="${y(t)+3.5}" text-anchor="end" class="axis-lbl">${esc(fmtCompact(t))}</text>`).join('');
  series.forEach((d,i)=>{
    const x=padL+iw*i+(iw-bw)/2, yv=y(d.value), h=Math.max(0,(H-padB)-yv);
    const rr=Math.min(4,h);
    const path = h<=0 ? '' :
      `M${x},${H-padB} L${x},${yv+rr} Q${x},${yv} ${x+rr},${yv} L${x+bw-rr},${yv} Q${x+bw},${yv} ${x+bw},${yv+rr} L${x+bw},${H-padB} Z`;
    bars += `<path d="${path}" fill="var(--s1)"></path>
      <rect x="${padL+iw*i}" y="${padT}" width="${iw}" height="${H-padT-padB}" fill="transparent"
        data-tip="${esc(d.label)}|${esc(d.tip)}"></rect>`;
    if(i===maxIdx && d.value>0)
      labels += `<text x="${x+bw/2}" y="${yv-5}" text-anchor="middle" class="bar-lbl">${esc(fmtCompact(d.value))}</text>`;
    labels += `<text x="${x+bw/2}" y="${H-8}" text-anchor="middle" class="axis-lbl">${esc(d.label)}</text>`;
  });
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly spending">
    ${grid}
    <line x1="${padL}" x2="${W-4}" y1="${H-padB}" y2="${H-padB}" stroke="var(--baseline)" stroke-width="1"></line>
    ${bars}${labels}
  </svg></div>`;
}
function niceMax(v){
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for(const m of [1,2,2.5,5,10]) if(v <= m*p) return m*p;
  return 10*p;
}

/* tooltip */
document.addEventListener('mousemove', e=>{
  const el = e.target.closest?.('[data-tip]');
  const tip = $('#chart-tip');
  if(!el){ tip.hidden=true; return; }
  const [l,v] = el.dataset.tip.split('|');
  tip.innerHTML = `<span class="tt-label">${esc(l)}</span><br><b>${esc(v)}</b>`;
  tip.hidden=false;
  const pad=14, r=tip.getBoundingClientRect();
  let x=e.clientX+pad, yy=e.clientY+pad;
  if(x+r.width>innerWidth-8) x=e.clientX-r.width-pad;
  if(yy+r.height>innerHeight-8) yy=e.clientY-r.height-pad;
  tip.style.left=x+'px'; tip.style.top=yy+'px';
});

/* ---------- modal ---------- */
function openModal(html){
  const root=$('#modal-root');
  root.innerHTML=`<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  root.querySelector('input,select,textarea,button')?.focus();
  return root.querySelector('.modal');
}
function closeModal(){ $('#modal-root').innerHTML=''; }
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });
document.addEventListener('click', e=>{ if(e.target.id==='modal-root') closeModal(); });

/* ---------- router ---------- */
const routes = {};
function render(){
  if(!DB){ renderOnboard(); return; }
  const hash = location.hash || '#/dashboard';
  const [,page,arg] = hash.split('/');
  document.querySelectorAll('#nav a').forEach(a=>
    a.classList.toggle('active', a.dataset.route===page));
  const fn = routes[page] || routes.dashboard;
  $('#view').innerHTML = fn(arg ? decodeURIComponent(arg) : undefined);
}
window.addEventListener('hashchange', render);

/* ---------- onboarding ---------- */
function renderOnboard(){
  document.querySelectorAll('#nav a').forEach(a=>a.classList.remove('active'));
  $('#view').innerHTML = `<div class="onboard card">
    <div class="big">◆</div>
    <h1>Welcome to Axiom Finance</h1>
    <p>Split expenses with friends (like Splitwise) and track your accounts, spending and budgets (like Monarch) — free, private, and offline-friendly. Everything is stored <b>only in this browser</b>.</p>
    <button class="btn primary" data-action="start-sample">Explore with sample data</button>
    <button class="btn" data-action="start-fresh">Start fresh</button>
    <div class="footnote">Tip: use Settings → Export to back up your data as a JSON file.</div>
  </div>`;
}

/* ---------- dashboard ---------- */
routes.dashboard = () => {
  const mk = thisMonth();
  const spend = monthSpend(mk), income = monthIncome(mk);
  const nets = computeNets();
  const myNet = nets.me || 0;
  const byCat = spendByCat(mk);
  const withSlots = byCat.map(d=>({...d, color:catSlotColor(d.id)}));
  const top = withSlots.filter(d=>d.color).slice(0,7);
  const restVal = r2(byCat.reduce((s,d)=>s+d.v,0) - top.reduce((s,d)=>s+d.v,0));
  const donutData = top.map(d=>({label:cat(d.id).name, value:d.v, color:d.color}));
  if(restVal>0.005) donutData.push({label:'Other', value:restVal, color:OTHER_COLOR});
  const months = lastMonths(6).map(m=>({label:new Date(m+'-01T00:00:00').toLocaleDateString(undefined,{month:'short'}),
    value:monthSpend(m), tip:fmtMoney(monthSpend(m))+' spent'}));
  const recents = DB.transactions.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
  const budgets = Object.entries(DB.budgets).filter(([,v])=>v>0);
  return `
  <div class="page-head"><div><h1>Dashboard</h1><div class="sub">${monthLabel(mk)}</div></div>
    <button class="btn primary" data-action="add-tx">＋ Add transaction</button></div>
  <div class="tiles">
    <div class="tile"><div class="t-label">Net worth</div><div class="t-value">${fmtMoney(netWorth())}</div>
      <div class="t-sub">${DB.accounts.length} account${DB.accounts.length===1?'':'s'}</div></div>
    <div class="tile"><div class="t-label">Spent this month</div><div class="t-value">${fmtMoney(spend)}</div>
      <div class="t-sub">income ${fmtMoney(income)}</div></div>
    <div class="tile"><div class="t-label">Split balance</div>
      <div class="t-value ${myNet>0.005?'pos':myNet<-0.005?'neg':''}">${fmtMoney(Math.abs(myNet))}</div>
      <div class="t-sub">${myNet>0.005?'you are owed':myNet<-0.005?'you owe':'all settled up'}</div></div>
  </div>
  <div class="grid2">
    <div class="card"><h2>Spending by category</h2>${donutChart(donutData)}</div>
    <div class="card"><h2>Spending — last 6 months</h2>${barChart(months)}</div>
  </div>
  ${budgets.length?`<div class="card"><h2>Budgets · ${monthLabel(mk)}</h2>${budgetRows(mk)}</div>`:''}
  <div class="card"><h2>Recent transactions</h2>
    ${recents.length? `<div class="list">${recents.map(txRow).join('')}</div>
      <div style="margin-top:10px"><a href="#/transactions">See all →</a></div>`
      : '<div class="empty">No transactions yet. Add one to get started.</div>'}
  </div>`;
};

/* ---------- split ---------- */
routes.split = (groupId) => groupId!==undefined ? groupDetail(groupId) : splitHome();

function splitHome(){
  const nets = computeNets();
  const my = nets.me||0;
  const friends = DB.people.filter(p=>p.id!=='me');
  const suggestions = simplify(nets).filter(t=>t.from==='me'||t.to==='me');
  return `
  <div class="page-head"><div><h1>Split</h1><div class="sub">Shared expenses with friends</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" data-action="add-person">＋ Friend</button>
      <button class="btn" data-action="add-group">＋ Group</button>
      <button class="btn primary" data-action="add-split" data-group="">＋ Expense</button>
    </div></div>
  <div class="tiles">
    <div class="tile"><div class="t-label">Overall</div>
      <div class="t-value ${my>0.005?'pos':my<-0.005?'neg':''}">${fmtMoney(Math.abs(my))}</div>
      <div class="t-sub">${my>0.005?'you are owed':my<-0.005?'you owe':'all settled up'}</div></div>
  </div>
  ${suggestions.length?`<div class="card"><h2>Settle up suggestions</h2>
    ${suggestions.map(t=>`<div class="settle-row">${avatar(t.from)} <b>${esc(PersonName(t.from))}</b>
      <span class="arrow">pays →</span> ${avatar(t.to)} <b>${esc(PersonName(t.to))}</b>
      <span style="margin-left:auto" class="li-amt">${fmtMoney(t.amount)}</span>
      <button class="btn small" data-action="settle" data-from="${t.from}" data-to="${t.to}" data-amt="${t.amount}">Record</button>
    </div>`).join('')}</div>`:''}
  <div class="card"><h2>Groups</h2>
    ${DB.groups.length? `<div class="list">${DB.groups.map(g=>{
      const gn = computeNets(g.id).me||0;
      return `<div class="list-item clickable" data-action="open-group" data-id="${g.id}">
        <div class="li-ic">${esc(g.emoji||'👥')}</div>
        <div class="li-main"><div class="li-title">${esc(g.name)}</div>
        <div class="li-sub">${g.members.length} members</div></div>
        <div class="li-amt ${gn>0.005?'pos':gn<-0.005?'neg':''}">${gn>0.005?'+':gn<-0.005?'−':''}${fmtMoney(Math.abs(gn),{abs:true})}
        <div class="li-amt-sub">${gn>0.005?'you get back':gn<-0.005?'you owe':'settled'}</div></div>
      </div>`;}).join('')}</div>` : '<div class="empty">No groups yet — create one for a trip, flat, or team.</div>'}
  </div>
  <div class="card"><h2>Friends</h2>
    ${friends.length? `<div class="list">${friends.map(p=>{
      const n = nets[p.id]||0;
      return `<div class="list-item">${avatar(p.id)}
        <div class="li-main"><div class="li-title">${esc(p.name)}</div></div>
        <div class="li-amt ${n<-0.005?'pos':n>0.005?'neg':''}">${fmtMoney(Math.abs(n),{abs:true})}
        <div class="li-amt-sub">${n<-0.005?'owes overall':n>0.005?'is owed overall':'settled'}</div></div>
      </div>`;}).join('')}</div>` : '<div class="empty">Add friends to start splitting expenses.</div>'}
  </div>
  `;
}

function groupDetail(gid){
  const g = group(gid);
  if(!g) return '<div class="empty">Group not found. <a href="#/split">Back</a></div>';
  const nets = computeNets(gid);
  const sugg = simplify(nets);
  const exps = DB.splits.filter(e=>e.groupId===gid).sort((a,b)=>b.date.localeCompare(a.date));
  const setts = DB.settlements.filter(s=>s.groupId===gid).sort((a,b)=>b.date.localeCompare(a.date));
  return `
  <div class="page-head"><div>
      <div class="sub"><a href="#/split">← Split</a></div>
      <h1>${esc(g.emoji||'👥')} ${esc(g.name)}</h1></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" data-action="edit-group" data-id="${gid}">Edit</button>
      <button class="btn primary" data-action="add-split" data-group="${gid}">＋ Expense</button>
    </div></div>
  <div class="card"><h2>Balances</h2>
    <div class="list">${g.members.map(pid=>{
      const n = nets[pid]||0;
      return `<div class="list-item">${avatar(pid)}
        <div class="li-main"><div class="li-title">${esc(PersonName(pid))}</div></div>
        <div class="li-amt ${n>0.005?'pos':n<-0.005?'neg':''}">${n>0.005?'+':n<-0.005?'−':''}${fmtMoney(Math.abs(n),{abs:true})}
        <div class="li-amt-sub">${n>0.005?'gets back':n<-0.005?'owes':'settled'}</div></div></div>`;}).join('')}
    </div>
    ${sugg.length?`<div class="section-label">Suggested settlements</div>
      ${sugg.map(t=>`<div class="settle-row">${avatar(t.from)} <b>${esc(PersonName(t.from))}</b>
        <span class="arrow">pays →</span> ${avatar(t.to)} <b>${esc(PersonName(t.to))}</b>
        <span style="margin-left:auto" class="li-amt">${fmtMoney(t.amount)}</span>
        <button class="btn small" data-action="settle" data-group="${gid}" data-from="${t.from}" data-to="${t.to}" data-amt="${t.amount}">Record</button>
      </div>`).join('')}`:'<div class="hint" style="margin-top:8px">Everyone is settled up 🎉</div>'}
  </div>
  <div class="card"><h2>Expenses</h2>
    ${exps.length? `<div class="list">${exps.map(e=>{
      const mine = (e.paidBy==='me'?e.amount:0) - (e.shares.me||0);
      return `<div class="list-item clickable" data-action="edit-split" data-id="${e.id}">
        <div class="li-ic">🧾</div>
        <div class="li-main"><div class="li-title">${esc(e.desc)}</div>
          <div class="li-sub">${fmtDate(e.date)} · ${esc(PersonName(e.paidBy))} paid ${fmtMoney(e.amount)}</div></div>
        <div class="li-amt ${mine>0.005?'pos':mine<-0.005?'neg':''}">${mine>0.005?'+':mine<-0.005?'−':''}${fmtMoney(Math.abs(mine),{abs:true})}
          <div class="li-amt-sub">${mine>0.005?'you lent':mine<-0.005?'you borrowed':'—'}</div></div>
      </div>`;}).join('')}</div>` : '<div class="empty">No expenses yet — add the first one.</div>'}
  </div>
  ${setts.length?`<div class="card"><h2>Settlements</h2><div class="list">${setts.map(s=>`
    <div class="list-item"><div class="li-ic">🤝</div>
      <div class="li-main"><div class="li-title">${esc(PersonName(s.from))} paid ${esc(personName(s.to))}</div>
      <div class="li-sub">${fmtDate(s.date)}</div></div>
      <div class="li-amt">${fmtMoney(s.amount)}</div>
      <button class="btn small ghost" data-action="del-settle" data-id="${s.id}" title="Delete">✕</button>
    </div>`).join('')}</div></div>`:''}`;
}

/* ---------- transactions ---------- */
let txFilter = { month:'', cat:'', acct:'', q:'' };
routes.transactions = () => {
  const months = [...new Set(DB.transactions.map(t=>monthKey(t.date)))].sort().reverse();
  let list = DB.transactions.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
  if(txFilter.month) list=list.filter(t=>monthKey(t.date)===txFilter.month);
  if(txFilter.cat)   list=list.filter(t=>t.catId===txFilter.cat);
  if(txFilter.acct)  list=list.filter(t=>t.accountId===txFilter.acct);
  if(txFilter.q){ const q=txFilter.q.toLowerCase();
    list=list.filter(t=>(t.payee+' '+(t.notes||'')).toLowerCase().includes(q)); }
  const total = r2(list.reduce((s,t)=>s+t.amount,0));
  return `
  <div class="page-head"><div><h1>Transactions</h1>
    <div class="sub">${list.length} shown · net ${fmtMoney(total)}</div></div>
    <button class="btn primary" data-action="add-tx">＋ Add</button></div>
  <div class="card">
    <div class="tx-filters">
      <select data-filter="month"><option value="">All months</option>
        ${months.map(m=>`<option value="${m}" ${txFilter.month===m?'selected':''}>${monthLabel(m)}</option>`).join('')}</select>
      <select data-filter="cat"><option value="">All categories</option>
        ${DB.categories.map(c=>`<option value="${c.id}" ${txFilter.cat===c.id?'selected':''}>${esc(c.emoji+' '+c.name)}</option>`).join('')}</select>
      <select data-filter="acct"><option value="">All accounts</option>
        ${DB.accounts.map(a=>`<option value="${a.id}" ${txFilter.acct===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select>
      <input type="search" placeholder="Search…" value="${esc(txFilter.q)}" data-filter="q">
    </div>
    ${list.length? `<div class="list">${list.map(txRow).join('')}</div>` : '<div class="empty">Nothing here.</div>'}
  </div>`;
};
function txRow(t){
  const c = cat(t.catId);
  return `<div class="list-item clickable" data-action="edit-tx" data-id="${t.id}">
    <div class="li-ic">${esc(c.emoji)}</div>
    <div class="li-main"><div class="li-title">${esc(t.payee)}</div>
      <div class="li-sub">${fmtDate(t.date)} · ${esc(c.name)}${t.accountId&&account(t.accountId)?' · '+esc(account(t.accountId).name):''}</div></div>
    <div class="li-amt ${t.amount>0?'pos':''}">${t.amount>0?'+':''}${fmtMoney(t.amount)}</div>
  </div>`;
}

/* ---------- budgets ---------- */
routes.budgets = () => {
  const mk = thisMonth();
  return `
  <div class="page-head"><div><h1>Budgets</h1><div class="sub">${monthLabel(mk)}</div></div>
    <button class="btn primary" data-action="edit-budgets">Edit budgets</button></div>
  ${Object.entries(DB.budgets).filter(([,v])=>v>0).length
    ? `<div class="card">${budgetRows(mk)}</div>`
    : `<div class="card"><div class="empty">No budgets yet. Set a monthly limit per category — spending is tracked automatically from your transactions.</div></div>`}`;
};
function budgetRows(mk){
  const rows = Object.entries(DB.budgets).filter(([,v])=>v>0).map(([cid,limit])=>{
    const c = cat(cid);
    const spent = r2(-DB.transactions.filter(t=>monthKey(t.date)===mk&&t.catId===cid&&t.amount<0).reduce((s,t)=>s+t.amount,0));
    const pct = Math.min(100, spent/limit*100);
    const cls = spent>limit?'over':(spent>limit*0.85?'warn':'');
    return `<div style="padding:10px 0;border-bottom:1px solid var(--grid)">
      <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px">
        <span style="font-weight:550">${esc(c.emoji+' '+c.name)}</span>
        <span class="hint">${fmtMoney(spent)} of ${fmtMoney(limit)}
          ${spent>limit?`<b class="neg"> · ⚠ over by ${fmtMoney(r2(spent-limit))}</b>`:''}</span>
      </div>
      <div class="bar"><i class="${cls}" style="width:${pct}%"></i></div>
    </div>`;
  }).join('');
  return `<div>${rows}</div>`;
}

/* ---------- accounts ---------- */
routes.accounts = () => {
  const groups = {};
  for(const a of DB.accounts) (groups[a.type] ||= []).push(a);
  const typeName = t => (ACCOUNT_TYPES.find(([k])=>k===t)||[,''])[1];
  return `
  <div class="page-head"><div><h1>Accounts</h1>
    <div class="sub">Net worth ${fmtMoney(netWorth())}</div></div>
    <button class="btn primary" data-action="add-acct">＋ Add account</button></div>
  ${DB.accounts.length? Object.entries(groups).map(([t,as])=>`
    <div class="card"><h2>${esc(typeName(t)||t)}</h2><div class="list">
      ${as.map(a=>{ const b=accountBalance(a);
        return `<div class="list-item clickable" data-action="edit-acct" data-id="${a.id}">
          <div class="li-ic">${{checking:'🏦',savings:'🏦',cash:'💵',credit:'💳',investment:'📈',loan:'📉'}[a.type]||'▣'}</div>
          <div class="li-main"><div class="li-title">${esc(a.name)}</div></div>
          <div class="li-amt ${b<0?'neg':''}">${fmtMoney(b)}</div>
        </div>`;}).join('')}
    </div></div>`).join('')
  : '<div class="card"><div class="empty">Add your bank accounts, cash, cards and investments to track net worth. Balances update automatically as you add transactions.</div></div>'}`;
};

/* ---------- settings ---------- */
routes.settings = () => {
  const friends = DB.people.filter(p=>p.id!=='me');
  return `
  <div class="page-head"><div><h1>Settings</h1></div></div>
  <div class="card"><h2>General</h2>
    <div class="row2">
      <div class="field"><label>Currency</label>
        <select data-setting="currency">${CURRENCIES.map(c=>`<option ${DB.settings.currency===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Theme</label>
        <select data-setting="theme">
          <option value="auto" ${DB.settings.theme==='auto'?'selected':''}>Auto (system)</option>
          <option value="light" ${DB.settings.theme==='light'?'selected':''}>Light</option>
          <option value="dark" ${DB.settings.theme==='dark'?'selected':''}>Dark</option>
        </select></div>
    </div>
  </div>
  <div class="card"><h2>Friends</h2>
    <div class="list">${friends.map(p=>`<div class="list-item">${avatar(p.id)}
      <div class="li-main"><div class="li-title">${esc(p.name)}</div></div>
      <button class="btn small" data-action="rename-person" data-id="${p.id}">Rename</button>
      <button class="btn small ghost" data-action="del-person" data-id="${p.id}">✕</button>
    </div>`).join('')||'<div class="empty">No friends added yet.</div>'}</div>
    <div style="margin-top:10px"><button class="btn" data-action="add-person">＋ Add friend</button></div>
  </div>
  <div class="card"><h2>Categories</h2>
    <div class="list">${DB.categories.map(c=>`<div class="list-item">
      <div class="li-ic">${esc(c.emoji)}</div>
      <div class="li-main"><div class="li-title">${esc(c.name)}</div></div>
      <button class="btn small" data-action="rename-cat" data-id="${c.id}">Rename</button>
      ${DEFAULT_CATEGORIES.some(d=>d.id===c.id)?'':`<button class="btn small ghost" data-action="del-cat" data-id="${c.id}">✕</button>`}
    </div>`).join('')}</div>
    <div style="margin-top:10px"><button class="btn" data-action="add-cat">＋ Add category</button></div>
  </div>
  <div class="card"><h2>Your data</h2>
    <p class="hint" style="margin-top:0">Everything is stored only in this browser (localStorage). Export a backup regularly, and import it on any other device to move your data.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn" data-action="export">⬇ Export backup (JSON)</button>
      <button class="btn" data-action="import">⬆ Import backup</button>
      <button class="btn danger" data-action="reset">Erase all data</button>
    </div>
    <input type="file" id="import-file" accept="application/json" hidden>
  </div>
  <div class="card"><h2>About</h2>
    <p class="hint" style="margin:0">Axiom Finance — a free, open, self-contained alternative to Splitwise + Monarch Money for personal use. No sign-up, no server, no tracking. Works offline once loaded; add it to your home screen for an app-like experience.</p>
  </div>`;
};

/* ---------- forms / actions ---------- */
const actions = {};
document.addEventListener('click', e=>{
  const el = e.target.closest('[data-action]');
  if(!el) return;
  const fn = actions[el.dataset.action];
  if(fn){ e.preventDefault(); fn(el); }
});
document.addEventListener('change', e=>{
  const f = e.target.closest('[data-filter]');
  if(f){ txFilter[f.dataset.filter]=f.value; render(); return; }
  const s = e.target.closest('[data-setting]');
  if(s){
    DB.settings[s.dataset.setting]=s.value; save();
    applyTheme(); render(); toast('Saved');
  }
});
document.addEventListener('input', e=>{
  const f = e.target.closest('input[data-filter="q"]');
  if(f){ txFilter.q=f.value; clearTimeout(window.__qT);
    window.__qT=setTimeout(()=>{ const el=$('input[data-filter="q"]'); const pos=el?.selectionStart;
      render(); const nel=$('input[data-filter="q"]'); if(nel){ nel.focus(); nel.setSelectionRange(pos,pos);} },250); }
});

function applyTheme(){
  const t = DB?.settings.theme;
  if(t==='light'||t==='dark') document.documentElement.dataset.theme=t;
  else delete document.documentElement.dataset.theme;
}
actions['start-fresh'] = ()=>{ DB=defaultData(); save(); location.hash='#/dashboard'; render(); };
actions['start-sample'] = ()=>{ DB=sampleData(); save(); location.hash='#/dashboard'; render(); toast('Sample data loaded — erase it anytime in Settings'); };
$('#theme-toggle')?.addEventListener('click', ()=>{
  if(!DB) return;
  const cur = document.documentElement.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  DB.settings.theme = cur==='dark'?'light':'dark'; save(); applyTheme();
});

/* people */
actions['add-person'] = ()=>{
  const m = openModal(`<h2>Add friend</h2>
    <form id="f"><div class="field"><label>Name</label><input name="name" required maxlength="40" placeholder="e.g. Priya"></div>
    <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>
    <button class="btn primary">Add</button></div></form>`);
  m.querySelector('#f').onsubmit = ev=>{ ev.preventDefault();
    const name = ev.target.name.value.trim(); if(!name) return;
    DB.people.push({id:uid(),name}); save(); closeModal(); render(); toast(name+' added');
  };
};
actions['rename-person'] = el=>{
  const p = person(el.dataset.id);
  const name = prompt('Rename '+p.name+':', p.name);
  if(name&&name.trim()){ p.name=name.trim(); save(); render(); }
};
actions['del-person'] = el=>{
  const id = el.dataset.id;
  const used = DB.splits.some(e=>e.paidBy===id||e.shares[id]!==undefined)
    || DB.settlements.some(s=>s.from===id||s.to===id)
    || DB.groups.some(g=>g.members.includes(id));
  if(used){ alert('This friend has expenses or group memberships and can’t be deleted. Settle up and remove them from groups first.'); return; }
  if(confirm('Delete '+person(id).name+'?')){
    DB.people = DB.people.filter(p=>p.id!==id); save(); render();
  }
};
actions['close-modal'] = closeModal;

/* groups */
function groupForm(g){
  const isNew = !g;
  g = g || {id:uid(), name:'', emoji:'👥', members:['me']};
  const m = openModal(`<h2>${isNew?'New group':'Edit group'}</h2>
    <form id="f">
      <div class="row2">
        <div class="field"><label>Name</label><input name="name" required maxlength="50" value="${esc(g.name)}" placeholder="e.g. Goa trip"></div>
        <div class="field"><label>Emoji</label><input name="emoji" maxlength="4" value="${esc(g.emoji)}"></div>
      </div>
      <div class="field"><label>Members</label>
        ${DB.people.map(p=>`<label style="display:flex;align-items:center;gap:8px;font-weight:450;margin:6px 0">
          <input type="checkbox" name="mem" value="${p.id}" style="width:auto" ${g.members.includes(p.id)?'checked':''} ${p.id==='me'?'checked disabled':''}>
          ${esc(PersonName(p.id))}</label>`).join('')}
        <div class="hint">Add more friends from the Split page first if someone’s missing.</div>
      </div>
      <div class="modal-actions">
        ${isNew?'':`<button type="button" class="btn danger" data-action="del-group" data-id="${g.id}" style="margin-right:auto">Delete</button>`}
        <button type="button" class="btn" data-action="close-modal">Cancel</button>
        <button class="btn primary">${isNew?'Create':'Save'}</button></div>
    </form>`);
  m.querySelector('#f').onsubmit = ev=>{ ev.preventDefault();
    const fd = new FormData(ev.target);
    const members = ['me', ...[...m.querySelectorAll('input[name="mem"]:checked')].map(i=>i.value).filter(v=>v!=='me')];
    const name = (fd.get('name')||'').toString().trim(); if(!name) return;
    Object.assign(g,{name, emoji:(fd.get('emoji')||'👥').toString().trim()||'👥', members});
    if(isNew) DB.groups.push(g);
    save(); closeModal(); location.hash='#/split/'+g.id; render();
  };
}
actions['add-group'] = ()=> groupForm();
actions['edit-group'] = el=> groupForm(group(el.dataset.id));
actions['open-group'] = el=>{ location.hash='#/split/'+el.dataset.id; };
actions['del-group'] = el=>{
  const gid = el.dataset.id;
  const n = DB.splits.filter(e=>e.groupId===gid).length;
  if(!confirm(`Delete this group${n?` and its ${n} expense(s)`:''}? This cannot be undone.`)) return;
  DB.groups = DB.groups.filter(g=>g.id!==gid);
  DB.splits = DB.splits.filter(e=>e.groupId!==gid);
  DB.settlements = DB.settlements.filter(s=>s.groupId!==gid);
  save(); closeModal(); location.hash='#/split'; render(); toast('Group deleted');
};

/* split expenses */
function splitForm(exp, presetGroup){
  const isNew = !exp;
  const g = group(exp?.groupId ?? presetGroup);
  const parts = exp ? Object.keys(exp.shares) : (g? g.members.slice() : DB.people.map(p=>p.id));
  const m = openModal(`<h2>${isNew?'Add expense':'Edit expense'}</h2>
    <form id="f">
      <div class="field"><label>Description</label>
        <input name="desc" required maxlength="80" value="${esc(exp?.desc||'')}" placeholder="e.g. Dinner at Olive"></div>
      <div class="row2">
        <div class="field"><label>Amount</label>
          <input name="amount" type="number" min="0.01" step="0.01" required value="${exp?exp.amount:''}" placeholder="0.00"></div>
        <div class="field"><label>Date</label>
          <input name="date" type="date" required value="${exp?.date||todayStr()}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Group</label>
          <select name="group">
            <option value="">No group (one-off)</option>
            ${DB.groups.map(gr=>`<option value="${gr.id}" ${(exp?.groupId??presetGroup)===gr.id?'selected':''}>${esc(gr.name)}</option>`).join('')}
          </select></div>
        <div class="field"><label>Paid by</label><select name="paidBy" id="paidBy"></select></div>
      </div>
      <div class="field"><label>Split between</label><div id="parts"></div></div>
      <div class="field"><label>Split method</label>
        <div class="chips" id="method">
          ${[['equal','Equally'],['exact','Exact amounts'],['percent','Percentages'],['shares','Shares']]
            .map(([k,l])=>`<button type="button" class="chip ${((exp?.method)||'equal')===k?'on':''}" data-m="${k}">${l}</button>`).join('')}
        </div></div>
      <div class="split-rows" id="rows"></div>
      <div class="hint" id="sum-hint"></div>
      <div class="modal-actions">
        ${isNew?'':`<button type="button" class="btn danger" data-action="del-split" data-id="${exp.id}" style="margin-right:auto">Delete</button>`}
        <button type="button" class="btn" data-action="close-modal">Cancel</button>
        <button class="btn primary">${isNew?'Add':'Save'}</button></div>
    </form>`);
  const f = m.querySelector('#f');
  let method = exp?.method || 'equal';
  let selected = new Set(parts);
  const vals = {}; // per-person raw input for exact/percent/shares
  if(exp && exp.method && exp.method!=='equal' && exp.inputs) Object.assign(vals, exp.inputs);

  function partIds(){
    const gid = f.group.value;
    const gg = group(gid);
    return gg ? gg.members : DB.people.map(p=>p.id);
  }
  function renderParts(){
    const ids = partIds();
    for(const id of [...selected]) if(!ids.includes(id)) selected.delete(id);
    if(selected.size===0) ids.forEach(id=>selected.add(id));
    m.querySelector('#parts').innerHTML = `<div class="chips">${ids.map(id=>
      `<button type="button" class="chip ${selected.has(id)?'on':''}" data-p="${id}">${esc(PersonName(id))}</button>`).join('')}</div>`;
    const pb = m.querySelector('#paidBy');
    const cur = pb.value || exp?.paidBy || 'me';
    pb.innerHTML = ids.map(id=>`<option value="${id}" ${cur===id?'selected':''}>${esc(PersonName(id))}</option>`).join('');
    renderRows();
  }
  function renderRows(){
    const box = m.querySelector('#rows');
    if(method==='equal'){ box.innerHTML=''; updateHint(); return; }
    const unit = method==='percent'?'%':method==='shares'?'shares':'';
    box.innerHTML = [...selected].map(id=>`
      <div class="list-item">${avatar(id)}<div class="li-main">${esc(PersonName(id))}</div>
        <input type="number" min="0" step="${method==='shares'?'1':'0.01'}" data-v="${id}"
          value="${vals[id]??(method==='shares'?1:'')}" placeholder="0"> <span class="hint">${unit}</span>
      </div>`).join('');
    box.querySelectorAll('input[data-v]').forEach(inp=>{
      inp.addEventListener('input', ()=>{ vals[inp.dataset.v]=inp.value; updateHint(); });
    });
    updateHint();
  }
  function computedShares(){
    const amt = parseFloat(f.amount.value)||0;
    const ids = [...selected];
    if(!ids.length || amt<=0) return null;
    if(method==='equal') return equalShares(amt, ids);
    const nums = ids.map(id=>parseFloat(vals[id])||0);
    const tot = r2(nums.reduce((s,v)=>s+v,0));
    if(method==='exact'){
      if(Math.abs(tot-amt)>0.01) return {err:`Amounts add to ${fmtMoney(tot)} — need ${fmtMoney(amt)}`};
      return Object.fromEntries(ids.map((id,i)=>[id,r2(nums[i])]));
    }
    if(method==='percent'){
      if(Math.abs(tot-100)>0.01) return {err:`Percentages add to ${tot}% — need 100%`};
      const cents = Math.round(amt*100); let acc=0; const out={};
      ids.forEach((id,i)=>{ const c=(i===ids.length-1)?cents-acc:Math.round(cents*nums[i]/100); acc+=c; out[id]=c/100; });
      return out;
    }
    if(method==='shares'){
      if(tot<=0) return {err:'Enter at least one share'};
      const cents = Math.round(amt*100); let acc=0; const out={};
      ids.forEach((id,i)=>{ const c=(i===ids.length-1)?cents-acc:Math.round(cents*nums[i]/tot); acc+=c; out[id]=c/100; });
      return out;
    }
  }
  function updateHint(){
    const h = m.querySelector('#sum-hint');
    const s = computedShares();
    if(!s){ h.textContent='Pick at least one person and enter an amount.'; h.className='hint'; return; }
    if(s.err){ h.textContent=s.err; h.className='hint err'; return; }
    const n = Object.keys(s).length;
    h.className='hint';
    h.textContent = method==='equal'
      ? `${fmtMoney(parseFloat(f.amount.value)||0)} ÷ ${n} = ${fmtMoney(Object.values(s)[0]||0)} each`
      : '✓ splits add up';
  }
  m.querySelector('#method').addEventListener('click', e=>{
    const c = e.target.closest('[data-m]'); if(!c) return;
    method = c.dataset.m;
    m.querySelectorAll('#method .chip').forEach(x=>x.classList.toggle('on', x===c));
    renderRows();
  });
  m.querySelector('#parts').parentElement.addEventListener('click', e=>{
    const c = e.target.closest('[data-p]'); if(!c) return;
    const id = c.dataset.p;
    if(selected.has(id)){ if(selected.size>1) selected.delete(id); } else selected.add(id);
    renderParts();
  });
  f.group.addEventListener('change', ()=>{ selected=new Set(); renderParts(); });
  f.amount.addEventListener('input', updateHint);
  renderParts();

  f.onsubmit = ev=>{ ev.preventDefault();
    const shares = computedShares();
    if(!shares || shares.err){ updateHint(); return; }
    const rec = {
      id: exp?.id || uid(),
      groupId: f.group.value || '',
      desc: f.desc.value.trim(),
      amount: r2(parseFloat(f.amount.value)),
      paidBy: f.paidBy.value,
      date: f.date.value,
      method, shares,
      inputs: method==='equal'? undefined : Object.fromEntries([...selected].map(id=>[id, vals[id]])),
    };
    if(isNew) DB.splits.push(rec);
    else Object.assign(DB.splits.find(x=>x.id===exp.id), rec);
    save(); closeModal(); render(); toast(isNew?'Expense added':'Expense updated');
  };
}
actions['add-split'] = el=> splitForm(null, el.dataset.group||'');
actions['edit-split'] = el=> splitForm(DB.splits.find(x=>x.id===el.dataset.id));
actions['del-split'] = el=>{
  if(!confirm('Delete this expense?')) return;
  DB.splits = DB.splits.filter(x=>x.id!==el.dataset.id);
  save(); closeModal(); render(); toast('Expense deleted');
};

/* settlements */
actions['settle'] = el=>{
  const {from,to,amt,group:gid} = el.dataset;
  const m = openModal(`<h2>Record settlement</h2>
    <p>${esc(PersonName(from))} pays ${esc(personName(to))}</p>
    <form id="f">
      <div class="row2">
        <div class="field"><label>Amount</label>
          <input name="amount" type="number" min="0.01" step="0.01" required value="${esc(amt)}"></div>
        <div class="field"><label>Date</label><input name="date" type="date" required value="${todayStr()}"></div>
      </div>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>
      <button class="btn primary">Record</button></div>
    </form>`);
  m.querySelector('#f').onsubmit = ev=>{ ev.preventDefault();
    DB.settlements.push({id:uid(), groupId:gid||'', from, to,
      amount:r2(parseFloat(ev.target.amount.value)), date:ev.target.date.value});
    save(); closeModal(); render(); toast('Settlement recorded');
  };
};
actions['del-settle'] = el=>{
  if(!confirm('Delete this settlement?')) return;
  DB.settlements = DB.settlements.filter(s=>s.id!==el.dataset.id);
  save(); render();
};

/* transactions */
function txForm(t){
  const isNew = !t;
  const kind = t ? (t.amount>0?'income':'expense') : 'expense';
  const m = openModal(`<h2>${isNew?'Add transaction':'Edit transaction'}</h2>
    <form id="f">
      <div class="field"><div class="chips" id="kind">
        <button type="button" class="chip ${kind==='expense'?'on':''}" data-k="expense">Expense</button>
        <button type="button" class="chip ${kind==='income'?'on':''}" data-k="income">Income</button>
      </div></div>
      <div class="field"><label>Payee / description</label>
        <input name="payee" required maxlength="80" value="${esc(t?.payee||'')}" placeholder="e.g. Big Bazaar"></div>
      <div class="row2">
        <div class="field"><label>Amount</label>
          <input name="amount" type="number" min="0.01" step="0.01" required value="${t?Math.abs(t.amount):''}"></div>
        <div class="field"><label>Date</label><input name="date" type="date" required value="${t?.date||todayStr()}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Category</label>
          <select name="cat">${DB.categories.map(c=>`<option value="${c.id}" ${(t?.catId||'c_other')===c.id?'selected':''}>${esc(c.emoji+' '+c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Account</label>
          <select name="acct"><option value="">— none —</option>
          ${DB.accounts.map(a=>`<option value="${a.id}" ${t?.accountId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Notes (optional)</label><input name="notes" maxlength="140" value="${esc(t?.notes||'')}"></div>
      <div class="modal-actions">
        ${isNew?'':`<button type="button" class="btn danger" data-action="del-tx" data-id="${t.id}" style="margin-right:auto">Delete</button>`}
        <button type="button" class="btn" data-action="close-modal">Cancel</button>
        <button class="btn primary">${isNew?'Add':'Save'}</button></div>
    </form>`);
  let k = kind;
  m.querySelector('#kind').addEventListener('click', e=>{
    const c=e.target.closest('[data-k]'); if(!c) return;
    k=c.dataset.k; m.querySelectorAll('#kind .chip').forEach(x=>x.classList.toggle('on',x===c));
    if(k==='income') m.querySelector('select[name="cat"]').value='c_inc';
  });
  m.querySelector('#f').onsubmit = ev=>{ ev.preventDefault();
    const f=ev.target;
    const amt = r2(parseFloat(f.amount.value));
    const rec = { id:t?.id||uid(), accountId:f.acct.value||'', date:f.date.value,
      payee:f.payee.value.trim(), catId:f.cat.value,
      amount: k==='income'? amt : -amt, notes:f.notes.value.trim() };
    if(isNew) DB.transactions.push(rec);
    else Object.assign(DB.transactions.find(x=>x.id===t.id), rec);
    save(); closeModal(); render(); toast(isNew?'Transaction added':'Saved');
  };
}
actions['add-tx'] = ()=> txForm();
actions['edit-tx'] = el=> txForm(DB.transactions.find(x=>x.id===el.dataset.id));
actions['del-tx'] = el=>{
  if(!confirm('Delete this transaction?')) return;
  DB.transactions = DB.transactions.filter(x=>x.id!==el.dataset.id);
  save(); closeModal(); render(); toast('Deleted');
};

/* budgets */
actions['edit-budgets'] = ()=>{
  const cats = DB.categories.filter(c=>!c.income);
  const m = openModal(`<h2>Monthly budgets</h2>
    <form id="f">
      ${cats.map(c=>`<div class="list-item">
        <div class="li-ic">${esc(c.emoji)}</div>
        <div class="li-main">${esc(c.name)}</div>
        <input type="number" min="0" step="1" name="b_${c.id}" value="${DB.budgets[c.id]||''}"
          placeholder="—" style="width:120px;text-align:right">
      </div>`).join('')}
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>
      <button class="btn primary">Save</button></div>
    </form>`);
  m.querySelector('#f').onsubmit = ev=>{ ev.preventDefault();
    for(const c of cats){
      const v = parseFloat(ev.target['b_'+c.id].value);
      if(v>0) DB.budgets[c.id]=r2(v); else delete DB.budgets[c.id];
    }
    save(); closeModal(); render(); toast('Budgets saved');
  };
};

/* accounts */
function acctForm(a){
  const isNew=!a;
  const m = openModal(`<h2>${isNew?'Add account':'Edit account'}</h2>
    <form id="f">
      <div class="field"><label>Name</label>
        <input name="name" required maxlength="50" value="${esc(a?.name||'')}" placeholder="e.g. HDFC Savings"></div>
      <div class="row2">
        <div class="field"><label>Type</label>
          <select name="type">${ACCOUNT_TYPES.map(([k,l])=>`<option value="${k}" ${a?.type===k?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>${isNew?'Current balance':'Starting balance'}</label>
          <input name="start" type="number" step="0.01" required value="${a?a.start:''}" placeholder="0.00">
        </div>
      </div>
      <div class="hint">Use a negative balance for credit cards / loans you owe on. Transactions you assign to this account adjust the balance automatically.</div>
      <div class="modal-actions">
        ${isNew?'':`<button type="button" class="btn danger" data-action="del-acct" data-id="${a.id}" style="margin-right:auto">Delete</button>`}
        <button type="button" class="btn" data-action="close-modal">Cancel</button>
        <button class="btn primary">${isNew?'Add':'Save'}</button></div>
    </form>`);
  m.querySelector('#f').onsubmit = ev=>{ ev.preventDefault();
    const f=ev.target;
    const rec = {id:a?.id||uid(), name:f.name.value.trim(), type:f.type.value, start:r2(parseFloat(f.start.value)||0)};
    if(isNew) DB.accounts.push(rec);
    else Object.assign(DB.accounts.find(x=>x.id===a.id), rec);
    save(); closeModal(); render(); toast(isNew?'Account added':'Saved');
  };
}
actions['add-acct'] = ()=> acctForm();
actions['edit-acct'] = el=> acctForm(account(el.dataset.id));
actions['del-acct'] = el=>{
  const id=el.dataset.id;
  const n = DB.transactions.filter(t=>t.accountId===id).length;
  if(!confirm(`Delete this account${n?`? Its ${n} transaction(s) will be kept but unlinked`:'?'}`)) return;
  DB.accounts = DB.accounts.filter(a=>a.id!==id);
  DB.transactions.forEach(t=>{ if(t.accountId===id) t.accountId=''; });
  save(); closeModal(); render(); toast('Account deleted');
};

/* categories */
actions['add-cat'] = ()=>{
  const name = prompt('Category name:'); if(!name||!name.trim()) return;
  const emoji = prompt('Emoji for it:','🏷️') || '🏷️';
  DB.categories.push({id:uid(), name:name.trim(), emoji:emoji.trim()||'🏷️'});
  save(); render(); toast('Category added');
};
actions['rename-cat'] = el=>{
  const c = cat(el.dataset.id);
  const name = prompt('Rename category:', c.name);
  if(name&&name.trim()){ c.name=name.trim(); save(); render(); }
};
actions['del-cat'] = el=>{
  const id = el.dataset.id;
  if(DB.transactions.some(t=>t.catId===id)){ alert('This category has transactions. Re-categorise them first.'); return; }
  if(!confirm('Delete this category?')) return;
  DB.categories = DB.categories.filter(c=>c.id!==id);
  delete DB.budgets[id];
  save(); render();
};

/* data */
actions['export'] = ()=>{
  const blob = new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'axiom-finance-backup-'+todayStr()+'.json';
  a.click(); URL.revokeObjectURL(a.href);
  toast('Backup downloaded');
};
actions['import'] = ()=>{
  const inp = $('#import-file');
  inp.onchange = ()=>{
    const file = inp.files[0]; if(!file) return;
    const rd = new FileReader();
    rd.onload = ()=>{
      try{
        const d = JSON.parse(rd.result);
        if(d.version!==1 || !Array.isArray(d.people) || !d.settings) throw 0;
        if(!confirm('Replace all current data with this backup?')) return;
        DB = d; save(); applyTheme(); render(); toast('Backup imported');
      }catch(e){ alert('That file doesn’t look like an Axiom Finance backup.'); }
    };
    rd.readAsText(file);
  };
  inp.click();
};
actions['reset'] = ()=>{
  if(!confirm('Erase ALL data stored in this browser? This cannot be undone.')) return;
  if(!confirm('Really erase everything? Consider exporting a backup first.')) return;
  localStorage.removeItem(LS_KEY); DB=null; location.hash=''; render();
};

/* ---------- sample data ---------- */
function sampleData(){
  const d = defaultData();
  const p1={id:'p1',name:'Aarav'}, p2={id:'p2',name:'Priya'}, p3={id:'p3',name:'Rohan'};
  d.people.push(p1,p2,p3);
  d.groups.push({id:'g1',name:'Goa trip',emoji:'🏖️',members:['me','p1','p2','p3']});
  d.groups.push({id:'g2',name:'Flat 402',emoji:'🏠',members:['me','p1']});
  const M = n=>{ const dt=new Date(); dt.setDate(dt.getDate()-n); return dt.toISOString().slice(0,10); };
  d.splits.push(
    {id:uid(),groupId:'g1',desc:'Beach villa (2 nights)',amount:12000,paidBy:'me',date:M(9),method:'equal',shares:equalShares(12000,['me','p1','p2','p3'])},
    {id:uid(),groupId:'g1',desc:'Seafood dinner',amount:3400,paidBy:'p2',date:M(8),method:'equal',shares:equalShares(3400,['me','p1','p2','p3'])},
    {id:uid(),groupId:'g1',desc:'Scooter rentals',amount:1600,paidBy:'p1',date:M(8),method:'equal',shares:equalShares(1600,['me','p1','p2','p3'])},
    {id:uid(),groupId:'g2',desc:'Electricity bill',amount:2200,paidBy:'me',date:M(5),method:'equal',shares:equalShares(2200,['me','p1'])},
    {id:uid(),groupId:'g2',desc:'WiFi',amount:999,paidBy:'p1',date:M(3),method:'equal',shares:equalShares(999,['me','p1'])},
    {id:uid(),groupId:'',desc:'Movie tickets',amount:700,paidBy:'me',date:M(2),method:'equal',shares:equalShares(700,['me','p3'])},
  );
  d.settlements.push({id:uid(),groupId:'g1',from:'p3',to:'me',amount:1500,date:M(1)});
  d.accounts.push(
    {id:'a1',name:'HDFC Checking',type:'checking',start:52400},
    {id:'a2',name:'SBI Savings',type:'savings',start:210000},
    {id:'a3',name:'Cash wallet',type:'cash',start:3200},
    {id:'a4',name:'Credit card',type:'credit',start:-8150},
  );
  const T=(days,payee,catId,amt,acct='a1')=>({id:uid(),accountId:acct,date:M(days),payee,catId,amount:amt,notes:''});
  d.transactions.push(
    T(88,'Salary','c_inc',85000),T(58,'Salary','c_inc',85000),T(28,'Salary','c_inc',85000),
    T(85,'Rent','c_home',-18000),T(55,'Rent','c_home',-18000),T(25,'Rent','c_home',-18000),
    T(80,'Big Bazaar','c_groc',-3250),T(72,'Blinkit','c_groc',-1140),T(60,'DMart','c_groc',-2860),
    T(47,'Blinkit','c_groc',-980),T(33,'Big Bazaar','c_groc',-3410),T(18,'Blinkit','c_groc',-1260),T(6,'DMart','c_groc',-2540),
    T(78,'Swiggy','c_dine',-620),T(64,'Cafe Coffee Day','c_dine',-380,'a3'),T(50,'Zomato','c_dine',-840),
    T(36,'Swiggy','c_dine',-560),T(21,'Olive Bistro','c_dine',-2400,'a4'),T(9,'Zomato','c_dine',-720),T(2,'Swiggy','c_dine',-480),
    T(75,'Uber','c_trans',-340),T(61,'Petrol','c_trans',-2000),T(41,'Uber','c_trans',-280),T(20,'Petrol','c_trans',-2000),T(4,'Ola','c_trans',-310),
    T(70,'Electricity','c_util',-2200),T(40,'Electricity','c_util',-2350),T(10,'Electricity','c_util',-2400),
    T(68,'Amazon','c_shop',-1899,'a4'),T(38,'Myntra','c_shop',-2340,'a4'),T(12,'Amazon','c_shop',-1450,'a4'),
    T(66,'PVR Cinemas','c_ent',-900,'a4'),T(31,'BookMyShow','c_ent',-1100,'a4'),
    T(52,'Netflix','c_sub',-649,'a4'),T(22,'Netflix','c_sub',-649,'a4'),T(51,'Spotify','c_sub',-119,'a4'),T(21,'Spotify','c_sub',-119,'a4'),
    T(44,'Apollo Pharmacy','c_health',-560),T(15,'Gym membership','c_health',-1500),
    T(83,'Goa flights','c_trav',-8400,'a4'),
  );
  d.budgets = { c_groc:12000, c_dine:6000, c_trans:5000, c_shop:5000, c_ent:2500, c_sub:1000 };
  return d;
}

/* ---------- boot ---------- */
DB = load();
applyTheme();
render();
