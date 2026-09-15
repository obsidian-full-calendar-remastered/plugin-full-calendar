# FullCalendar Interop

!!! abstract "Interop boundary"
    The plugin runtime uses internal `OFCEvent` objects, while the view layer uses FullCalendar event primitives. `core/interop.ts` is the translation boundary between those two worlds.

## Why interop is independent core logic

Interop is not UI glue; it is a correctness boundary. It controls how recurrence, all-day semantics, category presentation, and timezone-aware fields are represented when crossing between internal state and FullCalendar runtime APIs.

## Core conversion paths

| Direction | Function | Purpose |
|---|---|---|
| Internal -> FullCalendar | `toEventInput` | Converts canonical event state into renderable FullCalendar input, including recurrence and display properties. |
| FullCalendar drag/resize -> internal | `dateEndpointsToFrontmatter` and related helpers | Converts user-edited date endpoints into internal event shape fields for cache mutation. |

## Recurrence and timezone handling in interop

Interop logic builds recurrence payloads and validates recurrence shape before rendering. Time values are parsed/combined carefully so edited event endpoints return deterministic internal fields instead of UI-library-specific artifacts.

## Category and display mapping

When advanced categorization is enabled, interop maps category/subcategory display, color resources, and timeline resource IDs so the visual model stays aligned with normalized event metadata.

!!! warning "Contract"
    Interop should never become a second source of truth. It translates representations; ownership of event state and mutation policy remains in `EventCache`.

## Integration anchors

- `src/core/interop.ts`
- `src/ui/view.ts`
- `src/core/EventCache.ts`
