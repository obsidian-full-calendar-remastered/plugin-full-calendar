/**
 * @file agentSettings.ts
 * @brief Single source of truth for agent settings initialization, BYOK options, and managed session persistence.
 *
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import {
  DEFAULT_AGENT_SPEC_URL,
  REMOTE_AGENT_ASSET_BASE_URL,
  type AgentSettings,
  type ManagedAgentSettings
} from '../../../types/settings';
import { CredentialStore } from '../../credentials/CredentialStore';
import type { AgentClientOptions } from './AgentClient';

export { DEFAULT_AGENT_SPEC_URL, REMOTE_AGENT_ASSET_BASE_URL };

export type ManagedSessionPersistencePayload = Pick<
  ManagedAgentSettings,
  'principalId' | 'activationId' | 'keyId' | 'licenseKeyMasked' | 'planTier' | 'currentPeriodEnd'
>;

export const AGENT_DOCS_LINKS = [
  { text: 'Full Calendar Agent guide', path: 'user/features/agent' },
  { text: 'Agent architecture spec', path: 'architecture/api/agent-spec' },
  { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
];

export function ensureAgentSettings(): AgentSettings {
  const s = PluginState.getSettings();
  if (!s.agent) {
    s.agent = {
      enabled: true,
      mode: 'managed',
      endpointUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      specUrl: DEFAULT_AGENT_SPEC_URL,
      maxRetries: 3,
      timeoutMs: 60000
    };
  }
  return s.agent;
}

export function ensureManagedAgentSettings(): ManagedAgentSettings {
  const ag = ensureAgentSettings();
  if (!ag.managed) {
    ag.managed = {};
  }
  return ag.managed;
}

export function buildByokClientOptions(
  overrides?: Partial<AgentClientOptions>
): AgentClientOptions {
  const settings = PluginState.getSettings().agent;
  const apiKey = CredentialStore.getAgentApiKey() || settings?.apiKey || '';

  return {
    endpointUrl: settings?.endpointUrl || 'https://api.openai.com/v1',
    apiKey,
    model: settings?.model || 'gpt-4o-mini',
    temperature: settings?.temperature,
    maxRetries: settings?.maxRetries ?? 3,
    timeoutMs: settings?.timeoutMs ?? 60000,
    ...overrides
  };
}

/**
 * Persists non-sensitive managed session metadata while preserving `gatewayUrl`
 * and `onboardingAcknowledged` across activation/deactivation cycles.
 */
export async function persistManagedSession(
  session: ManagedSessionPersistencePayload | null
): Promise<void> {
  const ag = ensureAgentSettings();
  const prev = ag.managed;
  const preserved: ManagedAgentSettings = {};

  if (prev?.gatewayUrl) preserved.gatewayUrl = prev.gatewayUrl;
  if (prev?.onboardingAcknowledged) {
    preserved.onboardingAcknowledged = prev.onboardingAcknowledged;
  }

  if (!session) {
    ag.managed = Object.keys(preserved).length > 0 ? preserved : undefined;
  } else {
    ag.managed = {
      ...preserved,
      principalId: session.principalId,
      activationId: session.activationId,
      keyId: session.keyId,
      licenseKeyMasked: session.licenseKeyMasked,
      planTier: session.planTier,
      currentPeriodEnd: session.currentPeriodEnd
    };
  }

  await PluginState.saveSettings();
}
