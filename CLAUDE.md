# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Framework

Este proyecto usa el **Claude Framework** como referencia central.
Ruta local: `C:\Users\Usuario\Desktop\Claude-framework`. Aplican sus principios y proceso
(ver su `CLAUDE.md`); lo de abajo es lo específico de esta app.

## What this is

A single-page PWA (Progressive Web App) for tracking family expenses ("Gastos"), in Spanish. It is a static site with no build step and no package manager: `index.html` (markup + CSS + all JS inline in one `<script>`), `sw.js` (service worker), `manifest.json`, and the icon PNGs are the entire deployable artifact.

The backend is **not in this repository**. It's a separate Google Apps Script project, deployed as a Web App, that reads/writes a Google Sheet used as the datastore (one Sheet per year). The frontend only knows it as a URL entered in Ajustes (Settings) — there is no server code, schema, or deployment config to find here.

## Commands

There is no `package.json`, build tool, linter, or test suite in this repo. Development is edit-and-reload:

- **Local run**: serve the directory over HTTP (not `file://`, since the service worker requires a real origin), e.g. `npx serve .` or `python -m http.server`, then open `index.html`.
- **Deploy**: upload/push `index.html`, `sw.js`, `manifest.json`, and the icon files as-is to the static host (e.g. GitHub Pages). Paths are root-relative (`scope: "./"` in the manifest), so the app must be served from the root of whatever path it's hosted at.
- **Cache busting**: `sw.js` has a `CACHE` constant (currently `'gastos-v7'`) that must be bumped by hand whenever the asset list (`ASSETS`) or cached-asset content changes meaningfully — the service worker deletes any cache key that doesn't match `CACHE` on activate, so an unbumped version means clients may keep serving a stale cached icon/manifest (the HTML itself is network-first, see below, so it always updates).

## Architecture

**Single file, three tab views.** `index.html` renders three `<main>` views (`quick` = fast keypad entry, `act` = recent activity, `dash` = monthly analysis/charts) toggled by `switchView()`; there's no router or framework, just `view-hidden` class toggling and per-view `enter*()` functions that lazily render from cache and then refresh.

**Data layer (`DL`)**: a single IIFE object is the one source of truth for all three views. It holds an in-memory (not persisted) cache of `{rows, prevYear, at}` fetched from the backend, follows a stale-while-revalidate pattern (`DL.ensure()`/`DL.refresh()` return cached data instantly, then reconcile after a network round-trip), and exposes optimistic local patch helpers (`patchAdd`, `patchUpdate`) so the UI updates immediately on save/edit before the server round-trip confirms. `patchAdd`/`patchUpdate` also queue themselves for replay if they land while a `refresh()` is in flight, so an optimistic edit can't be silently clobbered by a refresh that was fetched before the edit existed. All monthly/category aggregates (`computeMonthly`, ranking, YTD, YoY) are computed client-side from raw `rows` on every render — the backend is only asked for raw rows plus `prevYear` (previous year's monthly totals, used only for the YoY comparison stats/chart, since that data doesn't need to be reactive).

**Backend contract** (implemented in the external Apps Script project, not here — see `gastosx-backend-standalone.gs` and `gastosx-sheet-gasto-function.gs` in this repo, versioned for safety but deployed manually via the Apps Script UI, not by pushing here):
- `GET {webapp}?token=...&sheetId=...` → `{ok, rows, prevYear}` for the configured year's Sheet. `prevYear` (`{gastos:[12], ingresos:[12]}` or `null`) is read from a "Global Año" tab inside that *same* Sheet — there is no second Sheet URL or `mode=grid` request; YoY comparison never needed `cfgSheetPrev` in this client.
- Writes go through `apiSet()` → `postJSON(webapp, payload({action, ...}))` with `action` one of: `quick` (new entry from the keypad), `quick-batch` (several installments/cuotas at once, one entry per month picked), `update`, `update-amount`, `update-concept`, `update-date`, `delete` (soft delete: server sets `importe: 0, concepto: '(anulado)'` rather than removing the row — client mirrors this via `DL.patchUpdate`). An unrecognized `action` returns `{ok:false, error}` — there is no free-text/chat parsing fallback (removed 2026-07-19: it was dead code, nothing in the client ever sent raw text).
- Auth is a single shared secret string ("palabra secreta"/`token`) configured once in Ajustes and sent on every request, checked fail-closed server-side (no `APP_TOKEN` configured in Script Properties = every request rejected, not accepted); there is no per-user login. "Persona" (Miguel/Maribel/custom name) is just a label stored in `localStorage` and attached to new entries — both people share the same Sheet and secret.

