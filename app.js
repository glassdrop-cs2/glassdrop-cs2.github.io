/* GlassDrop — CS2 case simulator.
   Online mode (Supabase configured in js/config.js): server-side rolls, shared feed, battles, leaderboard.
   Offline mode (no config): everything runs locally, state in localStorage. */
(() => {
'use strict';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const IMGPRE = 'https://community.akamai.steamstatic.com/economy/image/';
const img = (u, size = '256fx256f') => !u ? '' : u[0] === '~' ? IMGPRE + u.slice(1) + '/' + size : u;
const fmt = v => (+v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = v => '$' + fmt(v);
const r2 = v => Math.round(v * 100) / 100;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const _cr = new Uint32Array(1);
const crand = () => { crypto.getRandomValues(_cr); return _cr[0] / 4294967296; };
function pickWeighted(odds) { let x = crand(), last; for (const k in odds) { last = k; if ((x -= odds[k]) < 0) return k; } return last; }
const ago = t => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? 'только что' : s < 3600 ? Math.floor(s / 60) + ' мин назад' : s < 86400 ? Math.floor(s / 3600) + ' ч назад' : new Date(t).toLocaleDateString('ru-RU'); };

const svg = (inner, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ICON = {
  cases: svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
  inv: svg('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),
  up: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 4-4 4 4M12 16V8"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  swords: svg('<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5 14 2h3v3l-4.5 4.5M5 14l4 4M7 17l-3 3M3 19l2 2"/>'),
  trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
  sOn: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
  sOff: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 3),
  back: svg('<path d="m15 18-6-6 6-6"/>', 2.5),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 2.5),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>', 2.5),
  check: svg('<path d="m5 12 5 5 9-10"/>', 3.5),
  gift: svg('<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8S10.5 3 7.5 3a2.5 2.5 0 0 0 0 5M12 8s1.5-5 4.5-5a2.5 2.5 0 0 1 0 5"/>'),
  bot: svg('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 13h.01M15 13h.01M9 17h6"/>'),
};

/* ================= rarity / wear ================= */
const TIERS = ['consumer', 'industrial', 'milspec', 'restricted', 'classified', 'covert', 'rare'];
const TIER_RU = { consumer: 'Ширпотреб', industrial: 'Промышленное', milspec: 'Армейское', restricted: 'Запрещённое', classified: 'Засекреченное', covert: 'Тайное', contraband: 'Контрабанда', rare: '★ Редкий особый' };
const TIER_COL = { consumer: '#b0c3d9', industrial: '#5e98d9', milspec: '#4b69ff', restricted: '#8847ff', classified: '#d32ce6', covert: '#eb4b4b', contraband: '#e4ae39', rare: '#e4ae39' };
const WEARS = [
  ['FN', 'Factory New', 'Прямо с завода', 0, .07],
  ['MW', 'Minimal Wear', 'Немного поношенное', .07, .15],
  ['FT', 'Field-Tested', 'После полевых испытаний', .15, .38],
  ['WW', 'Well-Worn', 'Поношенное', .38, .45],
  ['BS', 'Battle-Scarred', 'Закалённое в боях', .45, 1],
];
const UBK = [[.03, 0, .07], [.24, .07, .15], [.33, .15, .38], [.24, .38, .45], [.16, .45, 1]];
const wearOf = f => f == null ? null : (WEARS.find(w => f < w[4]) || WEARS[4]);
const wearByCode = c => WEARS.find(w => w[0] === c);

/* ================= skins & prices (base prices come from tools/build_data.py) ================= */
const SK = window.SKINS.map((a, i) => {
  const [name, weapon, pat, r, cat, mn, mx, st, im, base] = a;
  const star = name.startsWith('★');
  return { i, name, weapon, pat, r, cat, mn, mx, st: !!st, img: im, base, star, vanilla: star && mn == null, tier: star ? 'rare' : r };
});
const colOf = s => s.star ? TIER_COL.rare : TIER_COL[s.r];
const tierOf = s => s.star ? 'rare' : s.r === 'contraband' ? 'covert' : s.r;
const wpnLabel = s => (s.star ? '★ ' : '') + s.weapon;
function fullName(it) {
  const s = SK[it.s], w = wearOf(it.f);
  return `${s.star ? '★ ' : ''}${it.st ? 'StatTrak™ ' : ''}${s.weapon}${s.vanilla ? '' : ' | ' + s.pat}${w ? ` (${w[1]})` : ''}`;
}
const WEAR_MUL = { FN: 2.1, MW: 1.4, FT: 1, WW: .88, BS: .72 };
const WEAR_MUL_STAR = { FN: 1.7, MW: 1.2, FT: 1, WW: .9, BS: .82 };
function priceCode(s, code, st) {
  let p = s.base;
  if (code) p *= (s.star ? WEAR_MUL_STAR : WEAR_MUL)[code];
  if (st) p *= s.star ? 1.15 : 2;
  return Math.max(.03, r2(p));
}
function priceOf(s, f, st) {
  const w = wearOf(f);
  let p = priceCode(s, w && w[0], st);
  if (f != null && f < .01) p = r2(p * 1.25);
  return p;
}
function evSkin(s) {
  if (s._ev != null) return s._ev;
  let wp = null;
  if (!s.vanilla) {
    wp = {};
    for (const [p, a, b] of UBK) {
      const lo = s.mn + (s.mx - s.mn) * a, hi = s.mn + (s.mx - s.mn) * b;
      if (hi <= lo) continue;
      for (const w of WEARS) { const ov = Math.min(hi, w[4]) - Math.max(lo, w[3]); if (ov > 0) wp[w[0]] = (wp[w[0]] || 0) + p * ov / (hi - lo); }
    }
  }
  const one = st => wp ? Object.entries(wp).reduce((a, [c, p]) => a + p * priceCode(s, c, st), 0) : priceCode(s, null, st);
  return (s._ev = s.st ? .9 * one(false) + .1 * one(true) : one(false));
}
function rollFloat(s) {
  if (s.vanilla) return null;
  let x = crand(), b = UBK[4];
  for (const k of UBK) { if ((x -= k[0]) < 0) { b = k; break; } }
  return +(s.mn + (s.mx - s.mn) * (b[1] + (b[2] - b[1]) * crand())).toFixed(9);
}

/* ================= cases ================= */
const ALL_CASES = window.CASES.map((c, idx) => {
  const pools = {};
  for (const t in c.pools) pools[t] = c.pools[t].map(i => SK[i]);
  return { ...c, name: c.n, idx, pools, hero: SK[c.hero], count: Object.values(pools).reduce((a, l) => a + l.length, 0) };
});
const CUSTOM = ALL_CASES.filter(c => c.kind === 'custom');
const OFFICIAL = ALL_CASES.filter(c => c.kind === 'official');
OFFICIAL.forEach((c, i) => c.idx = i);
const caseById = id => ALL_CASES.find(c => c.id === id);

/* ================= backend ================= */
const CFG = window.GD_CONFIG || {};
const ONLINE = !!(CFG.url && CFG.key && window.supabase);
const sb = ONLINE ? window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
const ERR = {
  NO_FUNDS: 'Недостаточно средств', NICK_TAKEN: 'Этот ник уже занят', BAD_NICK: 'Ник: 3–16 символов — буквы, цифры, пробел, _ . -',
  NOT_OPEN: 'Баттл уже начался или отменён', FULL: 'Мест уже нет', ALREADY_IN: 'Ты уже в этом баттле', NO_USER: 'Игрок с таким ником не найден',
  SELF: 'Нельзя подарить самому себе', NOT_OWNER: 'Этот предмет уже не твой', TARGET_TOO_CHEAP: 'Цель должна быть дороже ставки',
  NOT_CREATOR: 'Это может только создатель баттла', 'Invalid login credentials': 'Неверный ник или пароль', NO_PROFILE: 'Профиль не найден',
  'Anonymous sign-ins are disabled': 'Гостевой вход выключен на сервере', 'Password should be at least': 'Пароль — минимум 6 символов',
  'already registered': 'Этот ник уже зарегистрирован', 'Failed to fetch': 'Нет связи с сервером',
};
function errText(e) {
  const m = String((e && e.message) || e);
  const cd = m.match(/COOLDOWN:(\d+)/);
  if (cd) return `Бонус будет через ${cd[1]} c`;
  for (const k in ERR) if (m.includes(k)) return ERR[k];
  return m;
}
async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}
async function fetchAll(make) {
  const out = []; const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await make().range(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < page) return out;
  }
}
const fromInv = r => ({ u: r.id, s: r.skin_id, f: r.float, st: r.st, p: +r.price, t: Date.parse(r.created_at), src: r.src });
const fromDrop = d => ({ u: d.id, s: +d.skin, f: d.float, st: !!d.st, p: +d.price, tier: d.tier, t: Date.now() });
const fromFeed = r => ({ id: r.id, uid: r.user_id, nick: r.nickname, s: r.skin_id, f: r.float, st: r.st, p: +r.price, src: r.source, c: r.case_id, extra: r.extra, t: Date.parse(r.created_at) });
function nickEmail(nick) {
  const hex = [...new TextEncoder().encode(nick.trim().toLowerCase())].map(b => b.toString(16).padStart(2, '0')).join('');
  return 'u' + BigInt('0x' + hex).toString(36) + '@glassdrop-cs2.github.io';
}

/* ================= state ================= */
const KEY = 'glassdrop.v1', SKEY = 'glassdrop.settings';
const BONUS_CD = 120e3, BONUS_AMT = 15;
const freshStats = () => ({ opened: 0, spent: 0, sold: 0, upW: 0, upL: 0, bw: 0, bl: 0, best: null });
const fresh = () => ({ bal: 100, inv: [], hist: [], uid: 1, lastBonus: 0, stats: freshStats() });
let SET = { sound: true, fast: false };
try { SET = Object.assign(SET, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch {}
let S = fresh();
if (!ONLINE) { try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o) { S = Object.assign(fresh(), o); if (o.sound != null && !localStorage.getItem(SKEY)) { SET.sound = o.sound; SET.fast = !!o.fast; } } } catch {} }
let ME = null; // online: { id, nick, guest }
let FEED = [];
let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { if (!ONLINE) localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }, 150); };
const saveSet = () => { try { localStorage.setItem(SKEY, JSON.stringify(SET)); } catch {} };
const invValue = () => r2(S.inv.reduce((a, it) => a + it.p, 0));
function bumpBest(it) { if (!S.stats.best || it.p > S.stats.best.p) S.stats.best = { s: it.s, f: it.f, st: it.st, p: it.p }; }

function applyProfile(p) {
  S.bal = +p.balance;
  S.lastBonus = p.last_bonus ? Date.parse(p.last_bonus) : 0;
  S.stats = { opened: p.opened, spent: +p.spent, sold: +p.sold, upW: p.up_w, upL: p.up_l, bw: p.battles_w, bl: p.battles_l, best: p.best_skin != null ? { s: p.best_skin, f: p.best_float, st: p.best_st, p: +p.best_price } : null };
  if (ME) ME.nick = p.nickname;
}
async function refreshProfile() {
  const { data, error } = await sb.from('profiles').select('*').eq('id', ME.id).single();
  if (error) throw new Error(error.message);
  applyProfile(data); renderBal(); return data;
}
async function refreshInventory() {
  const rows = await fetchAll(() => sb.from('inventory').select('id,skin_id,float,st,price,src,created_at').eq('owner', ME.id).order('id', { ascending: false }));
  S.inv = rows.map(fromInv);
}

