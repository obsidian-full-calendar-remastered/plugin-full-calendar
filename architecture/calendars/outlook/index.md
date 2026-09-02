# Outlook Provider Architecture

## Scope

Outlook provider integrates Microsoft Graph calendar APIs into the provider contract used by EventCache and ProviderRegistry.

Key implementation files:

- `src/providers/outlook/OutlookProvider.ts`
- `src/providers/outlook/parser/parser_outlook.ts`
- `src/providers/outlook/auth/auth.ts`
- `src/providers/outlook/auth/OutlookAuthManager.ts`
- `src/providers/outlook/auth/config.ts`
- `src/providers/outlook/ui/OutlookConfigComponent.tsx`

## Authentication Model

The provider uses OAuth Authorization Code with PKCE.

Flow:

1. Plugin generates PKCE verifier/challenge and state.
2. Browser opens Microsoft authorize endpoint.
3. Local callback listener receives `code` and `state`.
4. Plugin calls proxy `/api/microsoft/token` with PKCE verifier.
5. Tokens are persisted in `microsoftAccounts` settings.
6. Refresh flow uses proxy `/api/microsoft/refresh`.

Auth config resolution is centralized in `auth/config.ts` to avoid duplicated branching logic.

## Data Mapping

Provider reads from Graph `calendarView` and maps Graph events to `OFCEvent`:

- `subject` -> `title`
- `start`/`end` -> `date`, `startTime`, `endTime`, `endDate`
- `seriesMasterId` -> `recurringEventId` (normalized to `undefined` when null)
- all-day events map to inclusive internal end-date semantics

For write operations, `toOutlookEvent` maps `OFCEvent` back to Graph payloads.

## Provider Behavior

Capabilities:

- canCreate: true
- canEdit: true
- canDelete: true

Current constraint:

- `createInstanceOverride` is intentionally unsupported and returns a rejected Promise

## Configuration UX

Outlook setup uses a two-step modal:

1. Select connected account (or connect new account)
2. Select one or more calendars from that account

Saved source naming includes account email to prevent ambiguity across accounts.

## Integration Boundaries

- Provider exposes only contract-compliant events to core
- Registry remains the single routing surface
- No provider-specific branching is introduced in EventCache mutation path
