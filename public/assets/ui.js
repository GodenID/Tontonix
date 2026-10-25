const STRINGS = {
  en: {
    home: "Home", movies: "Movies", shows: "Shows", anime: "Anime", search: "Search",
    watchlist: "Watchlist", history: "History", login: "Sign in", signup: "Sign up", logout: "Sign out",
    play: "Play", moreInfo: "More info", trailer: "Trailer", addList: "Add to list", inList: "In list",
    top10: "Top 10 on Tontonix", trending: "Trending This Week", genres: "Popular Genres",
    all: "All", filters: "Filters", genre: "Genre", year: "Year", sort: "Sort by", quality: "4K only",
    popularity: "Popularity", rating: "Rating", newest: "Newest", titleAZ: "Title A-Z",
    seeAll: "See all", loadMore: "Load more", noResults: "No results found", nothingHere: "Nothing here yet",
    overview: "Overview", cast: "Cast", details: "Details", recommendations: "You may also like", similar: "Similar titles",
    seasons: "Seasons", episodes: "Episodes", season: "Season", episode: "Episode",
    director: "Director", writer: "Writer", creator: "Creator", status: "Status", released: "Released",
    runtime: "Runtime", minutes: "min", votes: "votes", servers: "Servers", qualityLabel: "Quality",
    speed: "Speed", subtitles: "Subtitles", off: "Off", normal: "Normal",
    filterSubtitles: "Search subtitles...", noSubtitles: "No subtitles found",
    textColor: "Text color", size: "Size", small: "Small", standard: "Standard", large: "Large", extraLarge: "Extra large",
    selectServer: "Select a server", loadingStream: "Finding a stream...", streamError: "No stream found on this server. Try another one.",
    nextEpisode: "Next episode", prevEpisode: "Previous episode", continueWatching: "Continue watching",
    resume: "Resume", fromStart: "From start", watchParty: "Watch party", legal: "Legal",
    dmca: "DMCA", terms: "Terms", privacy: "Privacy", disclaimer: "Tontonix does not host, upload, or store any files. Titles are indexed from public sources and third-party services. The media stays on those platforms.",
    emptyWatchlist: "Your watchlist is empty. Add titles with the + button.",
    emptyHistory: "No watch history yet. Play something.",
    memberSince: "Member since", email: "Email", password: "Password", name: "Name",
    authTitle: "Sign in to Tontonix", authSub: "Keep your watchlist and history in sync.",
    authSignupTitle: "Create your account", authSignupSub: "Free, no card needed.",
    needAccount: "New to Tontonix?", haveAccount: "Already have an account?",
    invalidCreds: "Wrong email or password.", genericError: "Something went wrong. Try again.",
    watchNow: "Watch now", up: "Up", down: "Down",
    server: "Server", switchingServer: "Server failed. Switching to another one...",
    serverFailed: "Server failed", nextIn: "Next episode in", playNow: "Play now", cancel: "Cancel",
    startOver: "Start over", resumedAt: "Resumed at", lastEpisode: "No next episode available",
    subtitleDelay: "Subtitle delay", subtitleStyle: "Subtitle style", background: "Background", outline: "Outline",
    font: "Font", opacity: "Opacity", uploadSubtitle: "Upload subtitle", downloadSubtitle: "Download VTT",
    subtitleAdded: "Subtitle loaded", subtitleFailed: "Subtitle unavailable", noSubtitleLoaded: "No subtitle selected",
    bgNone: "None", bgSoft: "Soft", bgSolid: "Solid", outlineNone: "None", outlineThin: "Thin", outlineThick: "Thick",
    fontDefault: "Default", fontSans: "Sans", fontSerif: "Serif", fontMono: "Mono",
    volume: "Volume", mute: "Mute", unmute: "Unmute", pip: "Picture in picture", cast: "Cast",
    customSubtitle: "Custom", secondsShort: "s",
  },
  id: {
    home: "Beranda", movies: "Film", shows: "Serial", anime: "Anime", search: "Cari",
    watchlist: "Daftar tonton", history: "Riwayat", login: "Masuk", signup: "Daftar", logout: "Keluar",
    play: "Putar", moreInfo: "Info lengkap", trailer: "Trailer", addList: "Tambah ke daftar", inList: "Ada di daftar",
    top10: "Top 10 di Tontonix", trending: "Populer minggu ini", genres: "Genre populer",
    all: "Semua", filters: "Filter", genre: "Genre", year: "Tahun", sort: "Urutkan", quality: "Hanya 4K",
    popularity: "Popularitas", rating: "Rating", newest: "Terbaru", titleAZ: "Judul A-Z",
    seeAll: "Lihat semua", loadMore: "Muat lagi", noResults: "Tidak ada hasil", nothingHere: "Belum ada apa-apa",
    overview: "Sinopsis", cast: "Pemain", details: "Detail", recommendations: "Rekomendasi untukmu", similar: "Mirip",
    seasons: "Musim", episodes: "Episode", season: "Musim", episode: "Episode",
    director: "Sutradara", writer: "Penulis", creator: "Pembuat", status: "Status", released: "Rilis",
    runtime: "Durasi", minutes: "menit", votes: "suara", servers: "Server", qualityLabel: "Kualitas",
    speed: "Kecepatan", subtitles: "Subtitle", off: "Mati", normal: "Normal",
    filterSubtitles: "Cari subtitle...", noSubtitles: "Subtitle tidak ditemukan",
    textColor: "Warna teks", size: "Ukuran", small: "Kecil", standard: "Standar", large: "Besar", extraLarge: "Sangat besar",
    selectServer: "Pilih server", loadingStream: "Mencari stream...", streamError: "Tidak ada stream di server ini. Coba server lain.",
    nextEpisode: "Episode berikutnya", prevEpisode: "Episode sebelumnya", continueWatching: "Lanjut tonton",
    resume: "Lanjutkan", fromStart: "Dari awal", watchParty: "Nonton bareng", legal: "Legal",
    dmca: "DMCA", terms: "Ketentuan", privacy: "Privasi", disclaimer: "Tontonix tidak menghosting, mengunggah, atau menyimpan berkas apa pun. Judul diindeks dari sumber publik dan layanan pihak ketiga. Media tetap berada di platform tersebut.",
    emptyWatchlist: "Daftar tonton kosong. Tambah judul lewat tombol +.",
    emptyHistory: "Belum ada riwayat tonton. Putar sesuatu.",
    memberSince: "Anggota sejak", email: "Email", password: "Kata sandi", name: "Nama",
    authTitle: "Masuk ke Tontonix", authSub: "Sinkronkan daftar tonton dan riwayatmu.",
    authSignupTitle: "Buat akun", authSignupSub: "Gratis, tanpa kartu.",
    needAccount: "Baru di Tontonix?", haveAccount: "Sudah punya akun?",
    invalidCreds: "Email atau kata sandi salah.", genericError: "Ada masalah. Coba lagi.",
    watchNow: "Tonton sekarang", up: "Suka", down: "Kurang",
    server: "Server", switchingServer: "Server gagal. Pindah ke server lain...",
    serverFailed: "Server gagal", nextIn: "Episode berikutnya dalam", playNow: "Putar sekarang", cancel: "Batal",
    startOver: "Dari awal", resumedAt: "Dilanjutkan dari", lastEpisode: "Tidak ada episode berikutnya",
    subtitleDelay: "Jeda subtitle", subtitleStyle: "Gaya subtitle", background: "Latar", outline: "Garis tepi",
    font: "Font", opacity: "Opasitas", uploadSubtitle: "Unggah subtitle", downloadSubtitle: "Unduh VTT",
    subtitleAdded: "Subtitle dimuat", subtitleFailed: "Subtitle tidak tersedia", noSubtitleLoaded: "Belum ada subtitle dipilih",
    bgNone: "Tanpa", bgSoft: "Lembut", bgSolid: "Padat", outlineNone: "Tanpa", outlineThin: "Tipis", outlineThick: "Tebal",
    fontDefault: "Bawaan", fontSans: "Sans", fontSerif: "Serif", fontMono: "Mono",
    volume: "Volume", mute: "Bisukan", unmute: "Nyalakan suara", pip: "Mode gambar dalam gambar", cast: "Cast",
    customSubtitle: "Kustom", secondsShort: "d",
  },
};

