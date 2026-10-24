import { api, getToken, getLang } from "./api.js";
import { t, esc, ICONS, toast } from "./ui.js";

/* CDN checks Referer: every segment, playlist and subtitle rides the local proxy. */
function proxyUrl(target) {
  return `/stream?u=${encodeURIComponent(target)}`;
}

const SUB_SIZES = { small: "0.85", standard: "1", large: "1.22", xlarge: "1.45" };
const SUB_COLOR_KEY = "movy:subColor";
const SUB_SIZE_KEY = "movy:subSize";

function storedSubColor() {
  try {
    const value = localStorage.getItem(SUB_COLOR_KEY) || "";
    return /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  } catch {
    return "#ffffff";
  }
}

function storedSubSize() {
  try {
    const value = localStorage.getItem(SUB_SIZE_KEY);
    return SUB_SIZES[value] ? value : "standard";
  } catch {
    return "standard";
  }
}

const state = {
  detail: null,
  providers: [],
  current: null,
  sources: [],
  subtitles: [],
  quality: null,
  season: 1,
  episode: 1,
  hls: null,
  saveTimer: 0,
  keyHandler: null,
  ui: null,
  subLang: null,
  subKey: null,
  subUserPick: false,
  subApply: 0,
  subReq: 0,
  subColor: storedSubColor(),
  subSize: storedSubSize(),
};

function providerIcon(p) {
  return `<img src="/flags/${p.flag}.svg" alt="" onerror="this.style.display='none'" />`;
}

