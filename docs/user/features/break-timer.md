# Break Timer

The **Break Timer** is a wellness feature designed to help you avoid strain and maintain healthy habits by periodically reminding you to step away from your screen.

> Inspiration and asset credits by [zokuzoku/cat-gatekeeper](https://github.com/zokuzoku/cat-gatekeeper) under MIT license.

## How it works

Once enabled, the Break Timer monitors your active computer usage within Obsidian. When the configured break interval is reached, it:
1. Triggers a native system desktop notification warning you that it's time for a break.
2. Displays a fullscreen, glassmorphic overlay over your entire Obsidian window.

### Fullscreen Overlay & ASCII Art

The fullscreen overlay contains:
- An animated walking **ASCII Cat** walking back and forth across the screen.
- A **30-second countdown** progress bar.
- A **Skip break** button which immediately closes the overlay and resets the timer in case you are in the middle of urgent work.

If you let the countdown run to 0, the break ends naturally, the overlay is dismissed, and the next break is scheduled.

## Smart Inactivity Detection

The timer is designed to be intelligent:
- If you step away from your computer (e.g. go idle) for longer than your **Idle reset threshold** (defaulting to 30 minutes), the break timer automatically resets.
- When you return to Obsidian, the countdown starts fresh, ensuring you aren't immediately hit with a break overlay after having just been away.
- It dynamically tracks activity across all focused pane layouts, main panels, and popout windows using advanced event capture listeners.

## Settings & Configuration

You can customize the Break Timer behavior in **Settings > General > Break Timer**:

- **Enable break timer**: Toggle the feature on or off.
- **Break interval (minutes)**: The duration of active computer use before a break is triggered (default: `60`).
- **Idle reset threshold (minutes)**: The time of inactivity after which the break countdown resets to full duration (default: `30`).
- **Break duration (seconds)**: How long the break overlay displays on the screen before auto-dismissing (default: `30`).

## Command Palette Shortcuts

You can force-trigger a break at any time using Obsidian's command palette (`Ctrl + P` or `Cmd + P`) and running:
- `Trigger break timer overlay`
