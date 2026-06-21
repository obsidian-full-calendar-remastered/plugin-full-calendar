/**
 * @file GithubGistService.ts
 * @brief Integration with GitHub Gist API to upload/update shared availability JSON files.
 * @license See LICENSE.md
 */

import { requestUrl } from 'obsidian';
import { CredentialStore } from '../credentials/CredentialStore';

export class GithubGistService {
  /**
   * Pushes the availability JSON content to a secret GitHub Gist.
   * If existingGistId is provided, updates that Gist. Otherwise, creates a new secret Gist.
   * Returns the Gist ID.
   */
  static async createOrUpdateGist(
    content: string,
    existingGistId?: string | null
  ): Promise<string> {
    const token = CredentialStore.getGitHubToken();
    if (!token) {
      throw new Error('GitHub Personal Access Token not configured. Please set it in settings.');
    }

    const payload = {
      description: 'Obsidian Full Calendar Shared Availability',
      public: false, // Secret Gist (accessible only via Gist ID URL, unlisted)
      files: {
        'availability.json': {
          content: content
        }
      }
    };

    const url = existingGistId
      ? `https://api.github.com/gists/${existingGistId}`
      : 'https://api.github.com/gists';

    const method = existingGistId ? 'PATCH' : 'POST';

    try {
      const response = await requestUrl({
        url,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.status >= 200 && response.status < 300) {
        const data = (response.json || JSON.parse(response.text)) as { id?: string };
        if (data && typeof data.id === 'string') {
          return data.id;
        }
        throw new Error('GitHub response did not contain a valid Gist ID.');
      } else {
        throw new Error(`GitHub API returned status ${response.status}: ${response.text}`);
      }
    } catch (err) {
      console.error('GitHub Gist API error:', err);
      throw new Error(err instanceof Error ? err.message : String(err), { cause: err });
    }
  }
}
