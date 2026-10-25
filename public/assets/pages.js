import { api, getToken } from "./api.js";
import {
  t, esc, ICONS, card, cardWithInfo, row, skeletonRow, renderShell, toast, metaLine,
} from "./ui.js";

/* -------------------------------- shared -------------------------------- */

export function watchHref(detail, season, episode) {
  const base = detail.mediaType === "tv" ? `/watch/tv/${detail.tmdbId}` : `/watch/movie/${detail.tmdbId}`;
  const params = new URLSearchParams();
  if (detail.mediaType === "tv") {
    params.set("season", String(season || 1));
    params.set("episode", String(episode || 1));
  }
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

async function accountButton() {
  if (!getToken()) return;
  try {
    const { user } = await api.me();
    const btn = document.getElementById("account-btn");
    if (user && btn) {
      btn.innerHTML = `<span class="avatar-btn">${esc((user.name || user.email || "?").slice(0, 2).toUpperCase())}</span>`;
      btn.href = "/account";
      btn.title = user.name || user.email;
    }
  } catch {
    /* anonymous */
  }
}

const YEARS = Array.from({ length: 26 }, (_, i) => new Date().getFullYear() + 1 - i);

function genreOptions(type, selected) {
  return apiGenres(type)
    .filter((g) => (type === "movie" ? ["movie", "both"].includes(g.type || "movie") : true))
    .map((g) => `<option value="${g.slug}" ${selected === g.slug ? "selected" : ""}>${esc(g.name)}</option>`)
    .join("");
}

let GENRE_CACHE = null;
function apiGenres() {
  if (GENRE_CACHE) return GENRE_CACHE;
  const base = [
    ["Action", "action"], ["Adventure", "adventure"], ["Animation", "animation"], ["Comedy", "comedy"],
    ["Crime", "crime"], ["Documentary", "documentary"], ["Drama", "drama"], ["Family", "family"],
    ["Fantasy", "fantasy"], ["History", "history"], ["Horror", "horror"], ["Music", "music"],
    ["Mystery", "mystery"], ["Romance", "romance"], ["Science Fiction", "scifi"], ["TV Movie", "tv-movie"],
    ["Thriller", "thriller"], ["War", "war"], ["Western", "western"], ["Action & Adventure", "action-adventure"],
    ["Sci-Fi & Fantasy", "scifi-fantasy"], ["Reality", "reality"], ["Kids", "kids"], ["News", "news"],
    ["Talk", "talk"], ["War & Politics", "war-politics"], ["Soap", "soap"],
  ];
  GENRE_CACHE = base.map(([name, slug]) => ({ name, slug, type: "movie" }));
  return GENRE_CACHE;
}

/* --------------------------------- home --------------------------------- */

async function heroMarkup(item, rankLabel) {
  return `<section class="hero">
    <div class="hero-backdrop" style="background-image:url('${item.image || item.poster || ""}')"></div>
    <div class="hero-shade"></div>
    <div class="container hero-inner">
      <div class="hero-copy">
        ${rankLabel ? `<div class="hero-rank"><span class="dot"></span>${esc(rankLabel)}</div>` : ""}
        ${item.logo ? `<img class="hero-logo" src="${item.logo}" alt="${esc(item.title)}" />` : `<h1 class="hero-title">${esc(item.title)}</h1>`}
        <div class="meta-row">
          <span class="score">${Number(item.rating || 0).toFixed(1)}</span>
          <span>${esc(String(item.release_date || "").slice(0, 4))}</span>
          <span>${item.mediaType === "tv" ? "Show" : "Movie"}</span>
          ${item.categories?.length ? `<span>${esc(item.categories.slice(0, 2).join(" · "))}</span>` : item.genre_ids ? `<span>${esc(String(item.genre_ids).split(" ").slice(0, 2).map((g) => genreName(g)).join(" · "))}</span>` : ""}
          ${item.certification ? `<span class="badge">${esc(item.certification)}</span>` : ""}
          ${item.uhd ? '<span class="badge uhd">4K</span>' : ""}
        </div>
        <p class="hero-desc">${esc(item.desc || "")}</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="/${item.mediaType === "tv" ? "tv" : "movie"}/${item.id}?play=true">${ICONS.play}${t("play")}</a>
          <a class="btn btn-secondary" href="/${item.mediaType === "tv" ? "tv" : "movie"}/${item.id}">${ICONS.info}${t("moreInfo")}</a>
        </div>
      </div>
      ${item.poster ? `<div class="hero-poster"><img src="${item.poster}" alt="${esc(item.title)} poster" /></div>` : ""}
    </div>
  </section>`;
}

const GENRE_NAMES = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary",
  18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Science Fiction", 10770: "TV Movie", 53: "Thriller",
  10752: "War", 37: "Western", 10759: "Action & Adventure", 10765: "Sci-Fi & Fantasy",
  10764: "Reality", 10762: "Kids", 10763: "News", 10767: "Talk", 10768: "War & Politics", 10766: "Soap",
};
function genreName(id) {
  return GENRE_NAMES[Number(id)] || "";
}

