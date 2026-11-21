/**
 * @file AgentLiveActivityBar.ts
 * @brief Persistent docked live activity strip anchored directly above the composer.
 */

import { t } from '../../i18n/i18n';

export class AgentLiveActivityBar {
  private readonly rootEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly stepsEl: HTMLElement;
  private readonly timerEl: HTMLElement;
  private startedAt = 0;
  private stepCount = 0;
  private timerHandle: number | null = null;

  constructor(containerEl: HTMLElement, onJumpToProgress: () => void) {
    this.rootEl = containerEl.createDiv({
      cls: 'ofc-agent-live-bar is-hidden',
      attr: {
        role: 'status',
        'aria-live': 'polite',
        title: t('agent.trace.jumpToProgress')
      }
    });
    this.rootEl.createSpan({ cls: 'ofc-agent-pulse-dot' });
    this.textEl = this.rootEl.createSpan({ cls: 'ofc-agent-live-bar-text' });
    this.stepsEl = this.rootEl.createSpan({
      cls: 'ofc-agent-live-bar-steps is-hidden'
    });
    this.timerEl = this.rootEl.createSpan({
      cls: 'ofc-agent-live-bar-timer',
      text: '0.0s'
    });
    this.rootEl.addEventListener('click', () => {
      onJumpToProgress();
    });
  }

  public show(startedAt: number, initialLabel: string, initialSteps = 0): void {
    this.clearTimer();
    this.startedAt = startedAt;
    this.stepCount = initialSteps;
    this.rootEl.removeClass('is-hidden');
    this.update(initialLabel, initialSteps);
    this.updateTimer();
    this.timerHandle = window.setInterval(() => {
      this.updateTimer();
    }, 200);
  }

  public update(label?: string, stepCount?: number): void {
    if (label && label.trim().length > 0) {
      this.textEl.setText(label.trim());
    }
    if (stepCount !== undefined) {
      this.stepCount = stepCount;
      if (stepCount > 0) {
        this.stepsEl.removeClass('is-hidden');
        this.stepsEl.setText(
          t(stepCount === 1 ? 'agent.trace.stepRecordedSingle' : 'agent.trace.stepsRecorded', {
            count: stepCount
          })
        );
      } else {
        this.stepsEl.addClass('is-hidden');
        this.stepsEl.setText('');
      }
    }
  }

  public incrementStep(label: string): void {
    this.stepCount++;
    this.update(label, this.stepCount);
  }

  public hide(): void {
    this.clearTimer();
    this.rootEl.addClass('is-hidden');
  }

  public destroy(): void {
    this.hide();
    this.rootEl.remove();
  }

  private updateTimer(): void {
    const elapsedSec = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    this.timerEl.setText(`${elapsedSec}s`);
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) {
      window.clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }
}
