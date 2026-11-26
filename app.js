/* GlassDrop — CS2 case simulator. Pure client-side, state in localStorage. */
(() => {
'use strict';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const IMGPRE = 'https://community.akamai.steamstatic.com/economy/image/';
const img = (u, size = '256fx256f') => !u ? '' : u[0] === '~' ? IMGPRE + u.slice(1) + '/' + size : u;
const fmt = v => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = v => '$' + fmt(v);
const r2 = v => Math.round(v * 100) / 100;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function hash(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const _cr = new Uint32Array(1);
const crand = () => { crypto.getRandomValues(_cr); return _cr[0] / 4294967296; };
function gauss(rng) { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function seededShuffle(arr, seed) { const r = mulberry(hash(seed)); const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pickWeighted(odds) { let x = crand(), last; for (const k in odds) { last = k; if ((x -= odds[k]) < 0) return k; } return last; }

const svg = (inner, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ICON = {
  cases: svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
  inv: svg('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),
  up: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 4-4 4 4M12 16V8"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  sOn: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
  sOff: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 3),
  back: svg('<path d="m15 18-6-6 6-6"/>', 2.5),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 2.5),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>', 2.5),
  check: svg('<path d="m5 12 5 5 9-10"/>', 3.5),
  gift: svg('<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8S10.5 3 7.5 3a2.5 2.5 0 0 0 0 5M12 8s1.5-5 4.5-5a2.5 2.5 0 0 1 0 5"/>'),
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
// CS2 float generation: pick a wear bucket on the 0..1 scale, then remap into the skin's own range
const UBK = [[.03, 0, .07], [.24, .07, .15], [.33, .15, .38], [.24, .38, .45], [.16, .45, 1]];
const wearOf = f => f == null ? null : (WEARS.find(w => f < w[4]) || WEARS[4]);
const wearByCode = c => WEARS.find(w => w[0] === c);

/* ================= skins ================= */
const SK = window.SKINS.map((a, i) => {
  const [name, weapon, pattern, r, cat, mn, mx, st, im, phase] = a;
  const star = name.startsWith('★');
  const pat = name.includes(' | ') ? name.split(' | ')[1] : (star ? 'Vanilla' : pattern);
  return { i, name, weapon, pat, r, cat, mn, mx, st: !!st && cat !== 'glove', img: im, phase, star, vanilla: star && mn == null, tier: star ? 'rare' : r };
});
const colOf = s => s.star ? TIER_COL.rare : TIER_COL[s.r];
const wpnLabel = s => (s.star ? '★ ' : '') + s.weapon;
function fullName(it) {
  const s = SK[it.s], w = wearOf(it.f);
  return `${s.star ? '★ ' : ''}${it.st ? 'StatTrak™ ' : ''}${s.weapon}${s.vanilla ? '' : ' | ' + s.pat}${w ? ` (${w[1]})` : ''}`;
}

/* ================= pricing model =================
   Not market prices — a deterministic model shaped like the real market:
   rarity base × weapon popularity × per-skin variance × wear × StatTrak. */
const BASE = { consumer: .05, industrial: .1, milspec: .32, restricted: 1.7, classified: 7.5, covert: 34, contraband: 1400 };
const WPN = { 'AWP': 1.8, 'AK-47': 1.7, 'M4A4': 1.35, 'M4A1-S': 1.4, 'Desert Eagle': 1.25, 'USP-S': 1.2, 'Glock-18': 1.1, 'P250': .8, 'MP9': .8, 'MAC-10': .8, 'Negev': .55, 'SG 553': .7, 'Sawed-Off': .6, 'PP-Bizon': .6, 'Nova': .6, 'MAG-7': .6, 'XM1014': .7, 'P2000': .8, 'Tec-9': .75, 'CZ75-Auto': .75, 'Dual Berettas': .65, 'Five-SeveN': .8, 'G3SG1': .55, 'SCAR-20': .55, 'M249': .55, 'R8 Revolver': .65, 'SSG 08': .9, 'FAMAS': .75, 'Galil AR': .75, 'AUG': .8, 'UMP-45': .7, 'P90': .9, 'MP7': .7, 'MP5-SD': .7 };
const KNIFE = { 'Karambit': 2.3, 'Butterfly Knife': 2.4, 'M9 Bayonet': 1.8, 'Bayonet': 1.15, 'Talon Knife': 1.6, 'Skeleton Knife': 1.7, 'Flip Knife': .85, 'Gut Knife': .5, 'Navaja Knife': .45, 'Shadow Daggers': .5, 'Falchion Knife': .6, 'Huntsman Knife': .75, 'Bowie Knife': .7, 'Stiletto Knife': 1.15, 'Ursus Knife': .8, 'Classic Knife': 1.0, 'Paracord Knife': .7, 'Survival Knife': .65, 'Nomad Knife': .95, 'Kukri Knife': 1.0 };
const GLOVE = { 'Sport Gloves': 2.1, 'Specialist Gloves': 1.4, 'Driver Gloves': 1.1, 'Moto Gloves': 1.25, 'Hand Wraps': .9, 'Hydra Gloves': .8, 'Bloodhound Gloves': .85, 'Broken Fang Gloves': .7 };
const FINISH = [[/Black Pearl|Emerald/, 9], [/Ruby|Sapphire/, 8], [/Phase 2|Phase 4/, 1.9], [/Lore/, 1.9], [/Fade/, 1.8], [/Doppler/, 1.6], [/Crimson Web/, 1.7], [/Marble/, 1.6], [/Tiger Tooth|Slaughter|Autotronic/, 1.35], [/Case Hardened/, 1.25], [/Ultraviolet|Black Laminate/, 1.0], [/Blue Steel/, .95], [/Damascus/, .85], [/Freehand|Bright Water|Night|Stained/, .75], [/Rust Coat/, .6], [/Safari Mesh|Scorched|Forest DDPAT|Boreal Forest|Urban Masked/, .5]];
const FAMOUS = { 'AWP | Dragon Lore': 40, 'M4A4 | Howl': 1, 'AWP | Gungnir': 30, 'AWP | Medusa': 20, 'AK-47 | Wild Lotus': 25, 'AK-47 | Gold Arabesque': 18, 'AWP | The Prince': 14, 'AK-47 | Fire Serpent': 9, 'M4A1-S | Knight': 10, 'M4A1-S | Welcome to the Jungle': 8, 'AWP | Asiimov': 2.2, 'AK-47 | Vulcan': 2.2, 'AWP | Lightning Strike': 3, 'Desert Eagle | Blaze': 5, 'AK-47 | Case Hardened': 3, 'M4A4 | Poseidon': 4, 'USP-S | Kill Confirmed': 2, 'AWP | Hyper Beast': 1.5, 'M4A1-S | Printstream': 2, 'Desert Eagle | Printstream': 1.8, 'AWP | Fade': 6, 'Glock-18 | Fade': 4, 'AK-47 | Bloodsport': 1.4, 'M4A4 | The Emperor': 1.5, 'M4A1-S | Hot Rod': 3, 'AWP | Containment Breach': 1.6 };
const WEAR_MUL = { FN: 2.1, MW: 1.4, FT: 1, WW: .88, BS: .72 };
const WEAR_MUL_STAR = { FN: 1.7, MW: 1.2, FT: 1, WW: .9, BS: .82 };

function basePrice(s) {
  if (s._b) return s._b;
  const rng = mulberry(hash(s.name)), g = gauss(rng);
  let p;
  if (s.cat === 'knife') {
    let fm = 1.15;
    if (!s.vanilla) { fm = 1; for (const [re, m] of FINISH) if (re.test(s.pat)) { fm = m; break; } }
    p = 190 * (KNIFE[s.weapon] || 1) * fm * Math.exp(g * .25);
  } else if (s.cat === 'glove') {
    p = 170 * (GLOVE[s.weapon] || 1) * Math.exp(g * .55);
  } else {
    p = BASE[s.r] * (WPN[s.weapon] || 1) * Math.exp(g * (s.r === 'covert' ? .75 : .6)) * (FAMOUS[s.name] || 1);
  }
  return (s._b = Math.max(.03, p));
}
function priceWear(s, code, st) {
  let p = basePrice(s);
  if (code) p *= (s.star ? WEAR_MUL_STAR : WEAR_MUL)[code];
  if (st) p *= s.star ? 1.15 : 2;
  return Math.max(.03, r2(p));
}
function priceOf(s, f, st) {
  const w = wearOf(f);
  let p = priceWear(s, w && w[0], st);
  if (f != null && f < .01) p = r2(p * 1.25);
  return p;
}
function wearProbs(s) {
  if (s.vanilla) return null;
  if (s._wp) return s._wp;
  const res = {};
  for (const [p, a, b] of UBK) {
    const lo = s.mn + (s.mx - s.mn) * a, hi = s.mn + (s.mx - s.mn) * b;
    if (hi <= lo) continue;
    for (const w of WEARS) {
      const ov = Math.min(hi, w[4]) - Math.max(lo, w[3]);
      if (ov > 0) res[w[0]] = (res[w[0]] || 0) + p * ov / (hi - lo);
    }
  }
  return (s._wp = res);
}
function evSkin(s) {
  if (s._ev != null) return s._ev;
  const wp = wearProbs(s);
  const one = st => wp ? Object.entries(wp).reduce((a, [c, p]) => a + p * priceWear(s, c, st), 0) : priceWear(s, null, st);
  return (s._ev = s.st ? .9 * one(false) + .1 * one(true) : one(false));
}
function rollFloat(s) {
  if (s.vanilla) return null;
  let x = crand(), b = UBK[4];
  for (const k of UBK) { if ((x -= k[0]) < 0) { b = k; break; } }
  const u = b[1] + (b[2] - b[1]) * crand();
  return +(s.mn + (s.mx - s.mn) * u).toFixed(9);
}

/* ================= cases ================= */
const OFFICIAL_ODDS = { milspec: .7992, restricted: .1598, classified: .032, covert: .0064, rare: .0026 };

function finalizeCase(c, odds, edge) {
  const o = {};
  let sum = 0;
  for (const t of TIERS) if (odds[t] && c.pools[t] && c.pools[t].length) { o[t] = odds[t]; sum += odds[t]; }
  for (const t in o) o[t] /= sum;
  c.odds = o;
  c.ev = Object.entries(o).reduce((a, [t, p]) => a + p * c.pools[t].reduce((x, s) => x + evSkin(s), 0) / c.pools[t].length, 0);
  c.price = Math.max(.25, r2(c.ev / edge));
  c.count = Object.keys(o).reduce((a, t) => a + c.pools[t].length, 0);
  // the most valuable non-rare skin represents the case
  const show = ['covert', 'classified', 'restricted', 'milspec', 'industrial', 'consumer'].find(t => o[t]);
  c.hero = c.pools[show].slice().sort((a, b) => basePrice(b) - basePrice(a))[0];
  return c;
}

const OFFICIAL = window.CASES.map((x, i) => {
  const pools = {};
  for (const si of x.items) { const s = SK[si]; const t = s.r === 'contraband' ? 'covert' : s.r; (pools[t] = pools[t] || []).push(s); }
  pools.rare = x.rare.map(si => SK[si]);
  const hue = hash(x.n) % 360;
  return finalizeCase({ id: x.id, name: x.n, kind: 'official', img: x.img, date: x.d, pools, idx: i, glow: `hsla(${hue},95%,60%,.55)` }, OFFICIAL_ODDS, .9);
});

const P = re => s => re.test(s.pat);
const CUSTOM_DEFS = [
  { id: 'c-liquid', name: 'Liquid Glass', mark: 'liquid', a: '#8be9ff', b: '#6b5cff', f: P(/Fade|Doppler|Marble|Vapor|Prism|Chroma|Gamma|Ultraviolet|Holo|Crystal|Glass|Aurora|Iridescent|Bubble|Pearl/i), rare: s => /Fade|Doppler/.test(s.pat), desc: 'Переливы, фейды и хром' },
  { id: 'c-neon', name: 'Neon Nights', mark: 'neon', a: '#ff4fd8', b: '#3a1cff', f: P(/Neon|Cyrex|Hyper Beast|Asiimov|Vulcan|Printstream|Neo-Noir|Bloodsport|Fever Dream|Bullet Rain|Cyber|Electric|Kill Confirmed|Wasteland Rebel|Mecha|Laser|Point Disarray|Fuel Injector|Decimator|Monster|Light Rail|Nightwish/i), rare: s => s.cat === 'glove', desc: 'Кислотные цвета и неон' },
  { id: 'c-awp', name: 'Sniper\'s Dream', mark: 'awp', a: '#59f0a9', b: '#0b6b5b', f: s => s.weapon === 'AWP' || s.weapon === 'SSG 08', rare: s => s.weapon === 'Karambit', desc: 'Только снайперки и керамбиты' },
  { id: 'c-crimson', name: 'Crimson Rush', mark: 'crimson', a: '#ff5a4e', b: '#6b0a2a', f: P(/Crimson|Blood|Red|Ruby|Fire|Hot Rod|Slaughter|Inferno|Lava|Magma|Ember|Flame|Scarlet|Cardiac|Wildfire|Howl|Heat|Torque|Bloodsport|Blaze|Oni/i), rare: s => /Crimson Web|Slaughter|Autotronic|Ruby/.test(s.pat), desc: 'Всё красное и горячее' },
  { id: 'c-arctic', name: 'Arctic Frost', mark: 'arctic', a: '#d9f6ff', b: '#2f7bff', f: P(/Frost|Ice|Winter|Snow|Arctic|Blue|Ocean|Cobalt|Polar|Glacier|Aqua|Azure|Water|Sea|Tide|Frozen|Cold|Chill|Poseidon|Hydro|Wave/i), rare: s => /Blue Steel|Bright Water|Sapphire|Ultraviolet|Gamma Doppler/.test(s.pat), desc: 'Холодные синие оттенки' },
  { id: 'c-toxic', name: 'Toxic Waste', mark: 'toxic', a: '#c6ff3d', b: '#0f7a2f', f: P(/Toxic|Venom|Acid|Poison|Hazard|Radiation|Emerald|Green|Jungle|Viper|Serpent|Snake|Cobra|Lime|Nuclear|Atomic|Bio|Leaf|Moss|Forest/i), rare: s => /Emerald|Tiger Tooth|Gamma Doppler|Boreal|Forest/.test(s.pat), desc: 'Ядовито-зелёная коллекция' },
  { id: 'c-mono', name: 'Midnight Mono', mark: 'mono', a: '#9aa0ad', b: '#111218', f: P(/Black|Night|Shadow|Dark|Obsidian|Monochrome|Noir|Carbon|Ink|Graphite|Onyx|Smoke|Phantom|Midnight|Grey|Gray|Silver|Chrome|Steel/i), rare: s => /Night|Black Laminate|Stained|Scorched|Black Pearl|Blue Steel/.test(s.pat), desc: 'Чёрное, серое, стальное' },
  { id: 'c-pistol', name: 'Pistol Party', mark: 'pistol', a: '#ffb347', b: '#ff4e7a', f: s => s.cat === 'pistol', rare: s => s.weapon === 'Butterfly Knife', desc: 'Пистолеты и бабочки' },
  { id: 'c-gold', name: 'Gold Rush', mark: 'gold', a: '#ffe08a', b: '#b5730f', f: s => s.cat === 'rifle' || s.weapon === 'Desert Eagle', rare: s => ['Karambit', 'Butterfly Knife', 'M9 Bayonet'].includes(s.weapon) && /Fade|Doppler|Lore|Tiger Tooth|Marble/.test(s.pat), odds: { classified: .7, covert: .27, rare: .03 }, edge: .88, desc: 'Только топ-редкость' },
  { id: 'c-gloves', name: 'Glove Club', mark: 'gloves', a: '#c69cff', b: '#4b2a8a', f: s => s.cat === 'rifle' || s.cat === 'smg', rare: s => s.cat === 'glove', odds: { milspec: .75, restricted: .17, classified: .05, covert: .02, rare: .01 }, desc: 'Перчатки с шансом 1%' },
  { id: 'c-lottery', name: 'Knife or Nothing', mark: 'knife?', a: '#f0f0f5', b: '#ff375f', f: s => true, rare: s => s.cat === 'knife', odds: { consumer: .6, industrial: .355, rare: .045 }, desc: 'Мусор или нож — 4.5%' },
  { id: 'c-budget', name: 'Budget Box', mark: 'budget', a: '#7ef0ff', b: '#2d8f6f', f: s => true, rare: s => /Safari Mesh|Scorched|Forest DDPAT|Boreal Forest|Urban Masked|Rust Coat/.test(s.pat), odds: { consumer: .5, industrial: .32, milspec: .14, restricted: .03, classified: .007, covert: .002, rare: .001 }, desc: 'Дёшево и сердито' },
];
const CUSTOM = CUSTOM_DEFS.map(d => {
  const pools = {};
  const odds = d.odds || OFFICIAL_ODDS;
  for (const t of TIERS) {
    if (!odds[t]) continue;
    const cand = t === 'rare' ? SK.filter(s => s.star && d.rare(s)) : SK.filter(s => !s.star && s.r === t && s.cat !== 'equip' && d.f(s));
    pools[t] = seededShuffle(cand, d.id + t).slice(0, t === 'rare' ? 24 : 8);
  }
  return finalizeCase({ id: d.id, name: d.name, kind: 'custom', mark: d.mark, a: d.a, b: d.b, desc: d.desc, pools, glow: d.a + '99' }, odds, d.edge || .9);
});
const ALL_CASES = [...CUSTOM, ...OFFICIAL];
const caseById = id => ALL_CASES.find(c => c.id === id);

/* ================= state ================= */
const KEY = 'glassdrop.v1';
const BONUS_CD = 120e3, BONUS_AMT = 15;
const fresh = () => ({ bal: 100, inv: [], hist: [], uid: 1, lastBonus: 0, sound: true, fast: false, stats: { opened: 0, spent: 0, sold: 0, upW: 0, upL: 0, best: null } });
let S;
try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || 'null') || {}); } catch { S = fresh(); }
let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }, 150); };
const invValue = () => r2(S.inv.reduce((a, it) => a + it.p, 0));