/* ---- game actions: same interface for online & offline ---- */
const API = {
  async openCase(c, n) {
    if (ONLINE) {
      const r = await rpc('open_case', { p_case: c.id, p_n: n });
      const items = r.items.map(fromDrop);
      S.inv.unshift(...items); items.forEach(bumpBest);
      S.stats.opened += n; S.stats.spent = r2(S.stats.spent + c.price * n);
      return { items, balance: +r.balance };
    }
    const cost = r2(c.price * n);
    if (S.bal < cost) throw new Error('NO_FUNDS');
    S.bal = r2(S.bal - cost); S.stats.opened += n; S.stats.spent = r2(S.stats.spent + cost);
    const items = Array.from({ length: n }, () => {
      const d = rollDrop(c);
      const it = { u: S.uid++, s: d.s, f: d.f, st: d.st, p: d.p, tier: d.tier, t: Date.now(), src: 'case' };
      S.inv.unshift(it); bumpBest(it);
      S.hist.unshift({ s: it.s, f: it.f, st: it.st, p: it.p, t: it.t, c: c.id });
      return it;
    });
    S.hist = S.hist.slice(0, 60); save();
    return { items, balance: S.bal };
  },
  async sell(uids) {
    const set = new Set(uids);
    if (ONLINE) {
      const r = await rpc('sell_items', { p_ids: uids });
      S.inv = S.inv.filter(it => !set.has(it.u)); S.stats.sold = r2(S.stats.sold + +r.sum);
      return { sum: +r.sum, balance: +r.balance };
    }
    let sum = 0;
    S.inv = S.inv.filter(it => { if (set.has(it.u)) { sum += it.p; return false; } return true; });
    sum = r2(sum); S.bal = r2(S.bal + sum); S.stats.sold = r2(S.stats.sold + sum); save();
    return { sum, balance: S.bal };
  },
  async bonus() {
    if (ONLINE) { const r = await rpc('claim_bonus'); S.lastBonus = Date.now(); return { balance: +r.balance }; }
    const left = BONUS_CD - (Date.now() - S.lastBonus);
    if (left > 0) throw new Error('COOLDOWN:' + Math.ceil(left / 1000));
    S.lastBonus = Date.now(); S.bal = r2(S.bal + BONUS_AMT); save();
    return { balance: S.bal };
  },
  async upgrade(uids, tgt) {
    if (ONLINE) {
      const r = await rpc('upgrade_items', { p_ids: uids, p_skin: tgt.s, p_code: tgt.code });
      S.inv = S.inv.filter(i => !uids.includes(i.u));
      let got = null;
      if (r.win) { got = fromDrop(r.item); got.src = 'upgrade'; S.inv.unshift(got); bumpBest(got); S.stats.upW++; } else S.stats.upL++;
      return { win: r.win, chance: r.chance, item: got, balance: +r.balance };
    }
    const total = r2(S.inv.filter(i => uids.includes(i.u)).reduce((a, i) => a + i.p, 0));
    const ch = Math.min(.9, total / tgt.p * .92);
    S.inv = S.inv.filter(i => !uids.includes(i.u));
    const win = crand() < ch;
    let got = null;
    if (win) {
      const s = SK[tgt.s]; let f = null;
      if (tgt.code) { const w = wearByCode(tgt.code); const lo = Math.max(w[3], s.mn), hi = Math.min(w[4], s.mx); f = +(lo + (hi - lo) * crand() * .999).toFixed(9); }
      got = { u: S.uid++, s: s.i, f, st: false, p: priceOf(s, f, false), t: Date.now(), src: 'upgrade' };
      S.inv.unshift(got); bumpBest(got); S.stats.upW++;
    } else S.stats.upL++;
    save();
    return { win, chance: ch, item: got, balance: S.bal };
  },
  async gift(u, nick) {
    const r = await rpc('gift_item', { p_id: u, p_to: nick });
    S.inv = S.inv.filter(i => i.u !== u);
    return r;
  },
};

/* ================= sound ================= */
let AC;
const ac = () => { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; };
function tone(f, dur, type = 'sine', vol = .06, when = 0, f2) {
  if (!SET.sound) return;
  try {
    const a = ac(), t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
  } catch {}
}
let lastTick = 0;
const SFX = {
  tick() { const n = performance.now(); if (n - lastTick < 28) return; lastTick = n; tone(2200, .035, 'triangle', .05); },
  open() { tone(180, .35, 'sine', .08, 0, 520); tone(400, .25, 'triangle', .03, .05, 900); },
  win(tier) {
    const lvl = Math.max(0, TIERS.indexOf(tier) - 1);
    const notes = [523, 659, 784, 1047, 1319, 1568].slice(0, 2 + Math.min(4, lvl));
    notes.forEach((n, i) => tone(n, .5, 'sine', .07, i * .07));
    if (tier === 'rare' || tier === 'covert') notes.forEach((n, i) => tone(n * 2, .7, 'triangle', .025, .35 + i * .05));
  },
  coin() { tone(1320, .09, 'square', .03); tone(1760, .25, 'square', .03, .07); },
  fail() { tone(300, .4, 'sawtooth', .04, 0, 120); },
  click() { tone(900, .03, 'sine', .03); },
  ping() { tone(1568, .12, 'sine', .05); tone(2093, .3, 'sine', .04, .08); },
};

/* ================= dynamic island ================= */
const island = $('#island');
let islandT;
function notify({ title, sub = '', icon = '', amt = '', tall = false, color = '', amtColor = '', ms = 2800 }) {
  const thumb = icon.startsWith('<img');
  island.innerHTML = `${icon ? `<div class="ico ${thumb ? 'thumb' : ''}" style="${color ? `background:${color}` : ''}">${icon}</div>` : ''}<div class="txt"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>${amt ? `<div class="amt" style="color:${amtColor || 'inherit'}">${amt}</div>` : ''}`;
  island.classList.toggle('tall', tall);
  island.classList.add('show');
  clearTimeout(islandT);
  islandT = setTimeout(() => island.classList.remove('show'), ms);
}
const notifyErr = e => { SFX.fail(); notify({ title: errText(e), icon: '!', color: 'rgba(255,69,58,.35)' }); };
const thumbIco = s => `<img src="${img(SK[s].img, '128fx128f')}">`;

/* ================= balance ================= */
const balEl = $('#balance'), balVal = $('#balVal');
let shownBal = S.bal, balRAF;
function renderBal() {
  const from = shownBal, to = S.bal, t0 = performance.now();
  cancelAnimationFrame(balRAF);
  const step = t => {
    const k = Math.min(1, (t - t0) / 750), e = 1 - Math.pow(1 - k, 4);
    shownBal = from + (to - from) * e;
    balVal.textContent = fmt(shownBal);
    if (k < 1) balRAF = requestAnimationFrame(step);
  };
  balRAF = requestAnimationFrame(step);
}
function setBal(v) {
  const d = v - S.bal;
  S.bal = r2(v); renderBal();
  if (!d) return;
  balEl.classList.remove('flash-up', 'flash-down'); void balEl.offsetWidth;
  balEl.classList.add(d > 0 ? 'flash-up' : 'flash-down');
}
balVal.textContent = fmt(S.bal);

const bonusBtn = $('#bonusBtn');
function drawBonus() {
  const left = Math.max(0, BONUS_CD - (Date.now() - S.lastBonus));
  const k = left / BONUS_CD;
  bonusBtn.innerHTML = `${ICON.plus}${left ? `<svg class="cd" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18.5" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2.5" stroke-dasharray="${116.2 * k} 200" transform="rotate(-90 20 20)" stroke-linecap="round"/></svg>` : ''}`;
  bonusBtn.style.filter = left ? 'saturate(.35) brightness(.8)' : '';
  bonusBtn.title = left ? `Бонус через ${Math.ceil(left / 1000)} c` : `Забрать бонус $${BONUS_AMT}`;
}
bonusBtn.onclick = async () => {
  if (ONLINE && !ME) return;
  const left = BONUS_CD - (Date.now() - S.lastBonus);
  if (left > 0) { notify({ title: 'Бонус ещё заряжается', sub: `Будет доступен через ${Math.ceil(left / 1000)} c`, icon: ICON.gift, color: 'rgba(255,159,10,.25)' }); return; }
  try {
    const r = await API.bonus();
    setBal(r.balance); SFX.coin();
    notify({ title: 'Бонус получен', sub: 'Следующий — через 2 минуты', icon: ICON.gift, color: 'rgba(48,209,88,.3)', amt: '+' + money(BONUS_AMT), amtColor: '#5ee07f' });
  } catch (e) { notifyErr(e); }
  drawBonus();
};
setInterval(drawBonus, 1000); drawBonus();

const soundBtn = $('#soundBtn');
const drawSound = () => { soundBtn.innerHTML = SET.sound ? ICON.sOn : ICON.sOff; };
soundBtn.onclick = () => { SET.sound = !SET.sound; saveSet(); drawSound(); SFX.click(); };
drawSound();

/* ================= segmented controls ================= */
function seg(name, opts, active, cls = '') {
  return `<div class="seg ${cls}" data-seg="${name}"><span class="pill"></span>${opts.map(([v, l]) => `<button data-v="${v}" class="${v === active ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function placePill(sg, instant) {
  const on = $('button.on', sg), pill = $('.pill', sg);
  if (!pill) return;
  if (!on) { pill.style.opacity = 0; return; }
  if (instant) pill.style.transition = 'none';
  pill.style.opacity = 1;
  pill.style.width = on.offsetWidth + 'px';
  pill.style.transform = `translateX(${on.offsetLeft}px)`;
  if (instant) { void pill.offsetWidth; pill.style.transition = ''; }
}
const layoutPills = (root = document, instant = true) => $$('.seg', root).forEach(s => placePill(s, instant));
window.addEventListener('resize', () => layoutPills());
function segSelect(sg, v) { $$('button', sg).forEach(b => b.classList.toggle('on', b.dataset.v === v)); placePill(sg, false); }

const NAV = ONLINE
  ? [['', 'Кейсы', ICON.cases], ['battles', 'Баттлы', ICON.swords], ['inventory', 'Инвентарь', ICON.inv], ['upgrade', 'Апгрейд', ICON.up], ['top', 'Топ', ICON.trophy], ['profile', 'Профиль', ICON.user]]
  : [['', 'Кейсы', ICON.cases], ['inventory', 'Инвентарь', ICON.inv], ['upgrade', 'Апгрейд', ICON.up], ['profile', 'Профиль', ICON.user]];
const navHTML = `<span class="pill"></span>` + NAV.map(([r, l, i]) => `<button data-go="#/${r}" data-r="${r}">${i}<span>${l}</span></button>`).join('');
$('#nav').innerHTML = navHTML; $('#dockNav').innerHTML = navHTML;
const NAV_KEY = { case: '', battle: 'battles', u: 'top' };
function updateNav(r) {
  const key = r in NAV_KEY ? NAV_KEY[r] : r;
  for (const nav of [$('#nav'), $('#dockNav')]) {
    $$('button', nav).forEach(b => b.classList.toggle('on', b.dataset.r === key));
    placePill(nav, false);
  }
}

