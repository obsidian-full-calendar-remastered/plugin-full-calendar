# Weather Forecast Integration

The Weather Forecast Integration brings live weather conditions and temperature forecasts directly into your daily, weekly, and monthly calendar views. It helps you plan activities, visualize scheduling context, and coordinate events around the forecast.

---

## Capabilities

| View | Placement | Display Detail |
|---|---|---|
| **Day View** | Column Header | Full details: Weather conditions emoji, max daily temperature, and condition description. |
| **Week View** | Column Header | Full details: Weather conditions emoji, max daily temperature, and condition description. |
| **Month View** | Day Cell | Minimal footprint: Compact conditions emoji aligned to the top-left of each day cell. |

---

## Design and Features

### 1. Free and Autonomic Geocoding
- Powered entirely by the free and open [Open-Meteo API](https://open-meteo.com/).
- No registration, subscription, or API keys are required to use this feature.
- Supports two input modes: **Place Name Resolution** (dynamic geocoding search) or **Manual GPS Coordinates** (latitude and longitude entry).

### 2. High-Performance Caching
- Forecast requests are cached in-memory using composite geolocation keys.
- Calendar navigation is instant, smooth, and flicker-free, avoiding redundant API network queries.
- Cache refreshes automatically when you modify coordinates or restart Obsidian.

### 3. Smart Future-Range Clamping
- The Open-Meteo free tier restricts forecast lookaheads to a maximum of 16 days.
- When navigating broad views (such as Month View, which spans up to 42 cells), the plugin automatically and safely clamps requests to the range `[today - 3 days, today + 14 days]`.
- This guarantees reliable API success while shielding the calendar from loading errors on far-future dates.

---

## Step-by-Step Configuration

> [!TIP]
> Make sure your Obsidian vault has an active internet connection so that coordinates can resolve and forecasts can download.

### Step 1: Open Settings
1. Open Obsidian Settings.
2. Select **Full Calendar** from the sidebar.
3. Scroll to the **Weather forecast** section under the General tab.

### Step 2: Open Configuration Modal
1. Click the **Gear icon** next to the weather settings description.
2. The *Weather Integration Settings* modal will open.

```
+-------------------------------------------------------------+
|                Weather Integration Settings                 |
|                                                             |
| Hide weather forecast in calendar UI     [ ]                |
|                                                             |
| Location Input Mode                      [ City / Region  ] |
|                                                             |
| Weather city / region                    [ Prague         ] |
| Resolved: Lat 50.0880, Lng 14.4208 (Success)                |
+-------------------------------------------------------------+
```

### Step 3: Set Location
- **City / Region Mode (Recommended):**
  - Enter your place name (e.g., `Prague` or `London, UK`) in the **Weather city / region** text box.
  - The plugin will automatically run a debounced geocoding search.
  - A real-time status message will update from `Resolving location...` to `Resolved: Lat XX.XXXX, Lng XX.XXXX` in green.
- **Latitude / Longitude Mode:**
  - Switch the dropdown to **Coordinates**.
  - Enter your target **Latitude** and **Longitude** values directly in the fields (e.g., `50.088` and `14.4208`).
  - Values are automatically parsed and saved when you focus out or press enter.

---

## Step 4: Hide/Show Control
- To completely hide weather forecasts from all calendar views, turn on the **Hide weather forecast in calendar UI** toggle.

---

## Interactive Interface Guide

> [!IMPORTANT]
> If you have enabled the weather feature but have not yet configured coordinates, the calendar views will display a beautiful placeholder panel in the header:
> 
> `🌤️❓ Set weather location / Click to configure`
> 
> Clicking this placeholder will **automatically open** the Full Calendar settings panel to guide you directly to the configuration modal!

### Premium Detailed Weather & Hourly Timeline Modal

Once configured, the weather thumbnails on the calendar views become fully interactive:
- **How to Open**: Click directly on the weather card (in **Day/Week Views**) or the weather emoji (in **Month View**). The hover state highlights the thumbnail with a pointer cursor.
- **Vibrant Summary**: Displays a responsive summary card with a large floating condition emoji, text description, and the day's temperature range.
- **Hourly Forecast Timeline**: A beautiful, horizontally scrollable swipe-enabled timeline that showcases conditions for each hour of the day:
  - **Condition Emoji & Time**: Clear visual timeline markers.
  - **Apparent Temperature**: Tells you what the temperature actually feels like.
  - **Precipitation Probability (💧)**: Shows real-time rain/snow chance percentage.
  - **Relative Humidity (💦)**: Shows current air moisture.
  - **Wind Speed (💨)**: Shows wind velocity in km/h.
- **Zero API Overhead**: Because the plugin fetches and caches both daily and hourly forecasts in a single background query during navigation, opening the modal takes **0ms and makes zero additional network requests**.
- **Community Footer**: The bottom of the detailed modal features a unified footer allowing you to directly *suggest a feature*, *raise an issue*, or *buy the creators a coffee*.