export async function homePage(ctx) {
  renderShell({ active: "home", body: `<div class="container" style="padding-top:calc(var(--header-h) + 30px)">${skeletonRow()}${skeletonRow()}</div>` });
  const data = await api.home();
  const rankIdx = data.top10.findIndex((x) => x.id === data.hero?.id && x.mediaType === data.hero?.mediaType);
  const hero = {
    ...data.hero,
    desc: data.hero?.overview || "",
  };
  const heroSection = await heroMarkup(hero, rankIdx >= 0 ? `#${rankIdx + 1} in ${hero.mediaType === "tv" ? "TV shows" : "movies"}` : "Trending now");

  const sectionHref = {
    upcomingTv: "/browse/tv",
    trending: "/browse/movie",
    netflix: "/browse/tv",
    recent4k: "/browse/movie?uhd=1",
    popularMovies: "/browse/movie",
    popularTv: "/browse/tv",
    topRated: "/browse/movie?sort=rating",
    anime: "/browse/anime",
  };

  let rowsHtml = row(t("top10"), data.top10, { top10: true });
  for (const section of data.sections) {
    const title = section.name === "trending" ? t("trending") : section.title;
    rowsHtml += row(title, section.items, { href: sectionHref[section.name] || null, id: section.name });
  }

  rowsHtml += `<section class="row"><div class="row-head"><h2 class="row-title">${t("genres")}</h2></div>
    <div class="genre-strip">${["action", "comedy", "drama", "horror", "romance", "adventure", "scifi", "thriller", "animation", "crime", "fantasy", "mystery"]
      .map((slug) => `<a class="genre-chip" href="/browse/movie?genres=${slug}">${esc(genreNameSlug(slug))}</a>`)
      .join("")}</div></section>`;

  renderShell({
    active: "home",
    body: `${heroSection}<div class="rows container">${rowsHtml}</div>`,
  });
  accountButton();
  continueRow();
}

/* Continue watching: local history carries progress and the second offset. */
async function continueRow() {
  if (!getToken()) return;
  let items = [];
  try {
    ({ items } = await api.history());
  } catch {
    return;
  }
  const cards = (items || [])
    .filter((h) => h && h.tmdbId && (h.seconds || 0) > 30 && (h.progress || 0) > 0.02 && (h.progress || 0) < 0.96)
    .slice(0, 14)
    .map((h) => ({
      id: h.tmdbId,
      mediaType: h.mediaType === "tv" ? "tv" : "movie",
      title: h.title,
      poster: h.poster,
      progress: h.progress,
      href: playbackHref(h),
    }));
  if (!cards.length) return;
  const host = document.querySelector(".rows");
  if (!host) return;
  host.insertAdjacentHTML("afterbegin", row(t("continueWatching"), cards, { href: "/history", id: "continue" }));
}

