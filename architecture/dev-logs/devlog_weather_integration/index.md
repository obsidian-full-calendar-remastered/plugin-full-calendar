# Devlog: Weather Forecast Integration

This page documents the design decisions, modular architecture, and implementation details for integrating live weather forecasts into the Obsidian Full Calendar plugin.

---

## 1. Summary

We added a live weather forecast feature to the daily, weekly, and monthly calendar views. The implementation resolves location coordinates using Open-Meteo's geocoding endpoint, retrieves forecasts dynamically for visible date ranges, and renders the data securely in daily column headers and monthly day cells. The codebase was refactored strictly under `src/features/weather/` to adhere to SOLID, DRY, and modularity principles.

---

## 2. Design Decisions & SOLID Modularity

In alignment with modularity and separation of concerns (SOLID principles):
- All weather forecasting, caching, settings UI rendering, and testing components are strictly grouped in `src/features/weather/`.
- **Weather Service (`src/features/weather/Weather.ts`)**: Acts as a decoupled domain boundary containing pure functions for forecast fetching (`fetchWeatherForecast`), WMO weather mappings (`WEATHER_MAP`), and geocoding coordinates resolution (`geocodeCity`). It is completely independent of the UI and calendar rendering lifecycle.
- **Weather Settings Component (`src/features/weather/WeatherSettings.ts`)**: Encapsulates the complete user settings UI rendering hook (`renderWeatherSettings`), including input field creation, debounced validation, semantic status feedback, and coordinates persistence.
- **Settings Delegation**: `renderGeneralSettings` in `renderGeneral.ts` simply invokes the exported hook `renderWeatherSettings(containerEl)`. This guarantees a single responsibility layout, ensuring the general tab is completely decoupled from the geocoding APIs and styling parameters.

---

## 3. Geocoding API & Coordinates Resolution

Weather forecasting requires numerical latitude and longitude coordinates. We integrated Open-Meteo's free geocoding API:
- **Endpoint**: `https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1&format=json`
- **Settings Input**: Added under the General tab with a 1-second debounce to throttle typing events.
- **Coordinates validation**: Displays real-time status feedback (e.g. `Resolving location...`, `Resolved: Lat 50.0833, Lng 14.4667`, `Could not resolve coordinates`) styled beautifully using semantic CSS classes (complying with Obsidian's strict `obsidianmd/no-static-styles-assignment` lint rules).

---

## 4. Forecast Retrieval, Caching & Clamping

To prevent hitting the Open-Meteo forecast API repeatedly during calendar navigation, we designed a robust, in-memory caching and clamping pipeline:
- **Forecast Cache**: Foreacasts are cached using a composite key: `${latitude},${longitude},${startDate},${endDate}`.
- **Date Clamping**: Open-Meteo's free forecast API restricts future forecast queries to a maximum of 16 days. To guarantee API safety and prevent requests from failing when users switch to Month view (which spans up to 42 days), we clamp the requested date ranges to at most `[today - 3 days, today + 14 days]`.

---

## 5. FullCalendar DOM Injection Pipeline

FullCalendar v5/v6 renders column headers and day cells synchronously. Since forecast retrieval is asynchronous, we implemented a non-blocking queue pipeline:
- **Synchronous Check**: When `dayHeaderDidMount` and `dayCellDidMount` are called, if the forecast for that date is already in the cache, the weather panel (week/day views) or emoji (month view) is rendered synchronously.
- **Asynchronous Queue**: If the forecast is loading, elements are registered into `pendingHeaders` and `pendingCells` lists. When the weather fetch completes, all queued elements are updated instantly in a single, flicker-free pass.
- **Grid Layout Harmony**: Daily/weekly view weather panels are styled to render as a cohesive horizontal bar directly above the all-day events row, perfectly matching the calendar's grid lines. Month view emojis are aligned to the top-left of each day cell, shifting the day number to the right.

---

## 6. Styling, Theming & ESLint Compliance

- **No static styles**: Handled status elements dynamically by assigning standard CSS classes (e.g. `.is-success`, `.is-warning`, `.is-accent`, `.is-muted`) in `styles.css` instead of setting inline styles (which violates custom Obsidian MD ESLint rules).
- **Harmony with Dark/Light Themes**: Uses Obsidian CSS variables (e.g. `var(--text-success)`, `var(--text-muted)`) so that colors are harmonized automatically when users toggle themes.

---

## 7. Premium Detailed Weather Modal & Hourly Timeline

To extend the integration without increasing API pressure, we refactored the pipeline to fetch daily and hourly data concurrently:
- **Conjoint Query**: Updated `fetchWeatherForecast` to query the forecast with:
  `&daily=weather_code,temperature_2m_max,temperature_2m_min&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m`
- **Cached In-Memory**: Hourly forecasts are parsed, aligned to the respective day (`YYYY-MM-DD` prefix string mapping), and cached in the same in-memory entry. This ensures opening the details modal consumes **zero network calls** and responds in **0ms**.
- **Unified Settings Footer**: Integrated `renderFooter` directly from `calendars/renderFooter.ts` inside `WeatherDetailModal` to keep branding, sustainability links, and bug raising buttons identical across all modals.
- **Type-safe App Resolution**: Resolved the Obsidian `App` instance safely from the mounting context by casting `activeDocument.defaultView` to `{ app?: App }`. This avoids unsafe `any` or window-based accesses that violate community guidelines, resulting in 100% linter and community compatibility.

---

## 8. Temperature Unit Configuration & Dynamic Range Display

In order to support displaying Celsius/Fahrenheit dynamically and rendering ranges in the weekly headers:
- **Settings Architecture & Load Persistence**: Added `weatherUnit: 'C' | 'F'` to the `FullCalendarSettings` interface and configured `'C'` as the system default. Updated `migrateAndSanitizeSettings` inside `utilsSettings.ts` to guarantee the property is preserved across plugin restarts.
- **Dynamic Unit Conversion**: Implemented pure, type-safe conversion utility functions `formatTemp` and `formatTempRange` in `Weather.ts` converting native Celsius values from Open-Meteo on-the-fly (`F = C * 9/5 + 32`).
- **Low-High Temperature Ranges**: Extended `injectHeaderWeather` to fetch the configured temperature unit and use `formatTempRange` to output low-high range labels (e.g. `12-22°C` or `54-72°F`) for daily headers.
- **Detail Modal Adaptation**: Updated `WeatherDetailModal.ts` to automatically format all daily summary and hourly temperatures, cleanly replacing localized `°C` suffixes in apparent temperature translations with the dynamically configured target unit when Fahrenheit is chosen.

---

## 9. Verification Coverage

### TypeScript Compilation
- **Command**: `pnpm run compile`
- **Result**: **Passed with zero errors**. All files compile successfully with proper type interfaces and clean generic structures.

### Lint Compliance
- **Command**: `pnpm run lint`
- **Result**: **Passed with zero errors and warnings**. Fully compliant with strict standard TypeScript ESLint rules and Obsidian MD policies, including zero `eslint-disable` workarounds in calendar or weather files.

### Jest Tests
- **Command**: `pnpm run test`
- **Result**: **Passed with 100% success rate**. All 56 test suites passed successfully, including the updated unit test suite (`src/features/weather/Weather.test.ts`) which validates conjoint coordinates resolution, mapping, caching, hourly data parsing, temperature conversions, range formatting, and error safety.
