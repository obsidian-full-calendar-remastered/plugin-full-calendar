/**
 * @file AgentStepTraceView.ts
 * @brief Live animated activity indicator and collapsible tool-execution trace.
 *
 * @license See LICENSE.md
 */

import { setIcon } from 'obsidian';
import type { AgentToolStepRecord } from '../types';
import { t } from '../../i18n/i18n';

interface StepRowRefs {
  rowEl: HTMLElement;
  iconEl: HTMLElement;
  metaEl: HTMLElement;
}

export class AgentStepTraceView {
  private detailsEl: HTMLDetailsElement;
  private summaryEl: HTMLElement;
  private indicatorEl: HTMLElement;
  private phaseEl: HTMLElement;
  private timerEl: HTMLElement;
  private stepsListEl: HTMLElement;

  private readonly startedAt: number;
  private timerHandle: number | null = null;
  private stepRows = new Map<string, StepRowRefs>();
  private stepCount = 0;
  private finished = false;

  constructor(containerEl: HTMLElement, startedAt = Date.now()) {
    this.startedAt = startedAt;
    this.detailsEl = containerEl.createEl('details', {
      cls: 'ofc-agent-trace is-running'
    });
    this.detailsEl.open = true;

    this.summaryEl = this.detailsEl.createEl('summary', {
      cls: 'ofc-agent-trace-summary'
    });
    this.indicatorEl = this.summaryEl.createSpan({ cls: 'ofc-agent-pulse-dot' });
    this.phaseEl = this.summaryEl.createSpan({
      cls: 'ofc-agent-trace-phase',
      text: t('agent.sidebar.thinking')
    });
    this.timerEl = this.summaryEl.createSpan({
      cls: 'ofc-agent-trace-timer',
      text: '0.0s'
    });
    this.updateTimer();

    this.stepsListEl = this.detailsEl.createDiv({ cls: 'ofc-agent-trace-steps is-hidden' });

    this.timerHandle = window.setInterval(() => {
      this.updateTimer();
    }, 200);
  }

  public getElement(): HTMLElement {
    return this.detailsEl;
  }

  public setPhase(label: string): void {
    if (this.finished) {
      return;
    }
    const text = label.trim() || t('agent.trace.working');
    this.phaseEl.setText(text);
  }

  public addToolStart(id: string, label: string): void {
    if (this.finished) {
      return;
    }
    this.stepsListEl.removeClass('is-hidden');
    this.stepCount++;

    const rowEl = this.stepsListEl.createDiv({ cls: 'ofc-agent-trace-step is-running' });
    const iconEl = rowEl.createSpan({ cls: 'ofc-agent-trace-step-icon' });
    setIcon(iconEl, 'loader-2');
    rowEl.createSpan({ cls: 'ofc-agent-trace-step-label', text: label });
    const metaEl = rowEl.createSpan({ cls: 'ofc-agent-trace-step-meta', text: '...' });

    this.stepRows.set(id, { rowEl, iconEl, metaEl });
    this.setPhase(label);
  }

  public finishTool(step: AgentToolStepRecord): void {
    if (this.finished) {
      return;
    }
    let refs = this.stepRows.get(step.id);
    if (!refs) {
      this.stepsListEl.removeClass('is-hidden');
      this.stepCount++;
      const rowEl = this.stepsListEl.createDiv({ cls: 'ofc-agent-trace-step' });
      const iconEl = rowEl.createSpan({ cls: 'ofc-agent-trace-step-icon' });
      rowEl.createSpan({ cls: 'ofc-agent-trace-step-label', text: step.label });
      const metaEl = rowEl.createSpan({ cls: 'ofc-agent-trace-step-meta' });
      refs = { rowEl, iconEl, metaEl };
      this.stepRows.set(step.id, refs);
    }

    refs.rowEl.removeClass('is-running');
    refs.rowEl.addClass(step.ok ? 'is-done' : 'is-error');
    refs.iconEl.empty();
    setIcon(refs.iconEl, step.ok ? 'check' : 'x');
    const secLabel =
      step.durationMs >= 1000 ? `${(step.durationMs / 1000).toFixed(1)}s` : `${step.durationMs}ms`;
    refs.metaEl.setText(`${step.summary} · ${secLabel}`);
  }

