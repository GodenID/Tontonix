import { api, getToken, getLang } from "./api.js";
import { t, esc, ICONS, toast } from "./ui.js";

/* CDN checks Referer: every segment, playlist and subtitle rides the local proxy. */
function proxyUrl(target) {
  return `/stream?u=${encodeURIComponent(target)}`;
}

const SEEK_OPTIONS = [10, 15, 30];
const SEGMENT_TYPES = ["intro", "recap", "credits", "preview"];
const SEGMENT_LABEL = { intro: "skipIntro", recap: "skipRecap", credits: "skipCredits", preview: "skipPreview" };

const SUB_SIZES = { small: "0.85", standard: "1", large: "1.22", xlarge: "1.45" };
const SUB_FONTS = {
  default: "inherit",
  sans: "ui-sans-serif, system-ui, 'Segoe UI', Roboto, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
};
const SUB_BG = { none: "transparent", soft: "rgba(0, 0, 0, 0.42)", solid: "rgba(0, 0, 0, 0.8)" };
const LS = {
  color: "movy:subColor",
  size: "movy:subSize",
  bg: "movy:subBg",
  outline: "movy:subOutline",
  font: "movy:subFont",
  opacity: "movy:subOpacity",
  offset: "movy:subOffset",
  volume: "movy:volume",
  muted: "movy:muted",
  seek: "movy:seekAmount",
  doubleTap: "movy:doubleTapSeek",
  autoNext: "movy:autoNext",
  autoSubs: "movy:autoSubs",
  autoSkip: "movy:autoSkip",
  skipTypes: "movy:skipTypes",
};