/* ================= sheets ================= */
function openSheet(html, { narrow = false, acts = {}, onClose, locked = false } = {}) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="sheet ${narrow ? 'narrow' : ''}">${locked ? '' : `<button class="icon-btn close" data-sact="close">${ICON.x}</button>`}${html}</div>`;
  document.body.appendChild(scrim);
  requestAnimationFrame(() => scrim.classList.add('show'));
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    scrim.classList.remove('show');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => scrim.remove(), 420);
    onClose && onClose();
  };
  const onKey = e => { if (e.key === 'Escape' && !locked) close(); };
  document.addEventListener('keydown', onKey);
  scrim.addEventListener('click', e => {
    if (e.target === scrim) { if (!locked) close(); return; }
    const sb_ = e.target.closest('.seg[data-seg] button');
    if (sb_) { segSelect(sb_.parentElement, sb_.dataset.v); acts.onSeg && acts.onSeg(sb_.parentElement.dataset.seg, sb_.dataset.v, scrim); return; }
    const go = e.target.closest('[data-go]');
    if (go) { close(); location.hash = go.dataset.go; return; }
    const a = e.target.closest('[data-sact]');
    if (!a) return;
    if (a.dataset.sact === 'close') return close();
    acts[a.dataset.sact] && acts[a.dataset.sact](a, close, e);
  });
  scrim.addEventListener('keydown', e => { if (e.key === 'Enter' && acts.enter) acts.enter(close); });
  requestAnimationFrame(() => layoutPills(scrim));
  return { el: scrim, close };
}

/* ================= cards ================= */
function caseArt(c, size = '360fx360f') {
  if (c.kind === 'official') return `<img src="${img(c.img, size)}" alt="${esc(c.name)}" loading="lazy">`;
  return `<div class="ccase" style="--a:${c.a};--b:${c.b}"><img src="${img(c.hero.img)}" alt="" loading="lazy"><div class="lock"></div><div class="mark">${esc(c.mark)}</div></div>`;
}
function caseCard(c, i) {
  const badge = c.kind === 'custom' ? '<span class="badge custom">Авторский</span>' : (c.idx < 3 ? '<span class="badge new">New</span>' : '');
  return `<div class="case-card glass-flat" style="--i:${i};--glow:${c.glow}" data-go="#/case/${c.id}">${badge}<div class="art">${caseArt(c)}</div><h3>${esc(c.name)}</h3><div class="meta">${c.kind === 'custom' ? esc(c.desc) : c.count + ' предметов · ' + (c.d || '').slice(0, 4)}</div><span class="price-chip">${money(c.price)}</span></div>`;
}
function itemCard(it, o = {}) {
  const s = SK[it.s], w = wearOf(it.f);
  return `<div class="item ${o.sel ? 'sel' : ''}" style="--rc:${colOf(s)};--i:${o.i || 0}" ${o.attr || ''}>
    ${it.st ? '<span class="st">ST™</span>' : ''}
    ${o.check ? `<span class="check">${ICON.check}</span>` : ''}
    ${o.chance ? `<span class="chance">${o.chance}</span>` : ''}
    <div class="img"><img loading="lazy" src="${img(s.img)}" alt=""></div>
    <div class="wpn">${esc(wpnLabel(s))}</div>
    <div class="pat">${esc(s.pat)}</div>
    <div class="row"><span class="pr">${o.priceText || money(it.p)}</span><span class="wear">${o.wearText != null ? o.wearText : (w ? w[0] : '')}</span></div>
  </div>`;
}
const pct = p => p >= .1 ? (p * 100).toFixed(2) + '%' : p >= .001 ? (p * 100).toFixed(3) + '%' : (p * 100).toFixed(4) + '%';
const loadingHTML = '<div class="empty-state"><div class="spinner"></div></div>';
const onlineOnly = t => `<div class="empty-state"><div class="ill">🌐</div><h3>${t}</h3>Работает, когда сайт подключён к серверу (онлайн-режим).</div>`;

/* ================= router ================= */
const main = $('#view');
let VIEW = {};
let viewToken = 0;
const ROUTES = { '': viewHome, case: viewCase, inventory: viewInventory, upgrade: viewUpgrade, profile: viewProfile, battles: viewBattles, battle: viewBattle, top: viewTop, u: viewUser };
let firstRender = true;
async function route() {
  if (ONLINE && !ME) return;
  const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  const r = ROUTES[parts[0]] ? parts[0] : '';
  updateNav(r);
  viewToken++;
  if (!firstRender) {
    main.style.transition = 'opacity .18s, filter .18s, transform .18s';
    main.style.opacity = 0; main.style.filter = 'blur(6px)'; main.style.transform = 'scale(.995)';
    await sleep(170);
  }
  firstRender = false;
  try { VIEW.destroy && VIEW.destroy(); } catch {}
  VIEW = {};
  setTint(null);
  main.style.transition = 'none'; main.style.opacity = ''; main.style.filter = ''; main.style.transform = '';
  main.classList.remove('view-enter');
  const p = ROUTES[r](decodeURIComponent(parts[1] || ''));
  void main.offsetWidth;
  main.classList.add('view-enter');
  layoutPills(main);
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (p && p.catch) p.catch(e => { console.error(e); notifyErr(e); });
}
window.addEventListener('hashchange', route);

document.addEventListener('click', e => {
  if (e.target.closest('.scrim')) return;
  const sb_ = e.target.closest('.seg[data-seg] button');
  if (sb_) {
    const sg = sb_.parentElement;
    segSelect(sg, sb_.dataset.v); SFX.click();
    VIEW.onSeg && VIEW.onSeg(sg.dataset.seg, sb_.dataset.v);
    return;
  }
  const a = e.target.closest('[data-act]');
  if (a && VIEW.act) { VIEW.act(a.dataset.act, a, e); return; }
  const go = e.target.closest('[data-go]');
  if (go) { const h = go.dataset.go; if (location.hash === h || (h === '#/' && !location.hash)) route(); else location.hash = h; }
});
document.addEventListener('input', e => VIEW.onInput && VIEW.onInput(e.target));
document.addEventListener('change', e => VIEW.onChange && VIEW.onChange(e.target));

const tintEl = $('#tint');
function setTint(col) { tintEl.style.background = col ? `radial-gradient(70% 55% at 50% 30%, ${col}, transparent 70%)` : 'transparent'; tintEl.style.opacity = col ? .45 : 0; }

/* ================= live ticker ================= */
const SRC_ICO = { upgrade: '↑', battle: '⚔', gift: '🎁' };
function tkHTML(h, isNew) {
  const s = SK[h.s];
  const who = h.nick ? `${h.nick}: ` : '';
  const what = h.src === 'battle' ? `выиграл баттл на ${money(h.p)}` : h.src === 'gift' ? `подарил ${h.extra} ${fullName(h)}` : `${fullName(h)} — ${money(h.p)}`;
  const go = h.uid ? `#/u/${h.uid}` : h.c ? `#/case/${h.c}` : '';
  return `<div class="tk ${isNew ? 'new' : ''}" style="--rc:${colOf(s)}" title="${esc(who + what)}" ${go ? `data-go="${go}"` : ''}>${SRC_ICO[h.src] ? `<i class="src">${SRC_ICO[h.src]}</i>` : ''}<img src="${img(s.img, '128fx128f')}" alt=""><span>${esc(h.nick || s.pat)}</span></div>`;
}
function tickerHTML() {
  const list = ONLINE ? FEED : S.hist;
  return `<section class="ticker glass-flat" id="ticker"><div class="lbl"><b>Live</b>${ONLINE ? 'все игроки' : 'ваши дропы'}</div>${list.length ? list.slice(0, 24).map(h => tkHTML(h)).join('') : '<div class="empty">Тут появятся последние дропы — откройте первый кейс ✨</div>'}</section>`;
}
function pushTicker(h) {
  const t = $('#ticker');
  if (!t) return;
  const e = $('.empty', t); if (e) e.remove();
  $('.lbl', t).insertAdjacentHTML('afterend', tkHTML(h, true));
  const tks = $$('.tk', t); if (tks.length > 24) tks.at(-1).remove();
}

/* ================= HOME ================= */
const H = { tab: 'all', q: '', sort: 'def' };
function viewHome() {
  const feat = OFFICIAL[0];
  main.innerHTML = `
  ${tickerHTML()}
  <section class="hero glass edge">
    <div>
      <h1>Открывай кейсы.<br><span class="grad">${ONLINE ? 'Вместе с друзьями.' : 'Без риска.'}</span></h1>
      <p>Настоящие скины и кейсы CS2 плюс авторские коллекции. Шансы как в игре, флоат и StatTrak™${ONLINE ? ', кейс-баттлы, топ игроков и подарки друзьям' : ', свой инвентарь, продажа и апгрейды'} — всё на виртуальном балансе.</p>
      <div class="actions">
        <button class="btn primary big" data-go="#/case/${feat.id}">Открыть ${esc(feat.name)}</button>
        ${ONLINE ? '<button class="btn big" data-go="#/battles">⚔ Баттлы</button>' : '<button class="btn big" data-act="toCases">Все кейсы</button>'}
      </div>
    </div>
    <div class="hero-case" data-go="#/case/${feat.id}">
      <div class="halo"></div>
      <img src="${img(feat.img, '512fx384f')}" alt="">
      <div class="hero-tag glass">Новинка · ${money(feat.price)}</div>
    </div>
  </section>
  <div class="section-head" id="casesHead">
    <h2>Кейсы</h2><span class="sub" id="caseCount"></span><div class="grow"></div>
    <div class="controls">
      ${seg('tab', [['all', 'Все'], ['official', 'CS2'], ['custom', 'Авторские']], H.tab, 'sm')}
      <label class="search">${ICON.search}<input id="q" placeholder="Поиск кейса" value="${esc(H.q)}" autocomplete="off"></label>
      <select class="select" id="sort">
        ${[['def', 'По умолчанию'], ['pa', 'Сначала дешёвые'], ['pd', 'Сначала дорогие'], ['nm', 'По названию']].map(([v, l]) => `<option value="${v}" ${H.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="caseGrid"></div>`;
  drawCaseGrid();
  VIEW = {
    onSeg(n, v) { if (n === 'tab') { H.tab = v; drawCaseGrid(); } },
    onInput(t) { if (t.id === 'q') { H.q = t.value; drawCaseGrid(); } },
    onChange(t) { if (t.id === 'sort') { H.sort = t.value; drawCaseGrid(); } },
    act(a) { if (a === 'toCases') $('#casesHead').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  };
}
function drawCaseGrid() {
  const q = H.q.trim().toLowerCase();
  let list = ALL_CASES.filter(c => (H.tab === 'all' || c.kind === H.tab) && (!q || c.name.toLowerCase().includes(q)));
  if (H.sort === 'pa') list.sort((a, b) => a.price - b.price);
  if (H.sort === 'pd') list.sort((a, b) => b.price - a.price);
  if (H.sort === 'nm') list.sort((a, b) => a.name.localeCompare(b.name));
  $('#caseCount').textContent = list.length;
  const g = $('#caseGrid');
  if (!list.length) { g.innerHTML = `<div class="empty-state"><div class="ill">🔍</div><h3>Ничего не нашлось</h3>Попробуйте другой запрос</div>`; return; }
  if (H.tab === 'all' && !q && H.sort === 'def') {
    g.innerHTML = `<div class="section-head" style="margin-top:6px"><h2 style="font-size:20px">✦ Авторские</h2><span class="sub">выдуманные коллекции из реальных скинов</span></div>
      <div class="grid-cases stagger">${CUSTOM.map(caseCard).join('')}</div>
      <div class="section-head"><h2 style="font-size:20px">Кейсы CS2</h2><span class="sub">официальные, с реальным содержимым</span></div>
      <div class="grid-cases stagger">${OFFICIAL.map(caseCard).join('')}</div>`;
  } else g.innerHTML = `<div class="grid-cases stagger">${list.map(caseCard).join('')}</div>`;
}

/* ================= CASE PAGE ================= */
const C = { n: 1 };
let busy = false;
function viewCase(id) {
  const c = caseById(id);
  if (!c) { location.hash = '#/'; return; }
  setTint(c.glow);
  const order = ['rare', 'covert', 'classified', 'restricted', 'milspec', 'industrial', 'consumer'];
  const items = order.filter(t => t !== 'rare' && c.odds[t]).flatMap(t => c.pools[t].slice().sort((a, b) => evSkin(b) - evSkin(a)).map(s => ({ s, t })));
  const rare = c.odds.rare ? c.pools.rare.slice().sort((a, b) => evSkin(b) - evSkin(a)) : [];
  const card = (s, t, i) => itemCard({ s: s.i, p: evSkin(s) }, { i, chance: pct(c.odds[t] / c.pools[t].length), priceText: '≈ ' + money(evSkin(s)), wearText: '' });
  main.innerHTML = `
  <section class="case-top glass edge">
    <div class="head">
      <button class="icon-btn" data-go="#/">${ICON.back}</button>
      <div><h1>${esc(c.name)}</h1><div class="ev-note">${c.kind === 'custom' ? 'Авторский кейс · ' + esc(c.desc) : 'Официальный кейс CS2 · ' + (c.d || '')}</div></div>
      <div class="grow"></div>
      <span class="price-chip" style="margin:0">${money(c.price)}</span>
    </div>
    <div class="case-stage" id="stage" style="--glow:${c.glow}"><div class="halo"></div>${caseArt(c, '512fx384f')}</div>
    <div class="rolls" id="rolls" hidden></div>
    <div class="open-bar">
      ${seg('n', [1, 2, 3, 4, 5].map(n => [String(n), '×' + n]), String(C.n))}
      <button class="btn primary big" id="openBtn" data-act="open"></button>
      <label class="toggle" data-act="fast"><span class="switch ${SET.fast ? 'on' : ''}" id="fastSw"></span>Быстро</label>
      ${ONLINE ? `<button class="btn" data-go="#/battles?case=${c.id}">⚔ Баттл</button>` : ''}
    </div>
  </section>
  <div class="section-head">
    <h2>Содержимое</h2>
    <div class="contents-legend">${order.filter(t => c.odds[t]).map(t => `<span class="odds-pill" style="--rc:${TIER_COL[t]}"><i></i>${TIER_RU[t]} · ${pct(c.odds[t])}</span>`).join('')}</div>
    <div class="grow"></div><span class="ev-note">Средний возврат ≈ ${Math.round(c.ev / c.price * 100)}% от цены кейса</span>
  </div>
  <div class="grid-items stagger">
    ${rare.length ? `<div class="item gold-card" style="--i:0" data-act="toRare"><span class="chance">${pct(c.odds.rare)}</span><div class="img">★</div><div class="wpn">Редкий особый предмет</div><div class="pat">${c.pools.rare.some(s => s.cat === 'glove') && c.pools.rare.some(s => s.cat === 'knife') ? 'Ножи и перчатки' : c.pools.rare.some(s => s.cat === 'glove') ? 'Перчатки' : 'Ножи'}</div><div class="row"><span class="pr">${rare.length} вариантов</span></div></div>` : ''}
    ${items.map(({ s, t }, i) => card(s, t, i + 1)).join('')}
  </div>
  ${rare.length ? `<div class="section-head" id="rareHead"><h2 style="color:var(--gold)">★ Редкие предметы</h2><span class="sub">${pct(c.odds.rare)} на весь список</span></div>
  <div class="grid-items">${rare.map(s => card(s, 'rare', 0)).join('')}</div>` : ''}`;
  const drawBtn = () => { const b = $('#openBtn'); if (b) b.innerHTML = `Открыть ${C.n > 1 ? C.n + ' шт. ' : ''}за ${money(r2(c.price * C.n))}`; };
  drawBtn();
  VIEW = {
    onSeg(n, v) { if (n === 'n') { C.n = +v; drawBtn(); } },
    act(a, el, e) {
      if (a === 'open') openCase(c, C.n);
      if (a === 'fast') { e.preventDefault(); SET.fast = !SET.fast; saveSet(); $('#fastSw').classList.toggle('on', SET.fast); SFX.click(); }
      if (a === 'toRare') $('#rareHead').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  };
}

function rollDrop(c) {
  const t = pickWeighted(c.odds);
  const pool = c.pools[t];
  const s = pool[Math.floor(crand() * pool.length)];
  const f = rollFloat(s);
  const st = s.st && crand() < .1;
  return { s: s.i, f, st, p: priceOf(s, f, st), tier: t };
}
// strip filler: flatter odds so the reel looks lively
function fakeRoll(c) {
  const o = {}; let sum = 0;
  for (const t in c.odds) { o[t] = Math.pow(c.odds[t], .6); sum += o[t]; }
  for (const t in o) o[t] /= sum;
  const t = pickWeighted(o), pool = c.pools[t];
  return { s: pool[Math.floor(Math.random() * pool.length)].i, st: false, tier: t };
}
function rcHTML(d) {
  const s = SK[d.s];
  if (s.star) return `<div class="rc gold"><b>★</b><span>Редкий предмет</span></div>`;
  return `<div class="rc" style="--rc:${colOf(s)}"><img src="${img(s.img, '200fx200f')}" alt=""><span>${esc(s.pat)}</span></div>`;
}
const shake = el => el && el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 380 });

async function openCase(c, n) {
  if (busy) return;
  const cost = r2(c.price * n);
  if (S.bal < cost) {
    SFX.fail();
    notify({ title: 'Недостаточно средств', sub: `Нужно ${money(cost)} — заберите бонус или продайте предметы`, icon: '!', color: 'rgba(255,69,58,.35)' });
    shake($('#openBtn'));
    return;
  }
  busy = true;
  const token = viewToken;
  $('#openBtn').disabled = true;
  SFX.open();
  const stage = $('#stage'), rolls = $('#rolls');
  stage.classList.add('out');
  let res;
  try { [res] = await Promise.all([API.openCase(c, n), sleep(380)]); }
  catch (e) { busy = false; notifyErr(e); if (token === viewToken) resetStage(); return; }
  setBal(res.balance);
  const its = res.items;
  if (token !== viewToken) { busy = false; announce(its); return; }
  stage.hidden = true;
  rolls.hidden = false;
  rolls.classList.toggle('multi', n > 1);
  rolls.innerHTML = its.map(() => `<div class="roll"><div class="strip"></div><div class="marker"></div></div>`).join('');
  await Promise.all(its.map((d, k) => spin($$('.roll', rolls)[k], c, d, k)));
  busy = false;
  if (!ONLINE) its.forEach(pushTicker);
  if (token !== viewToken) { announce(its); return; }
  const best = its.reduce((a, d) => TIERS.indexOf(d.tier) > TIERS.indexOf(a.tier) ? d : a, its[0]);
  SFX.win(best.tier);
  showWin(c, its, n);
}
function announce(its) {
  const best = its.reduce((a, d) => d.p > a.p ? d : a, its[0]);
  notify({ title: fullName(best), sub: its.length > 1 ? `и ещё ${its.length - 1} — в инвентаре` : 'Добавлено в инвентарь', icon: thumbIco(best.s), amt: money(best.p), tall: true });
}

function spin(roll, c, drop, k, durOverride) {
  return new Promise(res => {
    const N = 62, WIN = 52;
    const items = Array.from({ length: N }, (_, i) => i === WIN ? drop : fakeRoll(c));
    const strip = $('.strip', roll);
    strip.innerHTML = items.map(rcHTML).join('');
    const cw = strip.children[0].offsetWidth + 8;
    const W = roll.clientWidth;
    const jitter = (Math.random() - .5) * (cw - 24);
    const target = -(WIN * cw + (cw - 8) / 2 - W / 2 + jitter);
    const dur = durOverride || ((SET.fast ? 1500 : 6400) + k * (SET.fast ? 120 : 260));
    strip.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${target}px)` }], { duration: dur, easing: 'cubic-bezier(.06,.55,.12,1)', fill: 'forwards' });
    let last = -1, run = true;
    const loop = () => {
      if (!run) return;
      const m = new DOMMatrixReadOnly(getComputedStyle(strip).transform);
      const idx = Math.floor((-m.m41 + W / 2) / cw);
      if (idx !== last) { if (k === 0 && last !== -1) SFX.tick(); last = idx; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    setTimeout(() => {
      run = false;
      roll.classList.add('done');
      const w = strip.children[WIN];
      const s = SK[drop.s];
      if (s.star) w.outerHTML = `<div class="rc win" style="--rc:${TIER_COL.rare}"><img src="${img(s.img, '200fx200f')}" alt=""><span>${esc(s.pat)}</span></div>`;
      else w.classList.add('win');
      res();
    }, dur + 80);
  });
}