const SKIP = 10;
const REWIND_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9l5 4"/><path d="M6 9h8a5 5 0 0 1 0 10h-2"/></svg>`;
const FORWARD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 5 5 4-5 4"/><path d="M18 9h-8a5 5 0 0 0 0 10h2"/></svg>`;
const PLAY_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.87v14.26c0 .8.87 1.28 1.54.85l11.2-7.13a1 1 0 0 0 0-1.7L8.54 4.02C7.87 3.6 7 4.07 7 4.87Z"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
const CC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8.5 10.3a2 2 0 1 0 0 3.4M15.5 10.3a2 2 0 1 0 0 3.4"/></svg>`;
const GEAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></svg>`;
const FS_ENTER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
const FS_EXIT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M21 16h-3a2 2 0 0 0-2 2v3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`;

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
      <video id="video" playsinline crossorigin="anonymous"></video>
      <div class="sub-overlay" id="sub-overlay" aria-live="off"></div>
      <img class="pui-logo" src="/assets/logo.png" alt="Tontonix" />

      <button class="skip-btn skip-back" id="skip-back" aria-label="Rewind ${SKIP} seconds">${REWIND_ICON}<span>${SKIP}</span></button>
      <button class="skip-btn skip-fwd" id="skip-fwd" aria-label="Forward ${SKIP} seconds">${FORWARD_ICON}<span>${SKIP}</span></button>

      <div class="watch-overlay" id="overlay"><div class="spinner"></div><div class="watch-note">${t("loadingStream")}</div></div>

      <div class="player-ui" id="player-ui">
        <button class="pui-bigplay" id="pui-bigplay" aria-label="Play">${PLAY_ICON}</button>
        <div class="pui-bar">
          <input class="pui-seek" id="pui-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek" />
          <div class="pui-ctrls">
            <button class="pui-btn" id="pui-play" aria-label="Play/Pause">${PLAY_ICON}</button>
            <button class="pui-btn pui-skip" data-skip="-${SKIP}" aria-label="Rewind ${SKIP}s">${REWIND_ICON}<em>${SKIP}</em></button>
            <button class="pui-btn pui-skip" data-skip="${SKIP}" aria-label="Forward ${SKIP}s">${FORWARD_ICON}<em>${SKIP}</em></button>
            <span class="pui-time"><span id="pui-cur">0:00</span> / <span id="pui-dur">0:00</span></span>
            <span class="pui-spacer"></span>
            <button class="pui-btn" id="pui-cc" aria-label="Subtitles">${CC_ICON}</button>
            <button class="pui-btn" id="pui-gear" aria-label="Settings">${GEAR_ICON}</button>
            <button class="pui-btn" id="pui-fs" aria-label="Fullscreen">${FS_ENTER_ICON}</button>
          </div>
        </div>

        <div class="pui-menu" id="pui-settings" hidden>
          <div class="pui-menu-sec"><div class="pui-menu-h">${t("speed")}</div><div class="pui-menu-list" id="pui-speed-list"></div></div>
          <div class="pui-menu-sec"><div class="pui-menu-h">${t("qualityLabel")}</div><div class="pui-menu-list" id="pui-quality-list"></div></div>
        </div>

        <div class="pui-menu pui-menu-captions" id="pui-captions" hidden>
          <div class="pui-menu-sec">
            <div class="pui-menu-h" id="pui-caption-h">${t("subtitles")}</div>
            <input class="pui-sub-filter" id="pui-sub-filter" type="search" placeholder="${t("filterSubtitles")}" autocomplete="off" spellcheck="false" aria-label="${t("filterSubtitles")}" />
            <div class="pui-sub-style">
              <label class="pui-sub-color" for="pui-sub-color">
                <span>${t("textColor")}</span>
                <input id="pui-sub-color" type="color" value="#ffffff" aria-label="${t("textColor")}" />
              </label>
              <div class="pui-sub-sizes" id="pui-sub-sizes" role="group" aria-label="${t("size")}">
                <button type="button" data-size="small" aria-label="${t("small")}" title="${t("small")}">A</button>
                <button type="button" data-size="standard" class="active" aria-label="${t("standard")}" title="${t("standard")}">A</button>
                <button type="button" data-size="large" aria-label="${t("large")}" title="${t("large")}">A</button>
                <button type="button" data-size="xlarge" aria-label="${t("extraLarge")}" title="${t("extraLarge")}">A</button>
              </div>
            </div>
            <div class="pui-menu-list" id="pui-caption-list"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="watch-panel" id="watch-panel"></div>
  </div>`;
}

function skip(delta) {
  const video = document.getElementById("video");
  if (!video) return;
  const target = (video.currentTime || 0) + delta;
  video.currentTime = isFinite(video.duration) && video.duration > 0
    ? Math.min(video.duration, Math.max(0, target))
    : Math.max(0, target);
  const side = document.getElementById(delta < 0 ? "skip-back" : "skip-fwd");
  if (side) {
    side.classList.add("flash");
    setTimeout(() => side.classList.remove("flash"), 320);
  }
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
  const togglePlay = () => { video.paused ? video.play().catch(() => {}) : video.pause(); };

  document.getElementById("pui-play")?.addEventListener("click", togglePlay);
  document.getElementById("pui-bigplay")?.addEventListener("click", togglePlay);
  video.addEventListener("click", () => { if (lastPT !== "touch") togglePlay(); });
  video.addEventListener("play", () => { setPlayIcons(false); showControls(false); });
  video.addEventListener("pause", () => { setPlayIcons(true); showControls(true); });
  setPlayIcons(true);

  document.getElementById("skip-back")?.addEventListener("click", () => { skip(-SKIP); showControls(false); });
  document.getElementById("skip-fwd")?.addEventListener("click", () => { skip(SKIP); showControls(false); });
  ui.querySelectorAll(".pui-skip").forEach((b) => b.addEventListener("click", () => { skip(Number(b.dataset.skip)); showControls(false); }));

  const seek = document.getElementById("pui-seek");
  let seeking = false;
  const setSeekFill = (pct) => seek && seek.style.setProperty("--p", `${pct}%`);
  seek?.addEventListener("input", () => {
    seeking = true;
    const d = video.duration || 0;
    document.getElementById("pui-cur").textContent = fmtTime((seek.value / 1000) * d);
    setSeekFill(seek.value / 10);
  });
  seek?.addEventListener("change", () => {
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
  });
  const refreshDur = () => { const dur = document.getElementById("pui-dur"); if (dur) dur.textContent = fmtTime(video.duration); };
  video.addEventListener("loadedmetadata", refreshDur);
  video.addEventListener("durationchange", refreshDur);

  renderSpeedMenu(video);
  applySubStyle();
  bindSubStyle();
  const refreshCues = () => {
    for (const tt of video.textTracks) {
      if (tt.mode !== "disabled") {
        renderCues(tt);
        return;
      }
    }
  };
  video.addEventListener("timeupdate", refreshCues);
  video.addEventListener("seeked", refreshCues);
  document.getElementById("pui-sub-filter")?.addEventListener("input", (e) => renderCaptionList(video, e.target.value));

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
  document.addEventListener("fullscreenchange", () => {
    const fs = document.fullscreenElement === stage;
    stage.classList.toggle("fullscreen", fs);
    if (fsBtn) fsBtn.innerHTML = fs ? FS_EXIT_ICON : FS_ENTER_ICON;
    showControls(false);
  });

  stage.addEventListener("pointerdown", (e) => { lastPT = e.pointerType; });
  stage.addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") showControls(false); });
  stage.addEventListener("pointerleave", () => { if (!video.paused) hideControls(); });
  showControls(false);

  // touch: single tap toggles controls/playback, double tap skips 10s on that side
  let lastTap = 0;
  let tapTimer = 0;
  stage.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "touch") return;
    if (e.target.closest(".pui-bar") || e.target.closest(".pui-menu") || e.target.closest(".skip-btn") || e.target.closest(".watch-overlay")) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      clearTimeout(tapTimer);
      const r = stage.getBoundingClientRect();
      skip(e.clientX < r.left + r.width / 2 ? -SKIP : SKIP);
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
    if (e.key === "ArrowRight") { e.preventDefault(); skip(SKIP); showControls(false); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); skip(-SKIP); showControls(false); }
    else if (e.key === "k" || e.key === " ") { e.preventDefault(); togglePlay(); }
    else if (e.key === "f") { e.preventDefault(); fsBtn?.click(); }
    else if (e.key === "Escape") closeMenus();
  };
  document.addEventListener("keydown", state.keyHandler);

  state.ui = { showControls, refreshDur };
}

export async function watchPage(ctx, params) {
  const type = ctx.type === "tv" ? "tv" : "movie";
  const id = ctx.id;
  state.season = Number(params.get("season") || 1);
  state.episode = Number(params.get("episode") || 1);
  state.current = null;
  state.sources = [];

  document.getElementById("app").innerHTML = `<div class="watch-page"><div class="watch-top"><div class="watch-title">Loading…</div></div></div>`;

  try {
    state.detail = type === "tv" ? await api.tv(id) : await api.movie(id);
  } catch (err) {
    document.getElementById("app").innerHTML = `<div class="watch-page"><div class="watch-top"><button class="icon-btn" onclick="history.back()">${ICONS.chevronLeft}</button><div class="watch-title">Not found</div></div><div class="watch-panel"><p class="watch-error">${esc(err.message)}</p></div></div>`;
    return;
  }

  const { providers } = await api.providers();
  state.providers = providers;

  document.getElementById("app").innerHTML = stageMarkup();
  document.getElementById("watch-back").addEventListener("click", () => history.back());
  bindPlayerControls();
  paintHeader();
  await buildPanel();
  await resolveAuto();
}

function paintHeader() {
  const sub = document.getElementById("watch-sub");
  if (!sub || !state.detail) return;
  const d = state.detail;
  sub.textContent =
    d.mediaType === "tv"
      ? `${t("season")} ${state.season} · ${t("episode")} ${state.episode}${d.year ? ` · ${d.year}` : ""}`
      : `${d.year || ""}${d.duration ? ` · ${d.duration} ${t("minutes")}` : ""}`;
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
      holder.innerHTML = data.episodes
        .map(
          (e) => `<button class="ep-chip ${e.episode_number === state.episode ? "active" : ""}" data-ep="${e.episode_number}">
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
    state.season = Number(e.target.value);
    state.episode = 1;
    loadSeason(state.season);
    paintHeader();
    resolveAuto();
  });
  document.getElementById("w-prev").addEventListener("click", () => goEpisode(state.season, Math.max(1, state.episode - 1)));
  document.getElementById("w-next").addEventListener("click", () => goEpisode(state.season, state.episode + 1));

  await loadSeason(state.season);
}