function readLS(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage blocked */
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function storedColor() {
  const value = readLS(LS.color, "");
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
}
function storedSize() {
  const value = readLS(LS.size, "standard");
  return SUB_SIZES[value] ? value : "standard";
}
function storedBg() {
  const value = readLS(LS.bg, "soft");
  return SUB_BG[value] ? value : "soft";
}
function storedOutline() {
  const value = readLS(LS.outline, "thin");
  return ["none", "thin", "thick"].includes(value) ? value : "thin";
}
function storedFont() {
  const value = readLS(LS.font, "default");
  return SUB_FONTS[value] ? value : "default";
}
function storedOpacity() {
  const value = Number(readLS(LS.opacity, "1"));
  return Number.isFinite(value) ? clamp(value, 0.4, 1) : 1;
}
function storedOffset() {
  const value = Number(readLS(LS.offset, "0"));
  return Number.isFinite(value) ? clamp(value, -30, 30) : 0;
}
function storedVolume() {
  const value = Number(readLS(LS.volume, "1"));
  return Number.isFinite(value) ? clamp(value, 0, 1) : 1;
}
function storedSeek() {
  const value = Number(readLS(LS.seek, "10"));
  return SEEK_OPTIONS.includes(value) ? value : 10;
}
function storedBool(key, fallback = true) {
  return readLS(key, fallback ? "1" : "0") === "1";
}
function storedSkipTypes() {
  const raw = readLS(LS.skipTypes, "");
  if (!raw) return [...SEGMENT_TYPES];
  if (raw === "none") return [];
  const list = raw.split(",").filter((type) => SEGMENT_TYPES.includes(type));
  return list.length ? list : [];
}

const state = {
  detail: null,
  providers: [],
  provider: null,
  providerName: "",
  sources: [],
  queue: [],
  pool: new Map(),
  tried: new Set(),
  failingOver: false,
  switching: false,
  started: false,
  subtitles: [],
  quality: null,
  season: 1,
  episode: 1,
  episodeCounts: {},
  hls: null,
  saveTimer: 0,
  keyHandler: null,
  fsHandler: null,
  ui: null,
  subTracks: [],
  subKey: null,
  subLang: null,
  prefLang: "",
  subUserPick: false,
  subReq: 0,
  subToken: 0,
  subCues: [],
  subVtt: "",
  subName: "",
  subOffset: storedOffset(),
  subColor: storedColor(),
  subSize: storedSize(),
  subBg: storedBg(),
  subOutline: storedOutline(),
  subFont: storedFont(),
  subOpacity: storedOpacity(),
  volume: storedVolume(),
  muted: readLS(LS.muted, "0") === "1",
  lastVolume: storedVolume() || 1,
  seekAmount: storedSeek(),
  doubleTap: storedBool(LS.doubleTap),
  autoNext: storedBool(LS.autoNext),
  autoSubs: storedBool(LS.autoSubs),
  autoSkip: storedBool(LS.autoSkip),
  skipTypes: storedSkipTypes(),
  segments: [],
  segmentKey: "",
  segmentDone: "",
  segmentDoneAt: 0,
  resumeSeconds: 0,
  resumedFrom: 0,
  nextTarget: null,
  nextTimer: 0,
  currentUrl: "",
  currentQuality: "",
  playlist: "",
  qualities: [],
  qualityPick: "auto",
  switchAt: 0,
  lastReport: "",
  lastResolveError: "",
};

function providerIcon(p) {
  return `<img src="/flags/${p.flag}.svg" alt="" onerror="this.style.display='none'" />`;
}

const REWIND_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9l5 4"/><path d="M6 9h8a5 5 0 0 1 0 10h-2"/></svg>`;
const FORWARD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 5 5 4-5 4"/><path d="M18 9h-8a5 5 0 0 0 0 10h2"/></svg>`;
const PLAY_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.87v14.26c0 .8.87 1.28 1.54.85l11.2-7.13a1 1 0 0 0 0-1.7L8.54 4.02C7.87 3.6 7 4.07 7 4.87Z"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
const CC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8.5 10.3a2 2 0 1 0 0 3.4M15.5 10.3a2 2 0 1 0 0 3.4"/></svg>`;
const GEAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></svg>`;
const FS_ENTER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
const FS_EXIT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M21 16h-3a2 2 0 0 0-2 2v3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`;
const VOLUME_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>`;
const MUTE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none"/><path d="m17 9 5 6M22 9l-5 6"/></svg>`;
const PIP_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" stroke="none"/></svg>`;
const CAST_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 17a4 4 0 0 1 4 4M3 12a9 9 0 0 1 9 9M3 21h.01"/><path d="M8 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4"/></svg>`;

const LANG_NAMES = {
  en: "English", eng: "English", es: "Español", spa: "Español", fr: "Français", fre: "Français", fra: "Français",
  de: "Deutsch", ger: "Deutsch", deu: "Deutsch", id: "Indonesia", ind: "Indonesia", ja: "日本語", jpn: "日本語",
  ko: "한국어", kor: "한국어", zh: "中文", chi: "中文", zho: "中文", ar: "العربية", ara: "العربية",
  pt: "Português", por: "Português", ru: "Русский", rus: "Русский", hi: "हिन्दी", hin: "हिन्दी",
  it: "Italiano", ita: "Italiano", nl: "Nederlands", dut: "Nederlands", tr: "Türkçe", tur: "Türkçe",
  th: "ไทย", tha: "ไทย", vi: "Tiếng Việt", vie: "Tiếng Việt", pl: "Polski", pol: "Polski",
  ms: "Melayu", msa: "Melayu", fa: "فارسی", per: "فارسی", sv: "Svenska", da: "Dansk", no: "Norsk", fi: "Suomi",
};

const LANG_CODES = {
  english: "en", indonesian: "id", spanish: "es", french: "fr", german: "de",
  japanese: "ja", korean: "ko", chinese: "zh", arabic: "ar", portuguese: "pt",
  russian: "ru", hindi: "hi", italian: "it", dutch: "nl", turkish: "tr",
  thai: "th", vietnamese: "vi", polish: "pl", malay: "ms", persian: "fa",
  swedish: "sv", danish: "da", norwegian: "no", finnish: "fi", czech: "cs",
  greek: "el", hebrew: "he", hungarian: "hu", romanian: "ro", ukrainian: "uk",
  bengali: "bn", tamil: "ta", telugu: "te", filipino: "tl", tagalog: "tl",
};

function subCode(track) {
  const raw = String(track?.lang || track?.language || "").toLowerCase().trim();
  if (!raw) return "";
  if (LANG_CODES[raw]) return LANG_CODES[raw];
  if (raw.length <= 3) return raw;
  const key = Object.keys(LANG_CODES).find((name) => name.startsWith(raw.slice(0, 3)));
  return key ? LANG_CODES[key] : raw.slice(0, 2);
}

function subLabel(track, i) {
  const code = subCode(track);
  const display = String(track.display || track.language || "").trim();
  if (display && display.length > 3) return display;
  return LANG_NAMES[display.toLowerCase()] || LANG_NAMES[code] || display || track.lang || `Sub ${i + 1}`;
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function setPlayIcons(paused) {
  const p = document.getElementById("pui-play");
  if (p) p.innerHTML = paused ? PLAY_ICON : PAUSE_ICON;
  const big = document.getElementById("pui-bigplay");
  if (big) big.style.display = paused ? "grid" : "none";
}

function stageMarkup() {
  return `<div class="watch-page">
    <div class="watch-top">
      <button class="icon-btn" id="watch-back" aria-label="Back">${ICONS.chevronLeft}</button>
      <div><div class="watch-title" id="watch-title">${esc(state.detail?.title || "")}</div><div class="watch-sub" id="watch-sub"></div></div>
    </div>
    <div class="watch-stage" id="stage">
      <video id="video" playsinline crossorigin="anonymous" x-webkit-airplay="allow"></video>
      <div class="sub-overlay" id="sub-overlay" aria-live="off"></div>
      <img class="pui-logo" src="/assets/logo.png" alt="Tontonix" />

      <button class="skip-btn skip-back" id="skip-back" aria-label="Rewind ${state.seekAmount} seconds">${REWIND_ICON}<span>${state.seekAmount}</span></button>
      <button class="skip-btn skip-fwd" id="skip-fwd" aria-label="Forward ${state.seekAmount} seconds">${FORWARD_ICON}<span>${state.seekAmount}</span></button>

      <button class="seg-skip" id="seg-skip" type="button" hidden><span id="seg-skip-label"></span></button>

      <div class="watch-overlay" id="overlay"><div class="spinner"></div><div class="watch-note">${t("loadingStream")}</div></div>

      <div class="cast-bar" id="cast-bar" hidden>
        <span class="cast-dot" aria-hidden="true"></span>
        <span class="cast-label">${t("castingTo")} <strong id="cast-device"></strong></span>
        <span class="cast-time" id="cast-time">0:00</span>
        <button class="cast-btn" id="cast-toggle" aria-label="Play/Pause">${PAUSE_ICON}</button>
        <button class="cast-btn" id="cast-stop" aria-label="${t("stopCasting")}">${ICONS.close}</button>
      </div>

      <div class="next-up" id="next-up" hidden>
        <div>
          <div class="next-up-label"><span id="next-label">${t("nextIn")}</span> <span id="next-count">8</span><span id="next-unit">${t("secondsShort")}</span></div>
          <div class="next-up-title" id="next-title"></div>
        </div>
        <div class="next-up-actions">
          <button class="btn btn-primary btn-sm" id="next-play">${t("playNow")}</button>
          <button class="btn btn-ghost btn-sm" id="next-cancel">${t("cancel")}</button>
        </div>
      </div>

      <div class="player-ui" id="player-ui">
        <button class="pui-bigplay" id="pui-bigplay" aria-label="Play">${PLAY_ICON}</button>
        <div class="pui-bar">
          <input class="pui-seek" id="pui-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek" />
          <div class="pui-ctrls">
            <button class="pui-btn" id="pui-play" aria-label="Play/Pause">${PLAY_ICON}</button>
            <button class="pui-btn pui-skip" data-skip="-${state.seekAmount}" aria-label="Rewind ${state.seekAmount}s">${REWIND_ICON}<em>${state.seekAmount}</em></button>
            <button class="pui-btn pui-skip" data-skip="${state.seekAmount}" aria-label="Forward ${state.seekAmount}s">${FORWARD_ICON}<em>${state.seekAmount}</em></button>
            <span class="pui-time"><span id="pui-cur">0:00</span> / <span id="pui-dur">0:00</span></span>
            <span class="pui-spacer"></span>
            <div class="pui-vol-wrap">
              <button class="pui-btn" id="pui-mute" aria-label="${t("mute")}">${VOLUME_ICON}</button>
              <input class="pui-vol" id="pui-vol" type="range" min="0" max="1" step="0.01" value="${state.volume}" aria-label="${t("volume")}" />
            </div>
            <button class="pui-btn" id="pui-cc" aria-label="Subtitles">${CC_ICON}</button>
            <button class="pui-btn" id="pui-gear" aria-label="Settings">${GEAR_ICON}</button>
            <button class="pui-btn" id="pui-pip" aria-label="${t("pip")}">${PIP_ICON}</button>
            <button class="pui-btn" id="pui-cast" aria-label="${t("cast")}">${CAST_ICON}</button>
            <button class="pui-btn" id="pui-fs" aria-label="Fullscreen">${FS_ENTER_ICON}</button>
          </div>
        </div>

        <div class="pui-menu" id="pui-settings" hidden>
          <div class="pui-menu-sec">
            <div class="pui-menu-h">${t("playback")}</div>
            <div class="pui-set-list" id="pui-playback-list"></div>
          </div>
          <div class="pui-menu-sec"><div class="pui-menu-h">${t("speed")}</div><div class="pui-menu-list" id="pui-speed-list"></div></div>
          <div class="pui-menu-sec"><div class="pui-menu-h">${t("qualityLabel")}</div><div class="pui-menu-list" id="pui-quality-list"></div></div>
        </div>

        <div class="pui-menu pui-menu-captions" id="pui-captions" hidden>
          <div class="pui-menu-sec">
            <div class="pui-menu-h" id="pui-caption-h">${t("subtitles")}</div>
            <input class="pui-sub-filter" id="pui-sub-filter" type="search" placeholder="${t("filterSubtitles")}" autocomplete="off" spellcheck="false" aria-label="${t("filterSubtitles")}" />
            <div class="pui-menu-list" id="pui-caption-list"></div>
          </div>
          <div class="pui-menu-sec">
            <div class="pui-menu-h">${t("subtitleDelay")}</div>
            <div class="pui-sub-timing">
              <button type="button" class="pui-mini" data-delay="-1">-1s</button>
              <button type="button" class="pui-mini" data-delay="-0.5">-0.5s</button>
              <button type="button" class="pui-delay-val" id="pui-delay-val" title="0s">0.0s</button>
              <button type="button" class="pui-mini" data-delay="0.5">+0.5s</button>
              <button type="button" class="pui-mini" data-delay="1">+1s</button>
            </div>
          </div>
          <div class="pui-menu-sec">
            <div class="pui-menu-h">${t("subtitleStyle")}</div>
            <div class="pui-sub-style">
              <label class="pui-sub-color" for="pui-sub-color">
                <span>${t("textColor")}</span>
                <input id="pui-sub-color" type="color" value="${state.subColor}" aria-label="${t("textColor")}" />
              </label>
              <div class="pui-sub-sizes" id="pui-sub-sizes" role="group" aria-label="${t("size")}">
                <button type="button" data-size="small" aria-label="${t("small")}" title="${t("small")}">A</button>
                <button type="button" data-size="standard" aria-label="${t("standard")}" title="${t("standard")}">A</button>
                <button type="button" data-size="large" aria-label="${t("large")}" title="${t("large")}">A</button>
                <button type="button" data-size="xlarge" aria-label="${t("extraLarge")}" title="${t("extraLarge")}">A</button>
              </div>
            </div>
            <div class="pui-sub-grid">
              <label>${t("background")}
                <select id="pui-sub-bg">
                  <option value="none">${t("bgNone")}</option>
                  <option value="soft">${t("bgSoft")}</option>
                  <option value="solid">${t("bgSolid")}</option>
                </select>
              </label>
              <label>${t("outline")}
                <select id="pui-sub-outline">
                  <option value="none">${t("outlineNone")}</option>
                  <option value="thin">${t("outlineThin")}</option>
                  <option value="thick">${t("outlineThick")}</option>
                </select>
              </label>
              <label>${t("font")}
                <select id="pui-sub-font">
                  <option value="default">${t("fontDefault")}</option>
                  <option value="sans">${t("fontSans")}</option>
                  <option value="serif">${t("fontSerif")}</option>
                  <option value="mono">${t("fontMono")}</option>
                </select>
              </label>
              <label>${t("opacity")}
                <input id="pui-sub-opacity" type="range" min="0.4" max="1" step="0.05" value="${state.subOpacity}" aria-label="${t("opacity")}" />
              </label>
            </div>
            <div class="pui-sub-file">
              <button type="button" class="pui-opt" id="pui-sub-upload">${t("uploadSubtitle")}</button>
              <button type="button" class="pui-opt" id="pui-sub-download">${t("downloadSubtitle")}</button>
              <input id="pui-sub-file" type="file" accept=".srt,.vtt,.ass,.ssa,.sub,.smi,.sami" hidden />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="watch-panel" id="watch-panel"></div>
  </div>`;
}

function skip(delta) {
  const video = document.getElementById("video");
  if (castActive()) {
    castSeekTo((castCtx.lastTime || 0) + delta);
  } else if (video) {
    const target = (video.currentTime || 0) + delta;
    video.currentTime = isFinite(video.duration) && video.duration > 0
      ? Math.min(video.duration, Math.max(0, target))
      : Math.max(0, target);
  }
  const side = document.getElementById(delta < 0 ? "skip-back" : "skip-fwd");
  if (side) {
    side.classList.add("flash");
    setTimeout(() => side.classList.remove("flash"), 320);
  }
}

/* --------------------------- playback settings ---------------------------- */

function renderPlaybackSettings() {
  const list = document.getElementById("pui-playback-list");
  if (!list) return;

  const row = (key, label, hint) => `
    <div class="pui-set">
      <div class="pui-set-text"><strong>${esc(t(label))}</strong>${hint ? `<small>${esc(t(hint))}</small>` : ""}</div>
      <button type="button" class="pui-switch ${state[key] ? "on" : ""}" role="switch" aria-checked="${state[key] ? "true" : "false"}" data-flag="${key}" aria-label="${esc(t(label))}"></button>
    </div>`;

  const segChips = SEGMENT_TYPES.map((type) => {
    const on = state.skipTypes.includes(type);
    return `<button type="button" class="pui-chip ${on ? "on" : ""}" data-seg="${type}" aria-pressed="${on}">${esc(t(SEGMENT_LABEL[type].replace("skip", "seg")))}</button>`;
  }).join("");

  const seekChips = SEEK_OPTIONS.map((n) =>
    `<button type="button" class="pui-chip ${state.seekAmount === n ? "on" : ""}" data-seek="${n}" aria-pressed="${state.seekAmount === n}">${n}${esc(t("secondsShort"))}</button>`).join("");

  list.innerHTML = [
    row("autoNext", "autoNext", "autoNextHint"),
    row("autoSubs", "autoSubs", "autoSubsHint"),
    row("autoSkip", "autoSkip", "autoSkipHint"),
    `<div class="pui-set-col"><div class="pui-set-label">${esc(t("segmentsToSkip"))}</div><div class="pui-chips">${segChips}</div></div>`,
    `<div class="pui-set-col"><div class="pui-set-label">${esc(t("seekAmount"))}</div><div class="pui-chips">${seekChips}</div></div>`,
    row("doubleTap", "doubleTapSeek", ""),
  ].join("");

  list.querySelectorAll("[data-flag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.flag;
      state[key] = !state[key];
      writeLS(LS[key], state[key] ? "1" : "0");
      btn.classList.toggle("on", state[key]);
      btn.setAttribute("aria-checked", state[key] ? "true" : "false");
      if (key === "autoSkip") hideSegmentPill();
      if (key === "autoSubs") ensureSubtitle();
    });
  });

  list.querySelectorAll("[data-seg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.seg;
      const on = !state.skipTypes.includes(type);
      state.skipTypes = on ? [...state.skipTypes, type] : state.skipTypes.filter((v) => v !== type);
      writeLS(LS.skipTypes, state.skipTypes.length ? state.skipTypes.join(",") : "none");
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      hideSegmentPill();
    });
  });

  list.querySelectorAll("[data-seek]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.seekAmount = Number(btn.dataset.seek);
      writeLS(LS.seek, state.seekAmount);
      list.querySelectorAll("[data-seek]").forEach((other) => {
        const on = Number(other.dataset.seek) === state.seekAmount;
        other.classList.toggle("on", on);
        other.setAttribute("aria-pressed", on ? "true" : "false");
      });
      paintSeekLabels();
    });
  });
}

function paintSeekLabels() {
  const amount = state.seekAmount;
  const back = document.getElementById("skip-back");
  const fwd = document.getElementById("skip-fwd");
  if (back) {
    back.setAttribute("aria-label", `Rewind ${amount} seconds`);
    const span = back.querySelector("span");
    if (span) span.textContent = String(amount);
  }
  if (fwd) {
    fwd.setAttribute("aria-label", `Forward ${amount} seconds`);
    const span = fwd.querySelector("span");
    if (span) span.textContent = String(amount);
  }
  document.querySelectorAll(".pui-skip").forEach((btn) => {
    const dir = Number(btn.dataset.skip) < 0 ? -1 : 1;
    btn.dataset.skip = String(dir * amount);
    btn.setAttribute("aria-label", `${dir < 0 ? "Rewind" : "Forward"} ${amount}s`);
    const em = btn.querySelector("em");
    if (em) em.textContent = String(amount);
  });
}

/* ----------------------------- skip segments ------------------------------ */

function segmentKey(seg) {
  return `${seg.type}:${Number(seg.start) || 0}`;
}

function hideSegmentPill() {
  const btn = document.getElementById("seg-skip");
  if (btn) btn.hidden = true;
}

function activeSegment(time) {
  for (const seg of state.segments) {
    if (!state.skipTypes.includes(seg.type)) continue;
    const start = Number(seg.start);
    const end = seg.end == null ? null : Number(seg.end);
    if (!Number.isFinite(start) || time < start) continue;
    if (end != null && time >= end) continue;
    if (end == null && time - start > 600) continue;
    return seg;
  }
  return null;
}