let lang = localStorage.getItem("movy:lang") || "en";

export function t(key) {
  return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
}
export function setLangLocal(next) {
  lang = next;
  localStorage.setItem("movy:lang", next);
}
export function currentLang() {
  return lang;
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export const ICONS = {
  logo: `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><clipPath id="lg"><path d="M0 0h100v100Q50 91.5 0 100Z"/></clipPath>
    <linearGradient id="lgl" x1="11" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#eb0d18"/><stop offset="1" stop-color="#d50914"/></linearGradient>
    <linearGradient id="lgr" x1="89" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b1060f"/><stop offset=".6" stop-color="#8e050d"/><stop offset="1" stop-color="#650307"/></linearGradient></defs>
    <g clip-path="url(#lg)"><path fill="#b1060f" d="M0 0h22v100H0z"/><path fill="#e50914" d="M78 0h22v100H78z"/><path fill="url(#lgr)" d="M78 0h22L61 100H39z"/><path fill="url(#lgl)" d="M0 0h22l39 100H39z"/></g></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.87v14.26c0 .8.87 1.28 1.54.85l11.2-7.13a1 1 0 0 0 0-1.7L8.54 4.02C7.87 3.6 7 4.07 7 4.87Z"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 12 5 5L20 6"/></svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m15 5-7 7 7 7"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m9 5 7 7-7 7"/></svg>`,
  thumbUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 10v11H4V10zM7 10l4-7a2 2 0 0 1 2 2v3h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 21H7"/></svg>`,
  thumbDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><g transform="translate(24 24) rotate(180)"><path d="M7 10v11H4V10zM7 10l4-7a2 2 0 0 1 2 2v3h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 21H7"/></g></svg>`,
  bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.5.87l-4.5-2.6a2 2 0 0 0-2 0l-4.5 2.6A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
};

/* ------------------------------- atom pieces ----------------------------- */

export function badges(item) {
  const flags = [];
  if (item.uhd) flags.push('<span class="badge uhd">4K</span>');
  return flags.join("");
}

export function metaLine(item, { showType = true } = {}) {
  const bits = [];
  if (item.rating) bits.push(`<span class="score">${Number(item.rating).toFixed(1)}</span>`);
  if (item.release_date) bits.push(`<span>${esc(String(item.release_date).slice(0, 4))}</span>`);
  if (showType && item.mediaType) bits.push(`<span>${item.mediaType === "tv" ? "Show" : "Movie"}</span>`);
  return bits.join('<span class="sep"></span>');
}

export function card(item, { hoverName = true, progress = 0, href = "" } = {}) {
  const title = esc(item.title);
  const link = href || `/${item.mediaType === "tv" ? "tv" : "movie"}/${item.id}`;
  const pct = Math.min(100, Math.max(0, Number(progress) * 100 || 0));
  const bar = pct > 0 ? `<span class="card-progress"><span style="width:${pct.toFixed(1)}%"></span></span>` : "";
  return `<a class="card" href="${esc(link)}" aria-label="${title}">
    <div class="card-media">
      ${item.poster ? `<img loading="lazy" src="${item.poster}" alt="${title} poster" />` : `<div class="skeleton" style="height:100%"></div>`}
      ${item.uhd ? `<span class="card-badge badge uhd">4K</span>` : ""}
      ${bar}
      ${hoverName ? `<div class="card-hover"><div class="card-name">${title}</div><div class="card-meta">${metaLine(item)}</div></div>` : ""}
    </div>
  </a>`;
}

export function cardWithInfo(item, opts = {}) {
  return `<div class="card-block">${card(item, { ...opts, hoverName: false })}
    <div class="card-info"><div class="name">${esc(item.title)}</div><div class="meta">${metaLine(item)}</div></div>
  </div>`;
}

export function topCard(item, index) {
  return `<div class="top-card"><div class="top-number">${index + 1}</div>${card(item, { hoverName: true })}</div>`;
}

export function row(title, items, { top10 = false, href = null, id = "" } = {}) {
  if (!items || !items.length) return "";
  const cells = top10
    ? items.slice(0, 10).map((item, i) => topCard(item, i)).join("")
    : items
        .map((item) => card(item, { href: item.href || "", progress: item.progress || 0 }))
        .join("");
  return `<section class="row" ${id ? `data-row="${id}"` : ""}>
    <div class="row-head">
      <h2 class="row-title">${href ? `<a href="${href}">${esc(title)}</a>` : esc(title)}</h2>
      ${href ? `<a class="row-see-all" href="${href}">${t("seeAll")}</a>` : ""}
    </div>
    <div class="row-wrap">
      <button class="row-arrow prev" data-scroll="-1" aria-label="Previous">${ICONS.chevronLeft}</button>
      <div class="row-scroller ${top10 ? "top10" : ""}">${cells}</div>
      <button class="row-arrow next" data-scroll="1" aria-label="Next">${ICONS.chevronRight}</button>
    </div>
  </section>`;
}

export function skeletonRow() {
  return `<section class="row"><div class="row-head"><div class="skeleton" style="width:220px;height:22px"></div></div>
    <div class="row-skeleton">${'<div class="skeleton"></div>'.repeat(7)}</div></section>`;
}

/* --------------------------------- layout -------------------------------- */

export function header(active = "") {
  const link = (href, key, match) =>
    `<a class="nav-link ${active === match ? "active" : ""}" href="${href}">${t(key)}</a>`;
  const drawerLink = (href, key, match, icon = "") =>
    `<a class="drawer-link ${active === match ? "active" : ""}" href="${href}">${icon}<span>${t(key)}</span></a>`;
  return `<header class="site-header" id="site-header">
    <div class="container">
      <a class="brand" href="/" aria-label="Tontonix home"><img class="brand-logo" src="/assets/logo.png" alt="Tontonix" /></a>

      <nav class="nav-links" aria-label="Main navigation">
        ${link("/", "home", "home")}
        ${link("/browse/movie", "movies", "movie")}
        ${link("/browse/tv", "shows", "tv")}
        ${link("/browse/anime", "anime", "anime")}
      </nav>

      <div class="search-box" id="search-box">
        <input id="search-input" type="search" placeholder="${t("search")}..." autocomplete="off" aria-label="${t("search")}" />
        <button class="search-submit" id="search-submit" type="button" aria-label="${t("search")}">${ICONS.search}</button>
        <div id="search-results" hidden></div>
      </div>

      <div class="header-right">
        <button class="icon-btn search-toggle" id="search-toggle" aria-label="${t("search")}" aria-expanded="false">${ICONS.search}</button>
        <select class="lang-select" id="lang-select" aria-label="Language">
          <option value="en"${currentLang() === "en" ? " selected" : ""}>EN</option>
          <option value="id"${currentLang() === "id" ? " selected" : ""}>ID</option>
        </select>
        <a class="icon-btn hide-mobile" href="/watchlist" title="${t("watchlist")}">${ICONS.bookmark}</a>
        <a class="icon-btn hide-mobile" href="/history" title="${t("history")}">${ICONS.clock}</a>
        <a class="icon-btn" href="/login" id="account-btn" title="${t("login")}">${ICONS.user}</a>
        <button class="icon-btn menu-btn" id="mobile-menu" aria-label="Menu" aria-expanded="false">${ICONS.menu}</button>
      </div>
    </div>
  </header>

  <div class="mobile-drawer" id="mobile-drawer" hidden>
    <div class="drawer-scrim" data-drawer-close></div>
      <aside class="drawer-panel" role="dialog" aria-modal="true" aria-label="Menu">
        <div class="drawer-head">
          <a class="brand" href="/" data-drawer-close aria-label="Tontonix home"><img class="drawer-logo" src="/assets/logo.png" alt="Tontonix" /></a>
          <button class="icon-btn" id="drawer-close" data-drawer-close aria-label="Close">${ICONS.close}</button>
        </div>
        <nav class="drawer-nav" aria-label="Browse">
          ${drawerLink("/", "home", "home")}
          ${drawerLink("/browse/movie", "movies", "movie")}
          ${drawerLink("/browse/tv", "shows", "tv")}
          ${drawerLink("/browse/anime", "anime", "anime")}
        </nav>
        <div class="drawer-divider"></div>
        <nav class="drawer-nav" aria-label="Account">
          ${drawerLink("/watchlist", "watchlist", "watchlist", ICONS.bookmark)}
          ${drawerLink("/history", "history", "history", ICONS.clock)}
          ${drawerLink("/login", "login", "login", ICONS.user)}
        </nav>
      </aside>
    </div>
  </div>`;
}

export function footer() {
  return `<footer class="site-footer"><div class="container">
    <div class="footer-links">
      <a href="/help">Help</a><a href="/legal/terms">${t("terms")}</a><a href="/legal/privacy">${t("privacy")}</a>
      <a href="/legal/dmca">${t("dmca")}</a><a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">TMDB</a>
    </div>
    <p class="footer-note">${t("disclaimer")} © ${new Date().getFullYear()} Tontonix · v1.0.0</p>
    <p class="footer-credit">Created by <span>Goden</span></p>
  </div></footer>`;
}

/* --------------------------------- helpers ------------------------------- */

export function toast(message) {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  root.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

export function debounce(fn, ms = 260) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function initHeaderChrome() {
  const header = document.getElementById("site-header");
  if (!header) return;
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 12);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  document.getElementById("lang-select")?.addEventListener("change", (e) => {
    setLangLocal(e.target.value);
    window.location.reload();
  });

  /* ---- mobile drawer ---- */
  const drawer = document.getElementById("mobile-drawer");
  const openDrawer = () => {
    if (!drawer) return;
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add("open"));
    document.body.classList.add("locked");
    document.getElementById("mobile-menu")?.setAttribute("aria-expanded", "true");
  };
  const closeDrawer = () => {
    if (!drawer) return;
    drawer.classList.remove("open");
    document.body.classList.remove("locked");
    document.getElementById("mobile-menu")?.setAttribute("aria-expanded", "false");
    setTimeout(() => { drawer.hidden = true; }, 280);
  };
  document.getElementById("mobile-menu")?.addEventListener("click", openDrawer);
  drawer?.addEventListener("click", (e) => {
    if (e.target.closest("[data-drawer-close]") || e.target.closest(".drawer-link")) closeDrawer();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer && !drawer.hidden) closeDrawer();
  });

  /* ---- mobile search toggle ---- */
  document.getElementById("search-toggle")?.addEventListener("click", () => {
    const h = document.getElementById("site-header");
    const open = h.classList.toggle("search-open");
    document.getElementById("search-toggle")?.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) setTimeout(() => document.getElementById("search-input")?.focus(), 30);
  });

  document.addEventListener("click", (e) => {
    const arrow = e.target.closest("[data-scroll]");
    if (arrow) {
      const wrap = arrow.closest(".row-wrap");
      const scroller = wrap?.querySelector(".row-scroller");
      if (scroller) scroller.scrollBy({ left: Number(arrow.dataset.scroll) * scroller.clientWidth * 0.86, behavior: "smooth" });
    }
  });

  const input = document.getElementById("search-input");
  const results = document.getElementById("search-results");
  if (!input || !results) return;

  if (location.pathname.startsWith("/search")) {
    const q = new URLSearchParams(location.search).get("q");
    if (q) input.value = q;
  }

  // Search only runs on Enter or the search button — never while typing.
  const submit = () => {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    results.hidden = true;
    results.innerHTML = "";
    header.classList.remove("search-open");
    window.__navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  document.getElementById("search-submit")?.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    if (e.key === "Escape") { header.classList.remove("search-open"); input.blur(); }
  });
}

export function renderShell({ active, body, withFooter = true }) {
  const app = document.getElementById("app");
  app.innerHTML = `${header(active)}<main id="main">${body}</main>${withFooter ? footer() : ""}`;
  initHeaderChrome();
}