function winCardHTML(it, i, single) {
  const s = SK[it.s], w = wearOf(it.f);
  return `<div class="win-card ${single ? 'single' : ''}" style="--rc:${colOf(s)};--i:${i}" data-u="${it.u}">
    <div class="rays"></div><div class="glow"></div>
    <img src="${img(s.img, '360fx360f')}" alt="">
    <div class="wpn">${esc(wpnLabel(s))}</div>
    <div class="pat">${esc(s.pat)}</div>
    <div class="info">${it.st ? '<span class="tag st">StatTrak™</span>' : ''}${w ? `<span class="tag">${w[2]}</span><span class="tag">${it.f.toFixed(5)}</span>` : '<span class="tag">Без износа</span>'}</div>
    <div class="pr">${money(it.p)}</div>
    <div class="mini-acts"><button class="btn sm" data-sact="sellOne" data-u="${it.u}">Продать</button></div>
  </div>`;
}
async function sellWithFx(uids, label) {
  try {
    const r = await API.sell(uids);
    setBal(r.balance);
    if (r.sum > 0) { SFX.coin(); notify({ title: label || 'Продано', amt: '+' + money(r.sum), amtColor: '#5ee07f', icon: '$', color: 'rgba(48,209,88,.3)' }); }
    return r.sum;
  } catch (e) { notifyErr(e); return 0; }
}
function showWin(c, its, n) {
  const total = () => r2(its.filter(it => S.inv.some(x => x.u === it.u)).reduce((a, it) => a + it.p, 0));
  openSheet(`
    <h2>${its.length > 1 ? 'Ваши дропы' : 'Вам выпало!'}</h2>
    <div class="subtitle">${esc(c.name)}</div>
    <div class="win-grid">${its.map((it, i) => winCardHTML(it, i, its.length === 1)).join('')}</div>
    <div class="total-line">Стоимость дропа: <b id="winTotal">${money(total())}</b> · кейсы: ${money(r2(c.price * n))}</div>
    <div class="acts">
      <button class="btn green" data-sact="sellAll">Продать всё</button>
      <button class="btn primary" data-sact="again">Ещё раз · ${money(r2(c.price * n))}</button>
      <button class="btn" data-sact="close">В инвентарь</button>
    </div>`, {
    acts: {
      async sellOne(b) {
        b.disabled = true;
        const sum = await sellWithFx([+b.dataset.u]);
        if (!sum) { b.disabled = false; return; }
        b.closest('.win-card').classList.add('sold'); b.textContent = 'Продано';
        $('#winTotal').textContent = money(total());
      },
      async sellAll(b, close) {
        const left = its.filter(it => S.inv.some(x => x.u === it.u)).map(i => i.u);
        if (left.length) await sellWithFx(left, 'Продано всё');
        close();
      },
      again(b, close) { close(); setTimeout(() => openCase(c, n), 250); },
    },
    onClose: () => resetStage(),
  });
}
function resetStage() {
  const stage = $('#stage'), rolls = $('#rolls'), b = $('#openBtn');
  if (!stage) return;
  rolls.hidden = true; rolls.innerHTML = '';
  stage.hidden = false; stage.classList.remove('out');
  if (b) b.disabled = false;
}

/* ================= item detail ================= */
function showItem(it, { onChange, readonly } = {}) {
  const s = SK[it.s], w = wearOf(it.f);
  const bar = w ? `<div class="floatbar"><div class="range" style="left:${s.mn * 100}%;right:${(1 - s.mx) * 100}%"></div><div class="pin" style="left:${it.f * 100}%"></div></div><div class="float-labels"><span>0.00</span><span>FN · MW · FT · WW · BS</span><span>1.00</span></div>` : '';
  openSheet(`
    <div class="detail-art" style="--rc:${colOf(s)}"><div class="glow"></div><img src="${img(s.img, '512fx384f')}" alt=""></div>
    <h2 style="color:color-mix(in srgb, ${colOf(s)} 55%, #fff)">${esc(fullName(it))}</h2>
    <div class="subtitle">${s.star ? TIER_RU.rare : TIER_RU[s.r]}${it.st ? ' · StatTrak™' : ''}</div>
    ${bar}
    <div class="kv">
      <div><span>Цена</span><b>${money(it.p)}</b></div>
      <div><span>Износ</span><b>${w ? w[0] : '—'}</b></div>
      <div><span>Float</span><b>${it.f != null ? it.f.toFixed(8) : '—'}</b></div>
      <div><span>Получен</span><b>${it.t ? new Date(it.t).toLocaleDateString('ru-RU') : '—'}</b></div>
    </div>
    ${readonly ? '' : `<div class="acts">
      <button class="btn green" data-sact="sell">Продать за ${money(it.p)}</button>
      <button class="btn" data-sact="upg">В апгрейд</button>
      ${ONLINE ? `<button class="btn" data-sact="gift">${ICON.gift.replace('<svg', '<svg width="16" height="16"')} Подарить</button>` : ''}
    </div>`}`, {
    narrow: true,
    acts: {
      async sell(b, close) { b.disabled = true; await sellWithFx([it.u], 'Продано: ' + s.pat); close(); onChange && onChange(); },
      upg(b, close) { U.sel = new Set([it.u]); U.target = null; close(); location.hash = '#/upgrade'; },
      gift(b, close) { close(); setTimeout(() => giftSheet(it, onChange), 300); },
    },
  });
}
function giftSheet(it, onChange) {
  const s = SK[it.s];
  openSheet(`
    <div class="detail-art" style="--rc:${colOf(s)};height:150px"><div class="glow"></div><img src="${img(s.img)}" alt=""></div>
    <h2>Подарить ${esc(s.pat)}</h2>
    <div class="subtitle">Предмет сразу окажется в инвентаре друга</div>
    <label class="field"><span>Ник получателя</span><input id="giftTo" maxlength="16" autocomplete="off" placeholder="Например, Sanya"></label>
    <div class="acts"><button class="btn" data-sact="close">Отмена</button><button class="btn primary" data-sact="send">Подарить</button></div>`, {
    narrow: true,
    acts: {
      async send(b, close) {
        const to = $('#giftTo').value.trim();
        if (!to) return shake($('#giftTo'));
        b.disabled = true;
        try {
          const r = await API.gift(it.u, to);
          SFX.coin(); notify({ title: `Подарено: ${r.to}`, sub: fullName(it), icon: thumbIco(it.s), tall: true });
          close(); onChange && onChange();
        } catch (e) { b.disabled = false; notifyErr(e); }
      },
      enter(close) { const b = document.querySelector('[data-sact="send"]'); b && b.click(); },
    },
  });
  setTimeout(() => { const i = $('#giftTo'); i && i.focus(); }, 350);
}

