import { ISidebarModule, SidebarContext } from '../types';
import { PluginState } from '../../../core/PluginState';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { SidebarStateStore } from '../SidebarStateStore';
import {
  fetchWeatherForecast,
  formatTemp,
  HourlyForecast,
  WeatherInfo
} from '../../weather/Weather';
import { OFCEvent } from '../../../types';

interface UpcomingItem {
  id: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  calendarId?: string;
  location?: string;
  sourceEvent: OFCEvent;
}

export class UpNextWeatherModule implements ISidebarModule {
  public readonly id = 'up-next';
  public readonly title = 'Up Next';
  public readonly icon = 'clock';
  public readonly defaultCollapsed = false;

  private context!: SidebarContext;
  private section!: CollapsibleSection;
  private store!: SidebarStateStore;
  private listEl!: HTMLElement;
  private weatherData: Record<string, WeatherInfo> | null = null;
  private isFetchingWeather = false;

  constructor(store: SidebarStateStore) {
    this.store = store;
  }

  public mount(containerEl: HTMLElement, context: SidebarContext): void {
    this.context = context;

    this.section = new CollapsibleSection(containerEl, {
      id: this.id,
      title: this.title,
      icon: this.icon,
      store: this.store,
      defaultCollapsed: this.defaultCollapsed
    });

    const bodyEl = this.section.getBodyEl();
    this.listEl = bodyEl.createDiv({ cls: 'ofc-upnext-list' });

    void this.refreshData();
  }

  public onCacheUpdate(): void {
    void this.refreshData();
  }

  public onDateChange(): void {
    void this.refreshData();
  }

  private async refreshData(): Promise<void> {
    if (!this.listEl) return;

    const items = this.getUpcomingItems();
    this.section.setBadge(items.length > 0 ? String(items.length) : null);

    await this.ensureWeatherData();
    this.renderItems(items);
  }

  private getUpcomingItems(): UpcomingItem[] {
    const items: UpcomingItem[] = [];
    try {
      const cache = PluginState.getCache();
      if (!cache) return items;

      const now = new Date();
      const endOfWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Next 24 hours

      // 1. Try occurrences from time engine
      try {
        const occurrences = cache.getOccurrenceCache();
        if (occurrences && occurrences.length > 0) {
          occurrences.forEach(occ => {
            const startDate = occ.start.toJSDate();
            const endDate = occ.end.toJSDate();

            if (endDate < now) return;
            if (startDate > endOfWindow) return;

            const calendarId = cache.store.getEventDetails(occ.id)?.calendarId;

            items.push({
              id: occ.id,
              title: occ.event.title,
              start: startDate,
              end: endDate,
              allDay: Boolean(occ.event.allDay),
              calendarId,
              location: occ.event.location,
              sourceEvent: occ.event
            });
          });
        }
      } catch {
        // Fallback to store if occurrences not yet populated
      }

      // 2. If occurrences didn't find anything, scan store single events
      if (items.length === 0 && cache.store) {
        const rawEvents = cache.store.getAllEvents();
        rawEvents.forEach(item => {
          const ev = item.event;
          if (ev.type !== 'single' || !ev.date || !ev.title) return;

          const dateStr =
            ev.allDay || !ev.startTime ? `${ev.date}T00:00:00` : `${ev.date}T${ev.startTime}:00`;
          const startDate = new Date(dateStr);
          if (isNaN(startDate.getTime())) return;

          const endDate = ev.allDay
            ? new Date(`${ev.endDate || ev.date}T23:59:59`)
            : ev.endTime
              ? new Date(`${ev.endDate || ev.date}T${ev.endTime}:00`)
              : new Date(startDate.getTime() + 60 * 60 * 1000);

          if (endDate < now || startDate > endOfWindow) return;

          items.push({
            id: item.id || ev.id || `${ev.title}_${ev.date}`,
            title: ev.title,
            start: startDate,
            end: endDate,
            allDay: Boolean(ev.allDay),
            calendarId: item.calendarId,
            location: ev.location,
            sourceEvent: ev
          });
        });
      }

      // Sort chronologically
      items.sort((a, b) => a.start.getTime() - b.start.getTime());
    } catch {
      // Return empty gracefully
    }

    return items.slice(0, 5); // Display top 5 upcoming items
  }

  private async ensureWeatherData(): Promise<void> {
    const settings = PluginState.getSettings();
    if (settings.weatherHide || !settings.weatherLatitude || !settings.weatherLongitude) {
      return;
    }

    if (this.isFetchingWeather) return;

    try {
      this.isFetchingWeather = true;
      const todayStr = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const data = await fetchWeatherForecast(
        settings.weatherLatitude,
        settings.weatherLongitude,
        todayStr,
        tomorrowStr
      );
      if (data) {
        this.weatherData = data;
      }
    } catch {
      // Weather failure is non-blocking
    } finally {
      this.isFetchingWeather = false;
    }
  }

