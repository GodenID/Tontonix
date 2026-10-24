import {
  homePage, browsePage, searchPage, detailPage, listPage, authPage, accountPage, legalPage, helpPage, notFoundPage,
} from "./pages.js";
import { watchPage } from "./player.js";

function parsePath(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  return segments;
}

export async function render() {
  const url = new URL(window.location.href);
  const parts = parsePath(url.pathname);
  const params = url.searchParams;
  const main = document.getElementById("main");

  try {
    if (parts.length === 0) {
      await homePage({});
      document.title = "Tontonix - Watch Free Movies & TV Shows Online";
    } else if (parts[0] === "browse" && parts[1]) {
      await browsePage({ type: parts[1] }, params);
      document.title = `Tontonix - ${parts[1] === "tv" ? "TV Shows" : parts[1] === "anime" ? "Anime" : "Movies"}`;
    } else if ((parts[0] === "movie" || parts[0] === "tv") && parts[1]) {
      await detailPage({ type: parts[0], id: parts[1] });
      document.title = "Tontonix";
    } else if (parts[0] === "watch" && parts[1] && parts[2]) {
      await watchPage({ type: parts[1], id: parts[2] }, params);
      document.title = "Tontonix - Player";
    } else if (parts[0] === "search") {
      await searchPage({}, params);
      document.title = "Tontonix - Search";
    } else if (parts[0] === "watchlist") {
      await listPage("watchlist");
      document.title = "Tontonix - Watchlist";
    } else if (parts[0] === "history") {
      await listPage("history");
      document.title = "Tontonix - History";
    } else if (parts[0] === "login") {
      await authPage("login");
      document.title = "Tontonix - Sign in";
    } else if (parts[0] === "signup") {
      await authPage("signup");
      document.title = "Tontonix - Sign up";
    } else if (parts[0] === "account") {
      await accountPage();
      document.title = "Tontonix - Account";
    } else if (parts[0] === "legal" && parts[1]) {
      legalPage(parts[1]);
      document.title = `Tontonix - ${parts[1]}`;
    } else if (parts[0] === "help") {
      helpPage();
      document.title = "Tontonix - Help";
    } else {
      notFoundPage();
    }
    void main;
  } catch (err) {
    console.error(err);
    document.getElementById("app").innerHTML = `<div class="container"><div class="empty-state" style="padding-top:120px"><h3>Something broke</h3><p>${String(err.message || err)}</p><a class="btn btn-secondary" href="/">Back home</a></div></div>`;
  }
}

export function navigate(path) {
  if (path === window.location.pathname + window.location.search) return;
  history.pushState({}, "", path);
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  render();
}

window.__navigate = navigate;

window.addEventListener("popstate", () => {
  window.scrollTo(0, 0);
  render();
});

document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const anchor = e.target.closest("a");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (!href || !href.startsWith("/") || href.startsWith("/img") || href.startsWith("/v1")) return;
  if (anchor.target && anchor.target !== "_self") return;
  e.preventDefault();
  navigate(href);
});

render();
