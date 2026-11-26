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
// any image that fails to load (Steam CDN hiccup) gets a neutral placeholder instead of a broken icon
const IMG_PH = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48"><path d="M8 30l10-14h22l6 6h10v8H40l-4 6H22l-4 6H8z" fill="#ffffff22"/></svg>');
document.addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG' && !t.dataset.fb) { t.dataset.fb = 1; t.src = IMG_PH; } }, true);
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
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>'),
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
  quest: svg('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  climb: svg('<path d="M3 20h4v-4h4v-4h4V8h4V4h2"/>'),
  bot: svg('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 13h.01M15 13h.01M9 17h6"/>'),
};

/* ================= hand-drawn colour icons (SVG sprite) ================= */
const GI_SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<linearGradient id="gd-org" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc061"/><stop offset=".55" stop-color="#ff7a1a"/><stop offset="1" stop-color="#d9480f"/></linearGradient>
<linearGradient id="gd-org2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset=".6" stop-color="#ff8f2a"/><stop offset="1" stop-color="#e2561a"/></linearGradient>
<radialGradient id="gd-glow" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#fff7b0"/><stop offset=".6" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff9a00"/></radialGradient>
<linearGradient id="gd-stem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a5d867"/><stop offset="1" stop-color="#3e6b1f"/></linearGradient>
<linearGradient id="gd-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".45" stop-color="#f2b632"/><stop offset="1" stop-color="#a86a00"/></linearGradient>
<linearGradient id="gd-steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#c9d3dd"/><stop offset="1" stop-color="#6f7c8a"/></linearGradient>
<linearGradient id="gd-violet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8b8ff"/><stop offset=".5" stop-color="#9b5cff"/><stop offset="1" stop-color="#5a24c7"/></linearGradient>
<linearGradient id="gd-blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a8e2ff"/><stop offset=".5" stop-color="#3f9dff"/><stop offset="1" stop-color="#1f4fd1"/></linearGradient>
<linearGradient id="gd-green" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a6f7b9"/><stop offset=".5" stop-color="#34c759"/><stop offset="1" stop-color="#16803a"/></linearGradient>
<linearGradient id="gd-red" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9e8f"/><stop offset=".5" stop-color="#ff453a"/><stop offset="1" stop-color="#b3161b"/></linearGradient>
<linearGradient id="gd-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d3546"/><stop offset="1" stop-color="#141118"/></linearGradient>
<linearGradient id="gd-fire" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd23f"/><stop offset=".5" stop-color="#ff7a1a"/><stop offset="1" stop-color="#e0302a"/></linearGradient>
<radialGradient id="gd-rareglow"><stop offset="0" stop-color="#ffd36a" stop-opacity=".55"/><stop offset=".6" stop-color="#e4ae39" stop-opacity=".18"/><stop offset="1" stop-color="#e4ae39" stop-opacity="0"/></radialGradient>
<linearGradient id="gd-steamb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#111d2e"/><stop offset=".212" stop-color="#051839"/><stop offset=".407" stop-color="#0a1b48"/><stop offset=".581" stop-color="#132e62"/><stop offset=".738" stop-color="#144b7e"/><stop offset=".873" stop-color="#136497"/><stop offset="1" stop-color="#1387b8"/></linearGradient>
<linearGradient id="gd-holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7ad7ff"/><stop offset=".35" stop-color="#b79bff"/><stop offset=".7" stop-color="#ff8ad8"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
</defs>
<symbol id="gi-pumpkin" viewBox="0 0 32 32">
  <path d="M15.2 8.6c-.6-2.8.1-4.9 2.2-6.1l1.5 1.4c-1.5 1-1.9 2.6-1.4 4.8z" fill="url(#gd-stem)"/>
  <path d="M18.3 4.4c2.4-2 5.4-1.8 6.9 0-2.3 1.2-4.6 1.2-6.9 0z" fill="#6fae34"/>
  <ellipse cx="9.6" cy="19" rx="7.4" ry="9.6" fill="url(#gd-org)"/>
  <ellipse cx="22.4" cy="19" rx="7.4" ry="9.6" fill="url(#gd-org)"/>
  <ellipse cx="16" cy="18.8" rx="7.8" ry="10.2" fill="url(#gd-org2)"/>
  <path d="M11.4 9.6c-2 5.2-2 13.4 0 18.6M20.6 9.6c2 5.2 2 13.4 0 18.6" stroke="#a63a00" stroke-opacity=".45" stroke-width=".9" fill="none"/>
  <path d="M9.6 16.6l2.6-3.8 2.5 3.8zM17.3 16.6l2.5-3.8 2.6 3.8zM15 19.4l1-1.5 1 1.5z" fill="url(#gd-glow)" stroke="#5a1d00" stroke-width=".7" stroke-linejoin="round"/>
  <path d="M9.2 21.4c4.4 4.3 9.2 4.3 13.6 0l-1.8.3-.9 1.5-1.5-1.1-1.3 1.6-1.3-1.6-1.3 1.6-1.3-1.6-1.5 1.1-.9-1.5z" fill="url(#gd-glow)" stroke="#5a1d00" stroke-width=".7" stroke-linejoin="round"/>
  <path d="M6.4 15c.5-2.6 1.6-4.3 3-5.2" stroke="#fff" stroke-opacity=".6" stroke-width="1.4" stroke-linecap="round" fill="none"/>
</symbol>
<symbol id="gi-bf" viewBox="0 0 32 32">
  <path d="M3.5 6.2A2.7 2.7 0 0 1 6.2 3.5h9.6c.7 0 1.4.3 1.9.8l10.5 10.5a2.7 2.7 0 0 1 0 3.8l-9.7 9.7a2.7 2.7 0 0 1-3.8 0L4.3 17.7c-.5-.5-.8-1.2-.8-1.9z" fill="url(#gd-dark)" stroke="url(#gd-org)" stroke-width="1.6"/>
  <circle cx="9.3" cy="9.3" r="2.1" fill="none" stroke="url(#gd-org)" stroke-width="1.6"/>
  <circle cx="14.6" cy="15.2" r="1.7" fill="none" stroke="#ffb347" stroke-width="1.5"/>
  <circle cx="20.4" cy="21" r="1.7" fill="none" stroke="#ffb347" stroke-width="1.5"/>
  <path d="M21.4 14.2l-7.8 7.8" stroke="#ff7a1a" stroke-width="1.8" stroke-linecap="round"/>
</symbol>
<symbol id="gi-sticker" viewBox="0 0 32 32">
  <path d="M7 3.5h18A3.5 3.5 0 0 1 28.5 7v11L18 28.5H7A3.5 3.5 0 0 1 3.5 25V7A3.5 3.5 0 0 1 7 3.5z" fill="url(#gd-holo)"/>
  <path d="M28.5 18H21a3 3 0 0 0-3 3v7.5z" fill="#f4f1ff"/>
  <path d="M28.5 18 18 28.5" stroke="#000" stroke-opacity=".25"/>
  <path d="M14 8l1.7 3.5 3.8.5-2.8 2.6.7 3.8-3.4-1.9-3.4 1.9.7-3.8L8.5 12l3.8-.5z" fill="#fff" fill-opacity=".92"/>
  <path d="M6.5 8.5c.3-1.3 1-2 2.2-2.3" stroke="#fff" stroke-opacity=".7" stroke-width="1.3" stroke-linecap="round" fill="none"/>
</symbol>
<symbol id="gi-knife" viewBox="0 0 32 32">
  <path d="M27.9 3.2 12.4 18.2l2.6 2.6L29.2 6.6c1-1 .6-2.7-1.3-3.4z" fill="url(#gd-steel)" stroke="#4b5560" stroke-width=".6"/>
  <path d="M27.4 4.6 13.9 17.9" stroke="#fff" stroke-opacity=".85" stroke-width=".8"/>
  <path d="M10.2 16.6l1.6-1.6 6.4 6.4-1.6 1.6z" fill="url(#gd-gold)"/>
  <path d="M13.2 21.3 6.2 28.3a2 2 0 0 1-2.9-2.9l7-7z" fill="url(#gd-dark)" stroke="#ff8a1f" stroke-width=".9"/>
  <circle cx="4.4" cy="27.3" r="1.8" fill="url(#gd-gold)"/>
</symbol>
<symbol id="gi-sparkle" viewBox="0 0 32 32">
  <path d="M13.5 2.5c1 6.8 2.9 8.8 9.6 9.7-6.7 1-8.6 2.9-9.6 9.7-1-6.8-2.9-8.7-9.6-9.7 6.7-.9 8.6-2.9 9.6-9.7z" fill="url(#gd-violet)"/>
  <path d="M24.5 18.5c.5 2.8 1.3 3.6 4 4-2.7.5-3.5 1.3-4 4-.4-2.7-1.2-3.5-4-4 2.8-.4 3.6-1.2 4-4z" fill="url(#gd-gold)"/>
  <circle cx="7" cy="25" r="1.6" fill="#c69bff"/>
</symbol>
<symbol id="gi-flame" viewBox="0 0 32 32">
  <path d="M16 2.5c1 4.6 6.6 7.1 8.9 12.6 2.5 6-1.5 13.4-8.9 13.4S4.6 21.8 7.1 15.6c1-2.4 2.8-3.7 3.7-6.1 1 2 1 3.9 2.4 5.1C13.7 10.2 14 6 16 2.5z" fill="url(#gd-fire)"/>
  <path d="M16 14.8c.8 2.7 4.4 3.9 4.4 7.6a4.4 4.4 0 0 1-8.8 0c0-2.1 1.3-3.1 2.1-4.6.6 1 .9 1.9 1.8 2.3-.2-1.9 0-3.5.5-5.3z" fill="#ffe36b"/>
</symbol>
<symbol id="gi-calendar" viewBox="0 0 32 32">
  <rect x="3.5" y="6" width="25" height="22.5" rx="4.5" fill="url(#gd-dark)" stroke="#fff" stroke-opacity=".22"/>
  <path d="M3.5 10.5A4.5 4.5 0 0 1 8 6h16a4.5 4.5 0 0 1 4.5 4.5V13h-25z" fill="url(#gd-org)"/>
  <rect x="9" y="2.8" width="2.6" height="6.4" rx="1.3" fill="#ece6f3"/><rect x="20.4" y="2.8" width="2.6" height="6.4" rx="1.3" fill="#ece6f3"/>
  <path d="M10.8 20.3l3.3 3.3 7-7.3" stroke="#5ee07f" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</symbol>
<symbol id="gi-coins" viewBox="0 0 32 32">
  <path d="M3 22.5v3c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5v-3z" fill="#b07408"/><ellipse cx="11.5" cy="22.5" rx="8.5" ry="3.3" fill="url(#gd-gold)"/>
  <path d="M3 17.5v3c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5v-3z" fill="#c4860f"/><ellipse cx="11.5" cy="17.5" rx="8.5" ry="3.3" fill="url(#gd-gold)"/>
  <circle cx="22" cy="11" r="7.5" fill="url(#gd-gold)" stroke="#a86a00" stroke-width=".8"/>
  <circle cx="22" cy="11" r="5.3" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".9"/>
  <text x="22" y="14.4" font-size="9.5" font-weight="900" font-family="system-ui,sans-serif" text-anchor="middle" fill="#7a4a00">$</text>
</symbol>
<symbol id="gi-crate" viewBox="0 0 32 32">
  <path d="M16 3 28.5 9.3v13.4L16 29 3.5 22.7V9.3z" fill="url(#gd-violet)"/>
  <path d="M16 3 28.5 9.3 16 15.6 3.5 9.3z" fill="#fff" fill-opacity=".25"/>
  <path d="M3.5 9.3 16 15.6l12.5-6.3M16 15.6V29" stroke="#fff" stroke-opacity=".45" stroke-width="1" fill="none" stroke-linejoin="round"/>
  <path d="M9.6 6.2l12.6 6.3v5.2l-2.6 1.3v-5.2L7 7.5z" fill="url(#gd-org)"/>
</symbol>
<symbol id="gi-upgrade" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="13" fill="url(#gd-green)"/>
  <circle cx="16" cy="16" r="12.2" fill="none" stroke="#fff" stroke-opacity=".35"/>
  <path d="M16 23.2V9.6M10.4 15 16 9.4l5.6 5.6" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</symbol>