function tickSegments() {
  const video = document.getElementById("video");
  const btn = document.getElementById("seg-skip");
  if (!video || !btn) return;
  if (!state.segments.length) {
    btn.hidden = true;
    return;
  }

  const time = video.currentTime || 0;
  if (state.segmentDone) {
    const done = state.segments.find((seg) => segmentKey(seg) === state.segmentDone);
    if (done && time < Number(done.start) - 1) state.segmentDone = "";
  }

  const seg = activeSegment(time);
  if (!seg) {
    btn.hidden = true;
    return;
  }

  const key = segmentKey(seg);
  if (state.segmentDone === key) {
    if (Date.now() - (state.segmentDoneAt || 0) < 2500) {
      btn.hidden = true;
      return;
    }
    state.segmentDone = "";
  }

  if (state.autoSkip) {
    state.segmentDone = key;
    state.segmentDoneAt = Date.now();
    if (seg.type === "credits" && seg.end == null) {
      btn.hidden = true;
      queueCreditsNext();
      return;
    }
    const end = seg.end == null ? time + state.seekAmount : Number(seg.end);
    if (end > time) video.currentTime = Math.min(end, video.duration || end);
    btn.hidden = true;
    if (seg.type === "credits") queueCreditsNext();
    return;
  }

  const label = document.getElementById("seg-skip-label");
  if (label) label.textContent = t(SEGMENT_LABEL[seg.type] || "skipIntro");
  btn.dataset.key = key;
  btn.dataset.end = seg.end == null ? "" : String(seg.end);
  btn.hidden = false;
}

function skipSegmentNow() {
  const btn = document.getElementById("seg-skip");
  const video = document.getElementById("video");
  if (!btn || !video) return;
  const end = Number(btn.dataset.end);
  if (Number.isFinite(end) && end > 0) video.currentTime = Math.min(end, video.duration || end);
  else skip(state.seekAmount);
  state.segmentDone = btn.dataset.key || "";
  state.segmentDoneAt = Date.now();
  btn.hidden = true;
}

async function loadSegments() {
  const detail = state.detail;
  if (!detail) return;
  const key = `${detail.mediaType}:${detail.tmdbId}:${state.season}:${state.episode}`;
  state.segmentKey = key;
  state.segments = [];
  state.segmentDone = "";
  state.segmentDoneAt = 0;
  hideSegmentPill();

  let rows = [];
  try {
    const res = await api.segments({
      tmdbId: detail.tmdbId,
      mediaType: detail.mediaType,
      season: state.season,
      episode: state.episode,
    });
    rows = Array.isArray(res.segments) ? res.segments : [];
  } catch {
    rows = [];
  }
  if (state.segmentKey !== key) return;
  state.segments = rows
    .filter((seg) => seg && SEGMENT_TYPES.includes(seg.type) && Number.isFinite(Number(seg.start)))
    .map((seg) => ({ type: seg.type, start: Number(seg.start), end: seg.end == null ? null : Number(seg.end) }))
    .sort((a, b) => a.start - b.start);
}

async function queueCreditsNext() {
  if (state.nextTimer || state.detail?.mediaType !== "tv") return;
  const target = await nextTarget();
  if (!target) return;
  state.nextTarget = target;
  showNextUp(target);
}

function renderSpeedMenu(video) {
  const list = document.getElementById("pui-speed-list");
  if (!list) return;
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  list.innerHTML = speeds
    .map((r) => `<button class="pui-opt ${r === video.playbackRate ? "active" : ""}" data-speed="${r}">${r === 1 ? t("normal") : r + "x"}</button>`)
    .join("");
  list.querySelectorAll("[data-speed]").forEach((b) =>
    b.addEventListener("click", () => {
      video.playbackRate = Number(b.dataset.speed);
      list.querySelectorAll(".pui-opt").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    }),
  );
}

/* ------------------------------ subtitle engine --------------------------- */

function trackKey(track) {
  if (!track) return "";
  if (track.id) return `${track.source || "sub"}:${track.id}`;
  return `url:${String(track.url || track.src || "").trim().toLowerCase()}`;
}

function subProxyUrl(track) {
  const raw = String(track.url || track.src || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/sub?")) return raw;

  let target = raw;
  if (raw.startsWith("/stream?")) {
    const inner = new URLSearchParams(raw.slice(raw.indexOf("?") + 1)).get("u");
    if (!inner) return raw;
    target = inner;
  } else if (raw.startsWith("/")) {
    return raw;
  }

  const params = new URLSearchParams({ u: target });
  const fmt = String(track.format || track.type || "").toLowerCase();
  if (fmt && fmt !== "vtt") params.set("fmt", fmt);
  const enc = String(track.encoding || "").trim();
  if (enc) params.set("enc", enc);
  return `/sub?${params.toString()}`;
}

function subDetail(track) {
  const parts = [];
  if (track.local) parts.push(t("customSubtitle"));
  if (track.origin) parts.push(String(track.origin));
  if (track.release) parts.push(String(track.release).slice(0, 46));
  if (track.format) parts.push(String(track.format).toUpperCase());
  if (track.downloads) parts.push(track.downloads >= 1000 ? `${Math.round(track.downloads / 1000)}k` : String(track.downloads));
  if (track.trusted) parts.push("trusted");
  return parts.join(" · ");
}

function parseTimestamp(value) {
  const match = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(String(value || "").trim());
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number((match[4] || "0").padEnd(3, "0"));
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function cueMarkup(raw) {
  const cleaned = String(raw || "")
    .replace(/<\/?(?:c|v|lang|ruby|rt)(?:\.[^>]*)?>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n");
  return esc(cleaned)
    .replace(/&lt;(\/?)(i|b|u|em|strong)&gt;/gi, "<$1$2>")
    .replace(/\n/g, "<br>");
}

function parseVtt(text) {
  const source = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = source.split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const rows = block.split("\n");
    if (!rows.length) continue;
    if (/^\s*WEBVTT/.test(rows[0]) || /^\s*(NOTE|STYLE|REGION)\b/.test(rows[0])) continue;
    const at = rows.findIndex((row) => row.includes("-->"));
    if (at < 0) continue;
    const [from, to] = rows[at].split("-->");
    const start = parseTimestamp(from.trim());
    const end = parseTimestamp(String(to || "").trim().split(/\s+/)[0]);
    if (start == null || end == null || end <= start) continue;
    const body = rows.slice(at + 1).join("\n").trim();
    if (!body) continue;
    cues.push({ start, end, html: cueMarkup(body) });
  }
  cues.sort((a, b) => a.start - b.start);
  return cues;
}

function clearSub() {
  const box = document.getElementById("sub-overlay");
  if (!box) return;
  box.textContent = "";
  box.dataset.sig = "";
}

function renderSubtitle() {
  const box = document.getElementById("sub-overlay");
  const video = document.getElementById("video");
  if (!box || !video) return;
  if (!state.subCues.length || state.subKey === "off") {
    if (box.dataset.sig !== "") clearSub();
    return;
  }

  const now = (video.currentTime || 0) - state.subOffset;
  const active = [];
  for (const cue of state.subCues) {
    if (cue.start > now) break;
    if (cue.end > now) active.push(cue);
  }

  const sig = active.map((cue) => cue.html).join("\u0001");
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = active.map((cue) => `<div class="sub-line">${cue.html}</div>`).join("");
}

async function loadSubtitle(track) {
  const token = ++state.subToken;
  state.subCues = [];
  state.subVtt = "";
  state.subName = "";
  clearSub();

  if (!track) {
    state.subKey = "off";
    state.subLang = "off";
    renderCaptionList();
    return;
  }

  state.subKey = trackKey(track);
  state.subLang = subCode(track);
  const label = subLabel(track, 0);

  try {
    let text = track.vttText || "";
    if (!text) {
      const url = subProxyUrl(track);
      if (!url) throw new Error("missing subtitle url");
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) throw new Error(`subtitle ${res.status}`);
      text = await res.text();
    }
    if (token !== state.subToken) return;
    const cues = parseVtt(text);
    if (!cues.length) throw new Error("empty subtitle");
    state.subVtt = text;
    state.subName = track.fileName || track.display || label;
    state.subCues = cues;
    renderSubtitle();
  } catch {
    if (token !== state.subToken) return;
    toast(`${t("subtitleFailed")}: ${label}`);
    state.subKey = "off";
    state.subCues = [];
    clearSub();
  }
  renderCaptionList();
  syncCastTrack();
}

function selectedIndex() {
  if (state.subKey === "off") return -1;
  if (state.subKey) {
    const exact = state.subTracks.findIndex((tr) => trackKey(tr) === state.subKey);
    if (exact >= 0) return exact;
  }
  return -1;
}

function autoPickIndex() {
  if (state.prefLang === "off") return -1;
  if (!state.subTracks.length) return -1;
  const prefs = [];
  if (state.prefLang) prefs.push(state.prefLang);
  const ui = String(getLang() || "").toLowerCase();
  if (ui) prefs.push(ui);
  if (state.subLang && state.subLang !== "off") prefs.push(state.subLang);
  prefs.push("en", "eng", "id", "ind");
  for (const pref of prefs) {
    const idx = state.subTracks.findIndex((tr) => {
      const code = subCode(tr);
      return code === pref || (pref.length > 2 && code.startsWith(pref));
    });
    if (idx >= 0) return idx;
  }
  return 0;
}

function orderSubtitles(list) {
  const ui = String(getLang() || "en").toLowerCase();
  const rank = (track) => {
    const code = subCode(track);
    if (code === ui) return 0;
    if (code === "en") return 1;
    if (code === "id") return 2;
    return 3;
  };
  return list
    .map((track, i) => ({ track, i }))
    .sort((a, b) => rank(a.track) - rank(b.track) || a.i - b.i)
    .map((entry) => entry.track);
}

function mergeTracks(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const track of list || []) {
      if (!track) continue;
      const key = trackKey(track);
      if (!key || map.has(key)) continue;
      map.set(key, track);
    }
  }
  return [...map.values()];
}

function ensureSubtitle() {
  if (state.subUserPick) return;
  if (!state.autoSubs) {
    if (state.subKey !== "off") {
      state.subToken++;
      state.subKey = "off";
      state.subCues = [];
      state.subVtt = "";
      clearSub();
    }
    renderCaptionList();
    return;
  }
  const idx = autoPickIndex();
  if (idx < 0) {
    state.subKey = "off";
    state.subCues = [];
    clearSub();
    renderCaptionList();
    return;
  }
  const track = state.subTracks[idx];
  if (trackKey(track) !== state.subKey) loadSubtitle(track);
  else renderSubtitle();
}

function populateCaptionMenu() {
  const header = document.getElementById("pui-caption-h");
  if (header) header.textContent = state.subTracks.length ? `${t("subtitles")} · ${state.subTracks.length}` : t("subtitles");
  const filter = document.getElementById("pui-sub-filter");
  renderCaptionList(filter ? filter.value : "");
}