/* ================= INVENTORY ================= */
const I = { f: 'all', q: '', sort: 'new', select: false, sel: new Set(), limit: 120 };
const INV_FILTERS = [['all', 'Все'], ['rare', '★'], ['covert', 'Тайные'], ['classified', 'Засекр.'], ['restricted', 'Запрещ.'], ['milspec', 'Армейские'], ['low', 'Прочие']];
function invList() {
  const q = I.q.trim().toLowerCase();
  let l = S.inv.filter(it => {
    const s = SK[it.s], t = tierOf(s);
    if (I.f === 'low' ? !['consumer', 'industrial'].includes(t) : I.f !== 'all' && t !== I.f) return false;
    return !q || s.name.toLowerCase().includes(q);
  });
  if (I.sort === 'pd') l.sort((a, b) => b.p - a.p);
  if (I.sort === 'pa') l.sort((a, b) => a.p - b.p);
  if (I.sort === 'old') l.reverse();
  return l;
}
function viewInventory() {
  I.sel = new Set(); I.select = false; I.limit = 120;
  main.innerHTML = `
  <section class="inv-head glass edge">
    <div class="stat"><span>Предметов</span><b id="invN"></b></div>
    <div class="stat"><span>Стоимость инвентаря</span><b id="invV"></b></div>
    <div class="grow"></div>
    <button class="btn" data-act="selMode" id="selBtn">Выбрать</button>
    <button class="btn green" data-act="sellAll">Продать всё</button>
  </section>
  <div class="section-head">
    ${seg('f', INV_FILTERS, I.f, 'sm')}
    <div class="grow"></div>
    <div class="controls">
      <label class="search">${ICON.search}<input id="iq" placeholder="Поиск" value="${esc(I.q)}" autocomplete="off"></label>
      <select class="select" id="isort">${[['new', 'Сначала новые'], ['old', 'Сначала старые'], ['pd', 'Дороже'], ['pa', 'Дешевле']].map(([v, l]) => `<option value="${v}" ${I.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
  </div>
  <div id="invGrid"></div>
  <div class="actionbar glass edge" id="abar"><span class="n" id="abarT"></span><button class="btn sm" data-act="selClear">Отмена</button><button class="btn green sm" data-act="sellSel">Продать</button></div>`;
  drawInv();
  VIEW = {
    onSeg(n, v) { if (n === 'f') { I.f = v; I.limit = 120; drawInv(); } },
    onInput(t) { if (t.id === 'iq') { I.q = t.value; drawInv(); } },
    onChange(t) { if (t.id === 'isort') { I.sort = t.value; drawInv(); } },
    refresh: drawInv,
    async act(a, el) {
      if (a === 'item') {
        const u = +el.dataset.u;
        if (I.select) { I.sel.has(u) ? I.sel.delete(u) : I.sel.add(u); el.classList.toggle('sel'); drawBar(); SFX.click(); }
        else { const it = S.inv.find(x => x.u === u); if (it) showItem(it, { onChange: () => $('#invGrid') && drawInv() }); }
      }
      if (a === 'selMode') { I.select = !I.select; I.sel.clear(); drawInv(); }
      if (a === 'selClear') { I.select = false; I.sel.clear(); drawInv(); }
      if (a === 'more') { I.limit += 240; drawInv(); }
      if (a === 'sellSel') {
        const uids = [...I.sel];
        $$('#invGrid .item.sel').forEach(e => e.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.8)' }], { duration: 300, fill: 'forwards', easing: 'ease-in' }));
        await Promise.all([sellWithFx(uids, `Продано предметов: ${uids.length}`), sleep(280)]);
        I.sel.clear(); I.select = false; if ($('#invGrid')) drawInv();
      }
      if (a === 'sellAll') {
        if (!S.inv.length) return;
        const v = invValue(), n = S.inv.length;
        openSheet(`<h2>Продать весь инвентарь?</h2><div class="subtitle">${n} предм. на сумму ${money(v)}</div><div class="acts"><button class="btn" data-sact="close">Отмена</button><button class="btn green" data-sact="ok">Продать за ${money(v)}</button></div>`, {
          narrow: true,
          acts: { async ok(b, close) { b.disabled = true; await sellWithFx(S.inv.map(i => i.u), 'Инвентарь продан'); close(); if ($('#invGrid')) drawInv(); } },
        });
      }
    },
  };
}
function drawBar() {
  const bar = $('#abar'); if (!bar) return;
  const sum = r2(S.inv.filter(i => I.sel.has(i.u)).reduce((a, i) => a + i.p, 0));
  $('#abarT').textContent = `Выбрано ${I.sel.size} · ${money(sum)}`;
  bar.classList.toggle('show', I.select && I.sel.size > 0);
}
function drawInv() {
  $('#invN').textContent = S.inv.length;
  $('#invV').textContent = money(invValue());
  $('#selBtn').textContent = I.select ? 'Готово' : 'Выбрать';
  $('#selBtn').classList.toggle('primary', I.select);
  const l = invList(), g = $('#invGrid');
  if (!S.inv.length) g.innerHTML = `<div class="empty-state"><div class="ill">🎒</div><h3>Инвентарь пуст</h3>Откройте пару кейсов — дропы появятся здесь.<br><button class="btn primary" data-go="#/">К кейсам</button></div>`;
  else if (!l.length) g.innerHTML = `<div class="empty-state"><div class="ill">🔍</div><h3>Нет предметов</h3>Под фильтр ничего не подходит</div>`;
  else g.innerHTML = `<div class="grid-items stagger">${l.slice(0, I.limit).map((it, i) => itemCard(it, { i: Math.min(i, 30), check: I.select, sel: I.sel.has(it.u), attr: `data-act="item" data-u="${it.u}"` })).join('')}</div>${l.length > I.limit ? `<div style="text-align:center;margin-top:20px"><button class="btn" data-act="more">Показать ещё (${l.length - I.limit})</button></div>` : ''}`;
  drawBar();
}

/* ================= UPGRADE ================= */
const U = { sel: new Set(), target: null, tab: 'inv', q: '', busy: false };
let MARKET;
function market() {
  if (MARKET) return MARKET;
  MARKET = [];
  for (const s of SK) {
    if (!['milspec', 'restricted', 'classified', 'covert', 'contraband'].includes(s.r) && !s.star) continue;
    if (s.cat === 'equip') continue;
    let code = null;
    if (!s.vanilla) {
      const ok = WEARS.filter(w => s.mn < w[4] && s.mx > w[3]).map(w => w[0]);
      code = ok.includes('FT') ? 'FT' : ok[0];
      if (s.star && ok.includes('FN')) MARKET.push({ s: s.i, code: 'FN', p: priceCode(s, 'FN', false) });
      if (ok.includes('MW') && !s.star) MARKET.push({ s: s.i, code: 'MW', p: priceCode(s, 'MW', false) });
    }
    MARKET.push({ s: s.i, code, p: priceCode(s, code, false) });
  }
  MARKET.sort((a, b) => a.p - b.p);
  return MARKET;
}
const selTotal = () => r2(S.inv.filter(i => U.sel.has(i.u)).reduce((a, i) => a + i.p, 0));
const chanceOf = () => U.target && U.sel.size ? Math.min(.9, selTotal() / U.target.p * .92) : 0;
function viewUpgrade() {
  for (const u of [...U.sel]) if (!S.inv.some(i => i.u === u)) U.sel.delete(u);
  main.innerHTML = `
  <section class="upg glass edge">
    <div class="upg-slot" id="slotIn"></div>
    <div>
      <div class="ring-wrap" id="ring">
        <svg class="ring" viewBox="0 0 260 260">
          <circle cx="130" cy="130" r="112" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="16"/>
          <circle class="arc" id="arc" cx="130" cy="130" r="112" fill="none" stroke="url(#ug)" stroke-width="16" stroke-linecap="round" stroke-dasharray="0 999"/>
          <defs><linearGradient id="ug" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#30d158"/><stop offset="1" stop-color="#0a84ff"/></linearGradient></defs>
        </svg>
        <div class="needle" id="needle"></div>
        <div class="center"><b id="chance">0%</b><span>шанс апгрейда</span></div>
      </div>
      <div class="upg-ctrl">${[1.5, 2, 3, 5, 10, 20].map(m => `<button class="btn sm" data-act="mul" data-m="${m}">×${m}</button>`).join('')}</div>
      <div class="upg-ctrl"><button class="btn gold big" id="upBtn" data-act="go">Апгрейд</button></div>
    </div>
    <div class="upg-slot" id="slotOut"></div>
  </section>
  <div class="section-head">
    ${seg('tab', [['inv', 'Ваши предметы'], ['tgt', 'Цели']], U.tab)}
    <div class="grow"></div>
    <label class="search">${ICON.search}<input id="uq" placeholder="Поиск" value="${esc(U.q)}" autocomplete="off"></label>
  </div>
  <div id="upGrid"></div>`;
  drawUpg();
  VIEW = {
    onSeg(n, v) { if (n === 'tab') { U.tab = v; drawUpList(); } },
    onInput(t) { if (t.id === 'uq') { U.q = t.value; drawUpList(); } },
    refresh() { if (!U.busy) drawUpg(); },
    act(a, el) {
      if (U.busy) return;
      if (a === 'pickIn') {
        const u = +el.dataset.u;
        if (U.sel.has(u)) U.sel.delete(u); else if (U.sel.size < 6) U.sel.add(u); else notify({ title: 'Максимум 6 предметов', icon: '!', color: 'rgba(255,159,10,.35)' });
        if (U.target && U.target.p <= selTotal()) U.target = null;
        SFX.click(); drawUpg();
      }
      if (a === 'pickOut') { const m = market()[+el.dataset.k]; U.target = U.target === m ? null : m; SFX.click(); drawUpg(); }
      if (a === 'mul') {
        if (!U.sel.size) return notify({ title: 'Сначала выберите предметы', icon: '!', color: 'rgba(255,159,10,.35)' });
        const want = selTotal() * +el.dataset.m;
        U.target = market().find(m => m.p >= want) || market().at(-1);
        U.tab = 'tgt'; segSelect($('[data-seg="tab"]', main), 'tgt'); drawUpg();
      }
      if (a === 'go') doUpgrade();
    },
  };
}
function drawUpg() {
  const items = S.inv.filter(i => U.sel.has(i.u));
  const si = $('#slotIn'), so = $('#slotOut');
  if (!si) return;
  if (!items.length) { si.className = 'upg-slot'; si.innerHTML = `<div class="ph"><b>＋</b>Выберите до 6 предметов<br>из инвентаря</div>`; }
  else {
    const top = items.reduce((a, b) => b.p > a.p ? b : a);
    si.className = 'upg-slot filled'; si.style.setProperty('--rc', colOf(SK[top.s]));
    si.innerHTML = `<div class="glow"></div>${items.length === 1 ? `<img src="${img(SK[top.s].img)}" alt=""><div class="nm">${esc(SK[top.s].pat)}</div>` : `<div class="multi">${items.map(i => `<img src="${img(SK[i.s].img, '128fx128f')}" alt="">`).join('')}</div><div class="nm">${items.length} предмета</div>`}<div class="pr">${money(selTotal())}</div>`;
  }
  if (!U.target) { so.className = 'upg-slot'; so.innerHTML = `<div class="ph"><b>◎</b>Выберите цель<br>во вкладке «Цели»</div>`; }
  else {
    const s = SK[U.target.s];
    so.className = 'upg-slot filled'; so.style.setProperty('--rc', colOf(s));
    so.innerHTML = `<div class="glow"></div><img src="${img(s.img)}" alt=""><div class="nm">${esc(wpnLabel(s))} | ${esc(s.pat)}${U.target.code ? ' · ' + U.target.code : ''}</div><div class="pr">${money(U.target.p)}</div>`;
  }
  const ch = chanceOf();
  $('#chance').textContent = (ch * 100).toFixed(2) + '%';
  $('#arc').setAttribute('stroke-dasharray', `${2 * Math.PI * 112 * ch} 999`);
  $('#upBtn').disabled = !ch;
  $('#ring').classList.remove('win', 'lose');
  drawUpList();
}
function drawUpList() {
  const g = $('#upGrid'); if (!g) return;
  const q = U.q.trim().toLowerCase();
  if (U.tab === 'inv') {
    const l = S.inv.filter(i => !q || SK[i.s].name.toLowerCase().includes(q)).slice().sort((a, b) => b.p - a.p).slice(0, 200);
    g.innerHTML = l.length ? `<div class="grid-items">${l.map(it => itemCard(it, { check: true, sel: U.sel.has(it.u), attr: `data-act="pickIn" data-u="${it.u}"` })).join('')}</div>` : `<div class="empty-state"><div class="ill">🎒</div><h3>Нет предметов</h3>Откройте кейсы, чтобы было что апгрейдить<br><button class="btn primary" data-go="#/">К кейсам</button></div>`;
  } else {
    const m = market(), min = selTotal();
    const l = [];
    m.forEach((x, k) => { if (x.p > min && (!q || SK[x.s].name.toLowerCase().includes(q))) l.push(k); });
    const tk = U.target ? m.indexOf(U.target) : -1;
    const show = l.slice(0, 120);
    if (tk >= 0 && !show.includes(tk)) show.unshift(tk);
    g.innerHTML = `<div class="grid-items">${show.map(k => {
      const x = m[k];
      const ch = min ? Math.min(.9, min / x.p * .92) : 0;
      return itemCard({ s: x.s, p: x.p, f: null }, { sel: U.target === x, wearText: x.code || '★', chance: ch ? (ch * 100).toFixed(1) + '%' : '', attr: `data-act="pickOut" data-k="${k}"` });
    }).join('')}</div>`;
  }
}
async function doUpgrade() {
  const ch0 = chanceOf();
  if (!ch0 || U.busy) return;
  U.busy = true;
  const tgt = U.target, inputs = [...U.sel];
  $('#upBtn').disabled = true;
  let r;
  try { r = await API.upgrade(inputs, tgt); }
  catch (e) { U.busy = false; notifyErr(e); if ($('#ring')) drawUpg(); return; }
  const ch = r.chance, win = r.win, got = r.item;
  const deg = win ? 360 * ch * (.08 + .84 * Math.random()) : 360 * ch + (360 - 360 * ch) * (.06 + .88 * Math.random());
  const needle = $('#needle'), ring = $('#ring');
  let anim = null;
  if (needle) {
    ring.classList.remove('win', 'lose');
    $('#arc').setAttribute('stroke-dasharray', `${2 * Math.PI * 112 * ch} 999`);
    anim = needle.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${360 * 5 + deg}deg)` }], { duration: 4600, easing: 'cubic-bezier(.12,.7,.08,1)', fill: 'forwards' });
    let lastSeg = 0, run = true;
    const tickLoop = () => { if (!run) return; const m = new DOMMatrixReadOnly(getComputedStyle(needle).transform); const a = Math.atan2(m.b, m.a); const sg = Math.floor((a + Math.PI) / (Math.PI / 12)); if (sg !== lastSeg) { SFX.tick(); lastSeg = sg; } requestAnimationFrame(tickLoop); };
    requestAnimationFrame(tickLoop);
    await sleep(4700);
    run = false;
  }
  U.busy = false; U.sel = new Set(); U.target = null;
  if (win) {
    SFX.win(tierOf(SK[got.s]));
    notify({ title: 'Апгрейд успешен!', sub: fullName(got), icon: thumbIco(got.s), amt: money(got.p), amtColor: '#5ee07f', tall: true });
  } else {
    SFX.fail();
    notify({ title: 'Не повезло', sub: 'Предметы сгорели в апгрейде', icon: '✕', color: 'rgba(255,69,58,.35)' });
  }
  if (!$('#ring')) return;
  ring.classList.add(win ? 'win' : 'lose');
  await sleep(1600);
  if (!$('#ring')) return;
  anim && anim.cancel();
  drawUpg();
}