function goEpisode(season, episode) {
  state.season = season;
  state.episode = episode;
  const url = `/watch/tv/${state.detail.tmdbId}?season=${season}&episode=${episode}`;
  history.replaceState({}, "", url);
  paintHeader();
  document.querySelectorAll(".ep-chip").forEach((c) => c.classList.toggle("active", Number(c.dataset.ep) === episode));
  resolveAuto();
}

function requestParams(providerId) {
  const d = state.detail;
  return {
    provider: providerId,
    tmdbId: d.tmdbId,
    mediaType: d.mediaType,
    title: d.title || "",
    titleOriginal: d.titleOriginal || "",
    year: d.year || "",
    imdbId: d.imdbId || "",
    season: state.season,
    episode: state.episode,
    totalSeasons: d.seasons?.length || d.episodeInfo?.seasons || 1,
  };
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
  document.getElementById("ov-retry")?.addEventListener("click", () => resolveAuto());
}

async function resolveAuto() {
  state.subReq++;
  state.subKey = null;
  state.subLang = null;
  state.subUserPick = false;
  overlay("loading");
  for (const p of state.providers) {
    state.current = p.id;
    try {
      const data = await api.sources(requestParams(p.id));
      const sources = (data.sources || []).filter((s) => s && s.url);
      if (!sources.length) continue;
      state.sources = sources;
      state.subtitles = (data.subtitles || []).filter((s) => s && (s.url || s.src));
      paintQualities();
      playSource(sources[0].url, sources[0].quality);
      loadExternalSubs();
      return;
    } catch { /* server down — slide to the next one silently */ }
  }
  state.sources = [];
  state.subtitles = [];
  paintQualities();
  overlay("error", t("streamError"));
}