function addItem(d, src) {
  const it = { u: S.uid++, s: d.s, f: d.f, st: d.st, p: d.p, t: Date.now(), src };
  S.inv.unshift(it);
  if (!S.stats.best || it.p > S.stats.best.p) S.stats.best = { s: it.s, f: it.f, st: it.st, p: it.p };
  return it;
}
function sellItems(uids) {
  const set = new Set(uids);
  let sum = 0;
  S.inv = S.inv.filter(it => { if (set.has(it.u)) { sum += it.p; return false; } return true; });
  sum = r2(sum);
  if (sum > 0) { S.stats.sold = r2(S.stats.sold + sum); changeBal(sum); SFX.coin(); }
  save();
  return sum;
}

/* ================= sound ================= */
let AC;
const ac = () => { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; };
function tone(f, dur, type = 'sine', vol = .06, when = 0, f2) {
  if (!S.sound) return;
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
};

/* ================= dynamic island ================= */
const island = $('#island');
let islandT;
function notify({ title, sub = '', icon = '', amt = '', tall = false, color = '', amtColor = '' }) {
  const thumb = icon.startsWith('<img');
  island.innerHTML = `${icon ? `<div class="ico ${thumb ? 'thumb' : ''}" style="${color ? `background:${color}` : ''}">${icon}</div>` : ''}<div class="txt"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>${amt ? `<div class="amt" style="color:${amtColor || 'inherit'}">${amt}</div>` : ''}`;
  island.classList.toggle('tall', tall);
  island.classList.add('show');
  clearTimeout(islandT);
  islandT = setTimeout(() => island.classList.remove('show'), 2800);
}

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
function changeBal(d) {
  S.bal = r2(S.bal + d); save(); renderBal();
  balEl.classList.remove('flash-up', 'flash-down'); void balEl.offsetWidth;
  balEl.classList.add(d >= 0 ? 'flash-up' : 'flash-down');
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
bonusBtn.onclick = () => {
  const left = BONUS_CD - (Date.now() - S.lastBonus);
  if (left > 0) { notify({ title: 'Бонус ещё заряжается', sub: `Будет доступен через ${Math.ceil(left / 1000)} c`, icon: ICON.gift, color: 'rgba(255,159,10,.25)' }); return; }
  S.lastBonus = Date.now(); changeBal(BONUS_AMT); SFX.coin();
  notify({ title: 'Бонус получен', sub: 'Следующий — через 2 минуты', icon: ICON.gift, color: 'rgba(48,209,88,.3)', amt: '+' + money(BONUS_AMT), amtColor: '#5ee07f' });
  drawBonus();
};
setInterval(drawBonus, 1000); drawBonus();

const soundBtn = $('#soundBtn');
const drawSound = () => { soundBtn.innerHTML = S.sound ? ICON.sOn : ICON.sOff; };
soundBtn.onclick = () => { S.sound = !S.sound; save(); drawSound(); SFX.click(); };
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

const NAV = [['', 'Кейсы', ICON.cases], ['inventory', 'Инвентарь', ICON.inv], ['upgrade', 'Апгрейд', ICON.up], ['profile', 'Профиль', ICON.user]];
const navHTML = `<span class="pill"></span>` + NAV.map(([r, l, i]) => `<button data-go="#/${r}" data-r="${r}">${i}<span>${l}</span></button>`).join('');
$('#nav').innerHTML = navHTML; $('#dockNav').innerHTML = navHTML;
function updateNav(r) {
  const key = r === 'case' ? '' : r;
  for (const nav of [$('#nav'), $('#dockNav')]) {
    $$('button', nav).forEach(b => b.classList.toggle('on', b.dataset.r === key));
    placePill(nav, false);
  }
}

/* ================= sheets ================= */
function openSheet(html, { narrow = false, acts = {}, onClose } = {}) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="sheet ${narrow ? 'narrow' : ''}"><button class="icon-btn close" data-sact="close">${ICON.x}</button>${html}</div>`;
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
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  scrim.addEventListener('click', e => {
    if (e.target === scrim) return close();
    const go = e.target.closest('[data-go]');
    if (go) { close(); location.hash = go.dataset.go; return; }
    const a = e.target.closest('[data-sact]');
    if (!a) return;
    if (a.dataset.sact === 'close') return close();
    acts[a.dataset.sact] && acts[a.dataset.sact](a, close, e);
  });
  return { el: scrim, close };
}

/* ================= cards ================= */
function caseArt(c, size = '360fx360f') {
  if (c.kind === 'official') return `<img src="${img(c.img, size)}" alt="${esc(c.name)}" loading="lazy">`;
  return `<div class="ccase" style="--a:${c.a};--b:${c.b}"><img src="${img(c.hero.img)}" alt="" loading="lazy"><div class="lock"></div><div class="mark">${esc(c.mark)}</div></div>`;
}
function caseCard(c, i) {
  const badge = c.kind === 'custom' ? '<span class="badge custom">Авторский</span>' : (c.idx < 3 ? '<span class="badge new">New</span>' : '');
  return `<div class="case-card glass-flat" style="--i:${i};--glow:${c.glow}" data-go="#/case/${c.id}">${badge}<div class="art">${caseArt(c)}</div><h3>${esc(c.name)}</h3><div class="meta">${c.kind === 'custom' ? esc(c.desc) : c.count + ' предметов · ' + (c.date || '').slice(0, 4)}</div><span class="price-chip">${money(c.price)}</span></div>`;
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

/* ================= router ================= */
const main = $('#view');
let VIEW = {};
let viewToken = 0;
const ROUTES = { '': viewHome, case: viewCase, inventory: viewInventory, upgrade: viewUpgrade, profile: viewProfile };
let firstRender = true;
async function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const r = ROUTES[parts[0]] ? parts[0] : '';
  updateNav(r);
  viewToken++;
  if (!firstRender) {
    main.style.transition = 'opacity .18s, filter .18s, transform .18s';
    main.style.opacity = 0; main.style.filter = 'blur(6px)'; main.style.transform = 'scale(.995)';
    await sleep(170);
  }
  firstRender = false;
  VIEW.destroy && VIEW.destroy();
  VIEW = {};
  setTint(null);
  main.style.transition = 'none'; main.style.opacity = ''; main.style.filter = ''; main.style.transform = '';
  main.classList.remove('view-enter');
  ROUTES[r](parts[1]);
  void main.offsetWidth;
  main.classList.add('view-enter');
  layoutPills(main);
  window.scrollTo({ top: 0, behavior: 'instant' });
}
window.addEventListener('hashchange', route);

document.addEventListener('click', e => {
  if (e.target.closest('.scrim')) return;
  const sb = e.target.closest('.seg[data-seg] button');
  if (sb) {
    const sg = sb.parentElement;
    $$('button', sg).forEach(b => b.classList.toggle('on', b === sb));
    placePill(sg, false); SFX.click();
    VIEW.onSeg && VIEW.onSeg(sg.dataset.seg, sb.dataset.v);
    return;
  }
  const go = e.target.closest('[data-go]');
  if (go) { const h = go.dataset.go; if (location.hash === h || (h === '#/' && !location.hash)) route(); else location.hash = h; return; }
  const a = e.target.closest('[data-act]');
  if (a && VIEW.act) VIEW.act(a.dataset.act, a, e);
});
document.addEventListener('input', e => VIEW.onInput && VIEW.onInput(e.target));
document.addEventListener('change', e => VIEW.onChange && VIEW.onChange(e.target));

const tintEl = $('#tint');
function setTint(col) { tintEl.style.background = col ? `radial-gradient(70% 55% at 50% 30%, ${col}, transparent 70%)` : 'transparent'; tintEl.style.opacity = col ? .45 : 0; }

/* ================= live ticker ================= */
function tkHTML(h, isNew) {
  const s = SK[h.s];
  return `<div class="tk ${isNew ? 'new' : ''}" style="--rc:${colOf(s)}" title="${esc(fullName(h))} — ${money(h.p)}" ${h.c ? `data-go="#/case/${h.c}"` : ''}><img src="${img(s.img, '128fx128f')}" alt=""><span>${esc(s.pat)}</span></div>`;
}
function tickerHTML() {
  return `<section class="ticker glass-flat" id="ticker"><div class="lbl"><b>Live</b>ваши дропы</div>${S.hist.length ? S.hist.slice(0, 24).map(h => tkHTML(h)).join('') : '<div class="empty">Тут появятся ваши последние дропы — откройте первый кейс ✨</div>'}</section>`;
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
      <h1>Открывай кейсы.<br><span class="grad">Без риска.</span></h1>
      <p>Настоящие скины и кейсы CS2 плюс авторские коллекции. Шансы как в игре, флоат и StatTrak™, свой инвентарь, продажа и апгрейды — всё на виртуальном балансе.</p>
      <div class="actions">
        <button class="btn primary big" data-go="#/case/${feat.id}">Открыть ${esc(feat.name)}</button>
        <button class="btn big" data-act="toCases">Все кейсы</button>
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
  const card = (s, t) => itemCard({ s: s.i, p: evSkin(s) }, { chance: pct(c.odds[t] / c.pools[t].length), priceText: '≈ ' + money(evSkin(s)), wearText: '' });
  main.innerHTML = `
  <section class="case-top glass edge">
    <div class="head">
      <button class="icon-btn" data-go="#/">${ICON.back}</button>
      <div><h1>${esc(c.name)}</h1><div class="ev-note">${c.kind === 'custom' ? 'Авторский кейс · ' + esc(c.desc) : 'Официальный кейс CS2 · ' + (c.date || '')}</div></div>
      <div class="grow"></div>
      <span class="price-chip" style="margin:0">${money(c.price)}</span>
    </div>
    <div class="case-stage" id="stage" style="--glow:${c.glow}"><div class="halo"></div>${caseArt(c, '512fx384f')}</div>
    <div class="rolls" id="rolls" hidden></div>
    <div class="open-bar">
      ${seg('n', [1, 2, 3, 4, 5].map(n => [String(n), '×' + n]), String(C.n))}
      <button class="btn primary big" id="openBtn" data-act="open"></button>
      <label class="toggle" data-act="fast"><span class="switch ${S.fast ? 'on' : ''}" id="fastSw"></span>Быстро</label>
    </div>
  </section>
  <div class="section-head">
    <h2>Содержимое</h2>
    <div class="contents-legend">${order.filter(t => c.odds[t]).map(t => `<span class="odds-pill" style="--rc:${TIER_COL[t]}"><i></i>${TIER_RU[t]} · ${pct(c.odds[t])}</span>`).join('')}</div>
    <div class="grow"></div><span class="ev-note">Средний возврат ≈ ${Math.round(c.ev / c.price * 100)}% от цены кейса</span>
  </div>
  <div class="grid-items stagger">
    ${rare.length ? `<div class="item gold-card" style="--i:0" data-act="toRare"><span class="chance">${pct(c.odds.rare)}</span><div class="img">★</div><div class="wpn">Редкий особый предмет</div><div class="pat">${c.pools.rare.some(s => s.cat === 'glove') && c.pools.rare.some(s => s.cat === 'knife') ? 'Ножи и перчатки' : c.pools.rare.some(s => s.cat === 'glove') ? 'Перчатки' : 'Ножи'}</div><div class="row"><span class="pr">${rare.length} вариантов</span></div></div>` : ''}
    ${items.map(({ s, t }, i) => card(s, t).replace('--i:0', '--i:' + (i + 1))).join('')}
  </div>
  ${rare.length ? `<div class="section-head" id="rareHead"><h2 style="color:var(--gold)">★ Редкие предметы</h2><span class="sub">${pct(c.odds.rare)} на весь список</span></div>
  <div class="grid-items">${rare.map(s => card(s, 'rare')).join('')}</div>` : ''}`;
  const drawBtn = () => { const b = $('#openBtn'); if (b) b.innerHTML = `Открыть ${C.n > 1 ? C.n + ' шт. ' : ''}за ${money(r2(c.price * C.n))}`; };
  drawBtn();
  VIEW = {
    onSeg(n, v) { if (n === 'n') { C.n = +v; drawBtn(); } },
    act(a, el, e) {
      if (a === 'open') openCase(c, C.n);
      if (a === 'fast') { e.preventDefault(); S.fast = !S.fast; save(); $('#fastSw').classList.toggle('on', S.fast); SFX.click(); }
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

async function openCase(c, n) {
  if (busy) return;
  const cost = r2(c.price * n);
  if (S.bal < cost) {
    SFX.fail();
    notify({ title: 'Недостаточно средств', sub: `Нужно ${money(cost)} — заберите бонус или продайте предметы`, icon: '!', color: 'rgba(255,69,58,.35)' });
    const b = $('#openBtn'); b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 380 });
    return;
  }
  busy = true;
  const token = viewToken;
  changeBal(-cost);
  S.stats.opened += n; S.stats.spent = r2(S.stats.spent + cost);
  const drops = Array.from({ length: n }, () => rollDrop(c));
  const its = drops.map(d => addItem(d, 'case'));
  drops.forEach(d => { S.hist.unshift({ s: d.s, f: d.f, st: d.st, p: d.p, t: Date.now(), c: c.id }); });
  S.hist = S.hist.slice(0, 60);
  save();
  SFX.open();
  $('#openBtn').disabled = true;

  const stage = $('#stage'), rolls = $('#rolls');
  stage.classList.add('out');
  await sleep(380);
  if (token !== viewToken) { busy = false; announce(drops); return; }
  stage.hidden = true;
  rolls.hidden = false;
  rolls.classList.toggle('multi', n > 1);
  rolls.innerHTML = drops.map(() => `<div class="roll"><div class="strip"></div><div class="marker"></div></div>`).join('');
  await Promise.all(drops.map((d, k) => spin($$('.roll', rolls)[k], c, d, k)));
  busy = false;
  if (token !== viewToken) { announce(drops); return; }
  const best = drops.reduce((a, d) => TIERS.indexOf(d.tier) > TIERS.indexOf(a.tier) ? d : a, drops[0]);
  SFX.win(best.tier);
  showWin(c, its, n);
}
function announce(drops) {
  const best = drops.reduce((a, d) => d.p > a.p ? d : a, drops[0]);
  const s = SK[best.s];
  notify({ title: fullName(best), sub: drops.length > 1 ? `и ещё ${drops.length - 1} — в инвентаре` : 'Добавлено в инвентарь', icon: `<img src="${img(s.img, '128fx128f')}">`, amt: money(best.p), tall: true });
}

function spin(roll, c, drop, k) {
  return new Promise(res => {
    const N = 62, WIN = 52;
    const items = Array.from({ length: N }, (_, i) => i === WIN ? drop : fakeRoll(c));
    const strip = $('.strip', roll);
    strip.innerHTML = items.map(rcHTML).join('');
    const card = strip.children[0];
    const cw = card.offsetWidth + 8;
    const W = roll.clientWidth;
    const jitter = (Math.random() - .5) * (cw - 24);
    const target = -(WIN * cw + (cw - 8) / 2 - W / 2 + jitter);
    const dur = (S.fast ? 1500 : 6400) + k * (S.fast ? 120 : 260);
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
      if (s.star) { w.outerHTML = `<div class="rc win" style="--rc:${TIER_COL.rare}"><img src="${img(s.img, '200fx200f')}" alt=""><span>${esc(s.pat)}</span></div>`; }
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
function showWin(c, its, n) {
  const total = () => r2(its.filter(it => S.inv.some(x => x.u === it.u)).reduce((a, it) => a + it.p, 0));
  const sh = openSheet(`
    <h2>${its.length > 1 ? 'Ваши дропы' : 'Вам выпало!'}</h2>
    <div class="subtitle">${esc(c.name)}</div>
    <div class="win-grid">${its.map((it, i) => winCardHTML(it, i, its.length === 1)).join('')}</div>
    <div class="total-line">Стоимость дропа: <b id="winTotal">${money(total())}</b> · кейсы: ${money(r2(c.price * n))}</div>
    <div class="acts">
      <button class="btn green" data-sact="sellAll" id="sellAllBtn">Продать всё</button>
      <button class="btn primary" data-sact="again">Ещё раз · ${money(r2(c.price * n))}</button>
      <button class="btn" data-sact="close">В инвентарь</button>
    </div>`, {
    acts: {
      sellOne(b) {
        const u = +b.dataset.u; const sum = sellItems([u]);
        if (!sum) return;
        b.closest('.win-card').classList.add('sold'); b.disabled = true; b.textContent = 'Продано';
        $('#winTotal').textContent = money(total());
        notify({ title: 'Продано', amt: '+' + money(sum), amtColor: '#5ee07f', icon: '$', color: 'rgba(48,209,88,.3)' });
      },
      sellAll(b, close) {
        const sum = sellItems(its.map(i => i.u));
        if (sum) notify({ title: `Продано ${its.length > 1 ? 'всё' : ''}`, amt: '+' + money(sum), amtColor: '#5ee07f', icon: '$', color: 'rgba(48,209,88,.3)' });
        close();
      },
      again(b, close) { close(); setTimeout(() => openCase(c, n), 250); },
    },
    onClose: () => resetStage(),
  });
  its.forEach(it => pushTicker(it));
}
function resetStage() {
  const stage = $('#stage'), rolls = $('#rolls'), b = $('#openBtn');
  if (!stage) return;
  rolls.hidden = true; rolls.innerHTML = '';
  stage.hidden = false; stage.classList.remove('out');
  if (b) b.disabled = false;
}

/* ================= item detail ================= */
function showItem(it, { onSell } = {}) {
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
      <div><span>Получен</span><b>${new Date(it.t).toLocaleDateString('ru-RU')}</b></div>
    </div>
    <div class="acts">
      <button class="btn green" data-sact="sell">Продать за ${money(it.p)}</button>
      <button class="btn" data-sact="upg">В апгрейд</button>
    </div>`, {
    narrow: true,
    acts: {
      sell(b, close) { const sum = sellItems([it.u]); if (sum) notify({ title: 'Продано', sub: fullName(it), amt: '+' + money(sum), amtColor: '#5ee07f', icon: `<img src="${img(s.img, '128fx128f')}">`, tall: true }); close(); onSell && onSell(); },
      upg(b, close) { U.sel = new Set([it.u]); U.target = null; close(); location.hash = '#/upgrade'; },
    },
  });
}