function renderCaptionList(query = "") {
  const list = document.getElementById("pui-caption-list");
  if (!list) return;
  const q = String(query || "").trim().toLowerCase();
  const rows = [`<button class="pui-opt ${state.subKey === "off" ? "active" : ""}" data-cc="-1">${esc(t("off"))}</button>`];
  let shown = 0;

  state.subTracks.forEach((track, i) => {
    const label = subLabel(track, i);
    const detail = subDetail(track);
    const haystack = `${label} ${detail} ${track.language || ""} ${track.lang || ""} ${track.release || ""}`.toLowerCase();
    if (q && !haystack.includes(q)) return;
    shown++;
    const active = state.subKey === trackKey(track);
    rows.push(
      `<button class="pui-opt ${active ? "active" : ""}" data-cc="${i}" title="${esc(detail || label)}">
        <span class="pui-opt-title">${esc(label)}${track.hi ? ' <em class="pui-sub-tag">HI</em>' : ""}</span>
        ${detail ? `<span class="pui-opt-sub">${esc(detail)}</span>` : ""}
      </button>`,
    );
  });

  if (!shown) rows.push(`<div class="pui-sub-empty">${esc(t("noSubtitles"))}</div>`);
  list.innerHTML = rows.join("");
  list.querySelectorAll("[data-cc]").forEach((btn) => {
    btn.addEventListener("click", () => chooseSubtitle(Number(btn.dataset.cc)));
  });
}

function chooseSubtitle(index) {
  const track = index >= 0 ? state.subTracks[index] : null;
  state.subUserPick = true;
  state.prefLang = track ? subCode(track) : "off";
  if (!track) {
    state.subToken++;
    state.subKey = "off";
    state.subLang = "off";
    state.subCues = [];
    state.subVtt = "";
    clearSub();
    renderCaptionList();
    syncCastTrack();
    return;
  }
  loadSubtitle(track);
}

async function loadExternalSubs() {
  const video = document.getElementById("video");
  if (!video || !state.detail) return;
  const reqId = ++state.subReq;
  const d = state.detail;
  const params = { tmdbId: d.tmdbId, mediaType: d.mediaType, imdbId: d.imdbId || "" };
  if (d.mediaType === "tv") { params.season = state.season; params.episode = state.episode; }

  const pick = (value) =>
    value && Array.isArray(value.subtitles) ? value.subtitles.filter((track) => track && track.url) : [];

  const merge = (list) => {
    if (reqId !== state.subReq || !list.length) return;
    const locals = state.subTracks.filter((track) => track.local);
    const rest = orderSubtitles(mergeTracks(list, state.subTracks.filter((track) => !track.local)));
    state.subTracks = [...locals, ...rest];
    populateCaptionMenu();
    ensureSubtitle();
  };

  // Local API answers in a few hundred ms; Atlantic's feed can take seconds or
  // be unreachable, so its tracks are merged in when they arrive.
  const local = api.subtitles(params).then(pick, () => []);
  const atlantic = api.atlanticSubtitles(params).then(pick, () => []);

  merge(await local);
  merge(await atlantic);
  if (reqId === state.subReq && !state.subTracks.length) ensureSubtitle();
}

async function readSubtitleText(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

async function uploadSubtitle(file) {
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) {
    toast("Subtitle file too large");
    return;
  }
  try {
    const raw = await readSubtitleText(file);
    let vtt = raw;
    if (!/^\s*WEBVTT\b/i.test(raw)) {
      const converted = await api.convertSubtitle(raw, "");
      vtt = converted?.vtt || "";
    }
    if (!/^\s*WEBVTT\b/i.test(vtt) || !parseVtt(vtt).length) throw new Error("empty");

    const track = {
      id: `local:${Date.now()}`,
      source: "local",
      display: file.name.replace(/\.[^.]+$/, ""),
      language: file.name,
      fileName: file.name,
      local: true,
      vttText: vtt,
    };
    state.subTracks = [track, ...state.subTracks.filter((tr) => trackKey(tr) !== trackKey(track))];
    state.subUserPick = true;
    await loadSubtitle(track);
    populateCaptionMenu();
    toast(t("subtitleAdded"));
  } catch {
    toast(t("subtitleFailed"));
  }
}

function downloadSubtitle() {
  if (!state.subVtt) {
    toast(t("noSubtitleLoaded"));
    return;
  }
  const name = (state.detail?.title || "subtitle").replace(/[^\w.-]+/g, "_");
  const blob = new Blob([state.subVtt], { type: "text/vtt;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.${state.subLang || "sub"}.vtt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function hexLum(hex) {
  const value = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return 1;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function outlineShadow(kind, color) {
  const light = hexLum(color) > 0.62;
  if (kind === "none") return "none";
  if (kind === "thick") {
    return light
      ? "0 2px 3px rgba(0, 0, 0, 0.98), 0 0 12px rgba(0, 0, 0, 0.95), 0 0 2px rgba(0, 0, 0, 1)"
      : "0 2px 3px rgba(255, 255, 255, 0.4), 0 0 12px rgba(0, 0, 0, 0.95)";
  }
  return light
    ? "0 1px 2px rgba(0, 0, 0, 0.95), 0 0 8px rgba(0, 0, 0, 0.75)"
    : "0 1px 2px rgba(255, 255, 255, 0.35), 0 0 10px rgba(0, 0, 0, 0.9)";
}

function applySubStyle() {
  const color = /^#[0-9a-f]{6}$/i.test(state.subColor) ? state.subColor : "#ffffff";
  const scale = SUB_SIZES[state.subSize] || "1";
  const shadow = outlineShadow(state.subOutline, color);

  for (const node of [document.getElementById("stage"), document.getElementById("video"), document.getElementById("sub-overlay")]) {
    if (!node) continue;
    node.style.setProperty("--sub-color", color);
    node.style.setProperty("--sub-scale", scale);
    node.style.setProperty("--sub-shadow", shadow);
    node.style.setProperty("--sub-bg", SUB_BG[state.subBg] || "transparent");
    node.style.setProperty("--sub-font", SUB_FONTS[state.subFont] || "inherit");
    node.style.setProperty("--sub-opacity", String(state.subOpacity));
  }
}

function paintDelay() {
  const label = document.getElementById("pui-delay-val");
  if (label) label.textContent = `${state.subOffset > 0 ? "+" : ""}${state.subOffset.toFixed(1)}s`;
}

function bindSubStyle() {
  const color = document.getElementById("pui-sub-color");
  if (color) {
    color.value = state.subColor;
    color.addEventListener("input", () => {
      state.subColor = color.value;
      writeLS(LS.color, state.subColor);
      applySubStyle();
    });
  }

  const sizes = document.getElementById("pui-sub-sizes");
  if (sizes) {
    const sync = () =>
      sizes.querySelectorAll("[data-size]").forEach((btn) => {
        const active = btn.dataset.size === state.subSize;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", String(active));
      });
    sync();
    sizes.querySelectorAll("[data-size]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.subSize = btn.dataset.size;
        writeLS(LS.size, state.subSize);
        applySubStyle();
        sync();
      });
    });
  }

  const bg = document.getElementById("pui-sub-bg");
  if (bg) {
    bg.value = state.subBg;
    bg.addEventListener("change", () => {
      state.subBg = SUB_BG[bg.value] ? bg.value : "soft";
      writeLS(LS.bg, state.subBg);
      applySubStyle();
    });
  }

  const outline = document.getElementById("pui-sub-outline");
  if (outline) {
    outline.value = state.subOutline;
    outline.addEventListener("change", () => {
      state.subOutline = ["none", "thin", "thick"].includes(outline.value) ? outline.value : "thin";
      writeLS(LS.outline, state.subOutline);
      applySubStyle();
    });
  }

  const font = document.getElementById("pui-sub-font");
  if (font) {
    font.value = state.subFont;
    font.addEventListener("change", () => {
      state.subFont = SUB_FONTS[font.value] ? font.value : "default";
      writeLS(LS.font, state.subFont);
      applySubStyle();
    });
  }

  const opacity = document.getElementById("pui-sub-opacity");
  if (opacity) {
    opacity.value = String(state.subOpacity);
    opacity.addEventListener("input", () => {
      state.subOpacity = clamp(Number(opacity.value) || 1, 0.4, 1);
      writeLS(LS.opacity, state.subOpacity);
      applySubStyle();
    });
  }

  document.querySelectorAll("[data-delay]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.subOffset = clamp(Number((state.subOffset + Number(btn.dataset.delay)).toFixed(1)), -30, 30);
      writeLS(LS.offset, state.subOffset);
      paintDelay();
      renderSubtitle();
    });
  });
  document.getElementById("pui-delay-val")?.addEventListener("click", () => {
    state.subOffset = 0;
    writeLS(LS.offset, 0);
    paintDelay();
    renderSubtitle();
  });
  paintDelay();

  document.getElementById("pui-sub-upload")?.addEventListener("click", () => {
    document.getElementById("pui-sub-file")?.click();
  });
  document.getElementById("pui-sub-file")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    uploadSubtitle(file);
  });
  document.getElementById("pui-sub-download")?.addEventListener("click", downloadSubtitle);

  applySubStyle();
}

/* --------------------------------- volume -------------------------------- */

function paintVolumeUI() {
  const btn = document.getElementById("pui-mute");
  if (btn) btn.innerHTML = state.muted || state.volume === 0 ? MUTE_ICON : VOLUME_ICON;
  if (btn) btn.setAttribute("aria-label", state.muted ? t("unmute") : t("mute"));
  const slider = document.getElementById("pui-vol");
  if (slider) {
    const value = state.muted ? 0 : state.volume;
    slider.value = String(value);
    slider.style.setProperty("--p", `${value * 100}%`);
  }
}

function applyVolume() {
  const video = document.getElementById("video");
  if (video) {
    video.volume = state.volume;
    video.muted = state.muted;
  }
  castApplyVolume();
  paintVolumeUI();
}

function setVolume(next) {
  state.volume = clamp(next, 0, 1);
  if (state.volume > 0) {
    state.muted = false;
    state.lastVolume = state.volume;
    writeLS(LS.volume, state.volume);
    writeLS(LS.muted, "0");
  } else {
    state.muted = true;
    writeLS(LS.muted, "1");
  }
  applyVolume();
}

function toggleMute() {
  if (state.muted || state.volume === 0) {
    state.muted = false;
    state.volume = state.lastVolume || 0.6;
    writeLS(LS.muted, "0");
    writeLS(LS.volume, state.volume);
  } else {
    state.lastVolume = state.volume;
    state.muted = true;
    writeLS(LS.muted, "1");
  }
  applyVolume();
}

function syncVolumeFromVideo() {
  const video = document.getElementById("video");
  if (!video) return;
  state.volume = clamp(video.volume, 0, 1);
  state.muted = video.muted;
  if (state.volume > 0 && !state.muted) state.lastVolume = state.volume;
  writeLS(LS.volume, state.volume);
  writeLS(LS.muted, state.muted ? "1" : "0");
  paintVolumeUI();
}

/* ------------------------------ PiP / cast ------------------------------- */