function playbackHref(entry) {
  const params = new URLSearchParams();
  if (entry.mediaType === "tv") {
    params.set("season", String(entry.season || 1));
    params.set("episode", String(entry.episode || 1));
  }
  if (entry.seconds) params.set("t", String(Math.round(entry.seconds)));
  const base = `/watch/${entry.mediaType === "tv" ? "tv" : "movie"}/${entry.tmdbId}`;
  return params.toString() ? `${base}?${params}` : base;
}

function genreNameSlug(slug) {
  const map = {
    action: "Action", comedy: "Comedy", drama: "Drama", horror: "Horror", romance: "Romance",
    adventure: "Adventure", scifi: "Science Fiction", thriller: "Thriller", animation: "Animation",
    crime: "Crime", fantasy: "Fantasy", mystery: "Mystery",
  };
  return map[slug] || slug;
}

/* -------------------------------- browse -------------------------------- */

export async function browsePage(ctx, params) {
  const type = ctx.type || "movie";
  const q = {
    genres: params.get("genres") || "",
    year: params.get("year") || "",
    sort: params.get("sort") || "popularity",
    uhd: params.get("uhd") === "1" ? "1" : "",
    page: 1,
  };

  const label = type === "movie" ? t("movies") : type === "tv" ? t("shows") : t("anime");
  const body = `<div class="container">
    <div class="page-head"><h1>${label}</h1><p>${type === "anime" ? "Japanese animation, subbed and dubbed." : type === "tv" ? "Series, seasons and episodes." : "Films from every decade and genre."}</p></div>
    <div class="filter-bar">
      <div class="tab-group">
        <a class="tab ${type === "movie" ? "active" : ""}" href="/browse/movie">${t("movies")}</a>
        <a class="tab ${type === "tv" ? "active" : ""}" href="/browse/tv">${t("shows")}</a>
        <a class="tab ${type === "anime" ? "active" : ""}" href="/browse/anime">${t("anime")}</a>
      </div>
      <select class="filter-select" id="f-genre"><option value="">${t("genre")}: ${t("all")}</option>${genreOptions(type, q.genres)}</select>
      <select class="filter-select" id="f-year"><option value="">${t("year")}: ${t("all")}</option>${YEARS.map((y) => `<option value="${y}" ${q.year === String(y) ? "selected" : ""}>${y}</option>`).join("")}</select>
      <select class="filter-select" id="f-sort">
        <option value="popularity" ${q.sort === "popularity" ? "selected" : ""}>${t("popularity")}</option>
        <option value="rating" ${q.sort === "rating" ? "selected" : ""}>${t("rating")}</option>
        <option value="newest" ${q.sort === "newest" ? "selected" : ""}>${t("newest")}</option>
        <option value="title" ${q.sort === "title" ? "selected" : ""}>${t("titleAZ")}</option>
      </select>
      <label class="filter-toggle"><input type="checkbox" id="f-uhd" ${q.uhd ? "checked" : ""}/>${t("quality")}</label>
    </div>
    <div id="browse-grid" class="grid">${Array.from({ length: 12 }, () => '<div class="skeleton" style="aspect-ratio:2/3"></div>').join("")}</div>
    <div class="load-more-wrap" id="browse-more"></div>
  </div>`;

  renderShell({ active: type === "anime" ? "anime" : type, body });

  const grid = document.getElementById("browse-grid");
  const more = document.getElementById("browse-more");
  let state = { ...q, totalPages: 1, loading: false };

  const syncUrl = () => {
    const sp = new URLSearchParams();
    if (state.genres) sp.set("genres", state.genres);
    if (state.year) sp.set("year", state.year);
    if (state.sort && state.sort !== "popularity") sp.set("sort", state.sort);
    if (state.uhd) sp.set("uhd", "1");
    history.replaceState({}, "", `/browse/${type}${sp.toString() ? `?${sp}` : ""}`);
  };

  const load = async (reset = false) => {
    if (state.loading) return;
    state.loading = true;
    if (reset) {
      state.page = 1;
      grid.innerHTML = Array.from({ length: 12 }, () => '<div class="skeleton" style="aspect-ratio:2/3"></div>').join("");
    }
    more.innerHTML = '<div class="spinner"></div>';
    try {
      const data = await api.browse({
        type,
        page: state.page,
        genres: state.genres,
        year: state.year,
        sort: state.sort,
        uhd: state.uhd,
      });
      const html = data.items.map((item) => cardWithInfo(item)).join("");
      if (reset) grid.innerHTML = html || `<div class="empty-state" style="grid-column:1/-1"><h3>${t("noResults")}</h3></div>`;
      else grid.insertAdjacentHTML("beforeend", html);
      state.totalPages = data.totalPages;
      more.innerHTML =
        state.page < data.totalPages
          ? `<button class="btn btn-ghost" id="load-more">${t("loadMore")}</button>`
          : "";
      document.getElementById("load-more")?.addEventListener("click", () => {
        state.page += 1;
        load(false);
      });
    } catch (err) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>${t("genericError")}</h3><p>${esc(err.message)}</p></div>`;
      more.innerHTML = "";
    } finally {
      state.loading = false;
    }
  };

  const apply = () => {
    state.genres = document.getElementById("f-genre").value;
    state.year = document.getElementById("f-year").value;
    state.sort = document.getElementById("f-sort").value;
    state.uhd = document.getElementById("f-uhd").checked ? "1" : "";
    syncUrl();
    load(true);
  };

  document.getElementById("f-genre").addEventListener("change", apply);
  document.getElementById("f-year").addEventListener("change", apply);
  document.getElementById("f-sort").addEventListener("change", apply);
  document.getElementById("f-uhd").addEventListener("change", apply);

  await load(true);
  accountButton();
}

/* -------------------------------- search -------------------------------- */

export async function searchPage(ctx, params) {
  const query = params.get("q") || "";
  const body = `<div class="container">
    <div class="page-head"><h1>${t("search")}</h1><p>${query ? esc(query) : ""}</p></div>
    <div id="search-grid" class="grid"></div><div class="load-more-wrap" id="search-more"></div>
  </div>`;
  renderShell({ active: "", body });
  const grid = document.getElementById("search-grid");
  const more = document.getElementById("search-more");
  if (!query) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>${t("noResults")}</h3></div>`;
    return;
  }
  let page = 1;
  const load = async () => {
    more.innerHTML = '<div class="spinner"></div>';
    try {
      const data = await api.search(query, page);
      grid.insertAdjacentHTML("beforeend", data.items.map((i) => cardWithInfo(i)).join(""));
      more.innerHTML = page < data.totalPages ? `<button class="btn btn-ghost" id="smore">${t("loadMore")}</button>` : "";
      document.getElementById("smore")?.addEventListener("click", () => {
        page += 1;
        load();
      });
    } catch (err) {
      more.innerHTML = "";
      toast(err.message);
    }
  };
  await load();
  accountButton();
}

