/**
 * @file domUtils.ts
 * @brief Shared Obsidian-safe DOM style utility helpers for agent UI components.
 */

/**
 * Applies CSS custom properties or inline style properties cleanly via `style.setProperty`.
 */
export function setCssProps(el: HTMLElement, props: Record<string, string>): void {
  for (const [key, value] of Object.entries(props)) {
    el.style.setProperty(key, value);
  }
}