const castCtx = {
  ctx: null,
  session: null,
  player: null,
  controller: null,
  device: "",
  lastTime: 0,
  loadedKey: "",
  mediaSessionId: null,
  sdkPromise: null,
  wired: false,
  saveAt: 0,
};

function castActive() {
  return Boolean(castCtx.session);
}

/** Receiver needs an absolute URL; keep the CORS proxy unless the origin is loopback. */
function castUrl(raw) {
  const value = String(raw || "");
  if (!value) return "";
  const loopback = /^(localhost|127\.|\[::1\])$/i.test(window.location.hostname);
  if (loopback) {
    if (value.startsWith("/")) {
      try {
        return new URL(value, window.location.origin).toString();
      } catch {
        return value;
      }
    }
    return value;
  }
  const target = value.startsWith("/") ? value : `/stream?u=${encodeURIComponent(value)}`;
  try {
    return new URL(target, window.location.origin).toString();
  } catch {
    return "";
  }
}

function loadCastSdk() {
  if (window.cast && window.cast.framework && window.cast.framework.CastContext) return Promise.resolve(true);
  if (castCtx.sdkPromise) return castCtx.sdkPromise;
  if (!window.isSecureContext) return Promise.resolve(false);

  castCtx.sdkPromise = new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(Boolean(ok));
    };
    const timer = setTimeout(() => done(Boolean(window.cast && window.cast.framework)), 8000);
    window.__onGCastApiAvailable = (available) => done(available);
    const script = document.createElement("script");
    script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    script.async = true;
    script.onerror = () => done(false);
    document.head.appendChild(script);
  });
  return castCtx.sdkPromise;
}

function paintCastBar() {
  const bar = document.getElementById("cast-bar");
  if (!bar) return;
  if (!castActive()) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const device = document.getElementById("cast-device");
  if (device) device.textContent = castCtx.device || "Chromecast";
  const time = document.getElementById("cast-time");
  const player = castCtx.player;
  if (time && player) time.textContent = fmtTime(Number(player.currentTime) || 0);
  if (player) {
    const duration = Number(player.duration) || 0;
    const current = Number(player.currentTime) || 0;
    const seek = document.getElementById("pui-seek");
    if (seek && duration > 0) {
      seek.value = String(Math.round((current / duration) * 1000));
      seek.style.setProperty("--p", `${(current / duration) * 100}%`);
    }
    const cur = document.getElementById("pui-cur");
    if (cur) cur.textContent = fmtTime(current);
    const dur = document.getElementById("pui-dur");
    if (dur && duration > 0) dur.textContent = fmtTime(duration);
  }
  const toggle = document.getElementById("cast-toggle");
  if (toggle && player) {
    toggle.innerHTML = player.isPaused ? PLAY_ICON : PAUSE_ICON;
    toggle.setAttribute("aria-label", player.isPaused ? "Play" : "Pause");
  }
}

function castSeekTo(seconds) {
  if (!castActive() || !castCtx.player || !castCtx.controller) return;
  const duration = Number(castCtx.player.duration) || 0;
  const next = duration > 0 ? clamp(seconds, 0, duration - 1) : Math.max(0, seconds);
  castCtx.player.currentTime = next;
  castCtx.controller.seek();
  castCtx.lastTime = next;
  paintCastBar();
}

function castTogglePlay() {
  castCtx.controller?.playOrPause();
}

function castApplyVolume() {
  if (!castActive() || !castCtx.player || !castCtx.controller) return;
  castCtx.player.volumeLevel = state.muted ? 0 : state.volume;
  castCtx.controller.setVolumeLevel();
  if (Boolean(castCtx.player.isMuted) !== Boolean(state.muted)) castCtx.controller.muteOrUnmute();
}

async function castStart(at = 0) {
  const session = castCtx.session || castCtx.ctx?.getCurrentSession();
  if (!session || !state.currentUrl) return false;

  const url = castUrl(state.currentUrl);
  if (!url) return false;
  const isHls = /\.m3u8(\?|$)/i.test(url);
  const mediaInfo = new chrome.cast.media.MediaInfo(url, isHls ? "application/x-mpegURL" : "video/mp4");
  mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;

  if (chrome.cast.media.MetadataType) {
    const metadata = new chrome.cast.media.GenericMediaMetadata();
    metadata.metadataType = chrome.cast.media.MetadataType.GENERIC;
    metadata.title = state.detail?.title || "";
    metadata.subtitle = state.detail?.mediaType === "tv" ? `${t("season")} ${state.season} · ${t("episode")} ${state.episode}` : String(state.detail?.year || "");
    const image = state.detail?.backdrop || state.detail?.poster;
    if (image) metadata.images = [castUrl(image)];
    mediaInfo.metadata = metadata;
  }

  const tracks = [];
  const activeIds = [];
  const MAX_TRACKS = 60;
  for (let index = 0; index < state.subTracks.length; index += 1) {
    const track = state.subTracks[index];
    if (!track || track.local) continue;
    const selected = trackKey(track) === state.subKey;
    if (tracks.length >= MAX_TRACKS && !selected) continue;
    const raw = subProxyUrl(track);
    const content = raw ? castUrl(raw) : "";
    if (!content) continue;
    const id = index + 1;
    const castTrack = new chrome.cast.media.Track(id, chrome.cast.media.TrackType.TEXT);
    castTrack.trackContentId = content;
    castTrack.trackContentType = "text/vtt";
    castTrack.subtype = chrome.cast.media.TextTrackType.SUBTITLES;
    castTrack.name = subLabel(track, index);
    castTrack.language = subCode(track) || "en";
    tracks.push(castTrack);
    if (selected) activeIds.push(id);
  }
  if (tracks.length) {
    mediaInfo.tracks = tracks;
    if (activeIds.length) mediaInfo.activeTrackIds = activeIds;
  }

  const request = new chrome.cast.media.LoadRequest(mediaInfo);
  request.autoplay = true;
  request.currentTime = Math.max(0, Number(at) || 0);

  try {
    overlay("loading", `${t("castingTo")} ${castCtx.device}`);
    const media = await session.loadMedia(request);
    castCtx.mediaSessionId = media?.mediaSessionId || null;
    castCtx.loadedKey = `${state.currentUrl}|${state.subKey}`;
    castCtx.lastTime = request.currentTime;
    overlay("clear");
    const player = document.getElementById("video");
    if (player) player.pause();
    media?.addUpdateListener?.(onCastMediaStatus);
    paintCastBar();
    return true;
  } catch {
    toast(t("castUnavailable"));
    castCtx.session = null;
    castCtx.ctx?.endCurrentSession(true);
    return false;
  }
}

function onCastMediaStatus(status) {
  if (!status || !castActive()) return;
  if (castCtx.mediaSessionId && status.mediaSessionId && status.mediaSessionId !== castCtx.mediaSessionId) return;

  if (status.playerState === chrome.cast.media.PlayerState.IDLE) {
    if (status.idleReason === chrome.cast.media.IdleReason.FINISHED) {
      handleEnded();
    } else if (status.idleReason === chrome.cast.media.IdleReason.ERROR) {
      failover();
    }
  }
}

function onCastSession(session) {
  if (!session) return;
  castCtx.session = session;
  castCtx.device = session.getCastDevice()?.friendlyName || "Chromecast";
  castCtx.loadedKey = "";
  const video = document.getElementById("video");
  const at = video && Number.isFinite(video.currentTime) ? video.currentTime : castCtx.lastTime || 0;
  if (video) video.pause();
  document.getElementById("stage")?.classList.add("casting");
  paintCastBar();
  if (state.currentUrl) castStart(at);
}

function onCastEnd() {
  const resumeAt = Number(castCtx.lastTime) || 0;
  castCtx.session = null;
  castCtx.loadedKey = "";
  castCtx.mediaSessionId = null;
  document.getElementById("stage")?.classList.remove("casting");
  const bar = document.getElementById("cast-bar");
  if (bar) bar.hidden = true;
  if (state.currentUrl) playSource(state.currentUrl, state.currentQuality, { resumeAt, notify: false });
  else overlay("clear");
}

function stopCasting() {
  castCtx.ctx?.endCurrentSession(true);
}

function syncCastTrack() {
  if (!castActive()) return;
  const key = `${state.currentUrl}|${state.subKey}`;
  if (key === castCtx.loadedKey) return;
  castStart(castCtx.lastTime || 0);
}

function setupCastContext() {
  const ctx = cast.framework.CastContext.getInstance();
  ctx.setOptions({
    receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    resumeSavedSession: true,
  });
  castCtx.ctx = ctx;

  if (!castCtx.wired) {
    castCtx.wired = true;
    castCtx.player = new cast.framework.RemotePlayer();
    castCtx.controller = new cast.framework.RemotePlayerController(castCtx.player);

    ctx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (event) => {
      const states = cast.framework.SessionState;
      if (event.sessionState === states.SESSION_STARTED || event.sessionState === states.SESSION_RESUMED) {
        onCastSession(ctx.getCurrentSession());
      } else if (event.sessionState === states.SESSION_ENDED) {
        onCastEnd();
      }
    });

    castCtx.controller.addEventListener(cast.framework.RemotePlayerEventType.ANY_CHANGE, () => {
      if (!castActive()) return;
      const player = castCtx.player;
      if (Number.isFinite(player.currentTime)) castCtx.lastTime = player.currentTime;
      paintCastBar();
      saveCastProgress();
    });
  }

  const existing = ctx.getCurrentSession();
  if (existing) onCastSession(existing);
}

async function initCast(video) {
  const button = document.getElementById("pui-cast");
  if (!button) return;

  const remote = video.remote;
  const airplay = typeof video.webkitShowPlaybackTargetPicker === "function";
  const fallback = () => {
    if (remote && typeof remote.prompt === "function") {
      remote.prompt().catch(() => {
        if (airplay) video.webkitShowPlaybackTargetPicker();
      });
      return;
    }
    if (airplay) video.webkitShowPlaybackTargetPicker();
  };

  let ready = false;
  button.addEventListener("click", () => {
    if (!ready) {
      fallback();
      return;
    }
    const ctx = castCtx.ctx;
    if (!ctx) return;
    if (ctx.getCurrentSession()) {
      stopCasting();
      return;
    }
    ctx.requestSession().catch(() => toast(t("castUnavailable")));
  });

  document.getElementById("cast-stop")?.addEventListener("click", stopCasting);
  document.getElementById("cast-toggle")?.addEventListener("click", castTogglePlay);

  const sdk = await loadCastSdk();
  if (!sdk || !window.cast || !window.cast.framework) {
    if (!(remote && typeof remote.prompt === "function") && !airplay) button.hidden = true;
    return;
  }

  try {
    setupCastContext();
    ready = true;
  } catch {
    button.hidden = !airplay;
    return;
  }

  paintCastBar();
}