/* -------------------------------- detail -------------------------------- */

function fact(label, value) {
  if (!value || (Array.isArray(value) && !value.length)) return "";
  return `<div><div class="fact-label">${label}</div><div class="fact-value">${esc(Array.isArray(value) ? value.join(", ") : value)}</div></div>`;
}

export async function detailPage(ctx) {
  const type = ctx.type === "tv" ? "tv" : "movie";
  const id = ctx.id;
  renderShell({ active: type, body: `<div class="container" style="padding-top:calc(var(--header-h) + 40px)">${skeletonRow()}</div>` });

  let detail;
  try {
    detail = type === "tv" ? await api.tv(id) : await api.movie(id);
  } catch (err) {
    renderShell({
      active: type,
      body: `<div class="container"><div class="empty-state"><h3>${t("genericError")}</h3><p>${esc(err.message)}</p></div></div>`,
    });
    return;
  }

  const categories = detail.categories || [];
  const meta = `<div class="meta-row">
      <span class="score">${Number(detail.score || 0).toFixed(1)}</span>
      <span>${esc(String(detail.year || ""))}</span>
      <span>${type === "tv" ? `${detail.episodeInfo?.seasons || detail.seasons.length} season${(detail.episodeInfo?.seasons || 1) > 1 ? "s" : ""}` : `${detail.duration || 0} ${t("minutes")}`}</span>
      ${detail.certification ? `<span class="badge">${esc(detail.certification)}</span>` : ""}
      ${detail.uhd ? '<span class="badge uhd">4K</span>' : ""}
      <span>${esc(categories.join(" · "))}</span>
    </div>`;

  const playHref = type === "tv" ? watchHref(detail, 1, 1) : watchHref(detail);

  const body = `<div class="detail-hero">
    <div class="detail-backdrop" style="background-image:url('${detail.background || detail.poster || ""}')"></div>
    <div class="detail-shade"></div>
    <div class="container detail-grid">
      <div class="detail-poster">${detail.poster ? `<img src="${detail.poster}" alt="${esc(detail.title)} poster" />` : ""}</div>
      <div class="detail-main">
        ${detail.logo ? `<img class="detail-logo" src="${detail.logo}" alt="${esc(detail.title)}" />` : `<h1 class="detail-title">${esc(detail.title)}</h1>`}
        <div class="detail-original">${esc(detail.titleOriginal || detail.title)}</div>
        ${meta}
        <div class="detail-actions">
          <a class="btn btn-primary" href="${playHref}" data-play>${ICONS.play}${t("play")}</a>
          <button class="btn btn-secondary" id="watchlist-btn">${ICONS.plus}${t("addList")}</button>
          ${detail.trailerId ? `<button class="btn btn-ghost" id="trailer-btn">${ICONS.play}${t("trailer")}</button>` : ""}
          <div class="vote-box" id="vote-box"></div>
        </div>
        <p class="detail-desc">${esc(detail.desc || "")}</p>
        <div class="facts">
          ${fact(t("director"), detail.directors)}
          ${fact(t("creator"), detail.creators)}
          ${fact(t("writer"), detail.writers)}
          ${fact("Release", detail.release_date)}
          ${fact("IMDb", detail.imdbId)}
        </div>
      </div>
    </div>
  </div>
  <div class="container" id="detail-rest"></div>`;

  renderShell({ active: type, body });
  accountButton();

  const rest = document.getElementById("detail-rest");
  rest.innerHTML = `
    ${detail.actors?.length ? `<section class="section"><div class="section-head"><h2>${t("cast")}</h2></div>
      <div class="cast-row">${detail.actors.map((a) => `<div class="cast-card">${a.avatar ? `<img class="cast-avatar" src="${a.avatar}" alt="${esc(a.name)}" loading="lazy" />` : '<div class="cast-avatar"></div>'}<div class="cast-name">${esc(a.name)}</div><div class="cast-role">${esc(a.label)}</div></div>`).join("")}</div></section>` : ""}
    ${type === "tv" ? `<section class="section" id="episodes-section"></section>` : ""}
    ${detail.recommendations?.length ? `<section class="section"><div class="section-head"><h2>${t("recommendations")}</h2></div><div class="row-wrap"><div class="row-scroller">${detail.recommendations.map((i) => card(i)).join("")}</div></div></section>` : ""}
    ${detail.similar?.length ? `<section class="section"><div class="section-head"><h2>${t("similar")}</h2></div><div class="row-wrap"><div class="row-scroller">${detail.similar.map((i) => card(i)).join("")}</div></div></section>` : ""}
  `;

  /* votes */
  const voteBox = document.getElementById("vote-box");
  const paintVotes = (v) => {
    voteBox.innerHTML = `<button class="vote-btn ${v.myVote === "up" ? "on" : ""}" data-vote="up">${ICONS.thumbUp}${v.up}</button>
      <button class="vote-btn ${v.myVote === "down" ? "on" : ""}" data-vote="down">${ICONS.thumbDown}${v.down}</button>`;
    voteBox.querySelectorAll("[data-vote]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!getToken()) return window.__navigate("/login");
        try {
          paintVotes(await api.vote(detail.tmdbId, type, btn.dataset.vote));
        } catch (err) {
          toast(err.message);
        }
      }),
    );
  };
  paintVotes(detail.votes || { up: 0, down: 0, myVote: null });

  /* watchlist */
  const wlBtn = document.getElementById("watchlist-btn");
  const wlItem = { id: detail.tmdbId, mediaType: type, title: detail.title, poster: detail.poster, rating: detail.score, release_date: detail.release_date };
  if (getToken()) {
    try {
      const { items } = await api.watchlist();
      if (items.some((x) => x.id === wlItem.id && x.mediaType === type)) wlBtn.innerHTML = `${ICONS.check}${t("inList")}`;
    } catch { /* ignore */ }
  }
  wlBtn.addEventListener("click", async () => {
    if (!getToken()) return window.__navigate("/login");
    try {
      const { added } = await api.toggleWatchlist(wlItem);
      wlBtn.innerHTML = added ? `${ICONS.check}${t("inList")}` : `${ICONS.plus}${t("addList")}`;
      toast(added ? "Added to watchlist" : "Removed from watchlist");
    } catch (err) {
      toast(err.message);
    }
  });

  /* trailer autoplay param */
  if (new URLSearchParams(location.search).get("play") === "true") {
    window.__navigate(playHref);
    return;
  }

  /* trailer modal */
  document.getElementById("trailer-btn")?.addEventListener("click", () => {
    const node = document.createElement("div");
    node.className = "modal-backdrop";
    node.innerHTML = `<div class="modal-box"><button class="modal-close" aria-label="Close">×</button>
      <iframe src="https://www.youtube.com/embed/${encodeURIComponent(detail.trailerId)}?autoplay=1&rel=0" title="${esc(detail.title)} trailer" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe></div>`;
    const close = () => node.remove();
    node.addEventListener("click", (e) => {
      if (e.target === node || e.target.classList.contains("modal-close")) close();
    });
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      document.removeEventListener("keydown", onKey);
      close();
    };
    document.addEventListener("keydown", onKey);
    document.body.appendChild(node);
  });

  /* episodes */
  if (type === "tv") {
    const section = document.getElementById("episodes-section");
    const seasons = detail.seasons?.length ? detail.seasons : [{ season_number: 1, name: "Season 1" }];
    const current = seasons[0];
    section.innerHTML = `<div class="section-head"><h2>${t("episodes")}</h2>
      <select class="filter-select" id="season-select">${seasons.map((s) => `<option value="${s.season_number}" ${s.season_number === current.season_number ? "selected" : ""}>${esc(s.name || `${t("season")} ${s.season_number}`)}</option>`).join("")}</select>
      </div><div class="episode-list" id="episode-list"><div class="spinner"></div></div>`;
    const list = document.getElementById("episode-list");
    const loadSeason = async (n) => {
      list.innerHTML = '<div class="spinner"></div>';
      try {
        const data = await api.season(detail.tmdbId, n);
        list.innerHTML = data.episodes
          .map(
            (e) => `<div class="episode">
              ${e.still ? `<img class="episode-still" src="${e.still}" alt="" loading="lazy" />` : '<div class="episode-still"></div>'}
              <div><div class="episode-num">${t("episode")} ${e.episode_number}${e.air_date ? ` · ${esc(e.air_date)}` : ""}</div>
                <div class="episode-name">${esc(e.name || `${t("episode")} ${e.episode_number}`)}</div>
                <div class="episode-desc">${esc(e.overview || "")}</div></div>
              <a class="btn btn-secondary btn-sm episode-play" href="${watchHref(detail, n, e.episode_number)}">${ICONS.play}${t("play")}</a>
            </div>`,
          )
          .join("");
      } catch (err) {
        list.innerHTML = `<div class="empty-state"><p>${esc(err.message)}</p></div>`;
      }
    };
    document.getElementById("season-select").addEventListener("change", (e) => loadSeason(Number(e.target.value)));
    await loadSeason(current.season_number);
  }
}

