/**
 * @file deprecations.ts
 * @brief Defines deprecated calendar providers and warning messages.
 * @license See LICENSE.md
 */

export interface DeprecatedProviderInfo {
  type: string;
  displayName: string;
  message: string;
}

export const DEPRECATED_PROVIDERS: Record<string, DeprecatedProviderInfo> = {
  bases: {
    type: 'bases',
    displayName: 'Obsidian Bases',
    message:
      'The Obsidian Bases calendar provider is deprecated and will be removed in a future version. Please migrate your events to a Local Folder provider and use the new Workspaces Bases integration for advanced filtering.'
  }
};