/* ================= BATTLES ================= */
const B = { caseId: null, rounds: 1, players: 2 };
async function loadBattlePlayers(ids) {
  if (!ids.length) return {};
  const { data } = await sb.from('battle_players').select('*').in('battle_id', ids).order('slot');
  const by = {}; (data || []).forEach(p => (by[p.battle_id] = by[p.battle_id] || []).push(p));
  return by;
}
function slotsHTML(b, players) {
  return Array.from({ length: b.max_players }, (_, i) => {
    const p = players.find(x => x.slot === i);
    if (!p) return `<span class="slot empty">?</span>`;
    const win = b.status === 'done' && b.winner_slot === i;
    return `<span class="slot ${p.is_bot ? 'bot' : ''} ${win ? 'win' : ''}" title="${esc(p.nickname)}">${esc(p.nickname.replace(/^Бот /, '').slice(0, 2))}</span>`;
  }).join('<i class="vs">vs</i>');
}
function battleRow(b, players) {
  const c = caseById(b.case_id) || ALL_CASES[0];
  const me = players.some(p => p.user_id === ME.id);
  const btn = b.status === 'open'
    ? (me ? `<button class="btn sm" data-go="#/battle/${b.id}">Открыть</button>` : `<button class="btn primary sm" data-act="join" data-id="${b.id}">Войти · ${money(b.cost)}</button>`)
    : `<button class="btn sm" data-go="#/battle/${b.id}">Смотреть</button>`;
  return `<div class="brow glass-flat" data-go="#/battle/${b.id}">
    <div class="bcase">${caseArt(c, '128fx128f')}</div>
    <div class="binfo"><b>${esc(c.name)}</b><span>${b.rounds} ${b.rounds === 1 ? 'раунд' : b.rounds < 5 ? 'раунда' : 'раундов'} · ${b.max_players} игрока · ${ago(Date.parse(b.created_at))}</span></div>
    <div class="bslots">${slotsHTML(b, players)}</div>
    <div class="bpot">${b.status === 'done' ? `<span>Банк</span><b>${money(b.total)}</b>` : `<span>Вход</span><b>${money(b.cost)}</b>`}</div>
    ${btn}
  </div>`;
}
async function joinBattle(id) {
  try { await rpc('join_battle', { p_id: +id }); await refreshProfile(); location.hash = '#/battle/' + id; }
  catch (e) { notifyErr(e); }
}
async function viewBattles() {
  if (!ONLINE) { main.innerHTML = onlineOnly('Кейс-баттлы'); return; }
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  if (qs.get('case')) B.caseId = qs.get('case');
  if (!caseById(B.caseId)) B.caseId = OFFICIAL[0].id;
  const tk = viewToken;
  main.innerHTML = `
  <section class="battle-create glass edge">
    <div class="bc-art" id="bcArt"></div>
    <div class="bc-form">
      <h1>Кейс-баттл</h1>
      <p class="ev-note">Все открывают одинаковые кейсы. У кого дроп дороже — забирает всё. Нет друзей онлайн? Добавь бота.</p>
      <select class="select" id="bcCase">${ALL_CASES.slice().sort((a, b) => a.price - b.price).map(c => `<option value="${c.id}" ${c.id === B.caseId ? 'selected' : ''}>${esc(c.name)} — ${money(c.price)}</option>`).join('')}</select>
      <div class="bc-row"><span>Раунды</span>${seg('rounds', [1, 2, 3, 4, 5].map(n => [String(n), String(n)]), String(B.rounds), 'sm')}</div>
      <div class="bc-row"><span>Игроки</span>${seg('players', [['2', '1 на 1'], ['3', '3 игрока'], ['4', '4 игрока']], String(B.players), 'sm')}</div>
      <button class="btn primary big" id="bcGo" data-act="create"></button>
    </div>
  </section>
  <div class="section-head"><h2>Открытые баттлы</h2><span class="sub" id="openCount"></span></div>
  <div id="openList">${loadingHTML}</div>
  <div class="section-head"><h2>Недавние</h2></div>
  <div id="doneList"></div>`;
  const drawForm = () => {
    const c = caseById(B.caseId);
    $('#bcArt').innerHTML = `<div class="halo" style="background:${c.glow}"></div>${caseArt(c, '360fx360f')}`;
    $('#bcGo').textContent = `Создать за ${money(r2(c.price * B.rounds))}`;
  };
  drawForm();
  const load = async () => {
    const { data: open } = await sb.from('battles').select('*').eq('status', 'open').order('id', { ascending: false }).limit(30);
    const { data: done } = await sb.from('battles').select('*').eq('status', 'done').order('finished_at', { ascending: false }).limit(15);
    const by = await loadBattlePlayers([...(open || []), ...(done || [])].map(b => b.id));
    if (tk !== viewToken) return;
    $('#openCount').textContent = (open || []).length;
    $('#openList').innerHTML = (open || []).length ? `<div class="blist">${open.map(b => battleRow(b, by[b.id] || [])).join('')}</div>` : `<div class="empty-state" style="padding:30px"><h3>Пока никого</h3>Создай баттл и позови друзей — или сразись с ботом</div>`;
    $('#doneList').innerHTML = (done || []).length ? `<div class="blist">${done.map(b => battleRow(b, by[b.id] || [])).join('')}</div>` : `<div class="ev-note" style="margin-left:4px">Ещё не было ни одного баттла</div>`;
  };
  await load();
  let reloadT;
  const ch = sb.channel('battles-list').on('postgres_changes', { event: '*', schema: 'public', table: 'battles' }, () => { clearTimeout(reloadT); reloadT = setTimeout(load, 300); }).subscribe();
  VIEW = {
    destroy() { sb.removeChannel(ch); },
    onSeg(n, v) { if (n === 'rounds') B.rounds = +v; if (n === 'players') B.players = +v; drawForm(); },
    onChange(t) { if (t.id === 'bcCase') { B.caseId = t.value; drawForm(); } },
    async act(a, el, e) {
      if (a === 'join') { e.stopPropagation(); el.disabled = true; await joinBattle(el.dataset.id); el.disabled = false; }
      if (a === 'create') {
        el.disabled = true;
        try {
          const id = await rpc('create_battle', { p_case: B.caseId, p_rounds: B.rounds, p_players: B.players });
          await refreshProfile(); SFX.click();
          location.hash = '#/battle/' + id;
        } catch (err) { notifyErr(err); el.disabled = false; }
      }
    },
  };
}