/* ================= INVENTORY ================= */
const I = { f: 'all', q: '', sort: 'new', select: false, sel: new Set(), limit: 120 };
const INV_FILTERS = [['all', 'Все'], ['rare', '★'], ['covert', 'Тайные'], ['classified', 'Засекр.'], ['restricted', 'Запрещ.'], ['milspec', 'Армейские'], ['low', 'Прочие']];
function invList() {
  const q = I.q.trim().toLowerCase();
  let l = S.inv.filter(it => {
    const s = SK[it.s];
    const t = s.star ? 'rare' : s.r === 'contraband' ? 'covert' : s.r;
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
    act(a, el) {
      if (a === 'item') {
        const u = +el.dataset.u;
        if (I.select) { I.sel.has(u) ? I.sel.delete(u) : I.sel.add(u); el.classList.toggle('sel'); drawBar(); SFX.click(); }
        else { const it = S.inv.find(x => x.u === u); if (it) showItem(it, { onSell: drawInv }); }
      }
      if (a === 'selMode') { I.select = !I.select; I.sel.clear(); drawInv(); }
      if (a === 'selClear') { I.select = false; I.sel.clear(); drawInv(); }
      if (a === 'more') { I.limit += 240; drawInv(); }
      if (a === 'sellSel') {
        const uids = [...I.sel];
        $$('#invGrid .item.sel').forEach(e => e.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.8)' }], { duration: 300, fill: 'forwards', easing: 'ease-in' }));
        setTimeout(() => {
          const sum = sellItems(uids);
          notify({ title: `Продано предметов: ${uids.length}`, amt: '+' + money(sum), amtColor: '#5ee07f', icon: '$', color: 'rgba(48,209,88,.3)' });
          I.sel.clear(); I.select = false; drawInv();
        }, 280);
      }
      if (a === 'sellAll') {
        if (!S.inv.length) return;
        const v = invValue(), n = S.inv.length;
        openSheet(`<h2>Продать весь инвентарь?</h2><div class="subtitle">${n} предм. на сумму ${money(v)}</div><div class="acts"><button class="btn" data-sact="close">Отмена</button><button class="btn green" data-sact="ok">Продать за ${money(v)}</button></div>`, {
          narrow: true,
          acts: { ok(b, close) { const sum = sellItems(S.inv.map(i => i.u)); notify({ title: 'Инвентарь продан', amt: '+' + money(sum), amtColor: '#5ee07f', icon: '$', color: 'rgba(48,209,88,.3)' }); close(); drawInv(); } },
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
      if (s.star && ok.includes('FN')) MARKET.push({ s: s.i, code: 'FN', p: priceWear(s, 'FN', false) });
      if (ok.includes('MW') && !s.star) MARKET.push({ s: s.i, code: 'MW', p: priceWear(s, 'MW', false) });
    }
    MARKET.push({ s: s.i, code, p: priceWear(s, code, false) });
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
        U.tab = 'tgt'; $$('[data-seg="tab"] button').forEach(b => b.classList.toggle('on', b.dataset.v === 'tgt')); drawUpg(); layoutPills(main, false);
      }
      if (a === 'go') doUpgrade();
    },
  };
}
function drawUpg() {
  const items = S.inv.filter(i => U.sel.has(i.u));
  const si = $('#slotIn'), so = $('#slotOut');
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
  const ch = chanceOf();
  if (!ch || U.busy) return;
  U.busy = true;
  const tgt = U.target, inputs = [...U.sel];
  const win = crand() < ch;
  const deg = win ? 360 * ch * (.08 + .84 * Math.random()) : 360 * ch + (360 - 360 * ch) * (.06 + .88 * Math.random());
  const needle = $('#needle'), ring = $('#ring');
  $('#upBtn').disabled = true;
  ring.classList.remove('win', 'lose');
  const total = 360 * 5 + deg;
  const anim = needle.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${total}deg)` }], { duration: 4600, easing: 'cubic-bezier(.12,.7,.08,1)', fill: 'forwards' });
  let lastSeg = 0, run = true;
  const tickLoop = () => { if (!run) return; const m = new DOMMatrixReadOnly(getComputedStyle(needle).transform); const a = Math.atan2(m.b, m.a); const sg = Math.floor((a + Math.PI) / (Math.PI / 12)); if (sg !== lastSeg) { SFX.tick(); lastSeg = sg; } requestAnimationFrame(tickLoop); };
  requestAnimationFrame(tickLoop);
  // resolve state immediately (so leaving the page can't change the result)
  S.inv = S.inv.filter(i => !inputs.includes(i.u));
  let got = null;
  if (win) {
    const s = SK[tgt.s];
    let f = null;
    if (tgt.code) { const w = wearByCode(tgt.code); const lo = Math.max(w[3], s.mn), hi = Math.min(w[4], s.mx); f = +(lo + (hi - lo) * crand() * .999).toFixed(9); }
    got = addItem({ s: s.i, f, st: false, p: priceOf(s, f, false) }, 'upgrade');
    S.stats.upW++;
  } else S.stats.upL++;
  save();
  await sleep(4700);
  run = false;
  U.busy = false; U.sel = new Set(); U.target = null;
  if (!$('#ring')) { if (got) notify({ title: 'Апгрейд успешен', sub: fullName(got), icon: `<img src="${img(SK[got.s].img, '128fx128f')}">`, amt: money(got.p), tall: true }); return; }
  ring.classList.add(win ? 'win' : 'lose');
  if (win) {
    SFX.win(SK[got.s].star ? 'rare' : SK[got.s].r);
    notify({ title: 'Апгрейд успешен!', sub: fullName(got), icon: `<img src="${img(SK[got.s].img, '128fx128f')}">`, amt: money(got.p), amtColor: '#5ee07f', tall: true });
  } else {
    SFX.fail();
    notify({ title: 'Не повезло', sub: 'Предметы сгорели в апгрейде', icon: '✕', color: 'rgba(255,69,58,.35)' });
  }
  await sleep(1600);
  if (!$('#ring')) return;
  anim.cancel();
  drawUpg();
}

/* ================= PROFILE ================= */
function viewProfile() {
  const st = S.stats, b = st.best;
  main.innerHTML = `
  <div class="stats stagger">
    <div class="stat-tile glass-flat" style="--i:0"><span>Баланс</span><b>${money(S.bal)}</b></div>
    <div class="stat-tile glass-flat" style="--i:1"><span>Стоимость инвентаря</span><b>${money(invValue())}</b></div>
    <div class="stat-tile glass-flat" style="--i:2"><span>Открыто кейсов</span><b>${st.opened}</b></div>
    <div class="stat-tile glass-flat" style="--i:3"><span>Потрачено на кейсы</span><b>${money(st.spent)}</b></div>
    <div class="stat-tile glass-flat" style="--i:4"><span>Продано предметов на</span><b>${money(st.sold)}</b></div>
    <div class="stat-tile glass-flat" style="--i:5"><span>Апгрейды (успех / провал)</span><b><span style="color:var(--green)">${st.upW}</span> / <span style="color:var(--red)">${st.upL}</span></b></div>
  </div>
  <div class="section-head"><h2>Лучший дроп</h2></div>
  ${b ? `<div style="max-width:340px">${itemCard(b, { attr: '' })}</div>` : '<div class="ev-note" style="margin-left:4px">Пока пусто</div>'}
  <div class="section-head"><h2>История открытий</h2><span class="sub">последние ${Math.min(S.hist.length, 60)}</span></div>
  <div class="list glass-flat">${S.hist.length ? S.hist.map(h => { const s = SK[h.s]; const c = caseById(h.c); return `<div class="li" style="--rc:${colOf(s)}"><div class="dot"></div><img src="${img(s.img, '128fx128f')}" alt="" loading="lazy"><div class="t"><b>${esc(fullName(h))}</b><span>${c ? esc(c.name) + ' · ' : ''}${new Date(h.t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div><div class="p">${money(h.p)}</div></div>`; }).join('') : '<div class="li"><div class="t"><span>Вы ещё ничего не открывали</span></div></div>'}</div>
  <div class="section-head"><h2>Настройки</h2></div>
  <div class="list glass-flat settings">
    <div class="li"><div class="t"><b>Звуки</b><span>Щелчки рулетки, звук выигрыша</span></div><span class="switch ${S.sound ? 'on' : ''}" data-act="snd"></span></div>
    <div class="li"><div class="t"><b>Быстрое открытие</b><span>Рулетка крутится ~1.5 секунды</span></div><span class="switch ${S.fast ? 'on' : ''}" data-act="fast"></span></div>
    <div class="li"><div class="t"><b>Сбросить прогресс</b><span>Баланс $100, пустой инвентарь и статистика</span></div><button class="btn danger sm" data-act="reset">Сбросить</button></div>
  </div>`;
  VIEW = {
    act(a, el) {
      if (a === 'snd') { S.sound = !S.sound; save(); el.classList.toggle('on', S.sound); drawSound(); SFX.click(); }
      if (a === 'fast') { S.fast = !S.fast; save(); el.classList.toggle('on', S.fast); SFX.click(); }
      if (a === 'reset') openSheet(`<h2>Сбросить всё?</h2><div class="subtitle">Инвентарь, баланс и статистика будут удалены без возможности восстановления.</div><div class="acts"><button class="btn" data-sact="close">Отмена</button><button class="btn danger" data-sact="ok">Сбросить</button></div>`, {
        narrow: true,
        acts: { ok(b, close) { const snd = S.sound; S = fresh(); S.sound = snd; save(); renderBal(); close(); notify({ title: 'Прогресс сброшен', sub: 'Баланс: $100.00', icon: '↺', color: 'rgba(10,132,255,.35)' }); route(); } },
      });
    },
  };
}

/* ================= boot ================= */
route();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layoutPills(document));
if (!localStorage.getItem(KEY)) { save(); setTimeout(() => notify({ title: 'Добро пожаловать!', sub: 'На балансе $100 — открывайте кейсы', icon: ICON.gift, color: 'rgba(10,132,255,.35)' }), 900); }
window.GD = { S, SK, ALL_CASES, priceOf, evSkin };
})();
