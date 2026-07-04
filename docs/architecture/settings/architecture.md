# Settings Architecture

This page describes how settings are modeled and applied.

## Core Components

- Settings model and defaults: `src/types/settings.ts`
- Plugin settings lifecycle: `src/main.ts`
- Settings UI composition: `src/ui/settings/SettingsTab.tsx`
- Feature-level settings renderers: `src/features/*/ui/*`
- Calendar source list management: `src/ui/settings/sections/calendars/CalendarSetting.tsx`

## Design Boundaries

- Settings schema remains the single typed source of truth.
- Features own their setting UI and behavior handlers.
- Settings updates propagate to views, cache, and providers.
- If a setting is exposed in more than one UI location, each control must write the same typed settings field and trigger the same downstream refresh path. For example, the Tasks backlog date-field selector in Settings and in the Tasks Backlog view both write `tasksIntegration.backlogDateTarget` and refresh backlog views through the provider registry.
- **Open Daily Note on click**: The `openDailyNoteOnDateClick` setting enables/disables navigation from calendar header date labels and Month view day number links to Obsidian Daily Notes. The click handler stops event propagation to prevent triggering the month view create event modal.

## Debounced Settings Save and Flush Lifecycle

To optimize disk performance and prevent write race conditions on `data.json` during rapid inputs (e.g., text/textarea settings), the plugin uses a unified debouncing save queue in `PluginState`:

- **Immediate Save (`PluginState.saveSettings(true)`)**: Cancels any scheduled debounced save and writes the settings to disk immediately.
- **Debounced Save (`PluginState.saveSettings(false)`)**: Schedules a write to disk after 500ms of inactivity. Subsequent calls to debounced save reschedule the timer and coalesce the underlying promise so that the caller can wait for the actual file write.
- **Save Flushing (`PluginState.flushDebouncedSave()`)**: Immediately triggers a save to disk if there is any scheduled save pending.

This lifecycle is automatically integrated into the following unmount and closing points:
- **Settings Tab Unmount**: `FullCalendarSettingTab.hide()` flushes any pending debounced save when the Obsidian settings tab is closed.
- **Modals Close**: Settings modals (e.g., `TasksIntegrationSettingsModal`, `AvailabilitySettingsModal`) call `flushDebouncedSave()` inside their `onClose()` methods.

## Calendar Source Auto-Save

Calendar source configurations use an **auto-save** pattern — there is no manual "Save" button. Every edit to the calendar source list is persisted to `data.json` automatically, using a dual-strategy approach:

| Change Type        | Strategy         | Rationale                                              |
|--------------------|------------------|--------------------------------------------------------|
| Add calendar       | Immediate save   | PluginState must reflect the new source before the next ID generation call to prevent duplicate IDs. |
| Delete calendar    | Immediate save   | The provider registry and settings must stay in sync.   |
| Rename calendar    | Debounced (500ms) | Coalesces rapid keystrokes into a single disk write.   |
| Change color       | Debounced (500ms) | Coalesces rapid color picker adjustments.              |

### Why Auto-Save?

The previous design used a deferred "Save" button in the `CalendarSettings` React component. This created a window where:

1. **Duplicate IDs**: Calendar sources added to React state but not yet persisted to `PluginState` were invisible to the `generateCalendarId()` function, causing duplicate `local_2`, `local_2`, etc.
2. **Data loss**: Users could close settings without clicking Save, losing their calendar additions.
3. **State divergence**: React component state, `ProviderRegistry.sources`, and `PluginState.getSettings().calendarSources` could all disagree.

Auto-save eliminates these gaps by ensuring `PluginState` is always the single source of truth for calendar source configuration.

### Unmount Safety

The `CalendarSettings` component flushes any pending debounced save in its `componentWillUnmount()` lifecycle method. This ensures that if the user closes the settings tab while a name/color edit is pending, the change is not lost.

### Validation

- **Dailynote limit (max 1)**: Enforced at add-time in the `addCalendarButton` handler (`SettingsTab.tsx`), not at save-time. The user is shown a notice and the add is rejected before the source enters state.
- **Dailynote format choice**: The Daily Note source captures its timed-event write format at add-time as source config (`default` or `dayPlanner`). The selected value controls future writes for that provider instance, while parsing remains format-agnostic and does not use a separate read-mode switch.

## Integration Settings Visibility Contract

- Integration sections should be discoverable even when a provider source is not yet configured.
- TaskNotes integration follows this rule: it always renders in Settings → Integrations.
- If no TaskNotes source exists, the integration section provides a guided prompt to add a TaskNotes source first.
- When configured, integration controls update source-level settings (`dispatchMode`) and persist through the standard settings save path.

## Credential Storage and Keychain Migration

To protect sensitive keys and user session data, Full Calendar isolates credential storage using a bi-directional migration system:

- **Storage Manager**: [CredentialStore](../../../src/features/credentials/CredentialStore.ts) wraps all access to tokens and passwords. It queries the `useLegacyPlaintextCredentials` setting to determine whether to read/write to Obsidian's `secretStorage` or fallback to the plaintext `data.json`.
- **Bi-directional Migration Pipeline**: Inside [utilsSettings.ts](../../../src/ui/settings/utilsSettings.ts), the pure `migrateAndSanitizeSettings(settings)` hook is invoked during settings load and save. It automatically:
  - Moves raw settings credentials to the OS keychain and nullifies them in the state if legacy mode is disabled.
  - Pulls credentials from the OS keychain back into settings if legacy mode is enabled.
- **Modular Renderer**: Setting UI and user-facing controls are decoupled from the main settings view and rendered via [renderCredentialsSettings.ts](../../../src/features/credentials/ui/renderCredentialsSettings.ts).
- **Localization**: UI warning strings are localized in [en.json](../../../src/features/i18n/locales/en.json) via `settings.credentials.keychainMissing`.

## Related User Docs

- [Calendar Sources](../../user/settings/sources.md)
- [Display and Behavior](../../user/settings/fc_config.md)
- [Reminders and Notifications](../../user/features/reminders.md)
- [API and Security Settings](../../user/settings/api.md)