<symbol id="gi-swords" viewBox="0 0 32 32">
  <path d="M4.5 4.5l15.2 15.2M27.5 4.5 12.3 19.7" stroke="url(#gd-steel)" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M17 23.6l6.6-6.6M8.4 17l6.6 6.6" stroke="url(#gd-gold)" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M22 22l4.2 4.2M10 22l-4.2 4.2" stroke="#7a3d16" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="27" cy="27" r="2" fill="url(#gd-gold)"/><circle cx="5" cy="27" r="2" fill="url(#gd-gold)"/>
</symbol>
<symbol id="gi-trophy" viewBox="0 0 32 32">
  <path d="M9 6.5H4.8v2.4a4.8 4.8 0 0 0 4.8 4.8M23 6.5h4.2v2.4a4.8 4.8 0 0 1-4.8 4.8" stroke="#e8a317" stroke-width="2.2" fill="none"/>
  <path d="M8.5 3.5h15v7.8a7.5 7.5 0 0 1-15 0z" fill="url(#gd-gold)"/>
  <path d="M14.3 18.4h3.4v4.2h-3.4z" fill="#c4860f"/>
  <rect x="9.5" y="22.5" width="13" height="6" rx="1.8" fill="url(#gd-dark)" stroke="#e8a317" stroke-width="1"/>
  <path d="M12.2 6v4.5" stroke="#fff" stroke-opacity=".75" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M16 6.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="#fff8d6"/>
</symbol>
<symbol id="gi-gift" viewBox="0 0 32 32">
  <rect x="5" y="13" width="22" height="15.5" rx="2.5" fill="url(#gd-red)"/>
  <rect x="3.5" y="9.5" width="25" height="5" rx="2" fill="#ff7b6e"/>
  <rect x="14" y="9.5" width="4" height="19" fill="url(#gd-gold)"/>
  <path d="M16 9.5c-1.8-5.2-7.6-6.4-7.6-2.8 0 2.2 3.8 2.8 7.6 2.8zM16 9.5c1.8-5.2 7.6-6.4 7.6-2.8 0 2.2-3.8 2.8-7.6 2.8z" fill="url(#gd-gold)"/>
</symbol>
<symbol id="gi-search" viewBox="0 0 32 32">
  <path d="M20.3 20.3l7.2 7.2" stroke="url(#gd-org)" stroke-width="4.4" stroke-linecap="round"/>
  <circle cx="13.5" cy="13.5" r="9" fill="#3f9dff" fill-opacity=".28" stroke="url(#gd-blue)" stroke-width="3"/>
  <path d="M8.8 11.5a5 5 0 0 1 3.6-3.6" stroke="#fff" stroke-opacity=".8" stroke-width="1.6" stroke-linecap="round" fill="none"/>
</symbol>
<symbol id="gi-bag" viewBox="0 0 32 32">
  <path d="M11.5 8V6.5a4.5 4.5 0 0 1 9 0V8" stroke="#c69bff" stroke-width="2.2" fill="none"/>
  <path d="M6.5 13.5A6 6 0 0 1 12.5 7.5h7a6 6 0 0 1 6 6v12a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3z" fill="url(#gd-violet)"/>
  <rect x="10" y="17" width="12" height="7.5" rx="2.2" fill="#fff" fill-opacity=".2" stroke="#fff" stroke-opacity=".35"/>
  <rect x="14.6" y="15.6" width="2.8" height="3.6" rx="1" fill="url(#gd-gold)"/>
  <path d="M9.5 12.5c.5-1.6 1.6-2.4 3-2.6" stroke="#fff" stroke-opacity=".6" stroke-width="1.4" stroke-linecap="round" fill="none"/>
</symbol>
<symbol id="gi-globe" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="12.5" fill="url(#gd-blue)"/>
  <ellipse cx="16" cy="16" rx="5.4" ry="12.5" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/>
  <path d="M3.5 16h25M5.5 9.5h21M5.5 22.5h21" stroke="#fff" stroke-opacity=".4" stroke-width="1.2"/>
  <circle cx="25" cy="25" r="5" fill="url(#gd-red)" stroke="#1b1020" stroke-width="1.4"/>
  <path d="M23.2 23.2l3.6 3.6M26.8 23.2l-3.6 3.6" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
</symbol>
<symbol id="gi-rareknife" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="13" fill="url(#gd-rareglow)"/>
  <path d="M12.2 18.6L24.6 5.2c1.3-1.2 3.2-.6 2.7 1.3-.3 1.1-1 2-1.8 2.9L14.9 21.2z" fill="url(#gd-gold)" stroke="#7a4f00" stroke-width=".6" stroke-linejoin="round"/>
  <path d="M14.2 18.4l11.2-11.9" stroke="#fff6cf" stroke-width=".9" stroke-linecap="round" opacity=".85"/>
  <path d="M9.4 16.6l6.8 6.8" stroke="url(#gd-gold)" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M11.6 21.2l-6 6" stroke="#b07a14" stroke-width="3.8" stroke-linecap="round"/>
  <path d="M10.4 22.4l-4 4" stroke="#ffe39a" stroke-width="1" stroke-dasharray="1.2 1.2" stroke-linecap="round"/>
  <circle cx="4.9" cy="27.9" r="1.7" fill="url(#gd-gold)" stroke="#7a4f00" stroke-width=".5"/>
  <path d="M7 6.5l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6zM26 20l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="#fff3c4"/>
</symbol>
<symbol id="gi-rareglove" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="13" fill="url(#gd-rareglow)"/>
  <path d="M10.6 25.5V16.8l-2.8-3c-.9-1-.8-2.3.1-3 .9-.7 2-.5 2.8.3l1.9 2V7.6c0-1 .7-1.7 1.6-1.7s1.6.7 1.6 1.7v5.2V5.8c0-1 .7-1.7 1.6-1.7s1.6.7 1.6 1.7v7V6.9c0-1 .7-1.7 1.6-1.7s1.6.7 1.6 1.7v6.4V9.4c0-.9.7-1.6 1.5-1.6s1.5.7 1.5 1.6v8.4c0 3.3-1.2 5.8-3.6 7.7z" fill="url(#gd-gold)" stroke="#7a4f00" stroke-width=".6" stroke-linejoin="round"/>
  <path d="M13.8 12.8v3.6M17 12.8v3.6M20.2 13.3v3.1" stroke="#8a5a00" stroke-width=".7" stroke-linecap="round" opacity=".7"/>
  <rect x="9.8" y="24.6" width="12.8" height="4.4" rx="1.4" fill="#b07a14" stroke="#7a4f00" stroke-width=".5"/>
  <path d="M11 26.8h10.4" stroke="#ffe39a" stroke-width=".8" stroke-dasharray="1.3 1.1"/>
  <path d="M12.6 8.4c.3-.9 1-1.3 1.6-1.2" stroke="#fff6cf" stroke-width=".8" stroke-linecap="round" fill="none"/>
  <path d="M26.5 4.5l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6zM5 21l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="#fff3c4"/>
</symbol>
<symbol id="gi-potion" viewBox="0 0 32 32">
  <rect x="12.2" y="2.5" width="7.6" height="4" rx="1.4" fill="#a0673a"/>
  <path d="M13 6.5h6v5.2c4.6 1.6 7.8 5.8 7.8 10.6A10.8 10.8 0 0 1 5.2 22.3c0-4.8 3.2-9 7.8-10.6z" fill="#cfe8ff" fill-opacity=".28" stroke="#e9f4ff" stroke-opacity=".75" stroke-width="1.1"/>
  <path d="M6.6 20.5c3.2-1.6 6.4 1.4 9.4 0s6.2-1.6 9.4 0c.4 1 .5 1.8.5 2.6a10 10 0 0 1-19.8 0c0-.9.2-1.7.5-2.6z" fill="url(#gd-green)"/>
  <circle cx="12" cy="24" r="1.4" fill="#fff" fill-opacity=".7"/><circle cx="18.5" cy="26" r="1" fill="#fff" fill-opacity=".6"/><circle cx="20" cy="22.6" r=".8" fill="#fff" fill-opacity=".6"/>
  <path d="M9 16.5c.6-1.4 1.6-2.3 2.8-2.8" stroke="#fff" stroke-opacity=".8" stroke-width="1.3" stroke-linecap="round" fill="none"/>
  <path d="M24.5 4.5l.7 1.6 1.7.2-1.3 1.1.4 1.7-1.5-.9-1.5.9.4-1.7-1.3-1.1 1.7-.2z" fill="#ffe08a"/>
</symbol>
<symbol id="gi-ticket" viewBox="0 0 32 32">
  <path d="M3.5 9A2.5 2.5 0 0 1 6 6.5h20A2.5 2.5 0 0 1 28.5 9v3.2a3.8 3.8 0 0 0 0 7.6V23a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 23v-3.2a3.8 3.8 0 0 0 0-7.6z" fill="url(#gd-gold)"/>
  <path d="M21 7v18" stroke="#7a4a00" stroke-opacity=".55" stroke-width="1.2" stroke-dasharray="2 2"/>
  <path d="M12.5 10.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#fff8d6"/>
  <path d="M6.5 9.5h4" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>
</symbol>
<symbol id="gi-steam" viewBox="0 0 65 65"><g transform="translate(.5 .5)">
  <path d="M1.305 41.202C5.259 54.386 17.488 64 31.959 64c17.673 0 32-14.327 32-32s-14.327-32-32-32C15.001 0 1.124 13.193.028 29.874c2.074 3.477 2.879 5.628 1.275 11.328z" fill="url(#gd-steamb)"/>
  <path fill="#fff" d="M30.31 23.985l.003.158-7.83 11.375c-1.268-.058-2.54.165-3.748.662a8.14 8.14 0 0 0-1.498.8L.042 29.893s-.398 6.546 1.26 11.424l12.156 5.016c.6 2.728 2.48 5.12 5.242 6.27a8.88 8.880 0 0 0 11.603-4.782 8.89 8.89 0 0 0 .684-3.656L42.18 36.16l.275.005c6.705 0 12.155-5.466 12.155-12.18s-5.44-12.160-12.155-12.174c-6.702 0-12.155 5.46-12.155 12.174zm-1.88 23.05c-1.454 3.5-5.466 5.147-8.953 3.694a6.84 6.84 0 0 1-3.524-3.362l3.957 1.640a5.04 5.04 0 0 0 6.591-2.719 5.05 5.050 0 0 0-2.715-6.601l-4.1-1.695c1.578-.6 3.372-.62 5.050.077 1.7.703 3 2.027 3.696 3.720s.692 3.56-.01 5.246M42.466 32.1a8.12 8.12 0 0 1-8.098-8.113 8.12 8.12 0 0 1 8.098-8.111 8.12 8.12 0 0 1 8.1 8.111 8.12 8.12 0 0 1-8.1 8.113m-6.068-8.126a6.09 6.09 0 0 1 6.08-6.095c3.355 0 6.084 2.730 6.084 6.095a6.09 6.090 0 0 1-6.084 6.093 6.09 6.09 0 0 1-6.081-6.093z"/>
</g></symbol>
<symbol id="gi-warn" viewBox="0 0 32 32">
  <path d="M14 5.2a2.3 2.3 0 0 1 4 0l10.8 19.2a2.3 2.3 0 0 1-2 3.4H5.2a2.3 2.3 0 0 1-2-3.4z" fill="url(#gd-org)"/>
  <path d="M16 12v7.5" stroke="#2a1300" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="23.4" r="1.8" fill="#2a1300"/>
</symbol>
</svg>`;
document.body.insertAdjacentHTML('afterbegin', GI_SPRITE);
const gi = (n, cls = '') => `<svg class="gi ${cls}" viewBox="0 0 32 32" aria-hidden="true"><use href="#gi-${n}"/></svg>`;

/* ================= rarity / wear ================= */
const TIERS = ['consumer', 'industrial', 'milspec', 'restricted', 'classified', 'covert', 'rare'];
const TIER_RU = { consumer: 'Ширпотреб', industrial: 'Промышленное', milspec: 'Армейское', restricted: 'Запрещённое', classified: 'Засекреченное', covert: 'Тайное', contraband: 'Контрабанда', rare: 'Редкий особый' };
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
  const [name, weapon, pat, r, cat, mn, mx, st, im, base, px] = a;
  const star = name.startsWith('★');
  return { i, name, weapon, pat, r, cat, mn, mx, st: !!st, img: im, base, px, star, vanilla: star && mn == null, tier: star ? 'rare' : r };
});
const colOf = s => s.star ? TIER_COL.rare : TIER_COL[s.r];
// mystery icon for a case's rare pool: gloves only -> golden glove, otherwise golden knife
const rareIco = (c, cls = '') => `<img class="rare-ico ${cls}" src="rare.png" alt="Редкий особый предмет" decoding="async">`;
// cheap cases can be opened in bigger batches (mirrors max_open() on the server)
const maxOpen = price => price <= 1 ? 50 : price <= 3 ? 20 : price <= 10 ? 10 : 5;
const tierOf = s => s.star ? 'rare' : s.r === 'contraband' ? 'covert' : s.r;
const wpnLabel = s => (s.star ? '★ ' : '') + s.weapon;
function fullName(it) {
  const s = SK[it.s], w = wearOf(it.f);
  return `${s.star ? '★ ' : ''}${it.st ? 'StatTrak™ ' : ''}${s.weapon}${s.vanilla ? '' : ' | ' + s.pat}${w ? ` (${w[1]})` : ''}`;
}
const WEAR_MUL = { FN: 2.1, MW: 1.4, FT: 1, WW: .88, BS: .72 };
const WEAR_MUL_STAR = { FN: 1.7, MW: 1.2, FT: 1, WW: .9, BS: .82 };
const WIDX = { FN: 0, MW: 1, FT: 2, WW: 3, BS: 4 };
function priceCode(s, code, st) {
  if (s.px) { const v = s.px[(code ? WIDX[code] : 0) + (st ? 5 : 0)]; if (v) return Math.max(.03, v); }
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
  if (s.mn != null) {
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
  if (s.mn == null) return null;
  let x = crand(), b = UBK[4];
  for (const k of UBK) { if ((x -= k[0]) < 0) { b = k; break; } }
  return +(s.mn + (s.mx - s.mn) * (b[1] + (b[2] - b[1]) * crand())).toFixed(9);
}

/* ================= cases ================= */
const SALE_END = new Date(2026, 11, 1); // Black Friday sale runs until Dec 1
const ALL_CASES = window.CASES.map((c, idx) => {
  const pools = {};
  for (const t in c.pools) pools[t] = c.pools[t].map(i => SK[i]);
  const onSale = c.sale > 0 && Date.now() < SALE_END;
  return { ...c, name: c.n, idx, pools, hero: SK[c.hero], count: Object.values(pools).reduce((a, l) => a + l.length, 0),
    full: c.price, price: onSale ? Math.round(c.price * (1 - c.sale) * 100 + 1e-7) / 100 : c.price, old: onSale ? c.price : c.old, onSale };
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
  NO_RL_FUNDS: 'Не хватает реальных денег', BAD_ITEM: 'Этот предмет нельзя купить', BAD_AMOUNT: 'Неверная сумма', BAD_QUEST: 'Нет такого задания',
  NO_FUNDS: 'Недостаточно средств', NICK_TAKEN: 'Этот ник уже занят', BAD_NICK: 'Ник: 3–16 символов — буквы, цифры, пробел, _ . -',
  NOT_OPEN: 'Баттл уже начался или отменён', FULL: 'Мест уже нет', ALREADY_IN: 'Ты уже в этом баттле', NO_USER: 'Игрок с таким ником не найден',
  SELF: 'Нельзя подарить самому себе', NOT_OWNER: 'Этот предмет уже не твой', TARGET_TOO_CHEAP: 'Цель должна быть дороже ставки',
  NOT_CREATOR: 'Это может только создатель баттла', QUEST_NOT_DONE: 'Квест ещё не выполнен', LEVEL_LOCKED: 'Этот уровень ещё не открыт', PREMIUM_REQUIRED: 'Эта награда — только в премиум-пропуске', PASS_ENDED: 'Сезон боевого пропуска завершён', ALREADY_PREMIUM: 'Премиум уже куплен', ALREADY_CLAIMED: 'Награда уже получена',
  NO_TICKETS: 'Бесплатных открытий не осталось', NO_PERK: 'Зелья уже нет', BAD_TARGET: 'Цель: от 1.01x до 1000x', BAD_BET: 'Минимальная ставка — $0.10', ONLINE_ONLY: 'Работает только онлайн', 'Invalid login credentials': 'Неверный ник или пароль', NO_PROFILE: 'Профиль не найден',
  'Anonymous sign-ins are disabled': 'Гостевой вход выключен на сервере', 'Password should be at least': 'Пароль — минимум 6 символов',
  'already registered': 'Этот ник уже зарегистрирован', 'Failed to fetch': 'Нет связи с сервером',
};
function errText(e) {
  const m = String((e && e.message) || e);
  const cd = m.match(/COOLDOWN:(\d+)/);
  if (cd) return `Бонус будет через ${cd[1]} c`;
  const dd = m.match(/DAILY_DONE:(\d+)/);
  if (dd) return `Ежедневный бонус уже забран — следующий через ${hms(+dd[1] * 1000)}`;
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
const fresh = () => ({ bal: 100, inv: [], hist: [], uid: 1, lastBonus: 0, bonusN: 0, xp: 0, quests: {}, perks: [], steam: [], luckUntil: 0, bpClaimed: [], dailyLast: null, dailyStreak: 0, pumpkins: [], pumpkinDone: false, stats: freshStats() });
const bonusAmt = n => n % 100 === 0 ? 1000 : n % 10 === 0 ? 100 : BONUS_AMT;
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
  S.bonusN = p.bonus_n || 0;
  S.bpClaimed = p.bp_claimed || []; S.bpPremium = !!p.bp_premium; S.steamQ = p.steam_q || []; S.rlBal = +(p.rl_balance || 0); S.luckUntil = p.luck_until ? Date.parse(p.luck_until) : 0;
  S.xp = p.xp || 0; S.quests = p.quests || {}; S.dailyLast = p.daily_last; S.dailyStreak = p.daily_streak || 0; S.pumpkinDone = !!p.pumpkin_done;
  S.stats = { opened: p.opened, spent: +p.spent, sold: +p.sold, upW: p.up_w, upL: p.up_l, bw: p.battles_w, bl: p.battles_l, best: p.best_skin != null ? { s: p.best_skin, f: p.best_float, st: p.best_st, p: +p.best_price } : null };
  if (ME) ME.nick = p.nickname;
  if (typeof lvlEl !== 'undefined') drawLevel();
}
async function refreshProfile() {
  const { data, error } = await sb.from('profiles').select('*').eq('id', ME.id).single();
  if (error) throw new Error(error.message);
  applyProfile(data); renderBal(); return data;
}
async function refreshInventory() {
  const rows = await fetchAll(() => sb.from('inventory').select('id,skin_id,float,st,price,src,created_at').eq('owner', ME.id).order('id', { ascending: false }));
  S.inv = rows.map(fromInv);
  await refreshPerks();
}
async function refreshPerks() {
  const [pk, st] = await Promise.all([
    fetchAll(() => sb.from('perks').select('id,kind,case_id,mins').eq('owner', ME.id).order('id')),
    fetchAll(() => sb.from('steam_items').select('*').eq('owner', ME.id).order('id', { ascending: false })),
  ]);
  S.perks = pk;
  S.steam = st.map(r => ({ u: r.id, s: r.skin_id, f: r.float, st: r.st, p: +r.price, t: Date.parse(r.withdrawn_at), src: r.src }));
}
// server adds XP for opening/upgrading/climbing — pull the new total (debounced)
let xpT;
const syncXp = () => { if (!ONLINE || !ME) return; clearTimeout(xpT); xpT = setTimeout(async () => { const { data } = await sb.from('profiles').select('xp').eq('id', ME.id).single(); if (data) { S.xp = data.xp; drawLevel(); } }, 500); };
const luckOn = () => S.luckUntil > Date.now();
const ticketsFor = id => S.perks.filter(p => p.kind === 'case' && p.case_id === id).length;

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
    if (ONLINE) { const r = await rpc('claim_bonus'); S.lastBonus = Date.now(); S.bonusN = r.n; return { balance: +r.balance, amount: +r.amount, n: r.n }; }
    const left = BONUS_CD - (Date.now() - S.lastBonus);
    if (left > 0) throw new Error('COOLDOWN:' + Math.ceil(left / 1000));
    S.bonusN = (S.bonusN || 0) + 1;
    const amount = bonusAmt(S.bonusN);
    S.lastBonus = Date.now(); S.bal = r2(S.bal + amount); save();
    return { balance: S.bal, amount, n: S.bonusN };
  },
  async upgrade(uids, tgt) {
    if (ONLINE) {
      const r = await rpc('upgrade_items', { p_ids: uids, p_skin: tgt.s, p_code: tgt.code }); syncXp();
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
  async claimLevel(lv) {
    if (!ONLINE) throw new Error('ONLINE_ONLY');
    const r = await rpc('claim_level', { p_level: lv });
    S.bpClaimed = [...S.bpClaimed, lv];
    let item = null;
    if (r.item) { item = fromDrop(r.item); item.src = 'pass'; S.inv.unshift(item); bumpBest(item); }
    if (r.kind === 'case' || r.kind === 'luck') await refreshPerks();
    return { balance: +r.balance, kind: r.kind, item };
  },
  async useLuck(id) {
    const r = await rpc('use_luck', { p_id: id });
    S.perks = S.perks.filter(p => p.id !== id); S.luckUntil = Date.parse(r.luck_until);
  },
  async openFree(c, n) {
    const r = await rpc('open_free', { p_case: c.id, p_n: n });
    const items = r.items.map(fromDrop);
    S.inv.unshift(...items); items.forEach(bumpBest); S.stats.opened += n;
    let k = n; S.perks = S.perks.filter(p => !(p.kind === 'case' && p.case_id === c.id && k-- > 0));
    return { items, balance: +r.balance };
  },
  async withdraw(uids) {
    const r = await rpc('withdraw_items', { p_ids: uids });
    const set = new Set(uids), moved = S.inv.filter(i => set.has(i.u));
    S.inv = S.inv.filter(i => !set.has(i.u));
    await refreshPerks(); // steam_items get their own ids on the server
    return { n: r.n, sum: +r.sum };
  },
  async climb(uids, amount, target) {
    const r = await rpc('play_climb', { p_ids: uids, p_amount: amount, p_target: target });
    if (uids.length) { const set = new Set(uids); S.inv = S.inv.filter(i => !set.has(i.u)); }
    return { crash: +r.crash, win: r.win, payout: +r.payout, bet: +r.bet, balance: +r.balance };
  },
  async claimQuest(type) {
    if (ONLINE) {
      const r = await rpc('claim_quest', { p_type: type });
      S.xp += r.xp; S.quests = { ...S.quests, [type]: r.tier };
      return { balance: +r.balance, money: +r.money, xp: r.xp };
    }
    const tier = S.quests[type] || 0, d = questDef(type, tier);
    if (QUESTS[type].cur() < d.target) throw new Error('QUEST_NOT_DONE');
    S.quests[type] = tier + 1; S.xp += d.xp; S.bal = r2(S.bal + d.money); save();
    return { balance: S.bal, money: d.money, xp: d.xp };
  },
  async daily() {
    if (ONLINE) {
      const r = await rpc('claim_daily');
      S.dailyLast = r.day; S.dailyStreak = r.streak; S.xp += r.xp;
      return { balance: +r.balance, amount: +r.amount, streak: r.streak };
    }
    const t = utcDay(0);
    if (S.dailyLast === t) throw new Error('DAILY_DONE:' + Math.ceil(msToUtcMidnight() / 1000));
    S.dailyStreak = S.dailyLast === utcDay(-1) ? S.dailyStreak + 1 : 1;
    S.dailyLast = t; S.xp += 25;
    const amount = dailyAmount(S.dailyStreak);
    S.bal = r2(S.bal + amount); save();
    return { balance: S.bal, amount, streak: S.dailyStreak };
  },
  async pumpkin(id) {
    if (ONLINE) {
      const r = await rpc('find_pumpkin', { p_id: id });
      S.pumpkins = r.list; if (r.reward) { S.pumpkinDone = true; S.xp += 500; }
      return { found: r.found, reward: +r.reward, balance: +r.balance };
    }
    if (!S.pumpkins.includes(id)) S.pumpkins.push(id);
    let reward = 0;
    if (S.pumpkins.length >= PK_TOTAL && !S.pumpkinDone) { reward = 1000; S.pumpkinDone = true; S.xp += 500; S.bal = r2(S.bal + 1000); }
    save();
    return { found: S.pumpkins.length, reward, balance: S.bal };
  },
  async gift(u, nick) {
    const r = await rpc('gift_item', { p_id: u, p_to: nick });
    S.inv = S.inv.filter(i => i.u !== u);
    return r;
  },
};

/* ================= logo ================= */
let logoN = 0;
function logoSVG() {
  const id = 'lg' + (logoN++);
  return `<svg viewBox="0 0 32 32" class="logo-svg"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc061"/><stop offset=".5" stop-color="#ff5e3a"/><stop offset="1" stop-color="#9b4dff"/></linearGradient></defs>
    <path d="M16 1.5C16 1.5 4.5 13.6 4.5 20.3a11.5 11.5 0 0 0 23 0C27.5 13.6 16 1.5 16 1.5Z" fill="url(#${id})"/>
    <path d="M16 1.5C16 1.5 4.5 13.6 4.5 20.3a11.5 11.5 0 0 0 23 0C27.5 13.6 16 1.5 16 1.5Z" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".8"/>
    <path d="M10.6 11.2C9 13.4 8.1 15.6 8.2 17.6" stroke="#fff" stroke-opacity=".75" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M10.8 19.4l2.6-3.6 2 3.6zM16.6 19.4l2-3.6 2.6 3.6z" fill="#1b0a24"/>
    <path d="M9.6 22.4c4 3.6 8.8 3.6 12.8 0l-1.6.2-.9 1.3-1.3-1-1.3 1.4-1.3-1.4-1.3 1.4-1.3-1.4-1.3 1-.9-1.3z" fill="#1b0a24"/>
  </svg>`;
}
$('#logoMark').innerHTML = logoSVG();

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
  const nx = (S.bonusN || 0) + 1, amt = bonusAmt(nx);
  bonusBtn.classList.toggle('mega', amt > BONUS_AMT);
  bonusBtn.dataset.amt = amt >= 1000 ? '$1K' : amt > BONUS_AMT ? '$100' : '';
  bonusBtn.title = (left ? `Бонус через ${Math.ceil(left / 1000)} c` : `Забрать бонус ${money(amt)}`) + ` · нажатие №${nx} (каждое 10-е — $100, каждое 100-е — $1000)`;
}
bonusBtn.onclick = async () => {
  if (ONLINE && !ME) return;
  const left = BONUS_CD - (Date.now() - S.lastBonus);
  if (left > 0) { notify({ title: 'Бонус ещё заряжается', sub: `Будет доступен через ${Math.ceil(left / 1000)} c`, icon: ICON.gift, color: 'rgba(255,159,10,.25)' }); return; }
  try {
    const r = await API.bonus();
    setBal(r.balance);
    const to10 = 10 - (r.n % 10), next = to10 === 10 ? 10 : to10;
    if (r.amount > BONUS_AMT) {
      SFX.win(r.amount >= 1000 ? 'rare' : 'covert');
      notify({ title: r.amount >= 1000 ? `Сотое нажатие — джекпот!` : `Десятое нажатие!`, sub: `Это было ${r.n}-е нажатие плюсика`, icon: gi('coins'), color: 'rgba(255,159,10,.45)', amt: '+' + money(r.amount), amtColor: '#ffd60a', tall: true, ms: 4500 });
    } else {
      SFX.coin();
      notify({ title: 'Бонус получен', sub: `До $100 — ещё ${next} нажат${next === 1 ? 'ие' : next < 5 ? 'ия' : 'ий'}`, icon: ICON.gift, color: 'rgba(48,209,88,.3)', amt: '+' + money(r.amount), amtColor: '#5ee07f' });
    }
  } catch (e) { notifyErr(e); }
  drawBonus();
};
setInterval(drawBonus, 1000); drawBonus();

const soundBtn = $('#soundBtn');
const drawSound = () => { soundBtn.innerHTML = SET.sound ? ICON.sOn : ICON.sOff; };
soundBtn.onclick = () => { SET.sound = !SET.sound; saveSet(); drawSound(); SFX.click(); };
drawSound();

/* ================= online / traffic ================= */
const statsEl = $('#siteStats');
const STATS = { online: 0, day: 0, month: 0 };
function drawStats() {
  if (!statsEl) return;
  statsEl.innerHTML = `<span class="on"><i></i><b>${STATS.online || 1}</b><em>онлайн</em></span><span><b>${STATS.day}</b><em>сегодня</em></span><span><b>${STATS.month}</b><em>за месяц</em></span>`;
  statsEl.title = `Сейчас на сайте: ${STATS.online || 1}\nУникальных игроков сегодня: ${STATS.day}\nЗа этот месяц: ${STATS.month}\nВсего игроков: ${STATS.players || '—'}`;
}
function startStats() {
  if (!ONLINE || !statsEl) { statsEl && statsEl.remove(); return; }
  const ch = sb.channel('online', { config: { presence: { key: ME.id } } });
  ch.on('presence', { event: 'sync' }, () => { STATS.online = Object.keys(ch.presenceState()).length; drawStats(); })
    .subscribe(async st => { if (st === 'SUBSCRIBED') await ch.track({ nick: ME.nick }); });
  const load = async track => { try { Object.assign(STATS, await rpc(track ? 'track_visit' : 'site_stats')); drawStats(); } catch (e) { console.warn(e); } };
  load(true); setInterval(() => load(false), 60e3);
  drawStats();
}

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

const LOWFX = matchMedia('(hover: none), (max-width: 760px)').matches;
if (LOWFX) document.documentElement.classList.add('lowfx');
const NAV = ONLINE
  ? [['', 'Кейсы', ICON.cases], ['battles', 'Баттлы', ICON.swords], ['climb', 'Подъём', ICON.climb], ['upgrade', 'Апгрейд', ICON.up], ['quests', 'Квесты', ICON.quest], ['top', 'Топ', ICON.trophy], ['profile', 'Профиль', ICON.user]]
  : [['', 'Кейсы', ICON.cases], ['upgrade', 'Апгрейд', ICON.up], ['quests', 'Квесты', ICON.quest], ['profile', 'Профиль', ICON.user]];
const navHTML = list => `<span class="pill"></span>` + list.map(([r, l, i]) => `<button data-go="#/${r}" data-r="${r}">${i}<span>${l}</span></button>`).join('');
$('#nav').innerHTML = navHTML(NAV); $('#dockNav').innerHTML = navHTML(NAV);
const NAV_KEY = { case: '', battle: 'battles', u: 'top', inventory: 'profile', steam: 'profile', life: 'profile' };
const ptabsHTML = active => `<nav class="ptabs"><div class="ptab-bar">${[['profile', 'Профиль', ICON.user], ['inventory', 'Инвентарь', ICON.inv], ...(ONLINE ? [['steam', 'Steam', gi('steam')], ['life', 'Жизнь', ICON.home]] : [])]
  .map(([r, l, i]) => `<a class="ptab ${r === active ? 'on' : ''}" href="#/${r}">${i}<span>${l}</span>${r === 'inventory' ? `<em>${S.inv.length}</em>` : r === 'steam' && S.steam.length ? `<em>${S.steam.length}</em>` : ''}</a>`).join('')}</div></nav>`;
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
function showcase(c) {
  if (c._show) return c._show;
  const by = l => l.slice().sort((a, b) => evSkin(b) - evSkin(a));
  const guns = by(Object.entries(c.pools).filter(([t]) => t !== 'rare').flatMap(([, l]) => l));
  const stars = by(c.pools.rare || []);
  const out = [], seen = new Set();
  const key = s => s.cat === 'sticker' || s.cat === 'graffiti' || s.cat === 'agent' ? s.name : s.weapon;
  const add = s => { if (s && !seen.has(key(s)) && out.length < 3) { seen.add(key(s)); out.push(s); } };
  if (guns.length) { add(guns[0]); add(stars[0]); guns.slice(1).forEach(add); }
  stars.forEach(add);
  const all = guns.concat(stars);
  while (out.length < 3) out.push(all[out.length % all.length]);
  return (c._show = out);
}
const GRP_DECO = { halloween: gi('pumpkin'), bf: '%' };
function caseArt(c, size = '360fx360f') {
  if (c.kind === 'official') return `<img src="${img(c.img, size)}" alt="${esc(c.name)}" loading="lazy" decoding="async">`;
  const [a, b, d] = showcase(c);
  return `<div class="crate g-${c.grp}" style="--a:${c.a};--b:${c.b}">
    <div class="rays"></div>
    <img class="loot l2" src="${img(b.img)}" alt="" loading="lazy" decoding="async">
    <img class="loot l3" src="${img(d.img)}" alt="" loading="lazy" decoding="async">
    <img class="loot l1" src="${img(a.img)}" alt="" loading="lazy" decoding="async">
    <div class="box"><div class="lid"></div><div class="front"><span>${esc(c.mark)}</span></div></div>
    ${GRP_DECO[c.grp] ? `<span class="deco">${GRP_DECO[c.grp]}</span>` : ''}
  </div>`;
}
const saleOf = c => c.old ? Math.round((1 - c.price / c.old) * 100) : 0;
const priceHTML = c => c.old ? `<s>${money(c.old)}</s>${money(c.price)}` : money(c.price);
function caseCard(c, i) {
  const badge = c.grp === 'bf' || c.onSale ? `<span class="badge bf">−${saleOf(c)}% Black Friday</span>`
    : c.grp === 'halloween' ? `<span class="badge hw">${gi('pumpkin')} Хэллоуин</span>`
    : c.reveal ? `<span class="badge knife">${rareIco(c)} 100%</span>`
    : c.kind === 'custom' ? '<span class="badge custom">Авторский</span>' : (c.idx < 3 ? '<span class="badge new">New</span>' : '');
  return `<div class="case-card glass-flat ${c.grp ? 'grp-' + c.grp : ''}" style="--i:${i};--glow:${c.glow}" data-go="#/case/${c.id}">${badge}<div class="art">${caseArt(c)}</div><h3>${esc(c.name)}</h3><div class="meta">${c.kind === 'custom' ? esc(c.desc) : c.count + ' предметов · ' + (c.d || '').slice(0, 4)}</div><span class="price-chip ${c.old ? 'sale' : ''}">${priceHTML(c)}</span></div>`;
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
const onlineOnly = t => `<div class="empty-state"><div class="ill">${gi('globe')}</div><h3>${t}</h3>Работает, когда сайт подключён к серверу (онлайн-режим).</div>`;

/* ================= router ================= */
const main = $('#view');
let VIEW = {};
let viewToken = 0;
const ROUTES = { life: viewLife, steam: viewSteam, climb: viewClimb, quests: viewQuests, '': viewHome, case: viewCase, inventory: viewInventory, upgrade: viewUpgrade, profile: viewProfile, battles: viewBattles, battle: viewBattle, top: viewTop, u: viewUser };
let firstRender = true;
async function route() {
  if (ONLINE && !ME) return;
  const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  const r = ROUTES[parts[0]] ? parts[0] : '';
  updateNav(r);
  viewToken++;
  if (!firstRender) {
    main.style.transition = 'opacity .18s, filter .18s, transform .18s';
    main.style.opacity = 0; if (!LOWFX) { main.style.filter = 'blur(6px)'; main.style.transform = 'scale(.995)'; }
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
const SRC_ICO = { upgrade: gi('upgrade'), battle: gi('swords'), gift: gi('gift'), pass: gi('ticket') };
function tkHTML(h, isNew) {
  const s = SK[h.s];
  const who = h.nick ? `${h.nick}: ` : '';
  const what = h.src === 'battle' ? `выиграл баттл на ${money(h.p)}` : h.src === 'gift' ? `подарил ${h.extra} ${fullName(h)}` : `${fullName(h)} — ${money(h.p)}`;
  const go = h.uid ? `#/u/${h.uid}` : h.c ? `#/case/${h.c}` : '';
  return `<div class="tk ${isNew ? 'new' : ''}" style="--rc:${colOf(s)}" title="${esc(who + what)}" ${go ? `data-go="${go}"` : ''}>${SRC_ICO[h.src] ? `<i class="src">${SRC_ICO[h.src]}</i>` : ''}<img src="${img(s.img, '128fx128f')}" alt=""><span>${esc(h.nick || s.pat)}</span></div>`;
}
function tickerHTML() {
  const list = ONLINE ? FEED : S.hist;
  return `<section class="ticker glass-flat" id="ticker"><div class="lbl"><b>Live</b>${ONLINE ? 'все игроки' : 'ваши дропы'}</div>${list.length ? list.slice(0, 24).map(h => tkHTML(h)).join('') : '<div class="empty">Тут появятся последние дропы — откройте первый кейс</div>'}</section>`;
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
const GROUPS = [
  ['halloween', gi('pumpkin') + ' Хэллоуин', 'жуткие коллекции сезона'],
  ['stickers', gi('sticker') + ' Наклейки и граффити', 'кейсы за копейки — от $0.04'],
  ['bf', gi('bf') + ' Black Friday', `скидки на ${ALL_CASES.filter(c => c.old).length} кейсов — до конца распродажи`],
  ['knives', gi('knife') + ' Ножи и перчатки', '100% редкий предмет из каждого кейса'],
  ['custom', gi('sparkle') + ' Авторские', 'выдуманные коллекции из реальных скинов'],
  ['official', 'Кейсы CS2', 'официальные, с реальным содержимым'],
];
const grpOf = c => c.kind === 'official' ? 'official' : c.grp || 'custom';
function countdown() {
  const ms = SALE_END - Date.now();
  if (ms <= 0) return '';
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, sec = Math.floor(ms / 1e3) % 60;
  const p2 = n => String(n).padStart(2, '0');
  return `${d ? `<b>${d}</b><i>д</i>` : ''}<b>${p2(h)}</b><i>:</i><b>${p2(m)}</b><i>:</i><b>${p2(sec)}</b>`;
}
function webSVG() {
  const ends = [[150, 0], [150, 46], [132, 100], [96, 140], [46, 150], [0, 150]];
  let d = ends.map(([x, y]) => `M0 0L${x} ${y}`).join('');
  for (const f of [.2, .38, .58, .8]) {
    const pts = ends.map(([x, y]) => [x * f, y * f]);
    d += 'M' + pts.map(([x, y], i) => i ? `Q${(pts[i - 1][0] + x) / 2 * .86} ${(pts[i - 1][1] + y) / 2 * .86} ${x.toFixed(1)} ${y.toFixed(1)}` : `${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  }
  return `<svg class="web" viewBox="0 0 150 150"><path d="${d}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width=".8"/><line x1="96" y1="0" x2="96" y2="62" stroke="rgba(255,255,255,.3)" stroke-width=".6"/><g transform="translate(96 66)"><ellipse rx="5" ry="6" fill="#120a18"/><circle cy="-6" r="3.2" fill="#120a18"/><path d="M-4-2l-7-4M-4 1l-8 0M-4 4l-7 5M4-2l7-4M4 1l8 0M4 4l7 5" stroke="#120a18" stroke-width="1.2"/></g></svg>`;
}
function viewHome() {
  const feat = caseById('c-halloween') || OFFICIAL[0];
  main.innerHTML = `
  ${tickerHTML()}
  <section class="hero season-hero glass edge">
    ${webSVG()}
    <div>
      <div class="season-chip"><span>${gi('pumpkin')} Halloween</span><i>×</i><span>${gi('bf')} Black Friday</span></div>
      <h1>Чёрная пятница<br><span class="grad">в мире кейсов</span></h1>
      <p>Хэллоуинские коллекции, кейсы со сниженной наценкой и кейсы, где 100% выпадает нож. ${ONLINE ? 'Баттлы с друзьями, топ и подарки — ' : ''}всё на виртуальном балансе.</p>
      <div class="sale-timer" id="saleTimer">${countdown() ? `<span>До конца распродажи</span><div class="cd">${countdown()}</div>` : ''}</div>
      <div class="actions">
        <button class="btn primary big" data-go="#/case/${feat.id}">${gi('pumpkin')} Открыть ${esc(feat.name)}</button>
        <button class="btn big" data-act="toGrp" data-g="bf">${gi('bf')} Распродажа</button>
      </div>
    </div>
    <div class="hero-case" data-go="#/case/${feat.id}">
      <div class="halo"></div>
      ${caseArt(feat)}
      <div class="hero-tag glass">Хит сезона · ${money(feat.price)}</div>
    </div>
  </section>
  <div class="section-head" id="casesHead">
    <h2>Кейсы</h2><span class="sub" id="caseCount"></span><div class="grow"></div>
    <div class="controls">
      <label class="search">${ICON.search}<input id="q" placeholder="Поиск кейса" value="${esc(H.q)}" autocomplete="off"></label>
      <select class="select" id="sort">
        ${[['def', 'По умолчанию'], ['pa', 'Сначала дешёвые'], ['pd', 'Сначала дорогие'], ['nm', 'По названию']].map(([v, l]) => `<option value="${v}" ${H.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
  </div>
  <div class="cat-row">${seg('tab', [['all', 'Все'], ...GROUPS.map(([g, l]) => [g, l])], H.tab, 'sm cats')}</div>
  <div id="caseGrid"></div>`;
  drawCaseGrid();
  const tmr = setInterval(() => { const t = $('#saleTimer .cd'); if (t) t.innerHTML = countdown(); }, 1000);
  VIEW = {
    destroy() { clearInterval(tmr); },
    onSeg(n, v) { if (n === 'tab') { H.tab = v; drawCaseGrid(); } },
    onInput(t) { if (t.id === 'q') { H.q = t.value; drawCaseGrid(); } },
    onChange(t) { if (t.id === 'sort') { H.sort = t.value; drawCaseGrid(); } },
    act(a, el) {
      if (a === 'toGrp') {
        H.tab = el.dataset.g; segSelect($('[data-seg="tab"]', main), H.tab); drawCaseGrid();
        $('#casesHead').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
  };
}
function drawCaseGrid() {
  const q = H.q.trim().toLowerCase();
  let list = ALL_CASES.filter(c => (H.tab === 'all' || grpOf(c) === H.tab || (H.tab === 'bf' && c.onSale)) && (!q || c.name.toLowerCase().includes(q)));
  if (H.sort === 'pa') list.sort((a, b) => a.price - b.price);
  if (H.sort === 'pd') list.sort((a, b) => b.price - a.price);
  if (H.sort === 'nm') list.sort((a, b) => a.name.localeCompare(b.name));
  $('#caseCount').textContent = list.length;
  const g = $('#caseGrid');
  if (!list.length) { g.innerHTML = `<div class="empty-state"><div class="ill">${gi('search')}</div><h3>Ничего не нашлось</h3>Попробуйте другой запрос</div>`; return; }
  if (H.tab === 'all' && !q && H.sort === 'def') {
    g.innerHTML = GROUPS.map(([k, l, sub]) => {
      const cs = list.filter(c => grpOf(c) === k);
      return cs.length ? `<div class="section-head grp-head grp-${k}"><h2 style="font-size:21px">${l}</h2><span class="sub">${sub}</span></div><div class="grid-cases stagger">${cs.map(caseCard).join('')}</div>` : '';
    }).join('');
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
  if (C.n > maxOpen(c.full)) C.n = 1;
  main.innerHTML = `
  <section class="case-top glass edge">
    <div class="head">
      <button class="icon-btn" data-go="#/">${ICON.back}</button>
      <div><h1>${esc(c.name)}</h1><div class="ev-note">${c.kind === 'custom' ? 'Авторский кейс · ' + esc(c.desc) : 'Официальный кейс CS2 · ' + (c.d || '')}</div></div>
      <div class="grow"></div>
      <span class="price-chip ${c.old ? 'sale' : ''}" style="margin:0">${priceHTML(c)}</span>
    </div>
    <div class="case-stage" id="stage" style="--glow:${c.glow}"><div class="halo"></div>${caseArt(c, '512fx384f')}</div>
    <div class="rolls" id="rolls" hidden></div>
    <div class="open-bar">
      ${seg('n', [1, 2, 3, 4, 5, 10, 20, 50].filter(n => n <= maxOpen(c.full)).map(n => [String(n), '×' + n]), String(C.n))}
      <button class="btn primary big" id="openBtn" data-act="open"></button>
      <button class="btn green big" id="freeBtn" data-act="free" hidden></button>
      <label class="toggle" data-act="fast"><span class="switch ${SET.fast ? 'on' : ''}" id="fastSw"></span>Быстро</label>
      ${ONLINE ? `<button class="btn" data-go="#/battles?case=${c.id}">${gi('swords')} Баттл</button>` : ''}
    </div>
  </section>
  <div class="section-head">
    <h2>Содержимое</h2>
    <div class="contents-legend">${order.filter(t => c.odds[t]).map(t => `<span class="odds-pill" style="--rc:${TIER_COL[t]}"><i></i>${TIER_RU[t]} · ${pct(c.odds[t])}</span>`).join('')}</div>
    <div class="grow"></div><span class="ev-note">Средний возврат ≈ ${Math.round(c.ev / c.price * 100)}% от цены кейса</span>
  </div>
  <div class="grid-items stagger">
    ${rare.length ? `<div class="item gold-card" style="--i:0" data-act="toRare"><span class="chance">${pct(c.odds.rare)}</span><div class="img">${rareIco(c)}</div><div class="wpn">Редкий особый предмет</div><div class="pat">${c.pools.rare.some(s => s.cat === 'glove') && c.pools.rare.some(s => s.cat === 'knife') ? 'Ножи и перчатки' : c.pools.rare.some(s => s.cat === 'glove') ? 'Перчатки' : 'Ножи'}</div><div class="row"><span class="pr">${rare.length} вариантов</span></div></div>` : ''}
    ${items.map(({ s, t }, i) => card(s, t, i + 1)).join('')}
  </div>
  ${rare.length ? `<div class="section-head" id="rareHead"><h2 style="color:var(--gold)">${rareIco(c)} Редкие предметы</h2><span class="sub">${pct(c.odds.rare)} на весь список</span></div>
  <div class="grid-items">${rare.map(s => card(s, 'rare', 0)).join('')}</div>` : ''}`;
  const drawBtn = () => {
    const b = $('#openBtn'); if (b) b.innerHTML = `Открыть ${C.n > 1 ? C.n + ' шт. ' : ''}за ${money(r2(c.price * C.n))}`;
    const f = $('#freeBtn'), k = ticketsFor(c.id);
    if (f) { f.hidden = !k; f.innerHTML = `${gi('ticket')} Бесплатно ×${Math.min(k, C.n)} <small>(есть ${k})</small>`; }
  };
  drawBtn();
  VIEW = {
    onSeg(n, v) { if (n === 'n') { C.n = +v; drawBtn(); } },
    refreshBtns: drawBtn,
    act(a, el, e) {
      if (a === 'open') openCase(c, C.n);
      if (a === 'free') openCase(c, Math.min(C.n, ticketsFor(c.id)), true);
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
function rcHTML(d, c) {
  const s = SK[d.s];
  if (s.star && !(c && c.reveal)) return `<div class="rc gold"><b>${rareIco(c)}</b><span>Редкий предмет</span></div>`;
  return `<div class="rc" style="--rc:${colOf(s)}"><img src="${img(s.img, '200fx200f')}" alt=""><span>${esc(s.pat)}</span></div>`;
}
const shake = el => el && el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 380 });

async function openCase(c, n, free) {
  if (busy || n < 1) return;
  const cost = r2(c.price * n);
  if (!free && S.bal < cost) {
    SFX.fail();
    notify({ title: 'Недостаточно средств', sub: `Нужно ${money(cost)} — заберите бонус или продайте предметы`, icon: '!', color: 'rgba(255,69,58,.35)' });
    shake($('#openBtn'));
    return;
  }
  busy = true;
  const token = viewToken;
  $('#openBtn').disabled = true; if ($('#freeBtn')) $('#freeBtn').disabled = true;
  SFX.open();
  const stage = $('#stage'), rolls = $('#rolls');
  stage.classList.add('out');
  let res;
  try { [res] = await Promise.all([free ? API.openFree(c, n) : API.openCase(c, n), sleep(380)]); }
  catch (e) { busy = false; notifyErr(e); if (token === viewToken) resetStage(); return; }
  setBal(res.balance); drawLevel(); syncXp();
  const its = res.items;
  if (token !== viewToken) { busy = false; announce(its); return; }
  stage.hidden = true;
  rolls.hidden = false;
  rolls.classList.toggle('multi', n > 1 && n <= 5);
  rolls.classList.toggle('mass', n > 5);
  if (n > 5) await massReveal(rolls, c, its);
  else {
    rolls.innerHTML = its.map(() => `<div class="roll"><div class="strip"></div><div class="marker"></div></div>`).join('');
    await Promise.all(its.map((d, k) => spin($$('.roll', rolls)[k], c, d, k)));
  }
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

// 10-50 at once: every tile shuffles through the case for a moment and lands on its drop
function massReveal(box, c, its) {
  box.innerHTML = its.map((d, i) => `<div class="mt" style="--i:${i}"><div class="mt-in">${rcHTML(fakeRoll(c), c)}</div></div>`).join('');
  const tiles = $$('.mt', box), total = SET.fast ? 900 : 2600, gap = total / its.length;
  const shuffle = setInterval(() => tiles.forEach(t => { if (!t.classList.contains('done')) $('.mt-in', t).innerHTML = rcHTML(fakeRoll(c), c); }), 90);
  return new Promise(res => {
    its.forEach((d, i) => setTimeout(() => {
      const t = tiles[i], s = SK[d.s];
      t.classList.add('done');
      t.style.setProperty('--rc', colOf(s));
      $('.mt-in', t).innerHTML = `<div class="rc win" style="--rc:${colOf(s)}"><img src="${img(s.img, '200fx200f')}" alt=""><span>${esc(s.pat)}</span></div>`;
      if (s.star || TIERS.indexOf(d.tier) >= TIERS.indexOf('classified')) t.classList.add('hot');
      if (i % 2 === 0) SFX.tick();
      if (i === its.length - 1) { clearInterval(shuffle); setTimeout(res, 450); }
    }, 350 + i * gap));
  });
}
function spin(roll, c, drop, k, durOverride) {
  return new Promise(res => {
    const N = 62, WIN = 52;
    const items = Array.from({ length: N }, (_, i) => i === WIN ? drop : fakeRoll(c));
    const strip = $('.strip', roll);
    strip.innerHTML = items.map(d => rcHTML(d, c)).join('');
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
      if (s.star && !c.reveal) w.outerHTML = `<div class="rc win" style="--rc:${TIER_COL.rare}"><img src="${img(s.img, '200fx200f')}" alt=""><span>${esc(s.pat)}</span></div>`;
      else w.classList.add('win');
      res();
    }, dur + 80);
  });
}

function winCardHTML(it, i, single, mini) {
  const s = SK[it.s], w = wearOf(it.f);
  return `<div class="win-card ${single ? 'single' : ''} ${mini ? 'mini' : ''}" style="--rc:${colOf(s)};--i:${Math.min(i, 20)}" data-u="${it.u}">
    <div class="rays"></div><div class="glow"></div>
    <img src="${img(s.img, '360fx360f')}" alt="">
    <div class="wpn">${esc(wpnLabel(s))}</div>
    <div class="pat">${esc(s.pat)}</div>
    <div class="info">${it.st ? '<span class="tag st">StatTrak™</span>' : ''}${w ? `<span class="tag">${w[2]}</span><span class="tag">${it.f.toFixed(5)}</span>` : `<span class="tag">${{ sticker: 'Наклейка', graffiti: 'Граффити' }[s.cat] || 'Без износа'}</span>`}</div>
    <div class="pr">${money(it.p)}</div>
    <div class="mini-acts"><button class="btn sm" data-sact="sellOne" data-u="${it.u}">Продать</button>${single ? '' : `<button class="btn sm keep" data-sact="keep" data-u="${it.u}">В инвентарь</button>`}</div>
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
  // items marked "to inventory" are skipped by the big sell button
  const kept = new Set();
  const unsold = () => its.filter(it => S.inv.some(x => x.u === it.u));
  const toSell = () => unsold().filter(it => !kept.has(it.u));
  const drawSellAll = () => {
    const b = document.querySelector('.scrim [data-sact="sellAll"]'); if (!b) return;
    const l = toSell(), sum = r2(l.reduce((a, it) => a + it.p, 0));
    b.textContent = kept.size ? (l.length ? `Продать остальное (${l.length}) · ${money(sum)}` : 'Всё оставлено') : 'Продать всё';
    b.disabled = kept.size > 0 && !l.length;
  };
  openSheet(`
    <h2>${its.length > 1 ? 'Ваши дропы' : 'Вам выпало!'}</h2>
    <div class="subtitle">${esc(c.name)}</div>
    ${its.length > 5 ? `<div class="subtitle">${its.length} предметов · лучший: <b>${esc(fullName(its.reduce((a, b) => b.p > a.p ? b : a)))}</b></div>` : ''}
    <div class="win-grid ${its.length > 5 ? 'mini' : ''}">${(its.length > 5 ? its.slice().sort((a, b) => b.p - a.p) : its).map((it, i) => winCardHTML(it, i, its.length === 1, its.length > 5)).join('')}</div>
    <div class="total-line">Стоимость дропа: <b id="winTotal">${money(total())}</b> · кейсы: ${money(r2(c.price * n))}</div>
    <div class="acts">
      <button class="btn green" data-sact="sellAll">Продать всё</button>
      <button class="btn primary" data-sact="again">Ещё раз · ${money(r2(c.price * n))}</button>
      <button class="btn" data-sact="close">${its.length > 1 ? 'Оставить всё' : 'В инвентарь'}</button>
    </div>`, {
    acts: {
      async sellOne(b) {
        b.disabled = true;
        const sum = await sellWithFx([+b.dataset.u]);
        if (!sum) { b.disabled = false; return; }
        const card = b.closest('.win-card'); card.classList.add('sold'); b.textContent = 'Продано';
        const k = $('[data-sact="keep"]', card); if (k) k.remove();
        $('#winTotal').textContent = money(total()); drawSellAll();
      },
      keep(b) {
        const u = +b.dataset.u, card = b.closest('.win-card');
        if (kept.has(u)) kept.delete(u); else kept.add(u);
        const on = kept.has(u);
        card.classList.toggle('kept', on);
        b.classList.toggle('on', on);
        b.innerHTML = on ? `${ICON.check} В инвентаре` : 'В инвентарь';
        const sell = $('[data-sact="sellOne"]', card); if (sell) sell.hidden = on;
        SFX.click(); drawSellAll();
      },
      async sellAll(b, close) {
        const left = toSell().map(i => i.u);
        if (left.length) await sellWithFx(left, kept.size ? 'Продано остальное' : 'Продано всё');
        close();
        if (kept.size) notify({ title: `${kept.size} предм. оставлено в инвентаре`, icon: ICON.check, color: 'rgba(10,132,255,.3)' });
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
  if ($('#freeBtn')) $('#freeBtn').disabled = false;
  VIEW.refreshBtns && VIEW.refreshBtns();
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
      ${ONLINE ? `<button class="btn steam" data-sact="steam">${gi('steam')} Вывести в Steam</button>` : ''}
    </div>`}`, {
    narrow: true,
    acts: {
      async sell(b, close) { b.disabled = true; await sellWithFx([it.u], 'Продано: ' + s.pat); close(); onChange && onChange(); },
      upg(b, close) { U.sel = new Set([it.u]); U.target = null; close(); location.hash = '#/upgrade'; },
      gift(b, close) { close(); setTimeout(() => giftSheet(it, onChange), 300); },
      steam(b, close) { close(); setTimeout(() => steamSheet([it.u], onChange), 300); },
    },
  });
}
function steamSheet(uids, onDone) {
  const its = S.inv.filter(i => uids.includes(i.u)), sum = r2(its.reduce((a, i) => a + i.p, 0));
  if (!its.length) return;
  const s = SK[its[0].s];
  openSheet(`
    <div class="steam-badge">${gi('steam')}</div>
    <h2>Вывести в Steam?</h2>
    <div class="subtitle">${its.length > 1 ? `${its.length} предм.` : esc(fullName(its[0]))} · ${money(sum)}<br>Предмет${its.length > 1 ? 'ы уйдут' : ' уйдёт'} из инвентаря насовсем и появ${its.length > 1 ? 'я' : 'и'}тся во вкладке «Steam» в профиле. Это понарошку — в настоящий Steam ничего не отправляется.</div>
    ${its.length === 1 ? `<div class="detail-art" style="--rc:${colOf(s)};height:140px"><div class="glow"></div><img src="${img(s.img)}" alt=""></div>` : ''}
    <div class="acts"><button class="btn" data-sact="close">Отмена</button><button class="btn steam" data-sact="ok">${gi('steam')} Вывести</button></div>`, {
    narrow: true,
    acts: {
      async ok(b, close) {
        b.disabled = true;
        try {
          const r = await API.withdraw(uids);
          SFX.coin(); close();
          notify({ title: 'Выведено в Steam', sub: `${r.n} предм. · смотри в профиле`, icon: gi('steam'), color: 'rgba(30,79,143,.5)', amt: money(r.sum), tall: true });
          onDone && onDone();
        } catch (e) { b.disabled = false; notifyErr(e); }
      },
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
const INV_FILTERS = [['all', 'Все'], ['rare', rareIco(null, 'sm')], ['covert', 'Тайные'], ['classified', 'Засекр.'], ['restricted', 'Запрещ.'], ['milspec', 'Армейские'], ['low', 'Прочие']];
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
  main.innerHTML = `${ptabsHTML('inventory')}
  <section class="inv-head glass edge">
    <div class="stat"><span>Предметов</span><b id="invN"></b></div>
    <div class="stat"><span>Стоимость инвентаря</span><b id="invV"></b></div>
    <div class="grow"></div>
    <button class="btn" data-act="selMode" id="selBtn">Выбрать</button>
    <button class="btn green" data-act="sellAll">Продать всё</button>
  </section>
  <div id="perkRow"></div>
  <div class="section-head">
    ${seg('f', INV_FILTERS, I.f, 'sm')}
    <div class="grow"></div>
    <div class="controls">
      <label class="search">${ICON.search}<input id="iq" placeholder="Поиск" value="${esc(I.q)}" autocomplete="off"></label>
      <select class="select" id="isort">${[['new', 'Сначала новые'], ['old', 'Сначала старые'], ['pd', 'Дороже'], ['pa', 'Дешевле']].map(([v, l]) => `<option value="${v}" ${I.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
  </div>
  <div id="invGrid"></div>
  <div class="actionbar glass edge" id="abar"><span class="n" id="abarT"></span><button class="btn sm" data-act="selClear">Отмена</button>${ONLINE ? `<button class="btn steam sm" data-act="steamSel">${gi('steam')} В Steam</button>` : ''}<button class="btn green sm" data-act="sellSel">Продать</button></div>`;
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
      if (a === 'steamSel') steamSheet([...I.sel], () => { I.sel.clear(); I.select = false; if ($('#invGrid')) drawInv(); });
      if (a === 'useLuck') {
        el.disabled = true;
        try {
          await API.useLuck(+el.dataset.id); SFX.win('classified'); drawLuck();
          notify({ title: 'Зелье удачи выпито!', sub: `Действует до ${new Date(S.luckUntil).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`, icon: gi('potion'), color: 'rgba(52,199,89,.4)', tall: true });
        } catch (e) { notifyErr(e); }
        drawInv();
      }
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
function drawPerks() {
  const row = $('#perkRow'); if (!row) return;
  const lucks = S.perks.filter(p => p.kind === 'luck');
  const tix = {}; S.perks.filter(p => p.kind === 'case').forEach(p => { tix[p.case_id] = (tix[p.case_id] || 0) + 1; });
  if (!lucks.length && !Object.keys(tix).length && !luckOn()) { row.innerHTML = ''; return; }
  row.innerHTML = `<div class="section-head"><h2 style="font-size:19px">Бонусы</h2><span class="sub">награды боевого пропуска</span></div><div class="perk-row">
    ${luckOn() ? `<div class="perk glass-flat on">${gi('potion')}<div class="t"><b>Удача активна</b><span>ещё <i data-luckleft>${hms(S.luckUntil - Date.now()).slice(3)}</i> · дропы и апгрейды лучше</span></div></div>` : ''}
    ${lucks.map(p => `<div class="perk glass-flat">${gi('potion')}<div class="t"><b>Зелье удачи · ${p.mins} мин</b><span title="40% открытий делают второй бросок и берут лучший предмет, шанс апгрейда ×1.1">дропы лучше · апгрейд ×1.1</span></div><button class="btn primary sm" data-act="useLuck" data-id="${p.id}">Использовать</button></div>`).join('')}
    ${Object.entries(tix).map(([id, n]) => { const c = caseById(id); return c ? `<div class="perk glass-flat">${gi('ticket')}<div class="t"><b>${esc(c.name)} ×${n}</b><span>бесплатн${n > 1 ? 'ые открытия' : 'ое открытие'}</span></div><button class="btn green sm" data-go="#/case/${id}">Открыть</button></div>` : ''; }).join('')}
  </div>`;
}
function drawInv() {
  drawPerks();
  $('#invN').textContent = S.inv.length;
  $('#invV').textContent = money(invValue());
  $('#selBtn').textContent = I.select ? 'Готово' : 'Выбрать';
  $('#selBtn').classList.toggle('primary', I.select);
  const l = invList(), g = $('#invGrid');
  if (!S.inv.length) g.innerHTML = `<div class="empty-state"><div class="ill">${gi('bag')}</div><h3>Инвентарь пуст</h3>Откройте пару кейсов — дропы появятся здесь.<br><button class="btn primary" data-go="#/">К кейсам</button></div>`;
  else if (!l.length) g.innerHTML = `<div class="empty-state"><div class="ill">${gi('search')}</div><h3>Нет предметов</h3>Под фильтр ничего не подходит</div>`;
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
    if (s.cat === 'equip' || s.cat === 'sticker' || s.cat === 'graffiti') continue;
    let code = null;
    if (s.mn != null) {
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
const chanceOf = () => U.target && U.sel.size ? Math.min(.9, selTotal() / U.target.p * .92 * (luckOn() ? 1.1 : 1)) : 0;
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
      <div class="upg-ctrl">${[1.2, 1.5, 2, 3, 5, 10, 20].map(m => `<button class="btn sm" data-act="mul" data-m="${m}">×${m}</button>`).join('')}</div>
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
    g.innerHTML = l.length ? `<div class="grid-items">${l.map(it => itemCard(it, { check: true, sel: U.sel.has(it.u), attr: `data-act="pickIn" data-u="${it.u}"` })).join('')}</div>` : `<div class="empty-state"><div class="ill">${gi('bag')}</div><h3>Нет предметов</h3>Откройте кейсы, чтобы было что апгрейдить<br><button class="btn primary" data-go="#/">К кейсам</button></div>`;
  } else {
    const m = market(), min = selTotal();
    const l = [];
    m.forEach((x, k) => { if (x.p > min && (!q || SK[x.s].name.toLowerCase().includes(q))) l.push(k); });
    const tk = U.target ? m.indexOf(U.target) : -1;
    const show = l.slice(0, 120);
    if (tk >= 0 && !show.includes(tk)) show.unshift(tk);
    g.innerHTML = `<div class="grid-items">${show.map(k => {
      const x = m[k];
      const ch = min ? Math.min(.9, min / x.p * .92 * (luckOn() ? 1.1 : 1)) : 0;
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
    notify({ title: 'Не повезло', sub: 'Предметы сгорели в апгрейде', icon: ICON.x, color: 'rgba(255,69,58,.35)' });
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
      <button class="case-pick" data-act="pickCase" id="bcPick"></button>
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
    $('#bcPick').innerHTML = `<span class="cp-art">${caseArt(c, '256fx192f')}</span><span class="cp-t"><b>${esc(c.name)}</b><small>${priceHTML(c)}</small></span><span class="cp-chev">▾</span>`;
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
      if (a === 'pickCase') casePicker(B.caseId, id => { B.caseId = id; drawForm(); });
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

function casePicker(cur, onPick) {
  const list = ALL_CASES.slice().sort((a, b) => a.price - b.price);
  openSheet(`<h2>Выбери кейс</h2>
    <label class="search cp-search">${ICON.search}<input id="cpQ" placeholder="Поиск кейса" autocomplete="off"></label>
    <div class="cp-grid">${list.map(c => `<button class="cp-item ${c.id === cur ? 'on' : ''}" data-sact="pick" data-id="${c.id}" data-n="${esc(c.name.toLowerCase())}">
      <span class="cp-img">${caseArt(c, '256fx192f')}</span><b>${esc(c.name)}</b><small>${priceHTML(c)}</small></button>`).join('')}</div>`, {
    acts: { pick(b, close) { onPick(b.dataset.id); SFX.click(); close(); } },
  });
  const q = document.querySelector('.scrim #cpQ');
  if (q) q.addEventListener('input', () => { const v = q.value.trim().toLowerCase(); document.querySelectorAll('.scrim .cp-item').forEach(x => { x.hidden = !!v && !x.dataset.n.includes(v); }); });
  const on = document.querySelector('.scrim .cp-item.on'); if (on) on.scrollIntoView({ block: 'center' });
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
  if (!b) { main.innerHTML = `<div class="empty-state"><div class="ill">${gi('swords')}</div><h3>Баттл не найден</h3><button class="btn" data-go="#/battles">К баттлам</button></div>`; return; }
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
    $('#btResult').innerHTML = `<div class="bt-win">${gi('trophy')} ${iWon ? 'Ты победил!' : `Победил ${esc(w ? w.nickname : '?')}`}<span>Банк: ${money(b.total)}${iWon ? ' — все предметы уже в твоём инвентаре' : ''}</span></div>
      <div class="acts"><button class="btn primary" data-act="again">Ещё такой же баттл</button><button class="btn" data-go="#/battles">Все баттлы</button></div>`;
    if (fx) {
      if (iWon) { SFX.win('covert'); notify({ title: 'Победа в баттле!', sub: 'Предметы в инвентаре', amt: '+' + money(b.total), amtColor: '#5ee07f', icon: gi('trophy'), color: 'rgba(255,214,10,.3)', tall: true }); }
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

/* ================= LEVELS / QUESTS / DAILY / PUMPKINS ================= */
// level L needs 50·L·(L-1) total XP: 2 → 100, 3 → 300, 4 → 600 …
function levelOf(xp) {
  let L = 1; while (50 * (L + 1) * L <= xp) L++;
  const base = 50 * L * (L - 1), next = 50 * (L + 1) * L;
  return { lvl: L, cur: xp - base, need: next - base, k: (xp - base) / (next - base) };
}
const QUESTS = {
  open: { t: [5, 25, 75, 200, 500, 1000, 2500], m: [10, 30, 75, 150, 300, 500, 1000], x: [50, 100, 200, 350, 500, 750, 1000], icon: gi('crate'), title: n => `Открой ${n} ${plural(n, 'кейс', 'кейса', 'кейсов')}`, cur: () => S.stats.opened },
  upgrades: { t: [1, 5, 15, 40, 100, 250], m: [10, 50, 120, 300, 700, 1500], x: [50, 120, 250, 450, 700, 1100], icon: gi('upgrade'), title: n => `Сделай ${n} ${plural(n, 'удачный апгрейд', 'удачных апгрейда', 'удачных апгрейдов')}`, cur: () => S.stats.upW },
  battles: { t: [1, 5, 15, 40, 100, 250], m: [15, 60, 150, 350, 800, 1500], x: [60, 150, 300, 500, 800, 1200], icon: gi('swords'), title: n => `Выиграй ${n} ${plural(n, 'баттл', 'баттла', 'баттлов')}`, cur: () => S.stats.bw, online: true },
  spent: { t: [50, 250, 1000, 5000, 20000, 100000], m: [5, 25, 100, 400, 1500, 6000], x: [40, 100, 250, 500, 900, 1500], icon: gi('coins'), title: n => `Потрать ${money(n)} на кейсы`, cur: () => S.stats.spent },
};
function plural(n, a, b, c) { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; }
function questDef(type, tier) {
  const d = QUESTS[type], n = d.t.length;
  return tier < n ? { target: d.t[tier], money: d.m[tier], xp: d.x[tier] } : { target: d.t[n - 1] * 2 ** (tier - n + 1), money: d.m[n - 1], xp: d.x[n - 1] };
}
const activeQuests = () => Object.keys(QUESTS).filter(k => ONLINE || !QUESTS[k].online);
const questReady = k => QUESTS[k].cur() >= questDef(k, S.quests[k] || 0).target;
const utcDay = off => new Date(Date.now() + off * 864e5).toISOString().slice(0, 10);
const msToUtcMidnight = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d.getTime(); };
const hms = ms => { const t = Math.max(0, Math.floor(ms / 1000)), p = n => String(n).padStart(2, '0'); return `${p(Math.floor(t / 3600))}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)}`; };
const dailyAmount = st => st >= 31 ? 200 + 25 * Math.floor((st - 31) / 30) : st >= 8 ? 70 : 50;
const dailyReady = () => S.dailyLast !== utcDay(0);
const nextStreak = () => S.dailyLast === utcDay(-1) || S.dailyLast === utcDay(0) ? S.dailyStreak + (dailyReady() ? 1 : 0) : 1;
const BPMAP = Object.fromEntries((window.BP || []).map(r => [r.level, r]));
function bpReward(lv) {
  if (BPMAP[lv]) return BPMAP[lv];
  const free = lv % 7 === 0;
  return lv % 10 === 0 ? { level: lv, kind: 'case', case_id: 'c-knife-budget', n: 1, free } : lv % 5 === 0 ? { level: lv, kind: 'luck', mins: 30, free } : { level: lv, kind: 'money', amount: 100, free };
}
const BP_END = new Date('2026-12-02T23:59:59+02:00'), BP_PRICE = 200;
const bpEnded = () => Date.now() >= BP_END;
const bpOpen = lv => bpReward(lv).free || S.bpPremium;
const bpUnclaimed = () => { if (!ONLINE || bpEnded()) return []; const L = levelOf(S.xp || 0).lvl, out = []; for (let l = 2; l <= L; l++) if (!S.bpClaimed.includes(l)) out.push(l); return out; };
const bpReadyList = () => bpUnclaimed().filter(bpOpen);
const bpLockedList = () => bpUnclaimed().filter(l => !bpOpen(l));
function buyPassSheet(onDone) {
  const locked = bpLockedList();
  openSheet(`
    <div class="bp-crown">${gi('trophy')}</div>
    <h2>Премиум боевой пропуск</h2>
    <div class="subtitle">Открывает все награды сезона: скины вплоть до Karambit | Fade, ножевые кейсы, пачки открытий и зелья удачи. Бесплатная дорожка — около 15% наград, остальное только в премиуме.${locked.length ? `<br><b>Уже доступно сразу: ${locked.length} наград${locked.length === 1 ? 'а' : locked.length < 5 ? 'ы' : ''}.</b>` : ''}<br>Сезон до ${BP_END.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.</div>
    <div class="acts"><button class="btn" data-sact="close">Позже</button><button class="btn primary" data-sact="ok">Купить за ${money(BP_PRICE)}</button></div>`, {
    narrow: true,
    acts: {
      async ok(b, close) {
        b.disabled = true;
        try {
          const r = await rpc('buy_pass');
          S.bpPremium = true; setBal(+r.balance); SFX.win('covert'); close(); drawLevel();
          notify({ title: 'Премиум пропуск активен!', sub: locked.length ? `Можно забрать ещё ${locked.length} наград` : 'Все награды сезона открыты', icon: gi('trophy'), color: 'rgba(255,214,10,.35)', tall: true });
          onDone && onDone();
        } catch (e) { b.disabled = false; notifyErr(e); }
      },
    },
  });
}
function bpName(r) {
  if (r.kind === 'money') return money(r.amount);
  if (r.kind === 'luck') return `Зелье удачи · ${r.mins} мин`;
  if (r.kind === 'case') { const c = caseById(r.case_id); return `${c ? esc(c.name) : 'Кейс'}${r.n > 1 ? ' ×' + r.n : ''}`; }
  const sk = SK[r.skin_id]; return sk ? `${esc(wpnLabel(sk))} | ${esc(sk.pat)} <small>(${r.code})</small>` : 'Скин';
}
function bpArt(r) {
  if (r.kind === 'money') return `<div class="bp-ico">${gi('coins')}</div>`;
  if (r.kind === 'luck') return `<div class="bp-ico">${gi('potion')}</div>`;
  if (r.kind === 'case') { const c = caseById(r.case_id); return c ? `<div class="bp-case">${caseArt(c, '256fx192f')}${r.n > 1 ? `<span class="bp-n">×${r.n}</span>` : ''}</div>` : ''; }
  const sk = SK[r.skin_id]; return sk ? `<div class="bp-skin" style="--rc:${colOf(sk)}"><img src="${img(sk.img, '256fx192f')}" alt="" loading="lazy" decoding="async"></div>` : '';
}
const bpSub = r => r.kind === 'case' ? 'бесплатн' + (r.n > 1 ? 'ые открытия' : 'ое открытие') : r.kind === 'skin' ? 'скин в инвентарь' : r.kind === 'luck' ? 'кладётся в инвентарь' : 'на баланс';
const anythingToClaim = () => dailyReady() || activeQuests().some(questReady) || bpReadyList().length > 0;

const lvlEl = $('#lvlBadge');
const luckEl = $('#luckChip');
function drawLuck() {
  if (!luckEl) return;
  const on = luckOn();
  luckEl.hidden = !on;
  if (on) luckEl.innerHTML = `${gi('potion')}<b>${hms(S.luckUntil - Date.now()).slice(3)}</b>`;
  $$('[data-luckleft]').forEach(e => { e.textContent = hms(S.luckUntil - Date.now()).slice(3); });
}
setInterval(drawLuck, 1000);
function drawLevel() {
  const L = levelOf(S.xp || 0);
  if (lvlEl) {
    lvlEl.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="3"/><circle cx="20" cy="20" r="17" fill="none" stroke="url(#lvg)" stroke-width="3" stroke-linecap="round" stroke-dasharray="${106.8 * L.k} 200" transform="rotate(-90 20 20)"/><defs><linearGradient id="lvg"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#b26bff"/></linearGradient></defs></svg><b>${L.lvl}</b>${anythingToClaim() ? '<i class="dot"></i>' : ''}`;
    lvlEl.title = `Уровень ${L.lvl} · ${L.cur}/${L.need} XP — квесты и ежедневный бонус`;
  }
  $$('[data-r="quests"]').forEach(b => b.classList.toggle('has-dot', anythingToClaim()));
}
setInterval(drawLevel, 5000);

async function claimDaily(btn) {
  if (btn) btn.disabled = true;
  try {
    const r = await API.daily();
    setBal(r.balance); SFX.win(r.amount >= 200 ? 'rare' : 'covert');
    notify({ title: `Ежедневный бонус · день ${r.streak}`, sub: r.streak >= 7 ? 'Стрик держится — так держать!' : `С 8-го дня подряд — по $70`, icon: gi('calendar'), color: 'rgba(255,159,10,.4)', amt: '+' + money(r.amount), amtColor: '#ffd60a', tall: true, ms: 4000 });
  } catch (e) { notifyErr(e); }
  drawLevel(); VIEW.refresh && VIEW.refresh();
}
async function claimLevels(levels, btn) {
  if (btn) btn.disabled = true;
  let money_ = 0, got = [], other = [];
  for (const lv of levels) {
    try {
      const r = await API.claimLevel(lv), rw = bpReward(lv);
      setBal(r.balance);
      if (r.kind === 'money') money_ += +rw.amount; else if (r.item) got.push(r.item); else other.push(rw);
    } catch (e) { notifyErr(e); break; }
  }
  drawLevel();
  if (got.length) {
    const best = got.reduce((a, b) => b.p > a.p ? b : a);
    SFX.win(SK[best.s].star ? 'rare' : 'covert');
    notify({ title: fullName(best), sub: 'Награда боевого пропуска — в инвентаре', icon: thumbIco(best.s), amt: money(best.p), tall: true, ms: 4000 });
  } else if (other.length) {
    SFX.win('classified');
    const r = other[other.length - 1];
    notify({ title: 'Награда получена!', sub: other.length > 1 ? `${other.length} наград — смотри в инвентаре` : bpName(r).replace(/<[^>]+>/g, '') + ' — в инвентаре', icon: gi(r.kind === 'luck' ? 'potion' : 'ticket'), color: 'rgba(255,214,10,.3)', amt: money_ ? '+' + money(money_) : '', amtColor: '#5ee07f', tall: true });
  } else if (money_) {
    SFX.coin();
    notify({ title: 'Награда боевого пропуска', icon: gi('coins'), color: 'rgba(48,209,88,.3)', amt: '+' + money(money_), amtColor: '#5ee07f', tall: true });
  }
}
async function claimQuest(type, btn) {
  if (btn) btn.disabled = true;
  try {
    const r = await API.claimQuest(type);
    setBal(r.balance); SFX.win('classified');
    notify({ title: 'Квест выполнен!', sub: `+${r.xp} XP`, icon: QUESTS[type].icon, color: 'rgba(48,209,88,.35)', amt: '+' + money(r.money), amtColor: '#5ee07f', tall: true });
  } catch (e) { notifyErr(e); }
  drawLevel(); VIEW.refresh && VIEW.refresh();
}

function viewQuests() {
  const draw = () => {
    const L = levelOf(S.xp || 0), st = nextStreak(), ready = dailyReady();
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = Math.max(1, st - (ready ? 0 : 0) - 3) + i;
      const done = day < st || (!ready && day === st);
      return `<div class="dday ${done ? 'done' : ''} ${day === st ? 'today' : ''}"><span>день ${day}</span><b>${money(dailyAmount(day)).replace('.00', '')}</b></div>`;
    }).join('');
    const pk = Array.from({ length: PK_TOTAL }, (_, i) => `<i class="${S.pumpkins.includes(i + 1) ? 'on' : ''}">${gi('pumpkin')}</i>`).join('');
    const bpReady = bpReadyList(), maxLv = Math.max(50, L.lvl + 10);
    const bpCards = ONLINE ? Array.from({ length: maxLv - 1 }, (_, i) => {
      const lv = i + 2, r = bpReward(lv), done = S.bpClaimed.includes(lv), reached = !done && lv <= L.lvl && !bpEnded(), can = reached && bpOpen(lv);
      return `<div class="bp-card ${done ? 'done' : can ? 'ready' : reached ? 'prem-lock' : 'locked'} k-${r.kind} ${r.free ? 'is-free' : 'is-prem'}" data-lv="${lv}">
        <div class="bp-lv">${lv}</div><span class="bp-tag">${r.free ? 'FREE' : 'PREMIUM'}</span>${bpArt(r)}
        <div class="bp-name">${bpName(r)}</div><div class="bp-sub">${bpSub(r)}</div>
        ${done ? `<span class="bp-state">${ICON.check} получено</span>` : can ? `<button class="btn green sm" data-act="bp" data-lv="${lv}">Забрать</button>` : reached ? `<button class="btn sm prem" data-act="buyPass">${ICON.lock || ''}Премиум</button>` : `<span class="bp-state">с ${lv} уровня</span>`}
      </div>`;
    }).join('') : '';
    main.innerHTML = `
    <section class="lvl-card glass edge">
      <div class="lvl-big"><b>${L.lvl}</b><span>уровень</span></div>
      <div class="lvl-info">
        <h1>Квесты и награды</h1>
        <div class="xpbar"><i style="width:${(L.k * 100).toFixed(1)}%"></i></div>
        <div class="ev-note">${L.cur} / ${L.need} XP до ${L.lvl + 1} уровня · всего ${S.xp || 0} XP</div>
      </div>
    </section>
    ${ONLINE ? `<div class="section-head"><h2>${gi('ticket')} Боевой пропуск</h2><span class="sub">награда за каждый уровень · XP дают кейсы, апгрейды, баттлы, подъём и квесты</span></div>
    <div class="bp-head glass-flat ${S.bpPremium ? 'premium' : ''}">
      <div class="bp-season"><span>Сезон 1 · ${bpEnded() ? 'завершён' : 'до ' + BP_END.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span><b>${bpEnded() ? 'Скоро зимний сезон' : `осталось ${Math.ceil((BP_END - Date.now()) / 864e5)} дн.`}</b></div>
      <div class="bp-plan"><span>Дальше</span><b>${gi('sparkle')} зимний сезон</b></div>
      <div class="bp-plan"><span>Бесплатно</span><b>${(window.BP || []).filter(r => r.free).length} из ${(window.BP || []).length} наград</b></div>
      <div class="bp-plan prem"><span>Премиум</span><b>${S.bpPremium ? `${ICON.check} активен` : `все награды · ${money(BP_PRICE)}`}</b></div>
      <div class="grow"></div>${bpReady.length > 1 ? `<button class="btn green sm" data-act="bpAll">Забрать всё (${bpReady.length})</button>` : ''}
      ${!S.bpPremium && !bpEnded() ? `<button class="btn primary sm" data-act="buyPass">Купить премиум${bpLockedList().length ? ` · ${bpLockedList().length} наград ждут` : ''}</button>` : ''}</div>
    <div class="bp-track glass-flat" id="bpTrack">${bpCards}</div>` : ''}
    <div class="q-top">
      <section class="q-card daily glass-flat">
        <div class="q-head"><span class="q-ico">${gi('calendar')}</span><div><h3>Ежедневный бонус</h3><div class="ev-note">${gi('flame')} Стрик: ${S.dailyLast === utcDay(0) || S.dailyLast === utcDay(-1) ? S.dailyStreak : 0} ${plural(S.dailyStreak, 'день', 'дня', 'дней')} подряд</div></div></div>
        <div class="days">${days}</div>
        <div class="ev-note rules">Дни 1–7: $50 · с 8-го дня: $70 · с 31-го: $200 · каждый следующий месяц +$25. Пропустил день — стрик с начала.</div>
        ${ready ? `<button class="btn primary big" data-act="daily">Забрать ${money(dailyAmount(st))}</button>` : `<button class="btn big" disabled>Следующий через <span id="dailyCd">${hms(msToUtcMidnight())}</span></button>`}
      </section>
      <section class="q-card pumpkin glass-flat">
        <div class="q-head"><span class="q-ico">${gi('pumpkin')}</span><div><h3>Охота на тыквы</h3><div class="ev-note">${S.pumpkins.length} из ${PK_TOTAL} найдено</div></div></div>
        <div class="pk-grid">${pk}</div>
        <div class="ev-note rules">По всему сайту спрятано ${PK_TOTAL} маленьких тыкв — на разных страницах, в углах и за заголовками. Нажми на тыкву, чтобы забрать её. Найдёшь все — получишь <b>$1000</b> и 500 XP.</div>
        <div class="q-reward ${S.pumpkinDone ? 'done' : ''}">${S.pumpkinDone ? '✓ Награда $1000 получена' : 'Награда: $1000 + 500 XP'}</div>
      </section>
    </div>
    ${ONLINE ? sqHTML() : ''}
    <div class="section-head"><h2>Задания</h2><span class="sub">награда растёт с каждым уровнем задания</span></div>
    <div class="q-list stagger">${activeQuests().map((k, i) => {
      const q = QUESTS[k], tier = S.quests[k] || 0, d = questDef(k, tier), cur = Math.min(q.cur(), d.target), ok = q.cur() >= d.target;
      return `<div class="q-item glass-flat ${ok ? 'ready' : ''}" style="--i:${i}">
        <span class="q-ico">${q.icon}</span>
        <div class="q-body"><b>${q.title(d.target)}</b><span class="q-tier">этап ${tier + 1}</span>
          <div class="xpbar small"><i style="width:${(cur / d.target * 100).toFixed(1)}%"></i></div>
          <span class="ev-note">${k === 'spent' ? money(cur) + ' / ' + money(d.target) : cur + ' / ' + d.target}</span></div>
        <div class="q-prize"><b>${money(d.money)}</b><span>+${d.xp} XP</span></div>
        <button class="btn ${ok ? 'green' : ''} sm" data-act="quest" data-q="${k}" ${ok ? '' : 'disabled'}>${ok ? 'Забрать' : 'В процессе'}</button>
      </div>`;
    }).join('')}</div>`;
  };
  const scrollBp = () => { const tr = $('#bpTrack'); if (!tr) return; const L = levelOf(S.xp || 0).lvl, first = bpReadyList()[0] || L + 1; const card = $(`.bp-card[data-lv="${first}"]`, tr); if (card) tr.scrollLeft = card.offsetLeft - tr.offsetLeft - 16; };
  draw(); scrollBp();
  const t = setInterval(() => { const e = $('#dailyCd'); if (e) e.textContent = hms(msToUtcMidnight()); if (!dailyReady() || !e) return; draw(); }, 1000);
  VIEW = {
    destroy() { clearInterval(t); },
    refresh: draw,
    act(a, el) {
      if (a === 'daily') claimDaily(el);
      if (a === 'quest') claimQuest(el.dataset.q, el);
      if (a === 'bp') claimLevels([+el.dataset.lv], el).then(() => { const k = $('#bpTrack') && $('#bpTrack').scrollLeft; draw(); if ($('#bpTrack')) $('#bpTrack').scrollLeft = k; });
      if (a === 'bpAll') claimLevels(bpReadyList(), el).then(() => { draw(); scrollBp(); });
      if (a === 'buyPass') buyPassSheet(() => { draw(); scrollBp(); });
      if (a === 'sqClaim') claimSteamQuest(el, draw);
    },
  };
}

// ---- pumpkin hunt: 20 little pumpkins hidden around the site ----
const PK_TOTAL = 20;
const PK_SPOTS = [
  [1, '*', 'footer', 'right:14%;top:2px'],
  [2, '*', '.ticker .lbl', 'right:2px;bottom:0'],
  [3, '', '.season-hero', 'left:16px;bottom:12px'],
  [4, '', '#casesHead h2', 'right:-30px;top:2px'],
  [5, '', '.grp-head.grp-knives', 'right:4px;top:6px'],
  [6, '', '.grp-head.grp-official', 'right:30%;top:8px'],
  [7, '', '.grp-head.grp-stickers h2', 'right:-28px;top:-6px'],
  [8, 'case', '.case-top .head', 'right:110px;bottom:-6px'],
  [9, 'case', '.case-stage', 'right:6%;bottom:6px'],
  [10, 'case', '.contents-legend', 'right:-26px;top:2px'],
  [11, 'inventory', '.inv-head', 'right:16px;top:6px'],
  [12, 'inventory', '#invGrid', 'left:2px;bottom:-28px'],
  [13, 'upgrade', '.upg', 'left:18px;bottom:12px'],
  [14, 'upgrade', '.upg-ctrl', 'right:0;bottom:-6px'],
  [15, 'battles', '.battle-create', 'right:16px;bottom:12px'],
  [16, 'battles', '#doneList', 'right:0;bottom:-28px'],
  [17, 'top', '#topList', 'left:48%;bottom:-28px'],
  [18, 'top', '.section-head h2', 'right:-28px;top:0'],
  [19, 'profile', '.stats', 'right:-4px;bottom:-12px'],
  [20, 'quests', '.lvl-card', 'right:22px;bottom:12px'],
];
let pkRaf = 0, pkReady = !ONLINE;
function placePumpkins() {
  pkRaf = 0;
  if (ONLINE && (!ME || !pkReady)) return;
  // a pumpkin may have been drawn before the list arrived or found in another tab
  for (const el of document.querySelectorAll('.pk:not(.got)')) if (S.pumpkins.includes(+el.dataset.pk)) el.remove();
  const r = location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0];
  for (const [id, route, sel, css] of PK_SPOTS) {
    if (S.pumpkins.includes(id) || (route !== '*' && route !== r)) continue;
    const el = document.querySelector(sel);
    if (!el || el.querySelector(`:scope > .pk[data-pk="${id}"]`)) continue;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.insertAdjacentHTML('beforeend', `<button class="pk" data-pk="${id}" style="${css}" aria-label="тыква">${gi('pumpkin')}</button>`);
  }
}
const schedulePk = () => { if (!pkRaf) pkRaf = requestAnimationFrame(placePumpkins); };
new MutationObserver(schedulePk).observe(document.body, { childList: true, subtree: true });
document.addEventListener('click', async e => {
  const pk = e.target.closest('.pk');
  if (!pk) return;
  e.stopPropagation(); e.preventDefault();
  if (pk.dataset.busy) return;
  pk.dataset.busy = 1;
  const id = +pk.dataset.pk, before = S.pumpkins.length;
  try {
    const r = await API.pumpkin(id);
    pk.classList.add('got'); setTimeout(() => pk.remove(), 600);
    if (r.found <= before && !r.reward) {
      notify({ title: 'Эта тыква уже найдена', sub: `${r.found}/${PK_TOTAL} · ищи оставшиеся на других страницах`, icon: gi('pumpkin'), color: 'rgba(255,138,31,.25)' });
    } else if (r.reward) {
      setBal(r.balance); SFX.win('rare');
      notify({ title: 'Все 20 тыкв найдены!', sub: 'Награда за охоту на тыквы + 500 XP', icon: gi('pumpkin'), color: 'rgba(255,138,31,.5)', amt: '+' + money(r.reward), amtColor: '#ffd60a', tall: true, ms: 6000 });
    } else {
      SFX.ping();
      notify({ title: `Тыква найдена! ${r.found}/${PK_TOTAL}`, sub: r.found >= PK_TOTAL ? 'Все найдены' : `Осталось ${PK_TOTAL - r.found} — ищи на других страницах`, icon: gi('pumpkin'), color: 'rgba(255,138,31,.4)' });
    }
    drawLevel(); VIEW.refresh && location.hash.startsWith('#/quests') && VIEW.refresh();
  } catch (err) { delete pk.dataset.busy; notifyErr(err); }
}, true);

/* ================= CLIMB: the operator runs up the stairs ================= */
const RUNNER_SVG = `<svg viewBox="0 0 48 64" aria-hidden="true">
  <g class="leg back"><path d="M22 38l-1 11 1 9" stroke="#262a30" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M21 59.5h7.5" stroke="#0f1114" stroke-width="4.2" stroke-linecap="round"/></g>
  <g class="arm back"><path d="M20 25l-4 8 5 3" stroke="#3a472e" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>
  <path d="M15.5 22.5h14.5l2.2 17H14.6z" fill="#4c5c3d"/>
  <rect x="15" y="23" width="17.4" height="13.6" rx="3.2" fill="#2f3a28"/>
  <rect x="17" y="29.6" width="4.2" height="5.4" rx="1.1" fill="#43523a"/><rect x="22.6" y="29.6" width="4.2" height="5.4" rx="1.1" fill="#43523a"/>
  <path d="M15.5 38.8h16.6" stroke="#1c1f17" stroke-width="2.2"/>
  <rect x="22" y="19" width="5" height="4.5" rx="1.5" fill="#22252b"/>
  <circle cx="25" cy="14.6" r="7.1" fill="#1d1f24"/>
  <rect x="25.2" y="12.4" width="7.4" height="3.4" rx="1.7" fill="#e2b48a"/><circle cx="30.4" cy="14.1" r=".95" fill="#111"/>
  <path d="M17.4 13.2a7.7 7.7 0 0 1 15.3 0v1.2H17.4z" fill="#5a6e32"/>
  <path d="M16.2 14.6h17.8" stroke="#3e4f22" stroke-width="2.1" stroke-linecap="round"/>
  <path d="M19.5 9.6c1.4-1.8 3.4-2.6 5.6-2.6" stroke="#fff" stroke-opacity=".35" stroke-width="1.1" stroke-linecap="round" fill="none"/>
  <path d="M20 29.6h24.5v2.8H31.4l-2.2 5.2h-3.1l1.1-5.2H20z" fill="#18191b"/>
  <path d="M30.4 32.4h3.2l-1.3 5.4h-3.2z" fill="#8a5424"/>
  <rect x="41" y="28.2" width="6.6" height="1.6" rx=".6" fill="#18191b"/>
  <rect x="24" y="27.8" width="9" height="1.9" rx=".8" fill="#2c2e31"/>
  <g class="arm front"><path d="M21 25.4l5.6 5.4 7.6-.6" stroke="#4c5c3d" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="34.4" cy="30.2" r="2.1" fill="#1a1a1a"/></g>
  <g class="leg front"><path d="M23 38l1 11-1 9" stroke="#33383f" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M22 59.5h8" stroke="#0f1114" stroke-width="4.4" stroke-linecap="round"/></g>
</svg>`;
const CL = { mode: 'bal', amt: 1, target: 2, sel: new Set(), busy: false, live: [], pend: [] };
const CK = .22, CSTEP = .45;
const mAt = t => Math.exp(CK * t), tAt = m => Math.log(m) / CK;
const crashCol = m => m < 1.5 ? '#ff453a' : m < 2 ? '#ff9f0a' : m < 10 ? '#30d158' : '#ffd60a';
function niceStep(range) { for (const s of [.1, .25, .5, 1, 2, 5, 10, 25, 50, 100, 250]) if (range / s <= 5) return s; return 500; }

// draws the staircase up to time t; returns where the runner stands
function drawClimb(cv, t, target, crashed) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const pl = 44, pb = 28, pt = 26, pr = 30;
  const tMax = Math.max(6, t * 1.28), mNow = mAt(t);
  let mMax = Math.max(2, mNow * 1.4);
  if (target && target < mMax * 1.7) mMax = Math.max(mMax, target * 1.14);
  const X = tt => pl + tt / tMax * (W - pl - pr), Y = m => H - pb - (m - 1) / (mMax - 1) * (H - pb - pt);
  // grid
  const st = niceStep(mMax - 1);
  g.font = '600 11px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let m = 1; m <= mMax + 1e-9; m += st) {
    const y = Y(m);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; g.beginPath(); g.moveTo(pl, y); g.lineTo(W - pr / 2, y); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.38)'; g.fillText((+m.toFixed(2)) + 'x', pl - 8, y);
  }
  // stairs
  const pts = [[X(0), Y(1)]];
  let ts = 0;
  for (; ts < t; ts += CSTEP) {
    const m = mAt(ts), te = Math.min(ts + CSTEP, t);
    pts.push([X(ts), Y(m)], [X(te), Y(m)]);
  }
  const cur = mAt(Math.max(0, ts - CSTEP));
  const grad = g.createLinearGradient(0, pt, 0, H - pb);
  grad.addColorStop(0, crashed ? 'rgba(255,69,58,.55)' : 'rgba(255,138,31,.55)'); grad.addColorStop(1, 'rgba(124,58,237,.08)');
  g.beginPath(); g.moveTo(X(0), H - pb);
  pts.forEach(([x, y]) => g.lineTo(x, y));
  g.lineTo(pts[pts.length - 1][0], H - pb); g.closePath(); g.fillStyle = grad; g.fill();
  // step faces (risers) a bit darker
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1;
  for (let i = 2; i < pts.length; i += 2) { g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i][0], H - pb); g.stroke(); }
  g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
  g.strokeStyle = crashed ? '#ff6b5e' : '#ffb347'; g.lineWidth = 3; g.lineJoin = 'round'; g.shadowColor = crashed ? '#ff453a' : '#ff8a1f'; g.shadowBlur = 14; g.stroke(); g.shadowBlur = 0;
  // target line
  if (target && Y(target) > pt - 4) {
    const y = Y(target), ok = mNow >= target;
    g.setLineDash([7, 6]); g.strokeStyle = ok ? '#30d158' : 'rgba(255,255,255,.55)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(pl, y); g.lineTo(W - pr / 2, y); g.stroke(); g.setLineDash([]);
    g.textAlign = 'right'; g.fillStyle = ok ? '#30d158' : 'rgba(255,255,255,.75)'; g.font = '800 12px system-ui, sans-serif';
    g.fillText(`цель ${target.toFixed(2)}x`, W - pr / 2, y - 10);
  }
  // runner: standing on the current stair, hopping up near the end of each step
  const frac = (t % CSTEP) / CSTEP, yCur = Y(cur), yNext = Y(mAt(Math.max(0, ts)));
  let ry = yCur;
  if (t > 0 && frac > .62) { const k = (frac - .62) / .38; ry = yCur + (yNext - yCur) * k - Math.sin(k * Math.PI) * 9; }
  return { x: X(t), y: ry, W, H };
}

function viewClimb() {
  if (!ONLINE) { main.innerHTML = onlineOnly('Подъём доступен онлайн'); return; }
  const tk = viewToken;
  main.innerHTML = `
  <section class="climb glass edge">
    <div class="climb-top"><h1>${gi('flame')} Подъём</h1><span class="ev-note">Боец бежит по ступенькам вверх, множитель растёт — и в любой момент он может споткнуться. Дошёл до твоей цели — забираешь ставку × цель.</span></div>
    <div class="cl-hist" id="clHist"></div>
    <div class="climb-stage" id="clStage">
      <canvas id="clCv"></canvas>
      <div class="cl-mult" id="clMult">1.00x</div>
      <div class="cl-msg" id="clMsg">Сделай ставку</div>
      <div class="runner idle" id="clRunner">${RUNNER_SVG}</div>
      <button class="btn sm cl-skip" id="clSkip" data-act="skip" hidden>Пропустить ⏩</button>
    </div>
  </section>
  <div class="climb-form">
    <section class="glass-flat cl-box">
      <div class="cl-head"><b>Ставка</b>${seg('clmode', [['bal', 'Баланс'], ['skins', 'Скины']], CL.mode, 'sm')}</div>
      <div id="clBet"></div>
    </section>
    <section class="glass-flat cl-box">
      <div class="cl-head"><b>Цель</b><span class="ev-note">где боец должен быть, чтобы ты выиграл</span></div>
      <label class="cl-target"><input id="clTarget" type="number" min="1.01" max="1000" step="0.01" value="${CL.target}"><span>x</span></label>
      <div class="cl-chips">${[1.2, 1.5, 2, 3, 5, 10, 25, 100].map(m => `<button class="btn sm" data-act="tg" data-m="${m}">${m}x</button>`).join('')}</div>
      <div class="cl-info" id="clInfo"></div>
      <button class="btn primary big" id="clGo" data-act="go">Поставить</button>
    </section>
  </div>
  <div class="section-head"><h2>Последние подъёмы</h2><span class="sub">все игроки, в реальном времени</span></div>
  <div class="list glass-flat" id="clLive"></div>`;
  const stage = $('#clStage'), cv = $('#clCv'), runner = $('#clRunner');
  const place = (pos, rot = 0, dy = 0) => { runner.style.transform = `translate(${pos.x - 24}px, ${pos.y - 62 + dy}px) rotate(${rot}deg)`; };
  const idle = () => place(drawClimb(cv, 0, +CL.target || 0, false));
  idle();
  const betTotal = () => CL.mode === 'skins' ? r2(S.inv.filter(i => CL.sel.has(i.u)).reduce((a, i) => a + i.p, 0)) : r2(+CL.amt || 0);
  const drawInfo = () => {
    const t = +CL.target, b = betTotal(), ok = t >= 1.01 && t <= 1000;
    $('#clInfo').innerHTML = ok ? `<div><span>Шанс дойти</span><b>${Math.min(96, 96 / t).toFixed(2)}%</b></div><div><span>Ставка</span><b>${money(b)}</b></div><div><span>Выигрыш</span><b class="g">${money(r2(b * t))}</b></div>` : '<div><span>Цель: от 1.01x до 1000x</span></div>';
    if (!CL.busy) idle();
  };
  const drawBet = () => {
    const box = $('#clBet'); if (!box) return;
    if (CL.mode === 'bal') {
      box.innerHTML = `<label class="cl-amt"><span>$</span><input id="clAmt" type="number" min="0.1" step="0.01" value="${CL.amt}"></label>
      <div class="cl-chips">${[['h', '½'], ['d', '×2'], ['p1', '+1'], ['p10', '+10'], ['p100', '+100'], ['max', 'Всё']].map(([k, l]) => `<button class="btn sm" data-act="amt" data-k="${k}">${l}</button>`).join('')}</div>`;
    } else {
      const list = S.inv.slice().sort((a, b) => b.p - a.p).slice(0, 80);
      box.innerHTML = list.length ? `<div class="ev-note">Выбрано ${CL.sel.size} из 20 · ${money(betTotal())}</div><div class="cl-skins">${list.map(it => itemCard(it, { check: true, sel: CL.sel.has(it.u), attr: `data-act="pick" data-u="${it.u}"` })).join('')}</div>`
        : `<div class="ev-note">Инвентарь пуст — открой кейс или ставь баланс.</div>`;
    }
    drawInfo();
  };
  const drawHist = () => { const h = $('#clHist'); if (h) h.innerHTML = CL.live.slice(0, 16).map(r => `<span style="--c:${crashCol(+r.crash)}">${(+r.crash).toFixed(2)}x</span>`).join(''); };
  const drawLive = () => {
    const l = $('#clLive'); if (!l) return;
    l.innerHTML = CL.live.length ? CL.live.slice(0, 15).map(r => `<div class="li cl-row ${r.win ? 'w' : 'l'}"><div class="t"><b>${esc(r.nickname)}</b><span>${r.skins ? `${r.skins} скин.` : 'баланс'} · цель ${(+r.target).toFixed(2)}x · упал на <i style="color:${crashCol(+r.crash)}">${(+r.crash).toFixed(2)}x</i></span></div><div class="p">${r.win ? '+' + money(+r.payout) : '−' + money(+r.bet)}</div></div>`).join('')
      : '<div class="li"><div class="t"><span>Пока никто не бегал — будь первым</span></div></div>';
  };
  const loadLive = async () => {
    const { data } = await sb.from('climbs').select('*').order('id', { ascending: false }).limit(30);
    if (tk !== viewToken) return;
    CL.live = data || []; drawHist(); drawLive();
  };
  loadLive();
  const ch = sb.channel('climbs-' + Date.now()).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'climbs' }, ({ new: row }) => {
    if (CL.busy && ME && row.user_id === ME.id) { CL.pend.push(row); return; }
    CL.live.unshift(row); CL.live = CL.live.slice(0, 30); drawHist(); drawLive();
  }).subscribe();
  drawBet();
  const ro = new ResizeObserver(() => { if (!CL.busy) idle(); }); ro.observe(stage);

  let skip = false;
  function animate(r, target) {
    return new Promise(done => {
      const msg = $('#clMsg'), mult = $('#clMult'), tEnd = tAt(Math.max(1, r.crash)), tWin = r.win ? tAt(target) : Infinity;
      let t = 0, last = performance.now(), won = false, crashed = false, fallT = 0, lastStep = -1, crashPos = null;
      runner.className = 'runner run'; stage.classList.remove('crashed', 'won');
      msg.textContent = ''; $('#clSkip').hidden = false; skip = false;
      const frame = now => {
        if (tk !== viewToken) return done();
        const dt = Math.min(.05, (now - last) / 1000) * (skip ? 14 : 1); last = now;
        if (!crashed) {
          t = Math.min(tEnd, t + dt);
          const step = Math.floor(t / CSTEP); if (step !== lastStep) { lastStep = step; if (step > 0) SFX.tick(); }
          const pos = drawClimb(cv, t, target, false); place(pos);
          mult.textContent = mAt(t).toFixed(2) + 'x';
          if (!won && t >= tWin) {
            won = true; stage.classList.add('won'); SFX.win('covert');
            msg.innerHTML = `Цель ${target.toFixed(2)}x взята! <b>+${money(r.payout)}</b>`;
          }
          if (t >= tEnd) {
            crashed = true; crashPos = pos; stage.classList.add('crashed'); SFX.fail();
            runner.className = 'runner fall'; mult.textContent = r.crash.toFixed(2) + 'x';
            drawClimb(cv, t, target, true);
            msg.innerHTML = won ? `Забрал на ${target.toFixed(2)}x, а он споткнулся на ${r.crash.toFixed(2)}x <b>+${money(r.payout)}</b>` : `Споткнулся на ${r.crash.toFixed(2)}x · ставка сгорела`;
          }
        } else {
          fallT += dt / (skip ? 14 : 1);
          place({ x: crashPos.x + fallT * 60, y: crashPos.y }, Math.min(105, fallT * 320), 900 * fallT * fallT / 2);
          if (fallT > 1.3) { $('#clSkip').hidden = true; return done(); }
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  async function go() {
    if (CL.busy) return;
    const target = +(+CL.target).toFixed(2);
    if (!(target >= 1.01 && target <= 1000)) { shake($('#clTarget')); return notifyErr(new Error('BAD_TARGET')); }
    let uids = [], amount = null;
    if (CL.mode === 'skins') { uids = [...CL.sel]; if (!uids.length) { shake($('#clBet')); return notify({ title: 'Выбери скины для ставки', icon: '!', color: 'rgba(255,69,58,.35)' }); } }
    else { amount = r2(+CL.amt); if (!(amount >= .1)) return notifyErr(new Error('BAD_BET')); if (amount > S.bal) { shake($('#clGo')); return notifyErr(new Error('NO_FUNDS')); } }
    CL.busy = true; $('#clGo').disabled = true;
    let r;
    try { r = await API.climb(uids, amount, target); }
    catch (e) { CL.busy = false; $('#clGo').disabled = false; return notifyErr(e); }
    setBal(r2(r.balance - r.payout));
    CL.sel.clear(); drawBet();
    await animate(r, target);
    CL.busy = false;
    if (tk !== viewToken) { setBal(r.balance); return; }
    setBal(r.balance); syncXp();
    $('#clGo').disabled = false;
    runner.className = 'runner idle';
    if (r.win) notify({ title: `Дошёл до ${target.toFixed(2)}x!`, sub: `Упал только на ${r.crash.toFixed(2)}x`, icon: gi('flame'), color: 'rgba(48,209,88,.35)', amt: '+' + money(r.payout), amtColor: '#5ee07f', tall: true });
    CL.live.unshift(...CL.pend.reverse()); CL.pend = []; CL.live = CL.live.slice(0, 30); drawHist(); drawLive();
    setTimeout(() => { if (CL.busy || tk !== viewToken) return; stage.classList.remove('crashed', 'won'); $('#clMult').textContent = '1.00x'; idle(); runner.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500 }); }, 3000);
  }

  VIEW = {
    destroy() { sb.removeChannel(ch); ro.disconnect(); CL.busy = false; CL.pend = []; },
    onSeg(n, v) { if (n === 'clmode' && !CL.busy) { CL.mode = v; CL.sel.clear(); drawBet(); } },
    onInput(t) {
      if (t.id === 'clTarget') { CL.target = t.value; drawInfo(); }
      if (t.id === 'clAmt') { CL.amt = t.value; drawInfo(); }
    },
    act(a, el) {
      if (a === 'go') go();
      if (a === 'skip') skip = true;
      if (CL.busy) return;
      if (a === 'tg') { CL.target = +el.dataset.m; $('#clTarget').value = CL.target; drawInfo(); }
      if (a === 'amt') {
        const v = +CL.amt || 0, k = el.dataset.k;
        CL.amt = r2(Math.max(.1, k === 'h' ? v / 2 : k === 'd' ? v * 2 : k === 'p1' ? v + 1 : k === 'p10' ? v + 10 : k === 'p100' ? v + 100 : S.bal));
        $('#clAmt').value = CL.amt; drawInfo();
      }
      if (a === 'pick') {
        const u = +el.dataset.u;
        if (CL.sel.has(u)) CL.sel.delete(u); else if (CL.sel.size < 20) CL.sel.add(u); else return notify({ title: 'Максимум 20 скинов', icon: '!' });
        el.classList.toggle('sel', CL.sel.has(u)); SFX.click();
        $('#clBet .ev-note').textContent = `Выбрано ${CL.sel.size} из 20 · ${money(betTotal())}`; drawInfo();
      }
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
    ${seg('by', [['networth', 'Богачи'], ['xp', 'Уровень'], ['best_price', 'Лучший дроп'], ['opened', 'Кейсы'], ['battles_w', 'Баттлы']], T.by)}</div>
  <div id="topList">${loadingHTML}</div>`;
  const load = async () => {
    const { data, error } = await sb.from('leaderboard').select('*').order(T.by, { ascending: false }).limit(50);
    if (tk !== viewToken) return;
    if (error) { $('#topList').innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; return; }
    const val = r => T.by === 'xp' ? `ур. ${levelOf(r.xp || 0).lvl}` : T.by === 'networth' ? money(r.networth) : T.by === 'best_price' ? money(r.best_price) : T.by === 'opened' ? r.opened : `${r.battles_w} побед`;
    const sub = r => T.by === 'xp' ? `${r.xp || 0} XP · стрик ${r.daily_streak || 0} дн.` : T.by === 'best_price' && r.best_skin != null ? esc(fullName({ s: r.best_skin, f: r.best_float, st: r.best_st })) : T.by === 'networth' ? `баланс ${money(r.balance)} · инвентарь ${money(r.inv_value)}` : T.by === 'battles_w' ? `${r.battles_l} поражений` : `потрачено на апгрейды: ${r.up_w + r.up_l}`;
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
    const what = h.src === 'battle' ? `Победа в баттле · банк ${money(h.p)}` : h.src === 'upgrade' ? `Апгрейд (${h.extra}%)` : h.src === 'gift' ? `Подарок → ${esc(h.extra)}` : h.src === 'pass' ? `Боевой пропуск · ур. ${esc(h.extra)}` : (c ? esc(c.name) : 'Кейс');
    return `<div class="li" style="--rc:${colOf(s)}"><div class="dot"></div><img src="${img(s.img, '128fx128f')}" alt="" loading="lazy" decoding="async"><div class="t"><b>${esc(fullName(h))}</b><span>${what} · ${new Date(h.t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div><div class="p">${money(h.src === 'battle' ? h.p : h.p)}</div></div>`;
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
  ${ptabsHTML('profile')}
  ${ONLINE ? `<section class="inv-head glass edge">
    <div class="avatar">${esc(ME.nick.slice(0, 2))}</div>
    <div class="stat"><span>${ME.guest ? 'Гость' : 'Аккаунт'}</span><b>${esc(ME.nick)}</b></div>
    <div class="grow"></div>
    ${ME.guest ? '<button class="btn" data-act="rename">Сменить ник</button><button class="btn primary" data-act="saveAcc">Сохранить аккаунт</button>' : ''}
    <button class="btn danger" data-act="logout">Выйти</button>
  </section>
  ${ME.guest ? '<div class="hint glass-flat">Ты играешь как гость — прогресс привязан к этому браузеру. Задай пароль («Сохранить аккаунт»), чтобы заходить с других устройств и ничего не потерять.</div>' : ''}` : ''}
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
      if (a === 'logout') openSheet(`<h2>Выйти?</h2><div class="subtitle">${ME.guest ? 'Ты гость без пароля — после выхода вернуться в этот аккаунт будет невозможно. Сначала сохрани аккаунт.' : 'Войти обратно можно по нику и паролю.'}</div><div class="acts"><button class="btn" data-sact="close">Отмена</button><button class="btn danger" data-sact="ok">Выйти</button></div>`, {
        narrow: true,
        acts: { async ok() { await sb.auth.signOut(); location.hash = '#/'; location.reload(); } },
      });
    },
  };
}
const STEAM_FEE = .05;
function viewSteam() {
  if (!ONLINE) { location.hash = '#/profile'; return; }
  const draw = () => { main.innerHTML = ptabsHTML('steam') + steamHTML() + sqHTML(); };
  draw();
  VIEW = {
    act(a, el) {
      if (a === 'sqClaim') claimSteamQuest(el, draw);
      if (a === 'stItem') steamBackSheet([+el.dataset.u], draw);
      if (a === 'stAll') steamBackSheet(S.steam.map(i => i.u), draw);
    },
  };
}
function steamBackSheet(ids, onDone) {
  const its = S.steam.filter(i => ids.includes(i.u)); if (!its.length) return;
  const sum = r2(its.reduce((a, i) => a + i.p, 0)), pay = r2(sum * (1 - STEAM_FEE)), rlPay = r2(sum * (1 - RL_FEE)), one = its.length === 1 ? its[0] : null, s = one && SK[one.s];
  openSheet(`
    <div class="steam-badge">${gi('steam')}</div>
    <h2>${one ? 'Продать из Steam' : `Продать все ${its.length} предм.`}</h2>
    <div class="subtitle">${one ? esc(fullName(one)) + ' · ' : ''}стоимость ${money(sum)}</div>
    ${one ? `<div class="detail-art" style="--rc:${colOf(s)};height:140px"><div class="glow"></div><img src="${img(s.img)}" alt=""></div>` : ''}
    <div class="sell-ways">
      <div class="sell-way"><b>На баланс сайта</b><span>комиссия ${STEAM_FEE * 100}%</span><em class="g">${money(pay)}</em><button class="btn green" data-sact="ok">На сайт</button></div>
      <div class="sell-way"><b>За реальные деньги</b><span>комиссия ${RL_FEE * 100}% · в «Реальную жизнь»</span><em class="b">${money(rlPay)}</em><button class="btn primary" data-sact="rl">${ICON.home} В жизнь</button></div>
    </div>
    <div class="acts"><button class="btn" data-sact="close">Отмена</button></div>`, {
    narrow: true,
    acts: {
      async rl(b, close) {
        b.disabled = true;
        try {
          const r = await rpc('steam_sell_rl', { p_ids: ids });
          S.steam = S.steam.filter(i => !ids.includes(i.u)); S.rlBal = +r.rl_balance; SFX.coin(); close();
          notify({ title: 'Продано за реальные деньги', sub: `${r.n} предм. · комиссия ${money(+r.fee)} · вкладка «Реальная жизнь»`, icon: ICON.home, color: 'rgba(10,132,255,.35)', amt: '+' + money(+r.payout), amtColor: '#64d2ff', tall: true });
          onDone && onDone();
        } catch (e) { b.disabled = false; notifyErr(e); }
      },
      async ok(b, close) {
        b.disabled = true;
        try {
          const r = await rpc('steam_deposit', { p_ids: ids });
          S.steam = S.steam.filter(i => !ids.includes(i.u)); setBal(+r.balance); SFX.coin(); close();
          notify({ title: 'Деньги на балансе', sub: `${r.n} предм. из Steam · комиссия ${money(+r.fee)}`, icon: gi('steam'), color: 'rgba(48,209,88,.3)', amt: '+' + money(+r.payout), amtColor: '#5ee07f', tall: true });
          onDone && onDone();
        } catch (e) { b.disabled = false; notifyErr(e); }
      },
    },
  });
}
function steamHTML() {
  const list = S.steam.slice().sort((a, b) => b.p - a.p), sv = r2(list.reduce((a, i) => a + i.p, 0));
  return `
  <section class="steam-head glass edge">
    <div class="steam-logo">${gi('steam')}</div>
    <div class="steam-title"><h2>Steam</h2><span>Инвентарь ${esc(ME.nick)} · скины, выведенные с GlassDrop</span></div>
    <div class="grow"></div>
    <div class="stat"><span>Предметов</span><b>${list.length}</b></div>
    <div class="stat"><span>Стоимость в Steam</span><b class="steam-v">${money(sv)}</b></div>
    <div class="stat"><span>Всего с инвентарём сайта</span><b>${money(r2(sv + invValue()))}</b></div>
    ${list.length ? `<button class="btn green" data-act="stAll">Продать всё</button>` : ''}
  </section>
  <div class="hint glass-flat">Это симуляция: в настоящий Steam ничего не уходит. Нажми на предмет, чтобы продать его: на баланс сайта (комиссия ${STEAM_FEE * 100}%) или за «реальные деньги» для вкладки «Реальная жизнь» (комиссия ${RL_FEE * 100}%).</div>
  ${list.length ? `<div class="grid-items stagger">${list.map((it, i) => itemCard(it, { i: Math.min(i, 30), attr: `data-act="stItem" data-u="${it.u}"`, wearText: new Date(it.t).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) })).join('')}</div>`
    : `<div class="empty-state"><div class="ill">${gi('steam')}</div><h3>В Steam пока пусто</h3>Открой предмет в инвентаре и нажми «Вывести в Steam».<br><button class="btn primary" data-go="#/inventory">В инвентарь</button></div>`}`;
}
/* ================= Steam inventory quests ================= */
const RL_FEE = .1;
function sqSlotDone(q, sl) {
  return S.steam.some(it => it.p >= q.min && (sl.cat ? SK[it.s].cat === sl.cat : sl.w.includes(SK[it.s].weapon)));
}
function sqHTML() {
  const qs = window.SQ || [];
  return `<div class="section-head"><h2>${gi('steam')} Задания Steam-инвентаря</h2><span class="sub">выведи скины в Steam и собери коллекцию — предметы остаются у тебя</span></div>
  <div class="sq-list">${qs.map(q => {
    const done = q.slots.map(sl => sqSlotDone(q, sl)), n = done.filter(Boolean).length, got = S.steamQ.includes(q.code), ok = n === q.slots.length;
    return `<section class="sq-card glass-flat ${got ? 'claimed' : ok ? 'ready' : ''}">
      <div class="sq-top"><div><h3>${esc(q.n)}</h3><div class="ev-note">${esc(q.d)}</div></div>
        <div class="q-prize"><b>${money(q.reward)}</b><span>+${q.xp} XP</span></div></div>
      <div class="xpbar small"><i style="width:${(n / q.slots.length * 100).toFixed(1)}%"></i></div>
      <div class="sq-slots">${q.slots.map((sl, i) => `<span class="sq-slot ${done[i] ? 'on' : ''}">${done[i] ? ICON.check : ''}${esc(sl.n)}</span>`).join('')}</div>
      <div class="sq-foot"><span class="ev-note">${n} / ${q.slots.length}${q.min ? ` · каждый предмет от ${money(q.min)}` : ''}</span>
        ${got ? `<span class="q-reward done">✓ Награда получена</span>` : `<button class="btn ${ok ? 'green' : ''} sm" data-act="sqClaim" data-q="${q.code}" ${ok ? '' : 'disabled'}>${ok ? 'Забрать' : 'Собираем'}</button>`}</div>
    </section>`;
  }).join('')}</div>`;
}
async function claimSteamQuest(el, redraw) {
  el.disabled = true;
  try {
    const r = await rpc('claim_steam_quest', { p_code: el.dataset.q });
    S.steamQ.push(el.dataset.q); S.xp = (S.xp || 0) + r.xp; setBal(+r.balance); drawLevel(); SFX.win('covert');
    notify({ title: 'Задание Steam выполнено!', sub: `+${r.xp} XP`, icon: gi('steam'), color: 'rgba(48,209,88,.35)', amt: '+' + money(+r.reward), amtColor: '#5ee07f', tall: true });
    redraw();
  } catch (e) { el.disabled = false; notifyErr(e); }
}

/* ================= «Реальная жизнь» ================= */
const RLC = Object.fromEntries((window.RL || []).map(r => [r.id, r]));
const RL_CATS = [['home', 'Недвижимость'], ['car', 'Машины'], ['tech', 'Гаджеты'], ['food', 'Супермаркет'], ['stuff', 'Всякое']];
const LIFE = { tab: 'mine', cat: 'home', q: '', sort: 'asc', limit: 60 };
const rlMoney = v => '$' + (+v).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
const rlSellValue = it => r2(it.paid * RLC[it.item].sell);
function rlApply(r) {
  S.rlBal = +r.balance;
  S.rl = r.items.map(x => ({ id: x.id, item: x.item, paid: +x.paid, rent: !!x.rent_from, acc: +x.acc })).filter(x => RLC[x.item]);
}
function viewLife() {
  if (!ONLINE) { location.hash = '#/profile'; return; }
  const tok = viewToken;
  main.innerHTML = ptabsHTML('life') + loadingHTML;
  const load = () => rpc('rl_state').then(r => { if (tok !== viewToken) return; rlApply(r); draw(); }).catch(notifyErr);
  const head = () => {
    const worth = r2(S.rl.reduce((a, it) => a + rlSellValue(it), 0)), acc = r2(S.rl.reduce((a, it) => a + it.acc, 0));
    const rentDay = r2(S.rl.filter(it => it.rent).reduce((a, it) => a + RLC[it.item].rent, 0));
    return `<section class="life-head glass edge">
      <div class="life-ico">${ICON.home}</div>
      <div class="steam-title"><h2>Реальная жизнь</h2><span>Скины из Steam → реальные деньги → квартиры, тачки и шаурма</span></div>
      <div class="grow"></div>
      <div class="stat"><span>Реальные деньги</span><b class="rl-v">${rlMoney(S.rlBal)}</b></div>
      <div class="stat"><span>Имущество</span><b>${rlMoney(worth)}</b></div>
      <div class="stat"><span>Аренда${rentDay ? ` · ${rlMoney(rentDay)}/день` : ''}</span><b>${rlMoney(acc)}</b></div>
      <div class="life-acts">
        ${acc >= .01 ? `<button class="btn green" data-act="rlCollect">Собрать аренду · ${rlMoney(acc)}</button>` : ''}
        <button class="btn primary" data-act="rlDeposit" ${S.rlBal >= .01 ? '' : 'disabled'}>Задепать на сайт</button>
        <button class="btn" disabled title="Скоро">Кредит · скоро</button>
      </div>
    </section>
    <div class="hint glass-flat">Это игра, всё ненастоящее. Реальные деньги приходят от продажи скинов из Steam (вкладка Steam → «В жизнь», комиссия ${RL_FEE * 100}%) и от продажи своих вещей. Их можно потратить в магазине или задепать обратно на сайт 1:1. Квартиру можно сдать в аренду — деньги капают каждый день (копятся до 7 дней).</div>`;
  };
  const card = (c, body, i) => `<div class="rl-card glass-flat" style="--i:${Math.min(i, 24)}">
      <div class="rl-img">${c.img ? `<img loading="lazy" decoding="async" src="${c.img}" alt="">` : ICON.home}</div>
      <div class="rl-body"><b>${esc(c.n)}</b><span class="rl-note">${esc(c.note || '')}</span>${body}</div>
    </div>`;
  const mineHTML = () => {
    if (!S.rl.length) return `<div class="empty-state"><div class="ill">${ICON.home}</div><h3>Ничего нет</h3>Даже ковра. Загляни в магазин.</div>`;
    const groups = [['home', 'Недвижимость', it => RLC[it.item].cat === 'home' || it.item === 'st-flat'],
                    ['things', 'Вещи', it => ['mine', 'car', 'tech', 'stuff'].includes(RLC[it.item].cat) && it.item !== 'st-flat'],
                    ['food', 'Еда', it => RLC[it.item].cat === 'food'],
                    ['organ', 'Чёрный рынок', it => RLC[it.item].cat === 'organ']];
    let i = 0;
    return groups.map(([g, title, f]) => {
      let list = S.rl.filter(f);
      if (!list.length) return '';
      if (g === 'food') {  // same food stacks into one card
        const by = {}; list.forEach(it => (by[it.item] = by[it.item] || []).push(it));
        return `<div class="section-head"><h2>${title}</h2></div><div class="rl-grid">${Object.values(by).map(l => card(RLC[l[0].item], `
          <span class="rl-price">×${l.length} · продать за ${rlMoney(rlSellValue(l[0]))} шт.</span>
          <div class="rl-acts"><button class="btn sm" data-act="rlEat" data-id="${l[0].id}">Съесть</button><button class="btn sm green" data-act="rlSell" data-id="${l[0].id}">Продать</button></div>`, i++)).join('')}</div>`;
      }
      return `<div class="section-head"><h2>${title}</h2></div><div class="rl-grid">${list.map(it => {
        const c = RLC[it.item];
        return card(c, `
          <span class="rl-price">${c.cat === 'mine' || c.cat === 'organ' ? 'Стоит' : 'Продать за'} ${rlMoney(rlSellValue(it))}</span>
          ${c.rent ? `<span class="rl-rent ${it.rent ? 'on' : ''}">${it.rent ? `Сдаётся · +${rlMoney(c.rent)}/день · накоплено ${rlMoney(it.acc)}` : `Можно сдать: +${rlMoney(c.rent)}/день`}</span>` : ''}
          <div class="rl-acts">${c.rent ? `<button class="btn sm ${it.rent ? '' : 'primary'}" data-act="rlRent" data-id="${it.id}" data-on="${it.rent ? 0 : 1}">${it.rent ? 'Снять с аренды' : 'Сдать в аренду'}</button>` : ''}
            <button class="btn sm green" data-act="rlSell" data-id="${it.id}">Продать</button></div>`, i++);
      }).join('')}</div>`;
    }).join('');
  };
  const shopHTML = () => {
    const q = LIFE.q.trim().toLowerCase();
    let list = (window.RL || []).filter(c => c.cat === LIFE.cat && (!q || (c.n + ' ' + c.note).toLowerCase().includes(q)));
    list.sort((a, b) => LIFE.sort === 'asc' ? a.p - b.p : b.p - a.p);
    return `<div class="section-head">${seg('rlcat', RL_CATS, LIFE.cat, 'sm')}<div class="grow"></div>
      ${seg('rlsort', [['asc', 'Дешевле'], ['desc', 'Дороже']], LIFE.sort, 'sm')}
      <label class="search">${ICON.search}<input id="lq" placeholder="Поиск: город, марка…" value="${esc(LIFE.q)}" autocomplete="off"></label></div>
      <div class="rl-grid" id="rlShop">${list.map((c, i) => card(c, `
        <span class="rl-price big">${rlMoney(c.p)}</span>
        ${c.rent ? `<span class="rl-rent">аренда +${rlMoney(c.rent)}/день</span>` : ''}
        <div class="rl-acts"><button class="btn sm ${S.rlBal >= c.p ? 'primary' : ''}" data-act="rlBuy" data-item="${c.id}">Купить</button></div>`, i)).join('') || '<div class="ev-note">Ничего не найдено</div>'}</div>`;
  };
  const body = () => LIFE.tab === 'mine' ? mineHTML() : shopHTML();
  const draw = () => {
    main.innerHTML = ptabsHTML('life') + head() + `<div class="section-head">${seg('rltab', [['mine', `Моё (${S.rl.length})`], ['shop', 'Магазин']], LIFE.tab)}</div><div id="rlBody">${body()}</div>`;
    layoutPills();
  };
  const drawBody = () => { const b = $('#rlBody'); if (b) { b.innerHTML = body(); layoutPills(b); } };
  const after = (r, msg) => { rlApply(r); draw(); if (msg) notify(msg); };
  load();
  VIEW = {
    refresh: () => S.rl && draw(),
    onSeg(n, v) {
      if (n === 'rltab') { LIFE.tab = v; drawBody(); }
      if (n === 'rlcat') { LIFE.cat = v; drawBody(); }
      if (n === 'rlsort') { LIFE.sort = v; drawBody(); }
    },
    onInput(t) { if (t.id === 'lq') { LIFE.q = t.value; const g = $('#rlShop'); if (g) { const pos = t.selectionStart; drawBody(); const n = $('#lq'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } } } },
    async act(a, el) {
      if (!S.rl) return;
      if (a === 'rlBuy') return rlBuySheet(RLC[el.dataset.item], r => after(r));
      if (a === 'rlSell') return rlSellSheet(S.rl.find(x => x.id === +el.dataset.id), r => after(r));
      if (a === 'rlDeposit') return rlDepositSheet(draw);
      el.disabled = true;
      try {
        if (a === 'rlRent') {
          const on = el.dataset.on === '1', r = await rpc('rl_rent', { p_id: +el.dataset.id, p_on: on });
          SFX.click();
          after(r, on ? { title: 'Сдано в аренду', sub: 'Деньги капают каждый день, собирай их наверху', icon: ICON.home, color: 'rgba(10,132,255,.3)' }
                      : { title: 'Снято с аренды', sub: +r.got ? 'Накопленная аренда зачислена' : '', icon: ICON.home, amt: +r.got ? '+' + rlMoney(+r.got) : '', amtColor: '#64d2ff' });
        }
        if (a === 'rlCollect') {
          const r = await rpc('rl_collect'); SFX.coin();
          after(r, { title: 'Аренда собрана', sub: 'Реальные деньги', icon: ICON.home, color: 'rgba(48,209,88,.3)', amt: '+' + rlMoney(+r.got), amtColor: '#5ee07f' });
        }
        if (a === 'rlEat') {
          const c = RLC[S.rl.find(x => x.id === +el.dataset.id).item];
          const r = await rpc('rl_eat', { p_id: +el.dataset.id }); SFX.ping();
          after(r, { title: 'Вкусно!', sub: c.n + ' съедено', icon: '😋', color: 'rgba(255,159,10,.3)' });
        }
      } catch (e) { el.disabled = false; notifyErr(e); }
    },
  };
}
function rlBuySheet(c, onDone) {
  const many = c.cat === 'food';
  openSheet(`
    <div class="rl-sheet-img">${c.img ? `<img src="${c.img}" alt="">` : ICON.home}</div>
    <h2>${esc(c.n)}</h2>
    <div class="subtitle">${esc(c.note || '')}${c.rent ? `<br>Можно сдавать в аренду: +${rlMoney(c.rent)} в день` : ''}<br>Если продать: вернётся ${Math.round(c.sell * 100)}% цены${c.rent ? ' + накопленная аренда' : ''}.</div>
    <div class="steam-calc"><span>Цена</span><b>${rlMoney(c.p)}</b><span>Реальные деньги</span><b class="${S.rlBal >= c.p ? 'g' : 'r'}">${rlMoney(S.rlBal)}</b></div>
    ${many ? seg('rln', [['1', '×1'], ['5', '×5'], ['10', '×10'], ['20', '×20']], '1', 'sm center') : ''}
    <div class="acts"><button class="btn" data-sact="close">Отмена</button><button class="btn primary" data-sact="ok" id="rlBuyBtn">Купить · ${rlMoney(c.p)}</button></div>`, {
    narrow: true,
    acts: {
      onSeg(n, v) { if (n === 'rln') { $('#rlBuyBtn').dataset.n = v; $('#rlBuyBtn').textContent = `Купить · ${rlMoney(r2(c.p * v))}`; } },
      async ok(b, close) {
        b.disabled = true;
        try {
          const n = +(b.dataset.n || 1), r = await rpc('rl_buy', { p_item: c.id, p_n: n });
          SFX.coin(); close(); onDone(r);
          notify({ title: 'Куплено!', sub: c.n + (n > 1 ? ` ×${n}` : '') + ' — во вкладке «Моё»', icon: ICON.home, color: 'rgba(10,132,255,.35)', amt: '−' + rlMoney(r2(c.p * n)) });
        } catch (e) { b.disabled = false; notifyErr(e); }
      },
    },
  });
}
function rlSellSheet(it, onDone) {
  if (!it) return;
  const c = RLC[it.item], v = rlSellValue(it);
  openSheet(`
    <div class="rl-sheet-img">${c.img ? `<img src="${c.img}" alt="">` : ICON.home}</div>
    <h2>Продать ${esc(c.n)}?</h2>
    <div class="subtitle">${c.cat === 'organ' ? 'Продаётся один раз и навсегда.' : c.cat === 'mine' ? 'Своё, родное. Назад купить не получится.' : `Покупатель даёт ${Math.round(c.sell * 100)}% от цены покупки.`}</div>
    <div class="steam-calc"><span>Получишь</span><b class="g">${rlMoney(v)}</b>${it.acc >= .01 ? `<span>+ аренда</span><b class="g">${rlMoney(it.acc)}</b>` : ''}</div>
    <div class="acts"><button class="btn" data-sact="close">Отмена</button><button class="btn green" data-sact="ok">Продать · ${rlMoney(r2(v + it.acc))}</button></div>`, {
    narrow: true,
    acts: {
      async ok(b, close) {
        b.disabled = true;
        try {
          const r = await rpc('rl_sell', { p_ids: [it.id] });
          const st = await rpc('rl_state');
          SFX.coin(); close(); onDone(st);
          notify({ title: 'Продано', sub: c.n, icon: ICON.home, color: 'rgba(48,209,88,.3)', amt: '+' + rlMoney(r2(+r.sum + +r.rent)), amtColor: '#5ee07f' });
        } catch (e) { b.disabled = false; notifyErr(e); }
      },
    },
  });
}
function rlDepositSheet(onDone) {
  const max = S.rlBal;
  openSheet(`
    <h2>Задепать на сайт</h2>
    <div class="subtitle">Реальные деньги → баланс GlassDrop, 1:1 без комиссии.</div>
    <label class="field"><span>Сумма (есть ${rlMoney(max)})</span><input id="rlAmt" inputmode="decimal" value="${max.toFixed(2)}" autocomplete="off"></label>
    ${seg('rlpart', [['.25', '25%'], ['.5', '50%'], ['1', 'Всё']], '1', 'sm center')}
    <div class="acts"><button class="btn" data-sact="close">Отмена</button><button class="btn green" data-sact="ok">Задепать</button></div>`, {
    narrow: true,
    acts: {
      onSeg(n, v) { if (n === 'rlpart') $('#rlAmt').value = (Math.floor(max * v * 100) / 100).toFixed(2); },
      async ok(b, close) {
        const amt = Math.floor(parseFloat(String($('#rlAmt').value).replace(',', '.')) * 100) / 100;
        if (!(amt >= .01) || amt > max) return notifyErr(new Error('BAD_AMOUNT'));
        b.disabled = true;
        try {
          const r = await rpc('rl_deposit', { p_amount: amt });
          S.rlBal = +r.rl_balance; setBal(+r.balance); SFX.coin(); close(); onDone();
          notify({ title: 'Задеплено на сайт', sub: 'Из реальной жизни', icon: ICON.home, color: 'rgba(48,209,88,.3)', amt: '+' + money(+r.amount), amtColor: '#5ee07f' });
        } catch (e) { b.disabled = false; notifyErr(e); }
      },
      enter() { const b = document.querySelector('.scrim [data-sact="ok"]'); b && b.click(); },
    },
  });
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
      <div class="auth-logo">${logoSVG()}</div>
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
  // pumpkins stay hidden if the list can't be loaded: otherwise found ones would show up again
  try { S.pumpkins = await rpc('my_pumpkins'); pkReady = true; schedulePk(); } catch { S.pumpkins = []; }
  shownBal = S.bal; balVal.textContent = fmt(S.bal); drawBonus();
  // feed
  const { data: feed } = await sb.from('drops').select('*').order('id', { ascending: false }).limit(24);
  FEED = (feed || []).map(fromFeed);
  const burst = {};
  const onDrop = row => {
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
    if (h.src === 'battle') notify({ title: `${h.nick} выиграл баттл`, sub: `Банк ${money(h.p)}`, icon: gi('swords'), color: 'rgba(255,214,10,.3)' });
    else if (s.star || h.p >= 25) { SFX.ping(); notify({ title: `${h.nick} выбил${h.src === 'upgrade' ? ' апгрейдом' : ''}`, sub: fullName(h), icon: thumbIco(h.s), amt: money(h.p), tall: true, ms: 4000 }); }
  };
  sb.channel('feed').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'drops' }, ({ new: row }) => {
    if (row.source !== 'case') return onDrop(row);
    const k = row.user_id;
    (burst[k] = burst[k] || []).push(row);
    if (burst[k].length === 1) setTimeout(() => {
      const g = burst[k]; delete burst[k];
      (g.length > 5 ? g.sort((a, b) => b.price - a.price).slice(0, 3).reverse() : g).forEach(onDrop);
    }, 500);
  }).subscribe();
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.reload(); });
  startStats();
}

/* ================= boot ================= */
(async () => {
  if (ONLINE) {
    main.innerHTML = loadingHTML;
    try { await startOnline(); }
    catch (e) { console.error(e); main.innerHTML = `<div class="empty-state"><div class="ill">${gi('warn')}</div><h3>Не удалось подключиться к серверу</h3>${esc(errText(e))}<br><button class="btn primary" onclick="location.reload()">Обновить</button></div>`; return; }
    route(); drawLevel(); drawLuck();
    notify({ title: `Привет, ${esc(ME.nick)}!`, sub: ME.guest ? 'Ты играешь как гость' : 'С возвращением', icon: ICON.gift, color: 'rgba(10,132,255,.35)' });
  } else {
    startStats();
    route(); drawLevel(); drawLuck();
    if (!localStorage.getItem(KEY)) { save(); setTimeout(() => notify({ title: 'Добро пожаловать!', sub: 'На балансе $100 — открывайте кейсы', icon: ICON.gift, color: 'rgba(10,132,255,.35)' }), 900); }
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layoutPills(document));
})();
})();
