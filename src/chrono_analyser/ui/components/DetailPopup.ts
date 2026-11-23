// src/chrono_analyser/modules/DetailPopup.ts

import { App, Modal } from 'obsidian';
import { TimeRecord } from '../../data/types';
import * as Utils from '../../data/utils';

function renderDetailStatsAndRows(
  statsEl: HTMLElement,
  tableBodyEl: HTMLTableSectionElement,
  recordsList: TimeRecord[],
  context: Record<string, unknown> & { value?: number | null }
): void {
  const isCountMetric = context.metric === 'count';
  const numSourceFiles = new Set(recordsList.map(r => r.path)).size;
  const displayTotal =
    context.value ??
    (isCountMetric
      ? recordsList.length
      : recordsList.reduce(
          (sum: number, r: TimeRecord) => sum + (r._effectiveDurationInPeriod || 0),
          0
        ));

  if (typeof statsEl.empty === 'function') statsEl.empty();
  else statsEl.textContent = '';

  const createStatCard = (value: string, label: string) => {
    if (typeof statsEl.createDiv !== 'function') {
      const wrapper = createDiv({ cls: 'summary-stat' });
      const valEl = createDiv({ cls: 'summary-stat-value', text: value });
      const labelEl = createDiv({ cls: 'summary-stat-label', text: label });
      wrapper.appendChild(valEl);
      wrapper.appendChild(labelEl);
      statsEl.appendChild(wrapper);
      return;
    }
    const card = statsEl.createDiv({ cls: 'summary-stat' });
    card.createDiv?.({ cls: 'summary-stat-value', text: value });
    card.createDiv?.({ cls: 'summary-stat-label', text: label });
  };

  createStatCard(String(numSourceFiles), 'Unique Files');
  createStatCard(
    isCountMetric ? String(Math.round(displayTotal)) : displayTotal.toFixed(2),
    isCountMetric ? 'Total Events' : 'Total Hours'
  );

  if (typeof tableBodyEl.empty === 'function') tableBodyEl.empty();
  else tableBodyEl.textContent = '';

  recordsList.forEach(record => {
    const row = tableBodyEl.insertRow();
    row.insertCell().textContent = record.project;
    row.insertCell().textContent = record.subprojectFull;
    row.insertCell().textContent = (record._effectiveDurationInPeriod || record.duration).toFixed(
      2
    );
    const dateCell = row.insertCell();
    dateCell.textContent = record.date ? Utils.getISODate(record.date) : 'Recurring';

    const pathCell = row.insertCell();
    if (typeof pathCell.createSpan === 'function') {
      pathCell.createSpan({
        cls: 'file-path-cell',
        text: record.path,
        attr: { title: record.path }
      });
    } else {
      pathCell.textContent = record.path;
    }
  });
}

class ChronoDetailModal extends Modal {
  constructor(
    app: App,
    private categoryName: string,
    private recordsList: TimeRecord[],
    private context: Record<string, unknown> & { value?: number | null }
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('chrono-analyser-view');
    contentEl.addClass('ofc-chrono-detail-modal');
    this.setTitle(`Details for: ${this.categoryName}`);

    const statsEl = contentEl.createDiv({ cls: 'summary-stats' });
    const tableWrap = contentEl.createDiv({ cls: 'detail-table-container' });
    const table = tableWrap.createEl('table', { cls: 'detail-table' });
    const thead = table.createTHead();
    const headRow = thead.insertRow();
    for (const col of ['Project', 'Subproject', 'Duration (h)', 'Date', 'Source']) {
      headRow.createEl('th', { text: col });
    }
    const tbody = table.createTBody();
    renderDetailStatsAndRows(statsEl, tbody, this.recordsList, this.context);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Manages the detail popup modal, including its visibility and content.
 */
export class DetailPopup {
  private popupEl: HTMLElement;
  private overlayEl: HTMLElement;
  private titleEl: HTMLElement;
  private statsEl: HTMLElement;
  private tableBodyEl: HTMLTableSectionElement;
  private closeBtn: HTMLElement;
  private popupBodyEl: HTMLElement;

  constructor(
    private app: App,
    private rootEl: HTMLElement
  ) {
    const popupEl = this.rootEl.querySelector<HTMLElement>('#detailPopup');
    const overlayEl = this.rootEl.querySelector<HTMLElement>('#detailOverlay');
    const titleEl = this.rootEl.querySelector<HTMLElement>('#popupTitle');
    const statsEl = this.rootEl.querySelector<HTMLElement>('#popupSummaryStats');
    const tableBodyEl = this.rootEl.querySelector<HTMLTableSectionElement>('#popupTableBody');
    const closeBtn = this.rootEl.querySelector<HTMLElement>('#popupCloseBtn');
    const popupBodyEl = this.rootEl.querySelector<HTMLElement>('.popup-body');

    if (
      !popupEl ||
      !overlayEl ||
      !titleEl ||
      !statsEl ||
      !tableBodyEl ||
      !closeBtn ||
      !popupBodyEl
    ) {
      throw new Error('Chrono Analyzer detail popup DOM is missing required elements.');
    }

    this.popupEl = popupEl;
    this.overlayEl = overlayEl;
    this.titleEl = titleEl;
    this.statsEl = statsEl;
    this.tableBodyEl = tableBodyEl;
    this.closeBtn = closeBtn;
    this.popupBodyEl = popupBodyEl;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.closeBtn.addEventListener('click', this.hide);
    this.overlayEl.addEventListener('click', this.hide);
  }

  public static showInModal(
    app: App,
    categoryName: string,
    recordsList: TimeRecord[],
    context: Record<string, unknown> & { value?: number | null } = {}
  ): void {
    new ChronoDetailModal(app, categoryName, recordsList, context).open();
  }

  public show = (
    categoryName: string,
    recordsList: TimeRecord[],
    context: Record<string, unknown> & { value?: number | null } = {}
  ) => {
    if (!this.popupEl || !this.overlayEl || !this.tableBodyEl) return;

    this.popupBodyEl.scrollTop = 0;
    this.titleEl.textContent = `Details for: ${categoryName}`;

    renderDetailStatsAndRows(this.statsEl, this.tableBodyEl, recordsList, context);

    this.overlayEl.classList.add('visible');
    this.popupEl.classList.add('visible');
    const body = this.app.workspace.containerEl.ownerDocument.body;
    body.classList.add('no-scroll');
  };

  public hide = () => {
    this.overlayEl.classList.remove('visible');
    this.popupEl.classList.remove('visible');
    const body = this.app.workspace.containerEl?.ownerDocument?.body;
    body?.classList.remove('no-scroll');
  };

  public destroy = () => {
    this.closeBtn.removeEventListener('click', this.hide);
    this.overlayEl.removeEventListener('click', this.hide);
    this.hide();
  };
}
