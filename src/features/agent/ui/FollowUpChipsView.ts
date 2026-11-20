/**
 * @file FollowUpChipsView.ts
 * @brief Contextual clickable follow-up suggestion chips rendered after assistant replies.
 *
 * @license See LICENSE.md
 */

export class FollowUpChipsView {
  private rootEl: HTMLElement;

  constructor(containerEl: HTMLElement, suggestions: string[], onSelect: (prompt: string) => void) {
    this.rootEl = containerEl.createDiv({ cls: 'ofc-agent-followups' });
    for (const prompt of suggestions) {
      const chip = this.rootEl.createEl('button', {
        cls: 'ofc-agent-followup-chip',
        text: prompt,
        attr: { type: 'button' }
      });
      chip.addEventListener('click', () => {
        this.remove();
        onSelect(prompt);
      });
    }
  }

  public remove(): void {
    this.rootEl.remove();
  }
}
