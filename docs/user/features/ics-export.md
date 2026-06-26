# Export Event Cache as ICS

The **Export Event Cache** feature allows you to export your calendar events as a standard `.ics` (iCalendar) file, which can be imported into external calendar software such as Google Calendar, Microsoft Outlook, Apple Calendar, or any other client that supports the iCalendar format.

---

## How to Export

1. Open the Obsidian Command Palette (`Ctrl+P` or `Cmd+P`).
2. Search for and select the command: **Export Event Cache as ICS file**.
3. A configuration modal will open:
   - **Export File Name**: Customize the name of the exported file (defaults to `full-calendar-export-<yyyyMMdd-HHmmss>.ics`).
   - **Target Vault Folder**: Specify a folder in your vault where the file will be saved.
   - **Calendars to Include**: Toggle individual calendars on or off to select exactly which events should be included in the export.
4. Select one of the export options:
   - **Save to Vault**: Saves the `.ics` file directly into your vault at the target folder path. If the file already exists, it will be overwritten.
   - **Download ICS File**: Triggers a browser-level file download to save the `.ics` file directly to your system's download folder.
   - **Cancel**: Closes the dialog without exporting.

---

## Configuration

You can configure the default folder for exported `.ics` files in the settings tab:
1. Open **Settings** -> **Full Calendar** -> **Integrations**.
2. Locate the **ICS Export** section.
3. Edit the **Default Export Path** setting to specify the vault folder (e.g., `calendars/exports`). If left blank, files will be saved in the root directory of your vault.