function initExtras(video) {
  const pip = document.getElementById("pui-pip");
  if (pip) {
    if (!document.pictureInPictureEnabled || typeof video.requestPictureInPicture !== "function") {
      pip.hidden = true;
    } else {
      pip.addEventListener("click", () => {
        if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
        else video.requestPictureInPicture().catch(() => toast(t("pip")));
      });
      video.addEventListener("enterpictureinpicture", () => pip.classList.add("on"));
      video.addEventListener("leavepictureinpicture", () => pip.classList.remove("on"));
    }
  }

  initCast(video);
}

/* ------------------------------- next up --------------------------------- */

function cancelNextUp() {
  clearInterval(state.nextTimer);
  state.nextTimer = 0;
  const box = document.getElementById("next-up");
  if (box) box.hidden = true;
}

function showNextUp(target) {
  const box = document.getElementById("next-up");
  if (!box) return;
  clearInterval(state.nextTimer);
  state.nextTimer = 0;
  let left = 8;
  const count = document.getElementById("next-count");
  const title = document.getElementById("next-title");
  const label = document.getElementById("next-label");
  const unit = document.getElementById("next-unit");
  if (title) title.textContent = `${t("season")} ${target.season} · ${t("episode")} ${target.episode}`;
  if (label) label.textContent = state.autoNext ? t("nextIn") : t("nextEpisode");
  if (count) {
    count.textContent = String(left);
    count.hidden = !state.autoNext;
  }
  if (unit) unit.hidden = !state.autoNext;
  box.hidden = false;
  if (!state.autoNext) return;
  state.nextTimer = setInterval(() => {
    if (!document.getElementById("video")) {
      cancelNextUp();
      return;
    }
    left -= 1;
    if (left <= 0) {
      cancelNextUp();
      goEpisode(target.season, target.episode);
      return;
    }
    if (count) count.textContent = String(left);
  }, 1000);
}

async function nextTarget() {
  const detail = state.detail;
  if (!detail || detail.mediaType !== "tv") return null;
  const counts = state.episodeCounts;

  if (counts[state.season] == null) {
    try {
      const data = await api.season(detail.tmdbId, state.season);
      counts[state.season] = (data.episodes || []).length;
    } catch {
      /* unknown count */
    }
  }

  const current = counts[state.season];
  if (!current || state.episode < current) return { season: state.season, episode: state.episode + 1 };

  const seasons = (detail.seasons || [])
    .map((season) => Number(season.season_number))
    .filter((n) => Number.isFinite(n) && n > 0);
  const after = seasons.filter((n) => n > state.season).sort((a, b) => a - b);

  for (const season of after) {
    if (counts[season] == null) {
      try {
        const data = await api.season(detail.tmdbId, season);
        counts[season] = (data.episodes || []).length;
      } catch {
        counts[season] = 0;
      }
    }
    if (counts[season] > 0) return { season, episode: 1 };
  }
  return null;
}

/* --------------------------------- player -------------------------------- */

function bindPlayerControls() {
  const video = document.getElementById("video");
  const stage = document.getElementById("stage");
  const ui = document.getElementById("player-ui");
  if (!video || !stage || !ui) return;

  const settings = document.getElementById("pui-settings");
  const captions = document.getElementById("pui-captions");
  let hideTimer = 0;
  let lastPT = "mouse";

  function hideControls() {
    if (!settings.hidden || !captions.hidden) return;
    ui.classList.add("hidden");
    stage.classList.add("controls-hidden");
  }
  function showControls(persist) {
    ui.classList.remove("hidden");
    stage.classList.remove("controls-hidden");
    clearTimeout(hideTimer);
    const menusOpen = !settings.hidden || !captions.hidden;
    if (!persist && !video.paused && !menusOpen) hideTimer = setTimeout(hideControls, 2800);
  }
  function closeMenus() {
    settings.hidden = true;
    captions.hidden = true;
    ui.classList.remove("menu-open");
  }
  const togglePlay = () => {
    if (castActive()) {
      castTogglePlay();
      return;
    }
    video.paused ? video.play().catch(() => {}) : video.pause();
  };

  document.getElementById("pui-play")?.addEventListener("click", togglePlay);
  document.getElementById("pui-bigplay")?.addEventListener("click", togglePlay);
  video.addEventListener("click", () => { if (lastPT !== "touch") togglePlay(); });
  video.addEventListener("play", () => { setPlayIcons(false); showControls(false); });
  video.addEventListener("pause", () => { setPlayIcons(true); showControls(true); });
  setPlayIcons(true);

  document.getElementById("skip-back")?.addEventListener("click", () => { skip(-state.seekAmount); showControls(false); });
  document.getElementById("skip-fwd")?.addEventListener("click", () => { skip(state.seekAmount); showControls(false); });
  ui.querySelectorAll(".pui-skip").forEach((b) => b.addEventListener("click", () => { skip(Number(b.dataset.skip)); showControls(false); }));
  document.getElementById("seg-skip")?.addEventListener("click", (e) => { e.stopPropagation(); skipSegmentNow(); showControls(false); });

  const seek = document.getElementById("pui-seek");
  let seeking = false;
  const setSeekFill = (pct) => seek && seek.style.setProperty("--p", `${pct}%`);
  seek?.addEventListener("input", () => {
    seeking = true;
    const d = castActive() ? Number(castCtx.player?.duration) || 0 : video.duration || 0;
    document.getElementById("pui-cur").textContent = fmtTime((seek.value / 1000) * d);
    setSeekFill(seek.value / 10);
  });
  seek?.addEventListener("change", () => {
    if (castActive()) {
      const d = Number(castCtx.player?.duration) || 0;
      if (d) castSeekTo((seek.value / 1000) * d);
      seeking = false;
      return;
    }
    const d = video.duration || 0;
    if (d) video.currentTime = (seek.value / 1000) * d;
    seeking = false;
  });
  video.addEventListener("timeupdate", () => {
    const d = video.duration || 0;
    if (!d) return;
    if (!seeking && seek) {
      seek.value = String(Math.round((video.currentTime / d) * 1000));
      setSeekFill((video.currentTime / d) * 100);
      const cur = document.getElementById("pui-cur");
      if (cur) cur.textContent = fmtTime(video.currentTime);
    }
    tickSegments();
  });
  const refreshDur = () => { const dur = document.getElementById("pui-dur"); if (dur) dur.textContent = fmtTime(video.duration); };
  video.addEventListener("loadedmetadata", refreshDur);
  video.addEventListener("durationchange", refreshDur);

  video.addEventListener("timeupdate", renderSubtitle);
  video.addEventListener("seeked", renderSubtitle);
  document.getElementById("pui-sub-filter")?.addEventListener("input", (e) => renderCaptionList(e.target.value));

  renderSpeedMenu(video);
  renderPlaybackSettings();
  paintSeekLabels();
  bindSubStyle();
  applyVolume();
  video.addEventListener("volumechange", syncVolumeFromVideo);

  const muteBtn = document.getElementById("pui-mute");
  muteBtn?.addEventListener("click", toggleMute);
  const volSlider = document.getElementById("pui-vol");
  volSlider?.addEventListener("input", () => setVolume(Number(volSlider.value)));

  initExtras(video);

  document.getElementById("next-play")?.addEventListener("click", () => {
    const target = state.nextTarget;
    cancelNextUp();
    if (target) goEpisode(target.season, target.episode);
  });
  document.getElementById("next-cancel")?.addEventListener("click", cancelNextUp);

  document.getElementById("pui-gear")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = settings.hidden;
    closeMenus();
    settings.hidden = !open;
    ui.classList.toggle("menu-open", !settings.hidden);
    showControls(true);
  });
  document.getElementById("pui-cc")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = captions.hidden;
    closeMenus();
    captions.hidden = !open;
    ui.classList.toggle("menu-open", !captions.hidden);
    showControls(true);
  });
  stage.addEventListener("click", (e) => {
    if (!e.target.closest(".pui-menu") && !e.target.closest("#pui-gear") && !e.target.closest("#pui-cc")) closeMenus();
  });

  const fsBtn = document.getElementById("pui-fs");
  fsBtn?.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => video.webkitEnterFullscreen?.());
    else video.webkitEnterFullscreen?.();
  });
  if (state.fsHandler) document.removeEventListener("fullscreenchange", state.fsHandler);
  state.fsHandler = () => {
    const fs = document.fullscreenElement === stage;
    stage.classList.toggle("fullscreen", fs);
    if (fsBtn) fsBtn.innerHTML = fs ? FS_EXIT_ICON : FS_ENTER_ICON;
    showControls(false);
  };
  document.addEventListener("fullscreenchange", state.fsHandler);

  stage.addEventListener("pointerdown", (e) => { lastPT = e.pointerType; });
  stage.addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") showControls(false); });
  stage.addEventListener("pointerleave", () => { if (!video.paused) hideControls(); });
  showControls(false);

  // touch: single tap toggles controls/playback, double tap seeks by the configured amount
  let lastTap = 0;
  let tapTimer = 0;
  stage.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "touch") return;
    if (e.target.closest(".pui-bar") || e.target.closest(".pui-menu") || e.target.closest(".skip-btn") || e.target.closest(".seg-skip") || e.target.closest(".watch-overlay") || e.target.closest(".next-up")) return;
    const now = Date.now();
    if (state.doubleTap && now - lastTap < 300) {
      clearTimeout(tapTimer);
      const r = stage.getBoundingClientRect();
      skip(e.clientX < r.left + r.width / 2 ? -state.seekAmount : state.seekAmount);
      showControls(false);
      lastTap = 0;
      return;
    }
    lastTap = now;
    tapTimer = setTimeout(() => {
      if (ui.classList.contains("hidden")) showControls(false);
      else { togglePlay(); showControls(false); }
    }, 260);
  });

  if (state.keyHandler) document.removeEventListener("keydown", state.keyHandler);
  state.keyHandler = (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (!document.getElementById("video")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); skip(state.seekAmount); showControls(false); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); skip(-state.seekAmount); showControls(false); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setVolume(state.volume + 0.05); showControls(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setVolume(state.volume - 0.05); showControls(false); }
    else if (e.key === "k" || e.key === " ") {
      if (e.key === " " && tag === "BUTTON") return;
      e.preventDefault();
      togglePlay();
    }
    else if (e.key === "f") { e.preventDefault(); fsBtn?.click(); }
    else if (e.key === "m") { e.preventDefault(); toggleMute(); }
    else if (e.key === "p") { e.preventDefault(); if (!castActive()) document.getElementById("pui-pip")?.click(); }
    else if (e.key === "Escape") closeMenus();
  };
  document.addEventListener("keydown", state.keyHandler);

  state.ui = { showControls, refreshDur };
}

