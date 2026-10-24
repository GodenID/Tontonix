"use strict";

const config = require("./config");

const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value, ttl = config.cacheTtlMs) {
  cache.set(key, { value, expires: Date.now() + ttl });
  if (cache.size > 800) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  return value;
}

async function tmdb(pathname, params = {}, { ttl = config.cacheTtlMs, fresh = false } = {}) {
  const url = new URL(config.tmdbBase + pathname);
  url.searchParams.set("language", params.language || config.tmdbLang);
  for (const [k, v] of Object.entries(params)) {
    if (k === "language" || v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const key = url.toString();
  if (!fresh) {
    const hit = cacheGet(key);
    if (hit) return hit;
  }
  const res = await fetch(key, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`tmdb ${res.status} ${pathname} ${text.slice(0, 140)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  return cacheSet(key, json, ttl);
}

/* ------------------------------- images -------------------------------- */

const IMG = {
  poster: (file) => (file ? `/img/w342${file}/q50.webp` : null),
  avatar: (file) => (file ? `/img/w185${file}/q50.webp` : null),
  logo: (file) => (file ? `/img/w500${file}/q50.webp` : null),
  card: (file) => (file ? `/img/w780${file}/q65.webp` : null),
  backdrop: (file) => (file ? `/img/original${file}/q80.webp` : null),
};

/* ------------------------------- genres -------------------------------- */

const GENRES = [
  { id: 28, name: "Action", slug: "action", type: "movie" },
  { id: 12, name: "Adventure", slug: "adventure", type: "movie" },
  { id: 16, name: "Animation", slug: "animation", type: "movie" },
  { id: 35, name: "Comedy", slug: "comedy", type: "movie" },
  { id: 80, name: "Crime", slug: "crime", type: "movie" },
  { id: 99, name: "Documentary", slug: "documentary", type: "movie" },
  { id: 18, name: "Drama", slug: "drama", type: "movie" },
  { id: 10751, name: "Family", slug: "family", type: "movie" },
  { id: 14, name: "Fantasy", slug: "fantasy", type: "movie" },
  { id: 36, name: "History", slug: "history", type: "movie" },
  { id: 27, name: "Horror", slug: "horror", type: "movie" },
  { id: 10402, name: "Music", slug: "music", type: "movie" },
  { id: 9648, name: "Mystery", slug: "mystery", type: "movie" },
  { id: 10749, name: "Romance", slug: "romance", type: "movie" },
  { id: 878, name: "Science Fiction", slug: "scifi", type: "movie" },
  { id: 10770, name: "TV Movie", slug: "tv-movie", type: "movie" },
  { id: 53, name: "Thriller", slug: "thriller", type: "movie" },
  { id: 10752, name: "War", slug: "war", type: "movie" },
  { id: 37, name: "Western", slug: "western", type: "movie" },
  { id: 10759, name: "Action & Adventure", slug: "action-adventure", type: "tv" },
  { id: 10765, name: "Sci-Fi & Fantasy", slug: "scifi-fantasy", type: "tv" },
  { id: 10764, name: "Reality", slug: "reality", type: "tv" },
  { id: 10762, name: "Kids", slug: "kids", type: "tv" },
  { id: 10763, name: "News", slug: "news", type: "tv" },
  { id: 10767, name: "Talk", slug: "talk", type: "tv" },
  { id: 10768, name: "War & Politics", slug: "war-politics", type: "tv" },
  { id: 10766, name: "Soap", slug: "soap", type: "tv" },
];

const genreById = new Map(GENRES.map((g) => [g.id, g.name]));
const genreBySlug = new Map(GENRES.map((g) => [g.slug, g]));

/* ----------------------------- normalizers ------------------------------ */

function card(item, mediaType) {
  const type = mediaType || item.media_type || (item.first_air_date ? "tv" : "movie");
  if (type === "person") return null;
  const title = item.title || item.name || item.original_title || item.original_name || "";
  const date = item.release_date || item.first_air_date || "";
  return {
    id: item.id,
    title,
    poster: IMG.poster(item.poster_path),
    slug: `/${type}/${item.id}`,
    image: IMG.card(item.backdrop_path),
    genre_ids: (item.genre_ids || (item.genres || []).map((g) => g.id)).join(" "),
    rating: Math.round((item.vote_average || 0) * 10) / 10,
    release_date: date,
    mediaType: type,
    vote_count: item.vote_count || 0,
    desc: item.overview || "",
  };
}

function cards(list, type) {
  return (list || []).map((item) => card(item, type)).filter(Boolean);
}

function crewNames(credits, job) {
  return [...new Set((credits?.crew || []).filter((c) => c.job === job).map((c) => c.name))].slice(0, 6);
}

function actors(credits) {
  return (credits?.cast || []).slice(0, 18).map((a) => ({
    id: a.id,
    name: a.name,
    avatar: IMG.avatar(a.profile_path),
    label: a.character || "",
  }));
}

function trailerId(videos) {
  const list = videos?.results || [];
  const pick =
    list.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ||
    list.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
    list.find((v) => v.site === "YouTube");
  return pick ? pick.key : null;
}

function certification(data, type) {
  if (type === "movie") {
    const entries = data.release_dates?.results || [];
    const us = entries.find((e) => e.iso_3166_1 === "US") || entries[0];
    const cert = us?.release_dates?.find((r) => r.certification)?.certification;
    return cert || null;
  }
  const entries = data.content_ratings?.results || [];
  const us = entries.find((e) => e.iso_3166_1 === "US") || entries[0];
  return us?.rating || null;
}

function titles(data) {
  const translations = data.translations?.translations || [];
  const pick = (iso) => {
    const t = translations.find((x) => x.iso_3166_1 === iso || x.iso_639_1 === iso);
    return t?.data?.title || t?.data?.name || null;
  };
  return {
    titleEnglish: pick("US") || data.title || data.name || null,
    titlePortuguese: pick("BR") || pick("PT"),
    titleSpanish: pick("ES") || pick("MX"),
    titleFrench: pick("FR"),
    titleGerman: pick("DE"),
  };
}

const UHD_HINT = new Set([28, 12, 14, 878, 53, 16]);

function isUhd(data) {
  const date = data.release_date || data.first_air_date || "";
  const year = Number((date || "0").slice(0, 4));
  const genres = (data.genres || []).map((g) => g.id);
  return year >= 2016 && (data.vote_count || 0) > 500 && genres.some((g) => UHD_HINT.has(g));
}

/* ------------------------------- details -------------------------------- */

async function movieDetail(id, { language } = {}) {
  const data = await tmdb(`/movie/${id}`, {
    append_to_response: "external_ids,credits,videos,recommendations,similar,release_dates,translations,images",
    include_image_language: "en,null",
    language,
  });
  const logo = (data.images?.logos || []).find((l) => l.iso_639_1 === "en") || (data.images?.logos || [])[0];
  return {
    mediaType: "movie",
    b35ebba4: "",
    background: IMG.backdrop(data.backdrop_path),
    categories: (data.genres || []).map((g) => g.name),
    logo: logo ? IMG.logo(logo.file_path) : null,
    tmdbId: data.id,
    duration: data.runtime || 0,
    imdbId: data.external_ids?.imdb_id || data.imdb_id || null,
    title: data.title,
    titleOriginal: data.original_title,
    ...titles(data),
    desc: data.overview || "",
    poster: IMG.poster(data.poster_path),
    year: Number((data.release_date || "0").slice(0, 4)) || null,
    release_date: data.release_date || null,
    score: Math.round((data.vote_average || 0) * 10) / 10,
    scoreCount: data.vote_count || 0,
    certification: certification(data, "movie"),
    trailerId: trailerId(data.videos),
    seasons: [],
    actors: actors(data.credits),
    directors: crewNames(data.credits, "Director"),
    writers: [...crewNames(data.credits, "Writer"), ...crewNames(data.credits, "Screenplay")].slice(0, 6),
    creators: [],
    recommendations: cards((data.recommendations?.results || []).slice(0, 18), "movie"),
    similar: cards((data.similar?.results || []).slice(0, 18), "movie"),
    uhd: isUhd(data),
  };
}

async function tvDetail(id, { language } = {}) {
  const data = await tmdb(`/tv/${id}`, {
    append_to_response: "external_ids,credits,videos,recommendations,similar,content_ratings,translations,images",
    include_image_language: "en,null",
    language,
  });
  const logo = (data.images?.logos || []).find((l) => l.iso_639_1 === "en") || (data.images?.logos || [])[0];
  const seasons = (data.seasons || [])
    .filter((s) => s.season_number > 0)
    .map((s) => ({
      air_date: s.air_date,
      episode_count: s.episode_count,
      id: s.id,
      name: s.name,
      overview: s.overview,
      poster_path: IMG.poster(s.poster_path),
      season_number: s.season_number,
    }));
  return {
    mediaType: "tv",
    b35ebba4: "",
    background: IMG.backdrop(data.backdrop_path),
    categories: (data.genres || []).map((g) => g.name),
    logo: logo ? IMG.logo(logo.file_path) : null,
    tmdbId: data.id,
    title: data.name,
    titleOriginal: data.original_name,
    ...titles(data),
    desc: data.overview || "",
    poster: IMG.poster(data.poster_path),
    year: Number((data.first_air_date || "0").slice(0, 4)) || null,
    release_date: data.first_air_date || null,
    score: Math.round((data.vote_average || 0) * 10) / 10,
    scoreCount: data.vote_count || 0,
    certification: certification(data, "tv"),
    trailerId: trailerId(data.videos),
    episodeInfo: {
      seasons: data.number_of_seasons || seasons.length,
      episodes: data.number_of_episodes || 0,
      lastEpisode: data.last_episode_to_air
        ? {
            season: data.last_episode_to_air.season_number,
            episode: data.last_episode_to_air.episode_number,
            air_date: data.last_episode_to_air.air_date,
            name: data.last_episode_to_air.name,
          }
        : null,
    },
    imdbId: data.external_ids?.imdb_id || null,
    actors: actors(data.credits),
    directors: [],
    writers: [],
    creators: (data.created_by || []).map((c) => c.name),
    seasons,
    recommendations: cards((data.recommendations?.results || []).slice(0, 18), "tv"),
    similar: cards((data.similar?.results || []).slice(0, 18), "tv"),
    uhd: isUhd(data),
  };
}

async function seasonDetail(tvId, seasonNumber, { language } = {}) {
  const data = await tmdb(`/tv/${tvId}/season/${seasonNumber}`, { language });
  return {
    id: data.id,
    name: data.name,
    overview: data.overview,
    season_number: data.season_number,
    air_date: data.air_date,
    poster: IMG.poster(data.poster_path),
    episodes: (data.episodes || []).map((e) => ({
      id: e.id,
      name: e.name,
      episode_number: e.episode_number,
      season_number: e.season_number,
      overview: e.overview,
      air_date: e.air_date,
      runtime: e.runtime,
      still: IMG.card(e.still_path),
      rating: Math.round((e.vote_average || 0) * 10) / 10,
    })),
  };
}

module.exports = {
  tmdb,
  IMG,
  GENRES,
  genreById,
  genreBySlug,
  card,
  cards,
  movieDetail,
  tvDetail,
  seasonDetail,
  certification,
  isUhd,
  _cache: cache,
};
