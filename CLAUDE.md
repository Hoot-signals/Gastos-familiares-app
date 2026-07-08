# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page PWA (Progressive Web App) for tracking family expenses ("Gastos"), in Spanish. It is a static site with no build step and no package manager: `index.html` (markup + CSS + all JS inline in one `<script>`), `sw.js` (service worker), `manifest.json`, and the icon PNGs are the entire deployable artifact.

The backend is **not in this repository**. It's a separate Google Apps Script project, deployed as a Web App, that reads/writes a Google Sheet used as the datastore (one Sheet per year). The frontend only knows it as a URL entered in Ajustes (Settings) — there is no server code, schema, or deployment config to find here.

## Commands

There is no `package.json`, build tool, linter, or test suite in this repo. Development is edit-and-reload:

- **Local run**: serve the directory over HTTP (not `file://`, since the service worker requires a real origin), e.g. `npx serve .` or `python -m http.server`, then open `index.html`.
- **Deploy**: upload/push `index.html`, `sw.js`, `manifest.json`, and the icon files as-is to the static host (e.g. GitHub Pages). Paths are root-relative (`scope: "./"` in the manifest), so the app must be served from the root of whatever path it's hosted at.
- **Cache busting**: `sw.js` has a `CACHE` constant (currently `'gastos-v5'`) that must be bumped by hand whenever the asset list (`ASSETS`) or cached-asset content changes meaningfully — the service worker deletes any cache key that doesn't match `CACHE` on activate, so an unbumped version means clients may keep serving a stale cached icon/manifest (the HTML itself is network-first, see below, so it always updates).

## Architecture

**Single file, three tab views.** `index.html` renders three `<main>` views (`quick` = fast keypad entry, `act` = recent activity, `dash` = monthly analysis/charts) toggled by `switchView()`; there's no router or framework, just `view-hidden` class toggling and per-view `enter*()` functions that lazily render from cache and then refresh.

**Data layer (`DL`)**: a single IIFE object is the one source of truth for all three views. It holds an in-memory (not persisted) cache of `{rows, monthly, registroGid, lastRow}` fetched from the backend, follows a stale-while-revalidate pattern (`DL.ensure()`/`DL.refresh()` return cached data instantly, then reconcile after a network round-trip), and exposes optimistic local patch helpers (`patchAdd`, `patchUpdate`) so the UI updates immediately on save/edit before the server round-trip confirms. All monthly/category aggregates (`computeMonthly`, ranking, YTD, YoY) are computed client-side from raw `rows` on every render — the backend is only asked for raw rows plus a `monthly` field (used for the previous-year comparison sheet, since that data doesn't need to be reactive).

**Backend contract** (implemented in the external Apps Script project, not here):
- `GET {webapp}?token=...&sheetId=...` → `{ok, rows, monthly, registroGid, lastRow}` for the configured year's Sheet.
- `GET {webapp}?token=...&sheetId=...&mode=grid` → `{ok, monthly}` for the previous-year Sheet (YoY comparison only).
- Writes go through `apiSet()` → `postJSON(webapp, payload({action, ...}))` with `action` one of: `quick` (new entry from the keypad), `update`, `update-amount`, `update-concept`, `update-date`, `delete` (soft delete: server sets `importe: 0, concepto: '(anulado)'` rather than removing the row — client mirrors this via `DL.patchUpdate`).
- Auth is a single shared secret string ("palabra secreta"/`token`) configured once in Ajustes and sent on every request; there is no per-user login. "Persona" (Miguel/Maribel/custom name) is just a label stored in `localStorage` and attached to new entries — both people share the same Sheet and secret.

**Fixed (previously a known gap)**: `postJSON` and `payload` were called (`apiSet`, and the quick-add confirm handler) but not defined anywhere in `index.html`, which threw a `ReferenceError` on every save/edit/delete. They're now defined near `toast()`: `payload(extra)` merges `token` and `sheetId` (same values the GET requests already use) into the action object; `postJSON(url, data)` POSTs it with `Content-Type: text/plain` (avoids a CORS preflight Apps Script doesn't handle). This was verified by actually driving the quick-add and edit flows in a simulated browser (jsdom), not just read — before the fix both paths threw `ReferenceError: postJSON is not defined` (silently swallowed as a misleading "No se pudo guardar" toast on quick-add; a fully silent unhandled rejection with zero UI feedback on edit/delete). The exact response shape the Apps Script backend must return per `action` (e.g. the full row echoed back on `quick`) was inferred from how the client uses the result, not read from the Apps Script source — verify against the actual `doPost` handler if saves still misbehave.

**Categories** are hardcoded client-side: `CATEGORIAS` (the full list), `EMO` (emoji per category), `INGRESO_CATS` (which categories count as income vs. expense for aggregation), `OCULTAR_RANKING` (categories excluded from the ranking/chart display but still counted in totals), and `SHORT` (abbreviated labels for the quick-entry tiles). The quick-entry category tiles (`catsAprendidas`) are the user's 8 most-used categories learned from their own historical rows, padded with `DEFAULT_QUICK` if needed — there's no persisted "favorites" setting.

**Year rollover**: each Sheet covers one calendar year. Ajustes holds the current year's Sheet URL (`cfgSheet`) and an optional previous year's (`cfgSheetPrev`) used only for the YoY comparison stats/chart overlay in the Análisis tab. The Web App URL and secret token stay fixed across years; only the Sheet link changes.

**Service worker (`sw.js`)** strategy: network-first for navigations and `index.html` itself (so app updates are picked up immediately), cache-first for everything else in `ASSETS` (icons, manifest), and an explicit bypass (`return` before `respondWith`) for any request whose hostname includes `script.google` or `googleusercontent` — backend calls are never cached or served offline.

# Gastos Familiares — contexto del proyecto

## Qué es
PWA (Progressive Web App) para registrar gastos familiares por voz/texto,
que sincroniza con Google Sheets. Sin frameworks: HTML/CSS/JS puro.

## Stack
- `index.html` — toda la interfaz y lógica del frontend (una sola página)
- `sw.js` — service worker (caché offline)
- `manifest.json` — configuración de instalación como app
- Backend: Google Apps Script (fuera de este repo, vive en el Sheet)
- Hosting: Vercel (deploy automático desde `main`)
- Repo: GitHub

## Flujo de git (importante)
- Este repo está conectado a Vercel: cualquier push a `main` se publica
  automáticamente en producción.
- NUNCA trabajes directamente en `main`. Antes de cualquier cambio, crea
  una rama nueva con nombre descriptivo (ej. `feature/nombre-del-cambio`)
  y trabaja ahí.
- Antes de aplicar cambios importantes, explica el impacto y espera mi
  aprobación explícita.
- Cuando yo apruebe, haz commit con un mensaje claro y push de la rama
  (nunca de `main`).
- NUNCA fusiones (merge) a `main` tú solo — eso lo hago yo manualmente en
  GitHub tras revisar el PR.

## Convenciones
- Todo el texto de la interfaz está en español.
- Los estilos usan variables CSS definidas en `:root` (no hardcodear colores).
- No añadas dependencias/frameworks externos sin preguntar antes.

## No tocar sin avisar
- La estructura de categorías (`CATEGORIAS`) — afecta datos ya guardados
  en el Sheet.