export async function watchPage(ctx, params) {
  const type = ctx.type === "tv" ? "tv" : "movie";
  const id = ctx.id;
  state.detail = null;
  state.season = Math.max(1, Number(params.get("season") || 1) || 1);
  state.episode = Math.max(1, Number(params.get("episode") || 1) || 1);
  state.provider = null;
  state.providerName = "";
  state.sources = [];
  state.playlist = "";
  state.qualities = [];
  state.qualityPick = "auto";
  state.queue = [];
  state.pool = new Map();
  state.tried = new Set();
  state.subTracks = [];
  state.subCues = [];
  state.subKey = null;
  state.subLang = null;
  state.subUserPick = false;
  state.subToken++;
  state.resumeSeconds = Math.max(0, Number(params.get("t") || 0) || 0);
  state.resumedFrom = 0;
  state.saveTimer = 0;
  state.episodeCounts = {};
  state.currentUrl = "";
  state.currentQuality = "";
  state.switchAt = 0;
  state.lastReport = "";
  state.lastResolveError = "";
  state.segments = [];
  state.segmentKey = "";
  state.segmentDone = "";

  document.getElementById("app").innerHTML = `<div class="watch-page"><div class="watch-top"><div class="watch-title">Loading…</div></div></div>`;

  try {
    state.detail = type === "tv" ? await api.tv(id) : await api.movie(id);
  } catch (err) {
    document.getElementById("app").innerHTML = `<div class="watch-page"><div class="watch-top"><button class="icon-btn" onclick="history.back()">${ICONS.chevronLeft}</button><div class="watch-title">Not found</div></div><div class="watch-panel"><p class="watch-error">${esc(err.message)}</p></div></div>`;
    return;
  }

  for (const season of state.detail.seasons || []) {
    if (season.season_number != null && season.episode_count) {
      state.episodeCounts[Number(season.season_number)] = Number(season.episode_count);
    }
  }

  if (!state.resumeSeconds) state.resumeSeconds = await resumePoint();

  const { providers } = await api.providers().catch(() => ({ providers: [] }));
  state.providers = providers;

  document.getElementById("app").innerHTML = stageMarkup();
  document.getElementById("watch-back").addEventListener("click", goBackFromWatch);
  bindPlayerControls();
  paintHeader();
  await buildPanel();
  await resolveAuto();
}

function goBackFromWatch() {
  const detail = state.detail;
  const fallback = detail ? `/${detail.mediaType}/${detail.tmdbId}` : "/";
  const from = location.pathname + location.search;
  const goFallback = () => {
    if (typeof window.__navigate === "function") window.__navigate(fallback);
    else location.assign(fallback);
  };
  if (history.length <= 1) {
    goFallback();
    return;
  }
  history.back();
  setTimeout(() => {
    if (location.pathname + location.search === from) goFallback();
  }, 400);
}

async function resumePoint() {
  if (!getToken() || !state.detail) return 0;
  try {
    const { items } = await api.history();
    const d = state.detail;
    const hit = (items || []).find(
      (h) =>
        h.tmdbId === d.tmdbId &&
        h.mediaType === d.mediaType &&
        (d.mediaType !== "tv" || (h.season === state.season && h.episode === state.episode)),
    );
    if (!hit) return 0;
    if ((hit.progress || 0) > 0.97) return 0;
    const seconds = Number(hit.seconds) || 0;
    return seconds > 30 ? seconds : 0;
  } catch {
    return 0;
  }
}

function paintHeader() {
  const sub = document.getElementById("watch-sub");
  if (!sub || !state.detail) return;
  const d = state.detail;
  const bits = [
    d.mediaType === "tv"
      ? `${t("season")} ${state.season} · ${t("episode")} ${state.episode}${d.year ? ` · ${d.year}` : ""}`
      : `${d.year || ""}${d.duration ? ` · ${d.duration} ${t("minutes")}` : ""}`,
  ];
  if (state.providerName) bits.push(esc(state.providerName));
  if (state.resumedFrom > 0) bits.push(`<button class="resume-link" id="start-over">${esc(t("startOver"))}</button>`);
  sub.innerHTML = bits.filter(Boolean).join(" · ");
  document.getElementById("start-over")?.addEventListener("click", () => {
    const video = document.getElementById("video");
    if (castActive()) {
      castCtx.lastTime = 0;
      castSeekTo(0);
      state.resumedFrom = 0;
      paintHeader();
      return;
    }
    if (!video) return;
    video.currentTime = 0;
    state.resumedFrom = 0;
    paintHeader();
    video.play().catch(() => {});
  });
}

async function buildPanel() {
  const panel = document.getElementById("watch-panel");
  const d = state.detail;
  panel.innerHTML = d.mediaType === "tv" ? '<div id="episode-area"></div>' : "";
  if (d.mediaType === "tv") await buildEpisodes();
}

async function buildEpisodes() {
  const area = document.getElementById("episode-area");
  if (!area) return;
  const seasons = state.detail.seasons?.length ? state.detail.seasons : [{ season_number: 1, name: "Season 1" }];
  area.innerHTML = `<div class="season-bar">
      <select class="filter-select" id="w-season">${seasons.map((s) => `<option value="${s.season_number}" ${s.season_number === state.season ? "selected" : ""}>${esc(s.name || `${t("season")} ${s.season_number}`)}</option>`).join("")}</select>
      <button class="btn btn-ghost btn-sm" id="w-prev">${t("prevEpisode")}</button>
      <button class="btn btn-ghost btn-sm" id="w-next">${t("nextEpisode")}</button>
    </div>
    <div class="episode-scroll" id="w-episodes"><div class="spinner"></div></div>`;

  const loadSeason = async (n) => {
    const holder = document.getElementById("w-episodes");
    holder.innerHTML = '<div class="spinner"></div>';
    try {
      const data = await api.season(state.detail.tmdbId, n);
      state.episodeCounts[n] = (data.episodes || []).length;
      holder.innerHTML = data.episodes
        .map(
          (e) => `<button class="ep-chip ${e.episode_number === state.episode && n === state.season ? "active" : ""}" data-ep="${e.episode_number}">
            <div class="n">${t("episode")} ${e.episode_number}</div><div class="t">${esc(e.name || "")}</div></button>`,
        )
        .join("");
      holder.querySelectorAll("[data-ep]").forEach((btn) =>
        btn.addEventListener("click", () => goEpisode(n, Number(btn.dataset.ep))),
      );
    } catch (err) {
      holder.innerHTML = `<p class="watch-error">${esc(err.message)}</p>`;
    }
  };

  document.getElementById("w-season").addEventListener("change", (e) => {
    const next = Math.max(1, Number(e.target.value) || 1);
    state.season = next;
    state.episode = 1;
    state.resumedFrom = 0;
    if (castActive()) castCtx.lastTime = 0;
    history.replaceState({}, "", `/watch/tv/${state.detail.tmdbId}?season=${next}&episode=1`);
    loadSeason(next);
    paintHeader();
    resolveAuto({ resumeAt: 0 });
  });
  document.getElementById("w-prev").addEventListener("click", () => goEpisode(state.season, Math.max(1, state.episode - 1)));
  document.getElementById("w-next").addEventListener("click", async () => {
    const target = await nextTarget();
    if (target) goEpisode(target.season, target.episode);
    else toast(t("lastEpisode"));
  });

  await loadSeason(state.season);
}

function goEpisode(season, episode) {
  if (!document.getElementById("video") || !state.detail) return;
  const s = Math.max(1, Number(season) || 1);
  const e = Math.max(1, Number(episode) || 1);
  const count = state.episodeCounts[s];
  if (count && e > count) {
    toast(t("lastEpisode"));
    return;
  }
  const prevSeason = state.season;
  state.season = s;
  state.episode = e;
  state.resumedFrom = 0;
  if (castActive()) castCtx.lastTime = 0;
  const url = `/watch/tv/${state.detail.tmdbId}?season=${s}&episode=${e}`;
  history.replaceState({}, "", url);
  paintHeader();
  if (prevSeason !== s) buildEpisodes();
  else document.querySelectorAll(".ep-chip").forEach((c) => c.classList.toggle("active", Number(c.dataset.ep) === e));
  resolveAuto({ resumeAt: 0 });
}

function requestParams(providerId) {
  const d = state.detail;
  const season = Number(state.season);
  const episode = Number(state.episode);
  const params = {
    tmdbId: d.tmdbId,
    mediaType: d.mediaType,
    title: d.title || "",
    titleOriginal: d.titleOriginal || "",
    year: d.year || "",
    imdbId: d.imdbId || "",
    season: Number.isFinite(season) && season > 0 ? season : 1,
    episode: Number.isFinite(episode) && episode > 0 ? episode : 1,
    totalSeasons: d.seasons?.length || d.episodeInfo?.seasons || 1,
  };
  if (providerId) params.provider = providerId;
  return params;
}

function resolveErrorText(message) {
  const text = String(message || "");
  if (/^atlantic:/i.test(text)) return t("sourceUnavailable");
  return text || t("streamError");
}

function overlay(kind, message) {
  const node = document.getElementById("overlay");
  if (!node) return;
  if (kind === "clear") {
    node.style.display = "none";
    node.innerHTML = "";
    return;
  }
  node.style.display = "grid";
  node.innerHTML =
    kind === "loading"
      ? `<div class="spinner"></div><div class="watch-note">${esc(message || t("loadingStream"))}</div>`
      : `<div class="watch-error">${esc(message)}</div><button class="btn btn-secondary btn-sm" id="ov-retry">Retry</button>`;
  document.getElementById("ov-retry")?.addEventListener("click", () => {
    const video = document.getElementById("video");
    resolveAuto({ resumeAt: video && Number.isFinite(video.currentTime) ? video.currentTime : 0 });
  });
}

async function resolveAuto({ resumeAt = state.resumeSeconds || 0 } = {}) {
  state.subReq++;
  state.subToken++;
  state.subKey = null;
  state.subLang = state.prefLang || null;
  state.subUserPick = false;
  state.subCues = [];
  state.subTracks = state.subTracks.filter((track) => track.local);
  state.tried = new Set();
  state.pool = new Map();
  clearSub();
  overlay("loading");
  document.getElementById("video")?.pause();

  const ids = state.providers.map((p) => p.id);
  state.queue = ids;

  try {
    const data = await api.sourcesAll({ ...requestParams(), limit: 8 });
    const list = (data.providers || []).filter((value) => value && Array.isArray(value.sources) && value.sources.length);
    if (list.length) {
      for (const value of list) state.pool.set(value.provider, value);
      const found = list.map((value) => value.provider);
      state.queue = [...found, ...ids.filter((id) => !found.includes(id))];
      const first = list[0];
      state.tried.add(first.provider);
      applyProvider(first, { resumeAt });
      return;
    }
  } catch {
    /* fall back to one-by-one */
  }

  const ok = await tryNext({ resumeAt });
  if (!ok) overlay("error", resolveErrorText(state.lastResolveError));
}

function applyProvider(value, { resumeAt = 0, reason = "", notify = true } = {}) {
  state.provider = value.provider;
  state.providerName = value.name || value.provider || "";
  state.sources = (value.sources || []).filter((source) => source && source.url);
  state.playlist = typeof value.playlist === "string" && value.playlist ? value.playlist : "";
  // A master playlist carries the full bitrate ladder, so hls.js can adapt when
  // bandwidth drops. Without one the provider only offers fixed variants.
  state.qualities = state.playlist
    ? [{ quality: "auto", url: state.playlist }, ...state.sources]
    : [...state.sources];
  // Keep the user's quality across episodes, but drop it when the new title
  // does not offer that tier.
  if (
    state.qualityPick !== "auto" &&
    !state.qualities.some((source) => String(source.quality || "").toLowerCase() === state.qualityPick)
  ) {
    state.qualityPick = "auto";
  }

  const incoming = (value.subtitles || []).filter((track) => track && (track.url || track.src));
  const locals = state.subTracks.filter((track) => track.local);
  const previous = state.subTracks.filter((track) => !track.local);
  state.subTracks = [...locals, ...orderSubtitles(mergeTracks(incoming, previous))];

  paintQualities();
  paintHeader();
  if (reason) toast(`${reason} · ${state.providerName}`);
  populateCaptionMenu();
  ensureSubtitle();

  const first = state.qualities[0];
  if (!first) return false;
  playSource(first.url, first.quality, { resumeAt, notify });
  loadExternalSubs();
  loadSegments();
  return true;
}