/* ------------------------------ watchlist ------------------------------- */

export async function listPage(kind) {
  if (!getToken()) return window.__navigate("/login");
  renderShell({ active: "", body: `<div class="container"><div class="page-head"><h1>${t(kind)}</h1></div><div class="grid" id="list-grid"><div class="spinner"></div></div></div>` });
  const grid = document.getElementById("list-grid");
  try {
    if (kind === "watchlist") {
      const { items } = await api.watchlist();
      grid.innerHTML = items.length
        ? items.map((i) => cardWithInfo({ ...i, mediaType: i.mediaType })).join("")
        : `<div class="empty-state" style="grid-column:1/-1"><h3>${t("nothingHere")}</h3><p>${t("emptyWatchlist")}</p></div>`;
    } else {
      const { items } = await api.history();
      if (!items.length) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>${t("nothingHere")}</h3><p>${t("emptyHistory")}</p></div>`;
      } else {
        grid.innerHTML = items
          .map(
            (h) => `<a class="card" href="${h.mediaType === "tv" ? `/watch/tv/${h.tmdbId}?season=${h.season || 1}&episode=${h.episode || 1}` : `/watch/movie/${h.tmdbId}`}">
              <div class="card-media">${h.poster ? `<img src="${h.poster}" alt="" loading="lazy" />` : ""}
              ${h.progress ? `<span class="card-progress"><span style="width:${Math.min(100, Math.max(0, h.progress * 100)).toFixed(1)}%"></span></span>` : ""}
              <div class="card-hover"><div class="card-name">${esc(h.title)}</div><div class="card-meta">${h.mediaType === "tv" ? `${t("season")} ${h.season || 1} · ${t("episode")} ${h.episode || 1}` : "Movie"} · ${Math.round((h.progress || 0) * 100)}%</div></div></div></a>`,
          )
          .join("");
      }
    }
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>${esc(err.message)}</p></div>`;
  }
  accountButton();
}

/* --------------------------------- auth --------------------------------- */

export async function authPage(mode) {
  const signup = mode === "signup";
  const body = `<div class="auth-wrap"><div class="auth-card">
    <h1>${signup ? t("authSignupTitle") : t("authTitle")}</h1>
    <p>${signup ? t("authSignupSub") : t("authSub")}</p>
    <div id="auth-error"></div>
    <form id="auth-form">
      ${signup ? `<div class="field"><label for="a-name">${t("name")}</label><input id="a-name" autocomplete="nickname" /></div>` : ""}
      <div class="field"><label for="a-email">${t("email")}</label><input id="a-email" type="email" required autocomplete="email" /></div>
      <div class="field"><label for="a-password">${t("password")}</label><input id="a-password" type="password" required minlength="6" autocomplete="${signup ? "new-password" : "current-password"}" /></div>
      <button class="btn btn-brand" style="width:100%" type="submit">${signup ? t("signup") : t("login")}</button>
    </form>
    <div class="auth-alt">${signup ? t("haveAccount") : t("needAccount")} <a href="${signup ? "/login" : "/signup"}">${signup ? t("login") : t("signup")}</a></div>
  </div></div>`;
  renderShell({ active: "", body, withFooter: false });
  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = document.getElementById("auth-error");
    error.innerHTML = "";
    const payload = {
      email: document.getElementById("a-email").value.trim(),
      password: document.getElementById("a-password").value,
    };
    if (signup) payload.name = document.getElementById("a-name").value.trim();
    try {
      const data = signup ? await api.register(payload) : await api.login(payload);
      localStorage.setItem("movy:token", data.token);
      window.__navigate("/watchlist");
    } catch (err) {
      error.innerHTML = `<div class="form-error">${esc(err.status === 401 ? t("invalidCreds") : err.message)}</div>`;
    }
  });
}

