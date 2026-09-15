# Milestones and Progress

!!! success "Philoscopy"
    Milestone provides a transparent overview of your usage across all the plugin features, but more importantly it tells you **what new features you are NOT using**, and potentially should look into for maximizing productivity. 

## Accessing Milestones

=== "FCR Command (Fastest)"

    The absolute fastest way to view your progress is to use the **[FCR Command](nlp.md)**. Just open the command palette (`Ctrl/Cmd + P`), select the FCR Command, and type `open milestones` or `show achievements`.

=== "Settings Menu"

    1. Open **Full Calendar Settings**.
    2. Navigate to the **Appearance** tab.
    3. Click the gear icon next to Milestones to open the dedicated page.
    4. Click **Back to settings** at the top when you are finished.

## Dashboard Overview

The Milestones dashboard provides a beautifully crafted view of your calendar journey. It displays interactive **Milestone cards** that automatically sort your unlocked achievements to the top. Each card features a clear **status badge**, descriptive target text, and a visual **progress bar** paired with a precise numeric label to track exactly how close you are to your next goal.

## Progression Mechanics

Your progress securely updates in the background after every successful, provider-backed operation. 

!!! info "Tracked Operations"
    Creating, updating, moving, or deleting events will increment your milestone counters. To ensure fairness, canceled operations, provider failures, and optimistic rollbacks do not inflate your stats.

**Comprehensive Source Coverage:**
Whether you're scheduling in [Local](../calendars/local.md) or [Daily Note](../calendars/dailynote.md) calendars, syncing with remote sources like Google and CalDAV, or managing productivity via [TaskNotes](../calendars/tasknotes.md), your activity counts. The system even evaluates behavioral metadata, rewarding advanced usages like recurring-series creation, heavy [NLP](nlp.md) utilization, distinct timezone tracking, and consistent daily streaks.

## Achievement Notifications

When your hard work pays off and a milestone unlocks, you will be celebrated with a premium glassmorphic toast notification. 
- **Actual Milestone Title**: The toast displays the unlocked milestone's custom title on the first line and its description on the second line.
- **Smart Timer**: Achievements stay on screen for 8 seconds.
- **Pause-on-Hover**: Hovering your cursor over the toast pauses the auto-dismiss timer, letting you read or click at your own pace. Moving the cursor away resumes the countdown.
- **Support Footer**: A conversion-optimized footer is embedded inside each toast with quick actions to "Sponsor" FCR or "See Financial Goal" on our sustainability page.
- **Queue System**: If you unlock multiple milestones concurrently, they queue and display in clean succession.

## Advanced Milestone Tiers & Locked Visuals

To support long-term productivity and cover the entire development lifecycle, the plugin comes equipped with 12 advanced, high-tier milestone achievements (such as *Sabbath Champion*, *Time Overlord*, *Chronicle Sovereign*, etc.) alongside early-tier challenges.

To make progress clear:
- **Grayed-out Unachieved Goals**: Milestone cards that you have not yet achieved are visually grayed out with a `0.6` opacity and grayscale filter to declutter your dashboard.
- **Interactive Previews**: Hovering over any locked milestone card smoothly restores its color and raises opacity, allowing you to easily read the targets and descriptions.

!!! note "Under the Hood"
    Milestones are strictly read-only from the UI. Your unlock states and counters safely persist within the plugin's settings data, and your progress is dynamically computed from this secure state every time the dashboard renders. For technical details, see the [Milestones Architecture](../../architecture/system/features/milestones-architecture.md).

---

[Display and Behavior](../settings/fc_config.md) · [Settings and Customization](../settings/index.md)