async function tryNext({ resumeAt = 0, reason = "", notify = true, fresh = false } = {}) {
  const order = state.queue.length ? state.queue : state.providers.map((p) => p.id);
  for (;;) {
    const id = order.find((value) => !state.tried.has(value));
    if (!id) return false;
    state.tried.add(id);
    try {
      const cached = fresh ? null : state.pool.get(id);
      const value = cached && cached.sources?.length ? cached : await api.sources({ ...requestParams(id), force: "1" });
      const sources = (value.sources || []).filter((source) => source && source.url);
      if (!sources.length) {
        state.lastResolveError = t("streamError");
        continue;
      }
      applyProvider({ ...value, provider: value.provider || id }, { resumeAt, reason, notify });
      return true;
    } catch (err) {
      if (err && err.message) state.lastResolveError = err.message;
      /* server down: keep walking */
    }
  }
}

async function failover() {
  if (state.failingOver || !state.detail) return;
  state.failingOver = true;
  state.switching = true;
  reportPlayback(false, "playback");
  const video = document.getElementById("video");
  const at = castActive() ? castCtx.lastTime || 0 : video && Number.isFinite(video.currentTime) ? video.currentTime : state.resumedFrom || 0;
  destroyHls();
  overlay("loading", t("switchingServer"));
  try {
    const ok = await tryNext({ resumeAt: at, reason: t("serverFailed"), notify: false, fresh: true });
    if (!ok) overlay("error", resolveErrorText(state.lastResolveError));
  } finally {
    state.failingOver = false;
  }
}

function paintQualities() {
  const list = document.getElementById("pui-quality-list");
  if (!list) return;
  if (!state.qualities.length) {
    list.innerHTML = `<button class="pui-opt" disabled>—</button>`;
    return;
  }
  const active = state.qualityPick || "auto";
  list.innerHTML = state.qualities
    .map((source, i) => {
      const label = String(source.quality || "auto").toLowerCase();
      return `<button class="pui-opt ${label === active ? "active" : ""}" data-q="${i}">${esc(label.toUpperCase())}</button>`;
    })
    .join("");
  list.querySelectorAll("[data-q]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const pick = state.qualities[Number(btn.dataset.q)];
      if (pick) selectQuality(pick);
    }),
  );
}

/**
 * Frame height is the tier name, but a 4:3 master reports its long edge in
 * height (1440x2076). Label by the short edge so 1440p stays 1440p.
 */
function levelLabel(width, height) {
  const short = Math.min(Number(width) || 0, Number(height) || 0) || Math.max(Number(width) || 0, Number(height) || 0);
  if (!short) return "auto";
  const tiers = [480, 720, 1080, 1440, 2160];
  let best = tiers[0];
  for (const tier of tiers) if (Math.abs(tier - short) < Math.abs(best - short)) best = tier;
  if (Math.abs(best - short) <= best * 0.12) return `${best}p`;
  return `${short}p`;
}

/** Index of the master level matching a quality label, -1 when none fits. */
function levelIndexFor(label) {
  const levels = state.hls?.levels;
  if (!Array.isArray(levels) || !levels.length) return -1;
  const want = String(label || "auto").toLowerCase();
  if (want === "auto") return -1;

  const exact = levels.findIndex((level) => levelLabel(level.width, level.height) === want);
  if (exact >= 0) return exact;

  const target = Number.parseInt(want, 10);
  if (!Number.isFinite(target)) return -1;
  let best = -1;
  let bestDiff = Infinity;
  levels.forEach((level, i) => {
    const short = Math.min(Number(level.width) || 0, Number(level.height) || 0) || Number(level.height) || 0;
    const diff = Math.abs(short - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  return best;
}

/**
 * Quality changes ride the existing MediaSource: hls.js swaps the level inside
 * the running stream. Tearing the player down and reloading a variant playlist
 * loses the audio track in Chrome, so that path is only the no-master fallback.
 */
function applyQualityPick() {
  const hls = state.hls;
  if (!hls || !Array.isArray(hls.levels) || !hls.levels.length) return false;
  const pick = state.qualityPick || "auto";
  if (pick === "auto") {
    if (hls.autoLevelEnabled === false) hls.currentLevel = -1;
    return true;
  }
  const idx = levelIndexFor(pick);
  if (idx < 0) return false;
  if (hls.currentLevel !== idx) hls.currentLevel = idx;
  return true;
}

function selectQuality(pick) {
  if (!pick) return;
  const label = String(pick.quality || "auto").toLowerCase();
  state.qualityPick = label;

  if (applyQualityPick()) {
    const level = state.hls?.levels?.[state.hls.currentLevel];
    state.currentQuality = state.hls?.currentLevel >= 0 && level ? levelLabel(level.width, level.height) : "auto";
    paintQualities();
    return;
  }

  // Fixed variants only: no ladder to ride, so the source has to reload.
  const video = document.getElementById("video");
  const at = castActive() ? castCtx.lastTime || 0 : video ? video.currentTime || 0 : 0;
  paintQualities();
  if (label === "auto" && state.playlist) playSource(state.playlist, "auto", { resumeAt: at, notify: false });
  else if (pick.url) playSource(pick.url, label, { resumeAt: at, notify: false });
}

function reportPlayback(ok, error = "") {
  const provider = state.provider;
  if (!provider) return;
  const key = `${provider}|${state.currentUrl}|${ok ? "ok" : "fail"}`;
  if (state.lastReport === key) return;
  state.lastReport = key;
  // Playback reports carry health only. The resolve latency is what the score
  // compares, so a long watch session must not look like a slow provider.
  api.reportProvider(provider, ok, 0, error).catch(() => {});
}

function destroyHls() {
  if (state.hls) {
    try {
      state.hls.destroy();
    } catch {
      /* already gone */
    }
    state.hls = null;
  }
}

function playSource(url, quality, { resumeAt = 0, notify = true } = {}) {
  const video = document.getElementById("video");
  if (!video) return;
  cancelNextUp();
  state.currentUrl = url;
  state.currentQuality = quality;
  state.switchAt = Date.now();

  if (castActive()) {
    state.switching = false;
    state.started = true;
    overlay("clear");
    castStart(resumeAt > 1 ? resumeAt : castCtx.lastTime || 0);
    return;
  }

  state.switching = true;
  state.started = false;
  destroyHls();
  video.removeAttribute("src");
  try {
    video.load();
  } catch {
    /* teardown only */
  }
  // A reloaded element can come back muted; re-assert the stored volume before
  // the new source attaches.
  applyVolume();

  const isHls = /\.m3u8(\?|$)/i.test(url);
  const proxied = proxyUrl(url);

  const seekResume = () => {
    if (!(resumeAt > 1)) return;
    if (video.readyState < 1) {
      video.addEventListener("loadedmetadata", seekResume, { once: true });
      return;
    }
    const duration = video.duration;
    if (Number.isFinite(duration) && resumeAt >= duration - 5) return;
    try {
      video.currentTime = resumeAt;
    } catch {
      return;
    }
    state.resumedFrom = resumeAt;
    paintHeader();
    if (notify) toast(`${t("resumedAt")} ${fmtTime(resumeAt)}`);
  };

  const markReady = () => {
    state.switching = false;
    state.started = true;
    overlay("clear");
    seekResume();
    reportPlayback(true);
    state.ui?.showControls(video.paused);
    video.play().catch(() => {
      setPlayIcons(true);
      state.ui?.showControls(true);
    });
  };

  overlay("loading", `${state.providerName || ""} ${String(quality || "auto").toUpperCase()}`.trim());

  if (isHls && window.Hls && window.Hls.isSupported()) {
    const hls = new window.Hls({
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      maxBufferSize: 60 * 1000 * 1000,
      backBufferLength: 30,
      capLevelToPlayerSize: true,
      enableWorker: true,
      lowLatencyMode: false,
    });
    state.hls = hls;
    let recovered = false;
    hls.loadSource(proxied);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      applyQualityPick();
      markReady();
    });
    hls.on(window.Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
      const level = hls.levels?.[data.level];
      if (level) state.currentQuality = levelLabel(level.width, level.height);
    });
    hls.on(window.Hls.Events.ERROR, (_evt, data) => {
      if (!data.fatal) return;
      if (data.type === window.Hls?.ErrorTypes?.MEDIA_ERROR && !recovered) {
        recovered = true;
        try {
          hls.recoverMediaError();
          return;
        } catch {
          /* fall through to failover */
        }
      }
      failover();
    });
  } else if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = proxied;
    video.addEventListener("loadedmetadata", markReady, { once: true });
  } else {
    video.src = proxied;
    video.addEventListener("loadeddata", markReady, { once: true });
  }

  document.getElementById("watch-title").textContent = state.detail?.title || "";
  paintHeader();
  attachProgress();
  setTimeout(() => {
    if (video.readyState >= 2 && !state.switching && state.started) overlay("clear");
  }, 5000);
}

function savePlaybackProgress(seconds, duration) {
  if (!getToken() || !state.detail) return;
  if (!(Number(duration) > 0)) return;
  const now = Date.now();
  if (now - state.saveTimer < 15000) return;
  state.saveTimer = now;
  const current = Math.max(0, Number(seconds) || 0);
  api
    .recordHistory({
      tmdbId: state.detail.tmdbId,
      mediaType: state.detail.mediaType,
      title: state.detail.title,
      poster: state.detail.poster,
      season: state.season,
      episode: state.episode,
      progress: Math.min(1, current / duration),
      seconds: Math.round(current),
    })
    .catch(() => {
      /* offline tolerant */
    });
}

function saveCastProgress() {
  if (!castActive() || !castCtx.player) return;
  savePlaybackProgress(castCtx.player.currentTime, castCtx.player.duration);
}

async function handleEnded() {
  if (state.detail?.mediaType !== "tv") return;
  const target = await nextTarget();
  if (!target) {
    toast(t("lastEpisode"));
    return;
  }
  state.nextTarget = target;
  showNextUp(target);
}

function attachProgress() {
  const video = document.getElementById("video");
  if (!video || video.dataset.bound === "1") return;
  video.dataset.bound = "1";
  video.addEventListener("timeupdate", () => {
    savePlaybackProgress(video.currentTime, video.duration || 0);
  });
  video.addEventListener("ended", handleEnded);
  video.addEventListener("error", () => {
    if (state.switching || !state.started) return;
    failover();
  });
}
