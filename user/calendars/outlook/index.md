# Outlook Calendar

Easily add, edit, and delete events from your Microsoft Outlook calendars in Full Calendar.

!!! tip "Power Up with Categories"
    Google Calendar events fully support [Advanced Categories](../events/categories.md). Use a title like `Personal - Doctor` to automatically apply your "Personal" color and styling.

!!! warn "Not possible for Work / Institutional Calendars"
    Due to Microsoft policies, adding a work or institutional calendar will not be possible. See [here](#note-for-institutional-university-accounts) for more details

## What This Source Supports

- Read events from Outlook calendars
- Create, update, and delete single events
- Multi-account support via connected Outlook accounts
- **Video Conferencing & Links**: Automatically extracts MS Teams/Zoom/etc. meeting URLs from `onlineMeetingUrl` and maps them directly to location/description fields (rendered as clickable links in the [Event Details modal](../events/manage.md#video-conference--linkification-support); see [Video Conference & Linkification Support](../events/manage.md#video-conference--linkification-support)).

Current limitation:

- Recurring single-instance overrides are not yet supported for Outlook sources

## Setup

1. Open Full Calendar settings.
2. Go to Integrations and open Outlook Accounts.
3. Configure credentials mode:
   - Default mode uses built-in client/proxy defaults.
   - Optional custom mode lets you enter your own Microsoft Client ID and proxy URL.
4. Connect an Outlook account.
5. Return to Calendars and add Outlook calendars from the connected account.

## Naming and Account Differentiation

When selecting calendars, Full Calendar stores source names as:

- CalendarName (account@domain.com)

This helps distinguish calendars when multiple Outlook accounts are connected.

## Note for Institutional & University Accounts

If you are using a work or university Microsoft account, you may encounter a "Need admin approval" screen.

#### Why this happens
* **Security Policy:** Many organizations disable "User Consent" for unverified applications to protect institutional data.
* **Unverified Status:** To become a "Verified Publisher," Microsoft requires developers to:
    * Register a **legal business entity** (LLC, etc.).
    * Provide official **tax and business registration** documents.
    * Pay for and maintain a **verified custom domain** (standard `.onmicrosoft.com` or `github.io` domains are strictly prohibited).

> Official requirements are documented here: [Microsoft Publisher Verification Overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview) and [Partner Center Verification Responses](https://learn.microsoft.com/en-us/partner-center/verification-responses).

Clearly, this is a significant burden on **free, open-source project**, and the legal and financial bureaucracy will NOT be undertaken in the forseeable future. 

#### Solutions
1. **Personal Accounts:** Standard `@outlook.com` or `@hotmail.com` accounts will work fine; simply click **"Continue anyway"** on the warning screen.
2. **Request Access:** You can click "Request Approval" on the error screen to ask your IT admin to whitelist the app, though many institutions automatically deny these requests for third-party hobby tools.

## Troubleshooting

*   **Outlook Setup:** See the [Central Troubleshooting Guide](../guides/troubleshooting.md#outlook-calendar) for help with custom app configuration, redirect URI issues, or missing events.
*   **Android and iOS Authentication Workaround:** For step-by-step instructions on authenticating Outlook accounts on mobile devices using vault synchronization, see [Mobile Authentication Workaround](../guides/troubleshooting.md#mobile-authentication-workaround).