  private renderItems(items: UpcomingItem[]): void {
    this.listEl.empty();

    if (items.length === 0) {
      const emptyEl = this.listEl.createDiv({ cls: 'ofc-upnext-empty' });
      emptyEl.createSpan({ text: 'No upcoming events today' });
      return;
    }

    const now = new Date();
    const settings = PluginState.getSettings();
    const unit = settings.weatherUnit || 'C';

    items.forEach(item => {
      const card = this.listEl.createDiv({ cls: 'ofc-upnext-card' });

      // Left accent color bar based on calendar
      const colorBar = card.createDiv({ cls: 'ofc-upnext-color-indicator' });
      if (item.calendarId) {
        const cal = settings.calendarSources.find(c => c.id === item.calendarId);
        if (cal && cal.color) {
          colorBar.style.backgroundColor = cal.color;
        }
      }

      const contentBox = card.createDiv({ cls: 'ofc-upnext-content' });

      // Title & Status
      const topRow = contentBox.createDiv({ cls: 'ofc-upnext-top-row' });
      const titleEl = topRow.createSpan({ cls: 'ofc-upnext-title', text: item.title });
      titleEl.setAttribute('title', item.title);

      // Relative timing pill
      const timePill = topRow.createSpan({ cls: 'ofc-upnext-time-pill' });
      const diffMins = Math.round((item.start.getTime() - now.getTime()) / 60000);

      if (item.allDay) {
        timePill.setText('All day');
      } else if (diffMins <= 0 && (!item.end || item.end > now)) {
        timePill.setText('Now');
        timePill.addClass('is-ongoing');
      } else if (diffMins > 0 && diffMins < 60) {
        timePill.setText(`in ${diffMins}m`);
        timePill.addClass('is-soon');
      } else {
        const hours = item.start.getHours().toString().padStart(2, '0');
        const mins = item.start.getMinutes().toString().padStart(2, '0');
        timePill.setText(`${hours}:${mins}`);
      }

      // Bottom Row: Time details & Weather
      const bottomRow = contentBox.createDiv({ cls: 'ofc-upnext-bottom-row' });
      const timeRangeText = item.allDay
        ? 'All day'
        : `${this.formatTime(item.start)}${item.end ? ` - ${this.formatTime(item.end)}` : ''}`;
      bottomRow.createSpan({ cls: 'ofc-upnext-time-range', text: timeRangeText });

      // Weather forecast for this event time
      const forecast = this.getHourlyWeatherForDate(item.start);
      if (forecast) {
        const weatherChip = bottomRow.createSpan({ cls: 'ofc-upnext-weather-chip' });
        weatherChip.createSpan({ cls: 'ofc-upnext-weather-emoji', text: forecast.emoji });
        weatherChip.createSpan({
          cls: 'ofc-upnext-weather-temp',
          text: formatTemp(forecast.temp, unit)
        });

        if (forecast.precipProb > 40) {
          const rainWarn = weatherChip.createSpan({
            cls: 'ofc-upnext-weather-rain-warn',
            text: `🌧️ ${forecast.precipProb}%`
          });
          rainWarn.setAttribute('title', `Precipitation probability: ${forecast.precipProb}%`);
        }
      }

      // Card click interaction: jumps to date and highlights
      card.addEventListener('click', () => {
        this.context.gotoDate(item.start);
      });
    });
  }

  private formatTime(d: Date): string {
    const is24h = PluginState.getSettings().timeFormat24h;
    if (is24h) {
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }
    const h = d.getHours() % 12 || 12;
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = d.getHours() >= 12 ? 'pm' : 'am';
    return `${h}:${m}${ampm}`;
  }

  private getHourlyWeatherForDate(date: Date): HourlyForecast | null {
    if (!this.weatherData) return null;

    const dateStr = date.toISOString().split('T')[0];
    const dayData = this.weatherData[dateStr];
    if (!dayData || !dayData.hourly || dayData.hourly.length === 0) return null;

    const targetHour = date.getHours();
    // Hourly data items have format "YYYY-MM-DDTHH:00"
    const matched = dayData.hourly.find(h => {
      const matchHour = parseInt(h.time.split('T')[1]?.split(':')[0] || '-1', 10);
      return matchHour === targetHour;
    });

    return matched || dayData.hourly[0] || null;
  }

  public setCollapsed(collapsed: boolean): void {
    this.section.setCollapsed(collapsed);
  }

  public isCollapsed(): boolean {
    return this.section.getIsCollapsed();
  }

  public destroy(): void {
    this.section.destroy();
  }
}