function paintQualities() {
  const list = document.getElementById("pui-quality-list");
  if (!list) return;
  if (!state.sources.length) {
    list.innerHTML = `<button class="pui-opt" disabled>—</button>`;
    return;
  }
  list.innerHTML = state.sources
    .map((s, i) => `<button class="pui-opt ${i === 0 ? "active" : ""}" data-q="${i}">${esc(String(s.quality || "auto").toUpperCase())}</button>`)
    .join("");
  list.querySelectorAll("[data-q]").forEach((btn) =>
    btn.addEventListener("click", () => {
      list.querySelectorAll(".pui-opt").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const pick = state.sources[Number(btn.dataset.q)];
      if (pick) playSource(pick.url, pick.quality, true);
    }),
  );
}

function destroyHls() {
  if (state.hls) {
    try {
      state.hls.destroy();
    } catch { /* already gone */ }
    state.hls = null;
  }
}

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
  if (track.origin) parts.push(String(track.origin));
  if (track.release) parts.push(String(track.release).slice(0, 46));
  if (track.format) parts.push(String(track.format).toUpperCase());
  if (track.downloads) parts.push(track.downloads >= 1000 ? `${Math.round(track.downloads / 1000)}k` : String(track.downloads));
  if (track.trusted) parts.push("trusted");
  return parts.join(" · ");
}

function selectedIndex() {
  if (state.subKey === "off") return -1;
  if (state.subKey) {
    const exact = state.subtitles.findIndex((tr) => trackKey(tr) === state.subKey);
    if (exact >= 0) return exact;
  }
  if (state.subLang && state.subLang !== "off") {
    const byLang = state.subtitles.findIndex((tr) => subCode(tr) === state.subLang);
    if (byLang >= 0) return byLang;
  }
  return -1;
}

function hexLum(hex) {
  const value = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return 1;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function applySubStyle() {
  const color = /^#[0-9a-f]{6}$/i.test(state.subColor) ? state.subColor : "#ffffff";
  const scale = SUB_SIZES[state.subSize] || "1";
  const shadow =
    hexLum(color) > 0.62
      ? "0 1px 2px rgba(0, 0, 0, 0.95), 0 0 8px rgba(0, 0, 0, 0.75)"
      : "0 1px 2px rgba(255, 255, 255, 0.35), 0 0 10px rgba(0, 0, 0, 0.9)";

  for (const node of [document.getElementById("stage"), document.getElementById("video"), document.getElementById("sub-overlay")]) {
    if (!node) continue;
    node.style.setProperty("--sub-color", color);
    node.style.setProperty("--sub-scale", scale);
    node.style.setProperty("--sub-shadow", shadow);
  }
}

function bindSubStyle() {
  const color = document.getElementById("pui-sub-color");
  if (color) {
    color.value = state.subColor;
    color.addEventListener("input", () => {
      state.subColor = color.value;
      try { localStorage.setItem(SUB_COLOR_KEY, state.subColor); } catch { /* storage blocked */ }
      applySubStyle();
    });
  }

  const sizes = document.getElementById("pui-sub-sizes");
  if (!sizes) return;
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
      try { localStorage.setItem(SUB_SIZE_KEY, state.subSize); } catch { /* storage blocked */ }
      applySubStyle();
      sync();
    });
  });
}

