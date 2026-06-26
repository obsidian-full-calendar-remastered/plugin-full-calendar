# Share Availability

The **Share Availability** feature allows you to calculate and share your available time slots with clients and colleagues. You can generate a clean local Markdown schedule in your vault, or upload a secure online availability page hosted via GitHub Gist.

---

## Output Formats

### 1. Local Markdown Document
Choosing **Export as Markdown File** creates a formatted `.md` schedule directly in your vault. 
- Grouped by day with emojis (✨ for available slots, 🟥 for busy times).
- Uses your display timezone configurations by default.
- Automatically opens the document in a new workspace pane.

### 2. Live Web Link
Choosing **Generate Web Link** uploads your anonymized daily schedule to a secret, unlisted GitHub Gist under your own account.
- **Zero Server Storage**: Your calendar slots are fetched client-side directly from GitHub. None of your data resides on our servers.
- **Timezone Conversion**: Viewers can toggle between your timezone and their local browser timezone.
- **Interactive Booking**: Viewers can click any available time slot to generate a copyable text booking request.

---

## Configuration

> [!NOTE]
> All availability calculations automatically ignore all-day events (such as birthdays and holidays) so they do not block your weekly schedule.

### Setup Settings
You can set default options by opening **Settings** -> **Full Calendar** -> [Integrations](file:///d:/Codes/plugin-full-calendar/src/ui/settings/SettingsTab.tsx#L743):
- **Default Export Path**: Specify a default folder for your Markdown files.
- **Default Daily Time Range**: Pre-populate daily start and end hours (e.g., `09:00` to `17:00`).
- **GitHub Personal Access Token**: Input your token to enable web sharing. 

> [!IMPORTANT]
> To share schedules online, you must supply a GitHub token with the `gist` permission. You can generate a pre-configured token in one click using the helper link in the settings panel or the share dialog.

### Date Range Performance Warning
When generating availability, selecting a date range longer than **90 days** will cause a warning notice to display in the modal. This is a reminder that computing available slots day-by-day over very large intervals can cause temporary performance degradation in Obsidian. You are still allowed to proceed if needed.
