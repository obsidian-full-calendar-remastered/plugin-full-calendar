import { ItemView, App, WorkspaceLeaf } from 'obsidian';
import { createDOMStructure } from './ui/dom';
import { AnalysisController } from './AnalysisController';
import { FilterPayload } from './ui/UIService';
import FullCalendarPlugin from '../main';

// Importing styles for the AnalysisView
import 'flatpickr/dist/themes/dark.css';
import './ui/styles/main_styles.css';

export const ANALYSIS_VIEW_TYPE = 'full-calendar-analysis-view';

let queuedActivationFilter: FilterPayload | null = null;

export class AnalysisView extends ItemView {
  private controller: AnalysisController | null = null;
  private pendingInitialFilter: FilterPayload | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: FullCalendarPlugin
  ) {
    super(leaf);
  }

  getViewType(): string {
    return ANALYSIS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Chrono analyser';
  }

  getIcon(): string {
    return 'bar-chart-horizontal';
  }

  public applyFilterPayload(payload: FilterPayload, options?: { forceLiveData?: boolean }): void {
    if (this.controller) {
      this.controller.applyFilterPayload(payload, options);
    } else {
      this.pendingInitialFilter = payload;
    }
  }

  protected async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('chrono-analyser-view');
    createDOMStructure(container as HTMLElement);

    const controller = new AnalysisController(this.app, container as HTMLElement, this.plugin);
    this.controller = controller;
    if (!this.pendingInitialFilter && queuedActivationFilter) {
      this.pendingInitialFilter = queuedActivationFilter;
      queuedActivationFilter = null;
    }
    if (this.pendingInitialFilter) {
      const initial = this.pendingInitialFilter;
      this.pendingInitialFilter = null;
      controller.applyFilterPayload(initial, { forceLiveData: true });
    }
    await Promise.resolve(controller.initialize());
  }

  protected onClose(): Promise<void> {
    this.controller?.destroy();
    this.controller = null;
    return Promise.resolve();
  }
}

/**
 * Activates the AnalysisView.
 * If the view is already open, it reveals it.
 * If not, it opens it in a new tab.
 * @param app The Obsidian App instance.
 */
export async function activateAnalysisView(app: App, initialFilter?: FilterPayload): Promise<void> {
  const existingLeaves = app.workspace.getLeavesOfType(ANALYSIS_VIEW_TYPE);
  if (existingLeaves.length > 0) {
    const leaf = existingLeaves[0];
    await app.workspace.revealLeaf(leaf);
    if (initialFilter && leaf.view instanceof AnalysisView) {
      leaf.view.applyFilterPayload(initialFilter, { forceLiveData: true });
    }
    return;
  }

  const newLeaf = app.workspace.getLeaf('tab');
  queuedActivationFilter = initialFilter ?? null;
  try {
    await newLeaf.setViewState({
      type: ANALYSIS_VIEW_TYPE,
      active: true
    });
    if (queuedActivationFilter && newLeaf.view instanceof AnalysisView) {
      const remaining = queuedActivationFilter;
      queuedActivationFilter = null;
      newLeaf.view.applyFilterPayload(remaining, { forceLiveData: true });
    }
  } finally {
    queuedActivationFilter = null;
  }
}