async function viewBattle(id) {
  if (!ONLINE) { main.innerHTML = onlineOnly('Кейс-баттлы'); return; }
  const tk = viewToken;
  main.innerHTML = loadingHTML;
  let b, players = [], drops = [], animating = false, shownDone = false;
  const fetchAll_ = async () => {
    ({ data: b } = await sb.from('battles').select('*').eq('id', id).single());
    ({ data: players } = await sb.from('battle_players').select('*').eq('battle_id', id).order('slot'));
    if (b && b.status === 'done') ({ data: drops } = await sb.from('battle_drops').select('*').eq('battle_id', id).order('round').order('slot'));
  };
  await fetchAll_();
  if (tk !== viewToken) return;
  if (!b) { main.innerHTML = `<div class="empty-state"><div class="ill">⚔</div><h3>Баттл не найден</h3><button class="btn" data-go="#/battles">К баттлам</button></div>`; return; }
  const c = caseById(b.case_id);
  setTint(c.glow);
  const mine = () => players.some(p => p.user_id === ME.id);
  const colHTML = i => {
    const p = players.find(x => x.slot === i);
    const head = p ? `<div class="bt-nick">${p.is_bot ? ICON.bot : ''}<span>${esc(p.nickname)}</span>${p.user_id === ME.id ? '<em>ты</em>' : ''}</div>`
      : `<div class="bt-nick wait"><span>Ждём игрока…</span></div>`;
    const actions = !p && b.status === 'open'
      ? (b.creator === ME.id ? `<button class="btn sm" data-act="bot">${ICON.bot.replace('<svg', '<svg width="16" height="16"')} Добавить бота</button>` : !mine() ? `<button class="btn primary sm" data-act="join">Войти · ${money(b.cost)}</button>` : '')
      : '';
    return `<div class="bt-col glass-flat" data-slot="${i}">
      ${head}<div class="bt-total" id="tot${i}">${b.status === 'done' && !animating ? money(players.find(x => x.slot === i)?.total || 0) : '$0.00'}</div>
      <div class="roll bt-roll"><div class="strip"></div><div class="marker"></div></div>
      <div class="bt-items" id="its${i}"></div>
      ${actions ? `<div class="bt-act">${actions}</div>` : ''}
    </div>`;
  };
  const render = () => {
    main.innerHTML = `
    <section class="case-top glass edge bt-top">
      <div class="head">
        <button class="icon-btn" data-go="#/battles">${ICON.back}</button>
        <div class="bt-case">${caseArt(c, '128fx128f')}</div>
        <div><h1>Баттл #${b.id}</h1><div class="ev-note">${esc(c.name)} × ${b.rounds} · вход ${money(b.cost)} · создал ${esc(b.creator_nick)}</div></div>
        <div class="grow"></div>
        <span class="bt-status ${b.status}" id="btStatus">${b.status === 'open' ? `Ждём игроков ${players.length}/${b.max_players}` : b.status === 'cancelled' ? 'Отменён' : 'Завершён'}</span>
        ${b.status === 'open' && b.creator === ME.id ? '<button class="btn danger sm" data-act="cancel">Отменить</button>' : ''}
      </div>
      <div class="bt-grid" style="--n:${b.max_players}">${Array.from({ length: b.max_players }, (_, i) => colHTML(i)).join('')}</div>
      <div class="bt-result" id="btResult"></div>
    </section>`;
  };
  const showStatic = () => {
    for (const d of drops) $('#its' + d.slot).insertAdjacentHTML('beforeend', miniDrop(d));
    finishView(false);
  };
  const miniDrop = d => { const s = SK[d.skin_id]; return `<div class="bt-it" style="--rc:${colOf(s)}" title="${esc(fullName({ s: d.skin_id, f: d.float, st: d.st }))}"><img src="${img(s.img, '128fx128f')}" alt=""><span>${money(d.price)}</span></div>`; };
  const finishView = fx => {
    shownDone = true;
    const w = players.find(p => p.slot === b.winner_slot);
    $$('.bt-col').forEach(col => col.classList.toggle(+col.dataset.slot === b.winner_slot ? 'winner' : 'loser', true));
    $$('.bt-roll').forEach(r => r.remove());
    const iWon = w && w.user_id === ME.id;
    $('#btResult').innerHTML = `<div class="bt-win">${iWon ? '🏆 Ты победил!' : `🏆 Победил ${esc(w ? w.nickname : '?')}`}<span>Банк: ${money(b.total)}${iWon ? ' — все предметы уже в твоём инвентаре' : ''}</span></div>
      <div class="acts"><button class="btn primary" data-act="again">Ещё такой же баттл</button><button class="btn" data-go="#/battles">Все баттлы</button></div>`;
    if (fx) {
      if (iWon) { SFX.win('covert'); notify({ title: 'Победа в баттле!', sub: 'Предметы в инвентаре', amt: '+' + money(b.total), amtColor: '#5ee07f', icon: '🏆', color: 'rgba(255,214,10,.3)', tall: true }); }
      else SFX.fail();
    }
  };
  const animate = async () => {
    animating = true;
    render();
    const totals = {};
    for (let r = 1; r <= b.rounds; r++) {
      const round = drops.filter(d => d.round === r);
      $('#btStatus').textContent = `Раунд ${r} из ${b.rounds}`;
      await Promise.all(round.map((d, k) => {
        const roll = $(`.bt-col[data-slot="${d.slot}"] .bt-roll`);
        roll.classList.remove('done');
        return spin(roll, c, { s: d.skin_id, tier: d.tier }, k, SET.fast ? 1400 : 3800);
      }));
      if (tk !== viewToken) return;
      SFX.win(round.reduce((a, d) => TIERS.indexOf(d.tier) > TIERS.indexOf(a) ? d.tier : a, 'consumer'));
      for (const d of round) {
        totals[d.slot] = r2((totals[d.slot] || 0) + +d.price);
        $('#tot' + d.slot).textContent = money(totals[d.slot]);
        $('#its' + d.slot).insertAdjacentHTML('beforeend', miniDrop(d));
      }
      await sleep(700);
    }
    $('#btStatus').textContent = 'Завершён';
    animating = false;
    finishView(true);
    if (players.some(p => p.user_id === ME.id)) { await refreshProfile(); if (b.winner_slot === players.find(p => p.user_id === ME.id).slot) await refreshInventory(); }
  };
  if (b.status === 'done') {
    const fresh_ = Date.now() - Date.parse(b.finished_at) < 25000;
    if (fresh_) await animate(); else { render(); showStatic(); }
  } else render();
  let inflight = false;
  const onChange = async () => {
    if (inflight || animating || shownDone || tk !== viewToken) return;
    inflight = true;
    try {
      await fetchAll_();
      if (tk !== viewToken) return;
      if (b.status === 'done') await animate(); else render();
    } finally { inflight = false; }
  };
  let t_;
  const deb = () => { clearTimeout(t_); t_ = setTimeout(onChange, 250); };
  const ch = sb.channel('battle-' + id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'battle_players', filter: `battle_id=eq.${id}` }, deb)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'battles', filter: `id=eq.${id}` }, deb)
    .subscribe();
  VIEW = {
    destroy() { sb.removeChannel(ch); },
    async act(a, el) {
      el.disabled = true;
      try {
        if (a === 'join') { await rpc('join_battle', { p_id: b.id }); await refreshProfile(); }
        if (a === 'bot') await rpc('add_bot', { p_id: b.id });
        if (a === 'cancel') { await rpc('cancel_battle', { p_id: b.id }); await refreshProfile(); notify({ title: 'Баттл отменён', sub: 'Деньги вернулись на баланс', icon: '↺', color: 'rgba(10,132,255,.35)' }); }
        if (a === 'again') {
          const nid = await rpc('create_battle', { p_case: b.case_id, p_rounds: b.rounds, p_players: b.max_players });
          await refreshProfile(); location.hash = '#/battle/' + nid; return;
        }
        deb();
      } catch (e) { notifyErr(e); el.disabled = false; }
    },
  };
}

/* ================= TOP ================= */
const T = { by: 'networth' };
async function viewTop() {
  if (!ONLINE) { main.innerHTML = onlineOnly('Топ игроков'); return; }
  const tk = viewToken;
  main.innerHTML = `
  <div class="section-head" style="margin-top:22px"><h2>Топ игроков</h2><div class="grow"></div>
    ${seg('by', [['networth', 'Богачи'], ['best_price', 'Лучший дроп'], ['opened', 'Открыто кейсов'], ['battles_w', 'Баттлы']], T.by)}</div>
  <div id="topList">${loadingHTML}</div>`;
  const load = async () => {
    const { data, error } = await sb.from('leaderboard').select('*').order(T.by, { ascending: false }).limit(50);
    if (tk !== viewToken) return;
    if (error) { $('#topList').innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; return; }
    const val = r => T.by === 'networth' ? money(r.networth) : T.by === 'best_price' ? money(r.best_price) : T.by === 'opened' ? r.opened : `${r.battles_w} побед`;
    const sub = r => T.by === 'best_price' && r.best_skin != null ? esc(fullName({ s: r.best_skin, f: r.best_float, st: r.best_st })) : T.by === 'networth' ? `баланс ${money(r.balance)} · инвентарь ${money(r.inv_value)}` : T.by === 'battles_w' ? `${r.battles_l} поражений` : `потрачено на апгрейды: ${r.up_w + r.up_l}`;
    $('#topList').innerHTML = `<div class="list glass-flat stagger">${data.map((r, i) => {
      const bs = r.best_skin != null ? SK[r.best_skin] : null;
      return `<div class="li top-li ${r.id === ME.id ? 'me' : ''}" style="--i:${i};--rc:${bs ? colOf(bs) : 'transparent'}" data-go="#/u/${r.id}">
        <div class="rank r${i + 1}">${i + 1}</div>
        ${bs ? `<img src="${img(bs.img, '128fx128f')}" alt="">` : '<div style="width:64px"></div>'}
        <div class="t"><b>${esc(r.nickname)}${r.id === ME.id ? ' <em class="me-tag">ты</em>' : ''}</b><span>${sub(r)}</span></div>
        <div class="p">${val(r)}</div></div>`;
    }).join('')}</div>`;
  };
  await load();
  VIEW = { onSeg(n, v) { if (n === 'by') { T.by = v; load(); } } };
}

