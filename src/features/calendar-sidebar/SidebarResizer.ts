import { SidebarStateStore } from './SidebarStateStore';

export interface SidebarResizerOptions {
  shellEl: HTMLElement;
  sidebarEl: HTMLElement;
  store: SidebarStateStore;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
  onDoubleClick: () => void;
  minWidth?: number;
  maxWidth?: number;
}

export class SidebarResizer {
  private resizerEl: HTMLElement;
  private shellEl: HTMLElement;
  private sidebarEl: HTMLElement;
  private store: SidebarStateStore;
  private onResize: (width: number) => void;
  private onResizeEnd: (width: number) => void;
  private onDoubleClick: () => void;
  private minWidth: number;
  private maxWidth: number;

  private isDragging = false;
  private startX = 0;
  private startWidth = 0;
  private currentWidth = 0;

  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;

  constructor(options: SidebarResizerOptions) {
    this.shellEl = options.shellEl;
    this.sidebarEl = options.sidebarEl;
    this.store = options.store;
    this.onResize = options.onResize;
    this.onResizeEnd = options.onResizeEnd;
    this.onDoubleClick = options.onDoubleClick;
    this.minWidth = options.minWidth ?? 200;
    this.maxWidth = options.maxWidth ?? 520;

    this.resizerEl = createDiv({ cls: 'ofc-calendar-sidebar-resizer' });
    this.resizerEl.setAttribute('role', 'separator');
    this.resizerEl.setAttribute('aria-orientation', 'vertical');
    this.resizerEl.setAttribute('title', 'Drag to resize, double-click to toggle');
    this.resizerEl.createDiv({ cls: 'ofc-resizer-handle' });

    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);

    this.resizerEl.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    this.resizerEl.addEventListener('dblclick', (e: MouseEvent) => {
      e.preventDefault();
      this.onDoubleClick();
    });
  }

  public getElement(): HTMLElement {
    return this.resizerEl;
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0) return; // Only primary mouse button
    e.preventDefault();

    this.isDragging = true;
    this.startX = e.clientX;
    this.startWidth = this.sidebarEl.getBoundingClientRect().width;
    this.currentWidth = this.startWidth;

    this.resizerEl.setPointerCapture(e.pointerId);
    document.body.addClass('ofc-sidebar-is-resizing');

    window.addEventListener('pointermove', this.boundPointerMove);
    window.addEventListener('pointerup', this.boundPointerUp);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.startX;
    const nextWidth = Math.max(this.minWidth, Math.min(this.maxWidth, this.startWidth + deltaX));

    this.currentWidth = nextWidth;
    this.onResize(nextWidth);
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.isDragging) return;

    this.isDragging = false;
    try {
      this.resizerEl.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore capture release error if already released
    }

    document.body.removeClass('ofc-sidebar-is-resizing');
    window.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('pointerup', this.boundPointerUp);

    this.store.setWidth(this.currentWidth);
    this.onResizeEnd(this.currentWidth);
  }

  public destroy(): void {
    document.body.removeClass('ofc-sidebar-is-resizing');
    window.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('pointerup', this.boundPointerUp);
    this.resizerEl.remove();
  }
}