export async function accountPage() {
  if (!getToken()) return window.__navigate("/login");
  const { user } = await api.me();
  if (!user) return window.__navigate("/login");
  const body = `<div class="container"><div class="page-head"><h1>${esc(user.name)}</h1><p>${esc(user.email)}</p></div>
    <div class="facts">${fact(t("memberSince"), new Date(user.createdAt).toLocaleDateString())}</div>
    <div class="detail-actions">
      <a class="btn btn-secondary" href="/watchlist">${t("watchlist")}</a>
      <a class="btn btn-secondary" href="/history">${t("history")}</a>
      <button class="btn btn-ghost" id="logout">${t("logout")}</button>
    </div></div>`;
  renderShell({ active: "", body });
  document.getElementById("logout").addEventListener("click", () => {
    localStorage.removeItem("movy:token");
    window.__navigate("/");
    toast("Signed out");
  });
}

/* -------------------------------- legal --------------------------------- */

const LEGAL = {
  dmca: {
    title: "DMCA",
    body: `<p>This deployment indexes metadata from public catalog services. It does not host, upload, or store media files. Streams are resolved from third-party providers and remain on those platforms.</p>
      <h2>Takedown requests</h2><p>Rights holders can request removal of an indexed title by sending a notice that identifies the work, the URL, and proof of authorization. Requests are processed in order of receipt.</p>
      <h2>Counter notice</h2><p>If a removal was made in error, a counter notice with supporting documentation can be submitted for review.</p>`,
  },
  terms: {
    title: "Terms of Service",
    body: `<p>By using this service you agree to use it for personal, non-commercial viewing. Access may be limited or withdrawn at any time.</p>
      <h2>Accounts</h2><p>You are responsible for the activity on your account and for keeping your credentials private.</p>
      <h2>Availability</h2><p>The service is provided as-is. Catalog data and stream availability depend on upstream providers and can change without notice.</p>`,
  },
  privacy: {
    title: "Privacy Policy",
    body: `<p>This service stores only what an account needs: an email, a display name, a password hash, your watchlist, your watch history, and your votes.</p>
      <h2>What is not collected</h2><p>No advertising identifier, no third-party analytics script, no fingerprinting.</p>
      <h2>Storage</h2><p>Account data lives in a local JSON store on the server. Clearing history removes those records permanently.</p>`,
  },
};

export function legalPage(kind) {
  const doc = LEGAL[kind] || LEGAL.terms;
  renderShell({
    active: "",
    body: `<div class="container"><article class="legal"><h1>${doc.title}</h1>${doc.body}</article></div>`,
  });
}

export function helpPage() {
  renderShell({
    active: "",
    body: `<div class="container"><article class="legal"><h1>Help</h1>
      <h2>Playback</h2><p>Pick a server on the watch page. If a server has no sources for a title, choose another one. Quality options appear when the stream exposes multiple renditions.</p>
      <h2>Subtitles</h2><p>Available subtitle tracks are listed under the player. Not every provider ships captions.</p>
      <h2>Accounts</h2><p>An account keeps your watchlist, history, and votes. No email verification is required on this deployment.</p>
    </article></div>`,
  });
}

export function notFoundPage() {
  renderShell({
    active: "",
    body: `<div class="container"><div class="empty-state" style="padding-top:calc(var(--header-h) + 80px)"><h3>404</h3><p>That page does not exist.</p><a class="btn btn-secondary" href="/" style="margin-top:16px">${t("home")}</a></div></div>`,
  });
}
