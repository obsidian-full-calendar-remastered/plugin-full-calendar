import Color from 'color';
import { activeDocument } from 'obsidian';

/**
 * Normalizes a color string and determines whether it is light or dark.
 * Supports:
 * - Standard named colors (e.g., 'white', 'black', 'yellow')
 * - 3-, 4-, 6-, and 8-digit hex strings (with or without '#' prefix)
 * - CSS functions: rgb(), rgba(), hsl(), hsla()
 *
 * @param colorStr The input color string to test.
 * @returns true if the color is light (requiring dark text for contrast), false otherwise.
 */
export function isLightColor(colorStr: string): boolean {
  const trimmed = colorStr.trim();
  if (!trimmed) return false;

  const normalized = /^[0-9A-Fa-f]{3,4}$|^[0-9A-Fa-f]{6}$|^[0-9A-Fa-f]{8}$/.test(trimmed)
    ? `#${trimmed}`
    : trimmed;

  try {
    return Color(normalized.toLowerCase()).isLight();
  } catch {
    return false;
  }
}

export function getCalendarColors(color: string | null | undefined): {
  color: string;
  textColor: string;
} {
  const bodyEl = activeDocument?.body;
  const styles = bodyEl ? getComputedStyle(bodyEl) : null;

  if (!color || !color.trim()) {
    return {
      color: styles?.getPropertyValue('--interactive-accent').trim() || 'var(--interactive-accent)',
      textColor: styles?.getPropertyValue('--text-on-accent').trim() || 'var(--text-on-accent)'
    };
  }

  const trimmed = color.trim();
  const normalizedColor = /^[0-9A-Fa-f]{3,4}$|^[0-9A-Fa-f]{6}$|^[0-9A-Fa-f]{8}$/.test(trimmed)
    ? `#${trimmed}`
    : trimmed;

  let isLight = false;
  let parsed = false;

  try {
    isLight = Color(normalizedColor.toLowerCase()).isLight();
    parsed = true;
  } catch {
    // If color is a CSS variable, try resolving it against body computed styles
    if (styles && trimmed.startsWith('var(')) {
      const varName = trimmed.slice(4, -1).trim();
      const resolved = styles.getPropertyValue(varName).trim();
      if (resolved) {
        try {
          isLight = Color(resolved.toLowerCase()).isLight();
          parsed = true;
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  let textVar = styles?.getPropertyValue('--text-on-accent').trim() || 'var(--text-on-accent)';

  if (parsed) {
    if (isLight) {
      textVar = 'black';
    } else {
      // For dark backgrounds, ensure textVar is not inadvertently dark
      // (e.g. if an Obsidian theme has a light interactive accent and black text-on-accent)
      try {
        if (Color(textVar.toLowerCase()).isDark()) {
          textVar = 'white';
        }
      } catch {
        // Leave as is if textVar is a CSS variable
      }
    }
  }

  return {
    color: normalizedColor,
    textColor: textVar
  };
}