function clearCues() {
  const box = document.getElementById("sub-overlay");
  if (!box) return;
  box.textContent = "";
  box.dataset.sig = "";
}

function renderCues(track) {
  const box = document.getElementById("sub-overlay");
  if (!box) return;
  const cues = track && track.mode !== "disabled" ? track.activeCues : null;
  if (!cues || !cues.length) {
    if (box.dataset.sig !== "") clearCues();
    return;
  }

  const sig = Array.from({ length: cues.length }, (_, i) => cues[i]?.text || "").join("\u0001");
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.textContent = "";

  const frag = document.createDocumentFragment();
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const line = document.createElement("div");
    line.className = "sub-line";
    if (typeof cue.getCueAsHTML === "function") line.appendChild(cue.getCueAsHTML());
    else line.textContent = cue.text || "";
    frag.appendChild(line);
  }
  box.appendChild(frag);
}

/* One <track> only. Native cue rendering stays off; the overlay owns the paint. */
function applySubtitle(video) {
  const token = ++state.subApply;
  video.querySelectorAll("track").forEach((el) => el.remove());
  clearCues();
  const idx = selectedIndex();
  if (idx < 0) return;
  const track = state.subtitles[idx];
  const src = subProxyUrl(track);
  if (!src) return;

  const el = document.createElement("track");
  el.kind = "subtitles";
  el.label = subLabel(track, idx);
  el.srclang = (subCode(track) || "en").slice(0, 3);
  el.src = src;
  el.default = true;
  video.appendChild(el);

  let bound = false;
  const show = () => {
    if (token !== state.subApply || !el.isConnected) return;
    const tt = el.track;
    if (!tt) return;
    for (const other of video.textTracks) if (other !== tt) other.mode = "disabled";
    tt.mode = "hidden";
    if (!bound) {
      bound = true;
      tt.addEventListener("cuechange", () => {
        if (token === state.subApply) renderCues(tt);
      });
    }
    renderCues(tt);
  };
  el.addEventListener("load", show);
  requestAnimationFrame(show);
  setTimeout(show, 350);
}

function autoPickIndex() {
  if (!state.subtitles.length) return -1;
  const prefs = [];
  const ui = String(getLang() || "").toLowerCase();
  if (ui) prefs.push(ui);
  if (state.subLang && state.subLang !== "off") prefs.push(state.subLang);
  prefs.push("en", "eng", "id", "ind");
  for (const pref of prefs) {
    const idx = state.subtitles.findIndex((tr) => {
      const code = subCode(tr);
      return code === pref || (pref.length > 2 && code.startsWith(pref));
    });
    if (idx >= 0) return idx;
  }
  return 0;
}

/* Preferred language first, then English, then the rest in server order. */
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

function renderSubtitles(video) {
  if (state.subKey == null) {
    const idx = autoPickIndex();
    if (idx >= 0) {
      state.subKey = trackKey(state.subtitles[idx]);
      state.subLang = subCode(state.subtitles[idx]);
    }
  }
  populateCaptionMenu(video);
  applySubtitle(video);
}

function populateCaptionMenu(video) {
  const header = document.getElementById("pui-caption-h");
  if (header) header.textContent = state.subtitles.length ? `${t("subtitles")} · ${state.subtitles.length}` : t("subtitles");
  const filter = document.getElementById("pui-sub-filter");
  renderCaptionList(video, filter ? filter.value : "");
}

function renderCaptionList(video, query = "") {
  const list = document.getElementById("pui-caption-list");
  if (!list) return;
  const q = String(query || "").trim().toLowerCase();
  const rows = [`<button class="pui-opt ${state.subKey === "off" ? "active" : ""}" data-cc="-1">${esc(t("off"))}</button>`];
  let shown = 0;

  state.subtitles.forEach((track, i) => {
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
    btn.addEventListener("click", () => chooseSubtitle(video, Number(btn.dataset.cc)));
  });
}

