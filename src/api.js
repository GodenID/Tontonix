"use strict";

const config = require("./config");
const tmdbApi = require("./tmdb");
const store = require("./store");
const auth = require("./auth");
const stream = require("./stream");

const { tmdb, cards, GENRES, genreBySlug, movieDetail, tvDetail, seasonDetail } = tmdbApi;

/* ------------------------------- helpers -------------------------------- */

function bad(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function sortFor(type, sort) {
  const movie = type === "movie";
  switch (sort) {
    case "rating":
      return { sort_by: "vote_average.desc", "vote_count.gte": 200 };
    case "newest":
      return { sort_by: movie ? "primary_release_date.desc" : "first_air_date.desc" };
    case "revenue":
      return movie ? { sort_by: "revenue.desc" } : { sort_by: "popularity.desc" };
    case "title":
      return { sort_by: movie ? "original_title.asc" : "original_name.asc" };
    default:
      return { sort_by: "popularity.desc" };
  }
}

function resolveGenreSlugs(raw) {
  return String(raw || "")
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((slug) => genreBySlug.get(slug.toLowerCase()))
    .filter(Boolean);
}

function discoverParams({ type, genres, year, yearFrom, yearTo, sort, page = 1, uhd }) {
  const params = {
    page: Math.max(1, Math.min(500, Number(page) || 1)),
    include_adult: "false",
    ...sortFor(type === "movie" ? "movie" : "tv", sort),
  };
  if (genres?.length) params.with_genres = genres.map((g) => g.id).join(",");
  const dateField = type === "movie" ? "primary_release_date" : "first_air_date";
  if (yearFrom && yearTo) {
    params[`${dateField}.gte`] = `${yearFrom}-01-01`;
    params[`${dateField}.lte`] = `${yearTo}-12-31`;
  } else if (year) {
    params[`${dateField}.gte`] = `${year}-01-01`;
    params[`${dateField}.lte`] = `${year}-12-31`;
  } else if (type === "movie" && uhd) {
    params[`${dateField}.gte`] = `${new Date().getFullYear() - 2}-01-01`;
  }
  if (uhd) params["vote_count.gte"] = 50;
  return params;
}

/* --------------------------------- home --------------------------------- */

async function homeFeed({ language } = {}) {
  const [trendingWeek, trendingAll, popularMovie, popularTv, onAirTv, netflixTv, recentMovie, topMovie, topTv, animeTv] =
    await Promise.all([
      tmdb("/trending/all/week", { language }),
      tmdb("/trending/all/day", { language }),
      tmdb("/discover/movie", { ...discoverParams({ type: "movie", sort: "popularity", page: 1 }) }),
      tmdb("/discover/tv", { ...discoverParams({ type: "tv", sort: "popularity", page: 1 }) }),
      tmdb("/tv/on_the_air", { page: 1 }),
      tmdb("/discover/tv", { with_networks: 213, sort_by: "popularity.desc", page: 1 }),
      tmdb("/discover/movie", { sort_by: "primary_release_date.desc", "vote_count.gte": 40, page: 1 }),
      tmdb("/movie/top_rated", { page: 1 }),
      tmdb("/tv/top_rated", { page: 1 }),
      tmdb("/discover/tv", { with_genres: 16, with_original_language: "ja", sort_by: "popularity.desc", page: 1 }),
    ]);

  const trending = cards(trendingAll.results, null).filter((c) => c.image);
  const baseHero = trending.find((c) => c.image && c.release_date) || trending[0];

  let hero = baseHero;
  if (baseHero) {
    try {
      const full = baseHero.mediaType === "tv" ? await tvDetail(baseHero.id, { language }) : await movieDetail(baseHero.id, { language });
      hero = {
        ...baseHero,
        logo: full.logo,
        desc: full.desc || baseHero.desc,
        certification: full.certification,
        duration: full.duration,
        uhd: full.uhd,
        categories: full.categories,
        imdbId: full.imdbId,
        titleOriginal: full.titleOriginal,
        tmdbId: full.tmdbId,
      };
    } catch {
      hero = baseHero;
    }
  }

  const row = (name, title, list, type) => ({ name, title, items: cards(list, type) });

  return {
    hero,
    top10: cards(trendingWeek.results, null).slice(0, 10),
    sections: [
      row("upcomingTv", "Current & upcoming TV shows", onAirTv.results, "tv"),
      row("trending", "Trending This Week", trendingWeek.results, null),
      row("netflix", "Only on Netflix", netflixTv.results, "tv"),
      row("recent4k", "Recently added in 4K", recentMovie.results, "movie"),
      row("popularMovies", "Popular movies", popularMovie.results, "movie"),
      row("popularTv", "Popular TV shows", popularTv.results, "tv"),
      row("topRated", "Top rated", [...topMovie.results.slice(0, 10), ...topTv.results.slice(0, 10)], null),
      row("anime", "Anime spotlight", animeTv.results, "tv"),
    ],
    genres: GENRES,
  };
}

/* -------------------------------- browse -------------------------------- */

async function browse({ type = "movie", page = 1, genres, year, yearFrom, yearTo, sort = "popularity", uhd, language }) {
  const cleanType = ["movie", "tv", "anime"].includes(type) ? type : "movie";
  const params = discoverParams({ type: cleanType, genres: resolveGenreSlugs(genres), year, yearFrom, yearTo, sort, page, uhd });

  let path = cleanType === "movie" ? "/discover/movie" : "/discover/tv";
  if (cleanType === "anime") {
    const animeGenres = resolveGenreSlugs(genres);
    params.with_genres = [16, ...animeGenres.map((g) => g.id)].join(",");
    params.with_original_language = "ja";
  }

  const data = await tmdb(path, { ...params, language });
  return {
    type: cleanType,
    page: data.page,
    totalPages: Math.min(data.total_pages, 500),
    totalResults: data.total_results,
    items: cards(data.results, cleanType === "movie" ? "movie" : "tv"),
    genres: GENRES,
  };
}

/* -------------------------------- search -------------------------------- */

async function search({ q, page = 1, language }) {
  const query = String(q || "").trim();
  if (!query) return { query, page: 1, totalPages: 0, items: [] };
  const data = await tmdb("/search/multi", { query, page, include_adult: "false", language });
  const items = (data.results || [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .map((r) => tmdbApi.card(r, r.media_type));
  return { query, page: data.page, totalPages: Math.min(data.total_pages, 500), items };
}

/* -------------------------------- detail -------------------------------- */

async function detail(mediaType, id, { language } = {}) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const data = type === "tv" ? await tvDetail(id, { language }) : await movieDetail(id, { language });
  data.votes = store.getVotes(data.tmdbId, type);
  return data;
}

/* -------------------------------- stream -------------------------------- */

function streamRequest(query) {
  const tmdbId = Number(query.tmdbId || query.id);
  if (!tmdbId) throw bad("tmdbId required");
  const mediaType = (query.mediaType || query.type) === "tv" ? "tv" : "movie";
  return {
    tmdbId,
    mediaType,
    title: query.title || "",
    titleOriginal: query.titleOriginal || "",
    year: query.year ? Number(query.year) : "",
    imdbId: query.imdbId || "",
    season: Number(query.season || 1),
    episode: Number(query.episode || 1),
    totalSeasons: query.totalSeasons ? Number(query.totalSeasons) : undefined,
  };
}

async function sourcesFor(query) {
  const req = streamRequest(query);
  const providerId = query.provider || "miami";
  const result = await stream.resolveProvider(providerId, req);
  return { ...result, request: req };
}

async function sourcesAll(query) {
  const req = streamRequest(query);
  const results = await stream.resolveAll(req);
  return { request: req, providers: results };
}

/* --------------------------------- auth --------------------------------- */

function currentUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.cookies?.token;
  const payload = auth.verify(token);
  if (!payload) return null;
  const db = store.load();
  const user = db.users[payload.sub];
  return user || null;
}

function requireUser(req) {
  const user = currentUser(req);
  if (!user) throw bad("authentication required", 401);
  return user;
}

module.exports = {
  homeFeed,
  browse,
  search,
  detail,
  sourcesFor,
  sourcesAll,
  currentUser,
  requireUser,
  streamRequest,
};