**Fixed (previously a known gap)**: `postJSON` and `payload` were called (`apiSet`, and the quick-add confirm handler) but not defined anywhere in `index.html`, which threw a `ReferenceError` on every save/edit/delete. They're now defined near `toast()`: `payload(extra)` merges `token` and `sheetId` (same values the GET requests already use) into the action object; `postJSON(url, data)` POSTs it with `Content-Type: text/plain` (avoids a CORS preflight Apps Script doesn't handle). This was verified by actually driving the quick-add and edit flows in a simulated browser (jsdom), not just read — before the fix both paths threw `ReferenceError: postJSON is not defined` (silently swallowed as a misleading "No se pudo guardar" toast on quick-add; a fully silent unhandled rejection with zero UI feedback on edit/delete). The exact response shape the Apps Script backend must return per `action` (e.g. the full row echoed back on `quick`) was inferred from how the client uses the result, not read from the Apps Script source — verify against the actual `doPost` handler if saves still misbehave.

**Categories** are hardcoded client-side: `CATEGORIAS` (the full list), `EMO` (emoji per category), `INGRESO_CATS` (which categories count as income vs. expense for aggregation), `OCULTAR_RANKING` (categories excluded from the ranking/chart display but still counted in totals), and `SHORT` (abbreviated labels for the quick-entry tiles). The quick-entry category tiles (`catsAprendidas`) are the user's 8 most-used categories learned from their own historical rows, padded with `DEFAULT_QUICK` if needed — there's no persisted "favorites" setting.

**Year rollover**: each Sheet covers one calendar year. Ajustes holds only the current year's Sheet URL (`cfgSheet`) — there is no separate previous-year Sheet setting in the client. The YoY comparison (Análisis tab) comes from a "Global Año" tab inside that *same* Sheet (see Backend contract above); how that tab gets last year's numbers each January is an external/manual step on the Sheet side, not something this app writes. The Web App URL and secret token stay fixed across years; only the Sheet link changes.

**Service worker (`sw.js`)** strategy: network-first for navigations and `index.html` itself (so app updates are picked up immediately), cache-first for everything else in `ASSETS` (icons, manifest), and an explicit bypass (`return` before `respondWith`) for any request whose hostname includes `script.google` or `googleusercontent` — backend calls are never cached or served offline.

**PIN lock (`Lock` module)**: opt-in, per-device access restriction, since the app shows family expense data directly (more exposed than the old Sheets link, which required navigating to a document). A 4-digit PIN encrypts `{webapp, sheet, token}` in `localStorage` with AES-GCM (key derived via PBKDF2-SHA256, 150k iterations); with no PIN configured the app behaves exactly as before (plaintext config, no lock screen) — nothing changes for a device that never activates one.
- `Lock.hasPin()` checks for a stored salt; `Lock.setup(pin, data)` / `Lock.unlock(pin)` / `Lock.reencrypt(key, data)` / `Lock.clear()` are the only entry points — never read `localStorage['cfgEnc']` etc. directly.
- The lock screen (`#lockScreen`, gated by `Lock.hasPin()` at boot) only appears on a cold launch. Once unlocked, `sessionSecrets` (decrypted config) and `sessionKey` (the derived `CryptoKey`) live in plain JS variables for the rest of that page session — switching tabs or briefly backgrounding the PWA does not re-prompt, only a full reload/relaunch does.
- Ajustes → "Guardar" re-encrypts with the cached `sessionKey` when a PIN is active, so the documented January Sheet-link rotation doesn't require re-entering the PIN. "Activar/Cambiar PIN" is the only action that derives a *new* key (needs the PIN typed twice). "Quitar" reverts to plaintext storage. "He olvidado el PIN" (on the lock screen) wipes the local encrypted config/PIN for that device only — it does not touch the Google Sheet.
- Each phone sets its own PIN independently (localStorage isn't shared across devices); there's no coordination needed between Miguel's and Maribel's phones.

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
- Se trabaja directamente sobre `main`, sin ramas ni PRs intermedios —
  cada push despliega al momento.
- Antes de aplicar cambios importantes, explica el impacto (qué cambia,
  qué riesgo tiene) y espera aprobación explícita antes de hacer commit.
- Una vez aprobado, haz commit con un mensaje claro y push directo a
  `main`.

## Convenciones
- Todo el texto de la interfaz está en español.
- Los estilos usan variables CSS definidas en `:root` (no hardcodear colores).
- No añadas dependencias/frameworks externos sin preguntar antes.

## No tocar sin avisar
- La estructura de categorías (`CATEGORIAS`) — afecta datos ya guardados
  en el Sheet.