function chooseSubtitle(video, idx) {
  const track = idx >= 0 ? state.subtitles[idx] : null;
  state.subUserPick = true;
  state.subKey = track ? trackKey(track) : "off";
  state.subLang = track ? subCode(track) : "off";
  applySubtitle(video);
  const filter = document.getElementById("pui-sub-filter");
  renderCaptionList(video, filter ? filter.value : "");
}

async function loadExternalSubs() {
  const video = document.getElementById("video");
  if (!video || !state.detail) return;
  const reqId = ++state.subReq;
  const d = state.detail;
  const params = { tmdbId: d.tmdbId, mediaType: d.mediaType, imdbId: d.imdbId || "" };
  if (d.mediaType === "tv") { params.season = state.season; params.episode = state.episode; }
  let list = [];
  try {
    const res = await api.subtitles(params);
    list = (res.subtitles || []).filter((s) => s && s.url);
  } catch { return; }
  if (reqId !== state.subReq || !list.length) return;

  const seen = new Set();
  const merged = [];
  for (const track of [...list, ...state.subtitles]) {
    const key = trackKey(track);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(track);
  }
  if (merged.length === state.subtitles.length) return;
  state.subtitles = orderSubtitles(merged);
  if (!state.subUserPick) {
    state.subKey = null;
    state.subLang = null;
  }
  renderSubtitles(video);
}

function playSource(url, quality, resume = false) {
  const video = document.getElementById("video");
  if (!video) return;
  const wasTime = !resume ? video.currentTime || 0 : video.currentTime || 0;
  destroyHls();
  video.removeAttribute("src");
  video.innerHTML = "";
  renderSubtitles(video);

  const isHls = /\.m3u8(\?|$)/i.test(url);
  const proxied = proxyUrl(url);
  if (isHls && window.Hls && window.Hls.isSupported()) {
    const hls = new window.Hls({ maxBufferLength: 30, enableWorker: true });
    state.hls = hls;
    hls.loadSource(proxied);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      overlay("clear");
      if (wasTime > 1) video.currentTime = wasTime;
      video.play().catch(() => { /* autoplay blocked */ });
    });
    hls.on(window.Hls.Events.ERROR, (_evt, data) => {
      if (!data.fatal) return;
      overlay("error", `Playback error: ${data.details || data.type}`);
    });
  } else if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = proxied;
    video.addEventListener("loadedmetadata", () => overlay("clear"), { once: true });
    video.play().catch(() => { /* autoplay blocked */ });
  } else {
    video.src = proxied;
    video.addEventListener("loadeddata", () => overlay("clear"), { once: true });
    video.play().catch(() => { /* autoplay blocked */ });
  }

  overlay("loading", `Quality ${quality || "auto"}`);
  setTimeout(() => {
    if (video.readyState >= 2) overlay("clear");
  }, 4000);

  document.getElementById("watch-title").textContent = state.detail?.title || "";
  paintHeader();
  attachProgress();
}

function attachProgress() {
  const video = document.getElementById("video");
  if (!video || video.dataset.bound === "1") return;
  video.dataset.bound = "1";
  video.addEventListener("timeupdate", () => {
    if (!getToken() || !state.detail) return;
    const now = Date.now();
    if (now - state.saveTimer < 15000) return;
    state.saveTimer = now;
    const duration = video.duration || 0;
    if (!duration) return;
    api
      .recordHistory({
        tmdbId: state.detail.tmdbId,
        mediaType: state.detail.mediaType,
        title: state.detail.title,
        poster: state.detail.poster,
        season: state.season,
        episode: state.episode,
        progress: video.currentTime / duration,
        seconds: Math.round(video.currentTime),
      })
      .catch(() => { /* offline tolerant */ });
  });
  video.addEventListener("ended", () => {
    if (state.detail?.mediaType === "tv") goEpisode(state.season, state.episode + 1);
  });
  video.addEventListener("error", () => {
    if (video.src) overlay("error", "Stream rejected by the browser. Try another server.");
  });
}
