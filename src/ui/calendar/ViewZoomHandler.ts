import { ViewContext } from './ViewContext';

export const VIEW_ZOOM_CONFIG: {
  [viewPrefix: string]: {
    defaultIndex: number;
    levels: { slotDuration: string; slotLabelInterval: string }[];
  };
} = {
  timeGrid: {
    defaultIndex: 1,
    levels: [
      { slotDuration: '01:00:00', slotLabelInterval: '01:00:00' },
      { slotDuration: '00:30:00', slotLabelInterval: '01:00:00' }, // Default
      { slotDuration: '00:15:00', slotLabelInterval: '00:30:00' },
      { slotDuration: '00:05:00', slotLabelInterval: '00:15:00' }
    ]
  },
  resourceTimelineWeek: {
    defaultIndex: 2, // Start more zoomed out
    levels: [
      { slotDuration: '06:00:00', slotLabelInterval: '06:00:00' },
      { slotDuration: '04:00:00', slotLabelInterval: '04:00:00' },
      { slotDuration: '02:00:00', slotLabelInterval: '02:00:00' }, // Default
      { slotDuration: '01:00:00', slotLabelInterval: '01:00:00' }
    ]
  },
  resourceTimeline: {
    defaultIndex: 1, // Same as timeGrid, for resourceTimelineDay
    levels: [
      { slotDuration: '01:00:00', slotLabelInterval: '01:00:00' },
      { slotDuration: '00:30:00', slotLabelInterval: '01:00:00' }, // Default
      { slotDuration: '00:15:00', slotLabelInterval: '00:30:00' },
      { slotDuration: '00:05:00', slotLabelInterval: '00:15:00' }
    ]
  }
};

export class ViewZoomHandler {
  public zoomIndexByView: { [viewType: string]: number } = {};

  private touchStartDistance = 0;
  private touchStartZoomIndex = 0;
  private isPinching = false;
  private currentConfigKey: string | null = null;

  constructor(private ctx: ViewContext) {}

  public findBestZoomConfigKey(viewType: string): string | null {
    let bestMatchKey: string | null = null;
    for (const key in VIEW_ZOOM_CONFIG) {
      if (viewType.startsWith(key)) {
        if (!bestMatchKey || key.length > bestMatchKey.length) {
          bestMatchKey = key;
        }
      }
    }
    return bestMatchKey;
  }

  public handleWheelZoom(event: WheelEvent): void {
    const fullCalendarView = this.ctx.fullCalendarView;
    if (!fullCalendarView || !(event.ctrlKey || event.metaKey)) {
      return;
    }

    const viewType = fullCalendarView.view.type;
    const configKey = this.findBestZoomConfigKey(viewType);

    if (!configKey) {
      return; // This view type doesn't support zooming.
    }

    event.preventDefault();

    const config = VIEW_ZOOM_CONFIG[configKey];
    const maxZoom = config.levels.length - 1;
    const currentZoom = this.zoomIndexByView[configKey] ?? config.defaultIndex;

    const direction = event.deltaY < 0 ? 'in' : 'out';

    let newIndex = currentZoom;
    if (direction === 'in' && currentZoom < maxZoom) {
      newIndex++;
    } else if (direction === 'out' && currentZoom > 0) {
      newIndex--;
    }

    if (newIndex !== currentZoom) {
      this.zoomIndexByView[configKey] = newIndex;
      const newZoomLevels = config.levels[newIndex];
      fullCalendarView.setOption('slotDuration', newZoomLevels.slotDuration);
      fullCalendarView.setOption('slotLabelInterval', newZoomLevels.slotLabelInterval);
    }
  }

  public applyZoomForView(viewType: string): void {
    const configKey = this.findBestZoomConfigKey(viewType);
    if (configKey) {
      const config = VIEW_ZOOM_CONFIG[configKey];
      const zoomIndex = this.zoomIndexByView[configKey] ?? config.defaultIndex;
      const zoomLevels = config.levels[zoomIndex];

      this.ctx.fullCalendarView?.setOption('slotDuration', zoomLevels.slotDuration);
      this.ctx.fullCalendarView?.setOption('slotLabelInterval', zoomLevels.slotLabelInterval);
    }
  }

  public handleTouchStart(event: TouchEvent): void {
    const fullCalendarView = this.ctx.fullCalendarView;
    if (!fullCalendarView || event.touches.length !== 2) {
      this.isPinching = false;
      return;
    }

    const viewType = fullCalendarView.view.type;
    // Only support 1 day (timeGridDay) and 3 day (timeGrid3Days) views as requested
    if (viewType !== 'timeGridDay' && viewType !== 'timeGrid3Days') {
      return;
    }

    const configKey = this.findBestZoomConfigKey(viewType);
    if (!configKey) {
      return;
    }

    this.currentConfigKey = configKey;
    const config = VIEW_ZOOM_CONFIG[configKey];
    this.touchStartZoomIndex = this.zoomIndexByView[configKey] ?? config.defaultIndex;

    const t1 = event.touches[0];
    const t2 = event.touches[1];
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    this.touchStartDistance = Math.sqrt(dx * dx + dy * dy);
    this.isPinching = this.touchStartDistance > 10;
  }

  public handleTouchMove(event: TouchEvent): void {
    if (!this.isPinching || event.touches.length !== 2 || !this.currentConfigKey) {
      return;
    }

    const fullCalendarView = this.ctx.fullCalendarView;
    if (!fullCalendarView) {
      return;
    }

    // Prevent default scroll/zoom behaviors on the device
    event.preventDefault();

    const t1 = event.touches[0];
    const t2 = event.touches[1];
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    const currentDistance = Math.sqrt(dx * dx + dy * dy);

    const config = VIEW_ZOOM_CONFIG[this.currentConfigKey];
    const maxZoom = config.levels.length - 1;

    // Threshold for changing zoom level (in pixels of pinch distance)
    const threshold = 50;
    const deltaDistance = currentDistance - this.touchStartDistance;
    const steps = Math.round(deltaDistance / threshold);

    let newIndex = this.touchStartZoomIndex + steps;
    if (newIndex < 0) {
      newIndex = 0;
    } else if (newIndex > maxZoom) {
      newIndex = maxZoom;
    }

    const currentIndex = this.zoomIndexByView[this.currentConfigKey] ?? config.defaultIndex;
    if (newIndex !== currentIndex) {
      this.zoomIndexByView[this.currentConfigKey] = newIndex;
      const newZoomLevels = config.levels[newIndex];
      fullCalendarView.setOption('slotDuration', newZoomLevels.slotDuration);
      fullCalendarView.setOption('slotLabelInterval', newZoomLevels.slotLabelInterval);
    }
  }

  public handleTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) {
      this.isPinching = false;
      this.currentConfigKey = null;
    }
  }
}
