/**
 * @file index.ts
 * @brief Minimal controlled public facade for the Managed AI client subsystem.
 *
 * @license See LICENSE.md
 */

import type { App } from 'obsidian';
import type { IAgentClient } from '../../domain/contracts/IAgentClient';
import { RequestSigner } from './client/RequestSigner';
import { ManagedAgentClient } from './client/ManagedAgentClient';
import type { FetchLike } from './client/managedHttp';
import { DeviceKeyManager } from './identity/DeviceKeyManager';
import { LicenseManager } from './identity/LicenseManager';
import { type ISecretBackingStore, SecretStorageAdapter } from './identity/SecretStorageAdapter';
import { TrialManager } from './identity/TrialManager';
import { UsageSnapshotCache } from './state/UsageSnapshotCache';
import {
  type IManagedAccountService,
  type IManagedActivationService,
  type IManagedUsageService,
  type ManagedSessionMetadata,
  resolveGatewayBaseUrl
} from './protocol/managedTypes';

export { resolveGatewayBaseUrl } from './protocol/managedTypes';
export type {
  AccountUsageSnapshot,
  IManagedAccountService,
  IManagedActivationService,
  IManagedUsageService,
  ManagedSessionMetadata,
  TrialRegistrationOutcome
} from './protocol/managedTypes';
export { renderManagedSettingsSection } from './ui/ManagedSettingsSection';
export { promptManagedOnboarding } from './ui/ManagedOnboardingModal';

export interface ManagedSubsystemOptions {
  app?: App;
  getGatewayUrl?: () => string | undefined;
  onSessionUpdated?: (session: ManagedSessionMetadata | null) => Promise<void> | void;
  fetchFn?: FetchLike;
  customSecretStore?: ISecretBackingStore;
}

export interface ManagedAgentSubsystem {
  client: IAgentClient;
  accountService: IManagedAccountService;
  activationService: IManagedActivationService;
  usageService: IManagedUsageService;
}

/**
 * Instantiates the complete managed client subsystem.
 * Should only be called lazily when Managed mode is selected.
 */
export function createManagedAgentSubsystem(
  options: ManagedSubsystemOptions
): ManagedAgentSubsystem {
  const getBaseUrl = () => resolveGatewayBaseUrl(options.getGatewayUrl?.());
  const secretStorage = new SecretStorageAdapter(options.app, undefined, options.customSecretStore);
  const keyManager = new DeviceKeyManager(secretStorage);
  const signer = new RequestSigner(keyManager);
  const usageCache = new UsageSnapshotCache();

  const licenseManager = new LicenseManager({
    getBaseUrl,
    keyManager,
    secretStorage,
    signer,
    usageCache,
    onSessionUpdated: options.onSessionUpdated,
    fetchFn: options.fetchFn
  });

  const trialManager = new TrialManager({
    getBaseUrl,
    keyManager,
    signer,
    persistSession: input => licenseManager.persistSession(input),
    refreshSessionFn: async () => {
      await licenseManager.refreshAccessToken();
    },
    fetchFn: options.fetchFn
  });

  const client = new ManagedAgentClient({
    getBaseUrl,
    signer,
    tokenProvider: licenseManager,
    usageCache,
    fetchFn: options.fetchFn
  });

  return {
    client,
    accountService: trialManager,
    activationService: licenseManager,
    usageService: licenseManager
  };
}