/* ================= OTHER PLAYER ================= */
async function viewUser(id) {
  if (!ONLINE) { location.hash = '#/profile'; return; }
  if (id === ME.id) { location.hash = '#/profile'; return; }
  const tk = viewToken;
  main.innerHTML = loadingHTML;
  const [{ data: p }, invRows, { data: hist }] = await Promise.all([
    sb.from('leaderboard').select('*').eq('id', id).single(),
    fetchAll(() => sb.from('inventory').select('id,skin_id,float,st,price,src,created_at').eq('owner', id).order('price', { ascending: false })),
    sb.from('drops').select('*').eq('user_id', id).order('id', { ascending: false }).limit(20),
  ]);
  if (tk !== viewToken) return;
  if (!p) { main.innerHTML = `<div class="empty-state"><h3>Игрок не найден</h3></div>`; return; }
  const inv = invRows.map(fromInv);
  main.innerHTML = `
  <section class="inv-head glass edge">
    <div class="avatar">${esc(p.nickname.slice(0, 2))}</div>
    <div class="stat"><span>Игрок</span><b>${esc(p.nickname)}</b></div>
    <div class="stat"><span>Состояние</span><b>${money(p.networth)}</b></div>
    <div class="stat"><span>Кейсов</span><b>${p.opened}</b></div>
    <div class="stat"><span>Баттлы</span><b>${p.battles_w}/${p.battles_l}</b></div>
    <div class="grow"></div>
    <button class="btn" data-go="#/top">${ICON.trophy.replace('<svg', '<svg width="16" height="16"')} Топ</button>
  </section>
  ${p.best_skin != null ? `<div class="section-head"><h2>Лучший дроп</h2></div><div style="max-width:340px">${itemCard({ s: p.best_skin, f: p.best_float, st: p.best_st, p: +p.best_price })}</div>` : ''}
  <div class="section-head"><h2>Инвентарь</h2><span class="sub">${inv.length} предм. · ${money(p.inv_value)}</span></div>
  ${inv.length ? `<div class="grid-items stagger">${inv.slice(0, 200).map((it, i) => itemCard(it, { i: Math.min(i, 30), attr: `data-act="view" data-u="${it.u}"` })).join('')}</div>` : '<div class="ev-note" style="margin-left:4px">Пусто</div>'}
  <div class="section-head"><h2>Последние события</h2></div>
  ${histList((hist || []).map(fromFeed))}`;
  VIEW = { act(a, el) { if (a === 'view') { const it = inv.find(x => x.u === +el.dataset.u); if (it) showItem(it, { readonly: true }); } } };
}
function histList(list) {
  if (!list.length) return '<div class="list glass-flat"><div class="li"><div class="t"><span>Пока ничего</span></div></div></div>';
  return `<div class="list glass-flat">${list.map(h => {
    const s = SK[h.s], c = caseById(h.c);
    const what = h.src === 'battle' ? `Победа в баттле · банк ${money(h.p)}` : h.src === 'upgrade' ? `Апгрейд (${h.extra}%)` : h.src === 'gift' ? `Подарок → ${esc(h.extra)}` : (c ? esc(c.name) : 'Кейс');
    return `<div class="li" style="--rc:${colOf(s)}"><div class="dot"></div><img src="${img(s.img, '128fx128f')}" alt="" loading="lazy"><div class="t"><b>${esc(fullName(h))}</b><span>${what} · ${new Date(h.t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div><div class="p">${money(h.src === 'battle' ? h.p : h.p)}</div></div>`;
  }).join('')}</div>`;
}

/* ================= PROFILE ================= */
async function viewProfile() {
  const tk = viewToken;
  let hist = S.hist.map(h => ({ ...h, src: 'case' }));
  if (ONLINE) {
    main.innerHTML = loadingHTML;
    await refreshProfile();
    const { data } = await sb.from('drops').select('*').eq('user_id', ME.id).order('id', { ascending: false }).limit(60);
    if (tk !== viewToken) return;
    hist = (data || []).map(fromFeed);
  }
  const st = S.stats, b = st.best;
  main.innerHTML = `
  ${ONLINE ? `<section class="inv-head glass edge">
    <div class="avatar">${esc(ME.nick.slice(0, 2))}</div>
    <div class="stat"><span>${ME.guest ? 'Гость' : 'Аккаунт'}</span><b>${esc(ME.nick)}</b></div>
    <div class="grow"></div>
    ${ME.guest ? '<button class="btn" data-act="rename">Сменить ник</button><button class="btn primary" data-act="saveAcc">Сохранить аккаунт</button>' : ''}
    <button class="btn danger" data-act="logout">Выйти</button>
  </section>
  ${ME.guest ? '<div class="hint glass-flat">👋 Ты играешь как гость — прогресс привязан к этому браузеру. Задай пароль («Сохранить аккаунт»), чтобы заходить с других устройств и ничего не потерять.</div>' : ''}` : ''}
  <div class="stats stagger">
    <div class="stat-tile glass-flat" style="--i:0"><span>Баланс</span><b>${money(S.bal)}</b></div>
    <div class="stat-tile glass-flat" style="--i:1"><span>Стоимость инвентаря</span><b>${money(invValue())}</b></div>
    <div class="stat-tile glass-flat" style="--i:2"><span>Открыто кейсов</span><b>${st.opened}</b></div>
    <div class="stat-tile glass-flat" style="--i:3"><span>Потрачено на кейсы</span><b>${money(st.spent)}</b></div>
    <div class="stat-tile glass-flat" style="--i:4"><span>Продано предметов на</span><b>${money(st.sold)}</b></div>
    <div class="stat-tile glass-flat" style="--i:5"><span>Апгрейды (успех / провал)</span><b><span style="color:var(--green)">${st.upW}</span> / <span style="color:var(--red)">${st.upL}</span></b></div>
    ${ONLINE ? `<div class="stat-tile glass-flat" style="--i:6"><span>Баттлы (победы / поражения)</span><b><span style="color:var(--green)">${st.bw}</span> / <span style="color:var(--red)">${st.bl}</span></b></div>` : ''}
  </div>
  <div class="section-head"><h2>Лучший дроп</h2></div>
  ${b ? `<div style="max-width:340px">${itemCard(b)}</div>` : '<div class="ev-note" style="margin-left:4px">Пока пусто</div>'}
  <div class="section-head"><h2>История</h2><span class="sub">последние ${hist.length}</span></div>
  ${histList(hist)}
  <div class="section-head"><h2>Настройки</h2></div>
  <div class="list glass-flat settings">
    <div class="li"><div class="t"><b>Звуки</b><span>Щелчки рулетки, звук выигрыша</span></div><span class="switch ${SET.sound ? 'on' : ''}" data-act="snd"></span></div>
    <div class="li"><div class="t"><b>Быстрое открытие</b><span>Рулетка крутится ~1.5 секунды</span></div><span class="switch ${SET.fast ? 'on' : ''}" data-act="fast"></span></div>
    ${ONLINE ? '' : '<div class="li"><div class="t"><b>Сбросить прогресс</b><span>Баланс $100, пустой инвентарь и статистика</span></div><button class="btn danger sm" data-act="reset">Сбросить</button></div>'}
  </div>`;
  VIEW = {
    act(a, el) {
      if (a === 'snd') { SET.sound = !SET.sound; saveSet(); el.classList.toggle('on', SET.sound); drawSound(); SFX.click(); }
      if (a === 'fast') { SET.fast = !SET.fast; saveSet(); el.classList.toggle('on', SET.fast); SFX.click(); }
      if (a === 'reset') openSheet(`<h2>Сбросить всё?</h2><div class="subtitle">Инвентарь, баланс и статистика будут удалены без возможности восстановления.</div><div class="acts"><button class="btn" data-sact="close">Отмена</button><button class="btn danger" data-sact="ok">Сбросить</button></div>`, {
        narrow: true,
        acts: { ok(b_, close) { S = fresh(); save(); renderBal(); close(); notify({ title: 'Прогресс сброшен', sub: 'Баланс: $100.00', icon: '↺', color: 'rgba(10,132,255,.35)' }); route(); } },
      });
      if (a === 'rename') renameSheet();
      if (a === 'saveAcc') saveAccountSheet();
      if (a === 'logout') openSheet(`<h2>Выйти?</h2><div class="subtitle">${ME.guest ? '⚠️ Ты гость без пароля — после выхода вернуться в этот аккаунт будет невозможно. Сначала сохрани аккаунт.' : 'Войти обратно можно по нику и паролю.'}</div><div class="acts"><button class="btn" data-sact="close">Отмена</button><button class="btn danger" data-sact="ok">Выйти</button></div>`, {
        narrow: true,
        acts: { async ok() { await sb.auth.signOut(); location.hash = '#/'; location.reload(); } },
      });
    },
  };
}
function renameSheet() {
  openSheet(`<h2>Новый ник</h2><label class="field"><span>Ник</span><input id="newNick" maxlength="16" value="${esc(ME.nick)}" autocomplete="off"></label><div class="acts"><button class="btn" data-sact="close">Отмена</button><button class="btn primary" data-sact="ok">Сохранить</button></div>`, {
    narrow: true,
    acts: {
      async ok(b, close) {
        b.disabled = true;
        try { const p = await rpc('set_nickname', { p_nick: $('#newNick').value }); applyProfile(p); close(); notify({ title: 'Ник изменён', sub: p.nickname, icon: '✓', color: 'rgba(48,209,88,.3)' }); route(); }
        catch (e) { b.disabled = false; notifyErr(e); }
      },
      enter() { const b = document.querySelector('.scrim [data-sact="ok"]'); b && b.click(); },
    },
  });
}
function saveAccountSheet() {
  openSheet(`<h2>Сохранить аккаунт</h2><div class="subtitle">Входить можно будет по нику <b>${esc(ME.nick)}</b> и паролю — с любого устройства. Почта не нужна.</div>
    <label class="field"><span>Пароль (минимум 6 символов)</span><input id="pw1" type="password" autocomplete="new-password"></label>
    <label class="field"><span>Ещё раз</span><input id="pw2" type="password" autocomplete="new-password"></label>
    <div class="acts"><button class="btn" data-sact="close">Отмена</button><button class="btn primary" data-sact="ok">Сохранить</button></div>`, {
    narrow: true,
    acts: {
      async ok(b, close) {
        const p1 = $('#pw1').value, p2 = $('#pw2').value;
        if (p1.length < 6) return notifyErr('Password should be at least');
        if (p1 !== p2) return notifyErr('Пароли не совпадают');
        b.disabled = true;
        const { error } = await sb.auth.updateUser({ email: nickEmail(ME.nick), password: p1 });
        if (error) { b.disabled = false; return notifyErr(error); }
        ME.guest = false; close(); SFX.coin();
        notify({ title: 'Аккаунт сохранён', sub: 'Вход — по нику и паролю', icon: '✓', color: 'rgba(48,209,88,.3)' });
        route();
      },
      enter() { const b = document.querySelector('.scrim [data-sact="ok"]'); b && b.click(); },
    },
  });
}

/* ================= AUTH (online) ================= */
function authSheet() {
  return new Promise(resolve => {
    let mode = 'guest';
    const body = () => mode === 'guest'
      ? `<label class="field"><span>Придумай ник</span><input id="aNick" maxlength="16" autocomplete="off" placeholder="3–16 символов"></label>
         <div class="acts"><button class="btn primary big" data-sact="go">Играть</button></div>
         <div class="ev-note" style="text-align:center;margin-top:12px">Без регистрации. Пароль можно задать потом в профиле.</div>`
      : `<label class="field"><span>Ник</span><input id="aNick" maxlength="16" autocomplete="username"></label>
         <label class="field"><span>Пароль</span><input id="aPw" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>
         <div class="acts"><button class="btn primary big" data-sact="go">${mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button></div>`;
    const sh = openSheet(`
      <div class="auth-logo"><div class="logo-mark"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linejoin="round"><path d="M3 8h18v12H3z"/><path d="M2 4h20v4H2zM10 12h4"/></svg></div></div>
      <h2>GlassDrop</h2>
      <div class="subtitle">Кейсы CS2, баттлы и топ — вместе с друзьями</div>
      <div style="display:flex;justify-content:center;margin-top:20px">${seg('mode', [['guest', 'Гость'], ['login', 'Вход'], ['reg', 'Регистрация']], mode)}</div>
      <div id="authBody">${body()}</div>`, {
      narrow: true, locked: true,
      acts: {
        onSeg(n, v, scrim) { mode = v; $('#authBody', scrim).innerHTML = body(); setTimeout(() => $('#aNick') && $('#aNick').focus(), 50); },
        async go(b) {
          const nick = ($('#aNick').value || '').trim();
          const pw = $('#aPw') ? $('#aPw').value : '';
          if (nick.length < 3) return notifyErr('BAD_NICK');
          b.disabled = true;
          try {
            if (mode === 'guest') {
              if (!(await rpc('nick_free', { p_nick: nick }))) throw new Error('NICK_TAKEN');
              const { data: sess } = await sb.auth.getSession();
              if (!sess.session) { const { error } = await sb.auth.signInAnonymously(); if (error) throw error; }
              await rpc('ensure_profile', { p_nick: nick });
            } else if (mode === 'login') {
              const { error } = await sb.auth.signInWithPassword({ email: nickEmail(nick), password: pw });
              if (error) throw error;
            } else {
              if (pw.length < 6) throw new Error('Password should be at least');
              if (!(await rpc('nick_free', { p_nick: nick }))) throw new Error('NICK_TAKEN');
              const { error } = await sb.auth.signUp({ email: nickEmail(nick), password: pw });
              if (error) throw error;
              await rpc('ensure_profile', { p_nick: nick });
            }
            sh.close(); resolve();
          } catch (e) { b.disabled = false; notifyErr(e); }
        },
        enter() { const b = document.querySelector('.scrim [data-sact="go"]'); b && b.click(); },
      },
    });
    setTimeout(() => $('#aNick') && $('#aNick').focus(), 400);
  });
}

async function startOnline() {
  let { data: { session } } = await sb.auth.getSession();
  let prof = null;
  if (session) { const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle(); prof = data; }
  if (!session || !prof) {
    if (session && !prof && !session.user.is_anonymous) {
      // registered but profile missing — shouldn't happen; sign out and ask again
      await sb.auth.signOut();
    }
    await authSheet();
    ({ data: { session } } = await sb.auth.getSession());
  }
  ME = { id: session.user.id, nick: '', guest: !!session.user.is_anonymous };
  await refreshProfile();
  await refreshInventory();
  shownBal = S.bal; balVal.textContent = fmt(S.bal); drawBonus();
  // feed
  const { data: feed } = await sb.from('drops').select('*').order('id', { ascending: false }).limit(24);
  FEED = (feed || []).map(fromFeed);
  sb.channel('feed').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'drops' }, ({ new: row }) => {
    const h = fromFeed(row);
    FEED.unshift(h); FEED = FEED.slice(0, 40);
    pushTicker(h);
    if (h.src === 'gift' && h.extra && h.extra.toLowerCase() === ME.nick.toLowerCase()) {
      SFX.ping();
      notify({ title: `${h.nick} подарил тебе предмет!`, sub: fullName(h), icon: thumbIco(h.s), amt: money(h.p), tall: true, ms: 4500 });
      refreshInventory().then(() => VIEW.refresh && VIEW.refresh());
      return;
    }
    if (h.uid === ME.id) return;
    const s = SK[h.s];
    if (h.src === 'battle') notify({ title: `${h.nick} выиграл баттл`, sub: `Банк ${money(h.p)}`, icon: '⚔', color: 'rgba(255,214,10,.3)' });
    else if (s.star || h.p >= 25) { SFX.ping(); notify({ title: `${h.nick} выбил${h.src === 'upgrade' ? ' апгрейдом' : ''}`, sub: fullName(h), icon: thumbIco(h.s), amt: money(h.p), tall: true, ms: 4000 }); }
  }).subscribe();
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.reload(); });
}

/* ================= boot ================= */
(async () => {
  if (ONLINE) {
    main.innerHTML = loadingHTML;
    try { await startOnline(); }
    catch (e) { console.error(e); main.innerHTML = `<div class="empty-state"><div class="ill">⚠️</div><h3>Не удалось подключиться к серверу</h3>${esc(errText(e))}<br><button class="btn primary" onclick="location.reload()">Обновить</button></div>`; return; }
    route();
    notify({ title: `Привет, ${esc(ME.nick)}!`, sub: ME.guest ? 'Ты играешь как гость' : 'С возвращением', icon: ICON.gift, color: 'rgba(10,132,255,.35)' });
  } else {
    route();
    if (!localStorage.getItem(KEY)) { save(); setTimeout(() => notify({ title: 'Добро пожаловать!', sub: 'На балансе $100 — открывайте кейсы', icon: ICON.gift, color: 'rgba(10,132,255,.35)' }), 900); }
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layoutPills(document));
})();
})();