  public finish(state: 'done' | 'cancelled' | 'error'): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.stopTimer();

    const elapsedSec = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    this.timerEl.setText(`${elapsedSec}s`);
    this.detailsEl.removeClass('is-running');
    this.detailsEl.addClass(`is-${state}`);
    this.indicatorEl.removeClass('ofc-agent-pulse-dot');
    this.indicatorEl.addClass('ofc-agent-trace-status-icon');
    setIcon(
      this.indicatorEl,
      state === 'done' ? 'check' : state === 'cancelled' ? 'slash' : 'alert-circle'
    );

    if (state === 'done') {
      if (this.stepCount === 0) {
        this.detailsEl.addClass('is-hidden');
        return;
      }
      this.phaseEl.setText(
        t(this.stepCount === 1 ? 'agent.trace.usedToolSingle' : 'agent.trace.usedTools', {
          count: this.stepCount
        })
      );
      this.detailsEl.open = false;
      return;
    }

    if (state === 'cancelled') {
      this.phaseEl.setText(t('agent.trace.cancelled'));
      this.detailsEl.open = false;
      return;
    }

    this.phaseEl.setText(t('agent.trace.failed'));
    this.detailsEl.open = this.stepCount > 0;
  }

  public destroy(): void {
    this.stopTimer();
    this.finished = true;
  }

  private updateTimer(): void {
    const elapsedSec = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    this.timerEl.setText(`${elapsedSec}s`);
  }

  private stopTimer(): void {
    if (this.timerHandle !== null) {
      window.clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  public static renderStatic(containerEl: HTMLElement, steps: AgentToolStepRecord[]): void {
    if (!steps || steps.length === 0) {
      return;
    }

    const detailsEl = containerEl.createEl('details', {
      cls: 'ofc-agent-trace ofc-agent-trace-static is-done'
    });
    detailsEl.open = false;

    const summaryEl = detailsEl.createEl('summary', { cls: 'ofc-agent-trace-summary' });
    const iconEl = summaryEl.createSpan({ cls: 'ofc-agent-trace-status-icon' });
    setIcon(iconEl, 'check');
    summaryEl.createSpan({
      cls: 'ofc-agent-trace-phase',
      text: t(steps.length === 1 ? 'agent.trace.stepRecordedSingle' : 'agent.trace.stepsRecorded', {
        count: steps.length
      })
    });

    const totalMs = steps.reduce((acc, s) => acc + (s.durationMs || 0), 0);
    summaryEl.createSpan({
      cls: 'ofc-agent-trace-timer',
      text: `${(totalMs / 1000).toFixed(1)}s`
    });

    const listEl = detailsEl.createDiv({ cls: 'ofc-agent-trace-steps' });
    for (const step of steps) {
      const rowEl = listEl.createDiv({
        cls: `ofc-agent-trace-step ${step.ok ? 'is-done' : 'is-error'}`
      });
      const stepIcon = rowEl.createSpan({ cls: 'ofc-agent-trace-step-icon' });
      setIcon(stepIcon, step.ok ? 'check' : 'x');
      rowEl.createSpan({
        cls: 'ofc-agent-trace-step-label',
        text: step.label || t('agent.sidebar.toolExecuted')
      });
      const secLabel =
        step.durationMs >= 1000
          ? `${(step.durationMs / 1000).toFixed(1)}s`
          : `${step.durationMs}ms`;
      rowEl.createSpan({
        cls: 'ofc-agent-trace-step-meta',
        text: `${step.summary} · ${secLabel}`
      });
    }
  }
}
