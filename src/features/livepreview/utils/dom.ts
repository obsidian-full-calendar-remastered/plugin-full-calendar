import { setIcon } from 'obsidian';

/**
 * Creates a beautiful calendar badge/colored dot.
 */
export function createColorDot(color: string): HTMLElement {
  const dot = activeDocument.createElement('span');
  dot.addClass('fc-lp-color-dot');
  dot.style.backgroundColor = color;
  return dot;
}

/**
 * Creates a beautiful category pill.
 */
export function createCategoryPill(text: string, color?: string): HTMLElement {
  const pill = activeDocument.createElement('span');
  pill.addClass('fc-lp-category-pill');
  pill.setText(text);
  if (color) {
    pill.style.borderColor = color;
    pill.style.color = color;
  }
  return pill;
}

/**
 * Creates an interactive Lucide icon button with smooth hover effects.
 */
export function createIconButton(
  iconId: string,
  tooltip: string,
  onClick: (e: MouseEvent) => void
): HTMLElement {
  const btn = activeDocument.createElement('button');
  btn.addClass('fc-lp-icon-button');
  btn.setAttribute('aria-label', tooltip);
  setIcon(btn, iconId);
  btn.addEventListener('click', e => {
    e.stopPropagation();
    e.preventDefault();
    onClick(e);
  });
  return btn;
}

/**
 * Creates a standard premium task checkbox.
 */
export function createTaskCheckbox(
  checked: boolean,
  onClick: (e: MouseEvent) => void
): HTMLElement {
  const checkbox = activeDocument.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.addClass('task-list-item-checkbox'); // Reuse Obsidian's standard checkbox styles
  checkbox.addEventListener('click', e => {
    e.stopPropagation();
    onClick(e);
  });
  return checkbox;
}
