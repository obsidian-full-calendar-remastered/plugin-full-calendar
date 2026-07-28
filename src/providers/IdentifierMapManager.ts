import { CalendarProvider, SyncKeyProvider, CanonicalTitleProvider } from './Provider';
import { OFCEvent } from '../types';
import EventCache from '../core/EventCache';
import { yieldIfFrameBudgetExceeded } from '../utils/async';

export class IdentifierMapManager {
  private pkCounter = 0;
  private identifierToSessionIdMap = new Map<string, string>();
  private sessionIdToIdentifierMap = new Map<string, string>();
  private identifierMapPromise: Promise<void> | null = null;

  constructor(
    private getCache: () => EventCache | null,
    private getInstance: (id: string) => CalendarProvider<unknown> | undefined
  ) {}

  public normalizePersistentId(id: string): string {
    return id.replace(/\\/g, '/');
  }

  public resolveSessionIdFromStoreFallback(
    calendarId: string,
    persistentId: string,
    eventHint?: OFCEvent
  ): string | null {
    const cache = this.getCache();
    if (!cache) {
      return null;
    }

    const normalizedPersistentId = this.normalizePersistentId(persistentId);
    const normalizedEventUid = eventHint?.uid ? this.normalizePersistentId(eventHint.uid) : null;

    const eventsInCalendar = cache.store.getEventsInCalendar(calendarId);

    const byPersistentId = eventsInCalendar.find(stored => {
      const uid = stored.event.uid ? this.normalizePersistentId(stored.event.uid) : null;
      const locationPath = stored.location?.path
        ? this.normalizePersistentId(stored.location.path)
        : null;
      return uid === normalizedPersistentId || locationPath === normalizedPersistentId;
    });

    if (byPersistentId) {
      return byPersistentId.id;
    }

    if (normalizedEventUid) {
      const byEventUid = eventsInCalendar.find(stored => {
        const uid = stored.event.uid ? this.normalizePersistentId(stored.event.uid) : null;
        return uid === normalizedEventUid;
      });
      if (byEventUid) {
        return byEventUid.id;
      }
    }

    return null;
  }

  public repairMappingFromStore(calendarId: string, sessionId: string): void {
    const cache = this.getCache();
    if (!cache) {
      return;
    }

    const details = cache.store.getEventDetails(sessionId);
    if (!details) {
      return;
    }

    this.addMapping(details.event, calendarId, sessionId);
  }

  public generateId(): string {
    return `${this.pkCounter++}`;
  }

  public async getSessionId(globalIdentifier: string): Promise<string | null> {
    if (this.identifierMapPromise) {
      await this.identifierMapPromise;
    }
    return this.identifierToSessionIdMap.get(globalIdentifier) || null;
  }

  public getGlobalIdentifier(event: OFCEvent, calendarId: string): string | null {
    const instance = this.getInstance(calendarId);
    if (!instance) {
      console.warn(`Could not find provider instance for calendar ID ${calendarId}`);
      return null;
    }
    const handle = instance.getEventHandle(event);
    if (!handle) {
      return null;
    }
    return `${calendarId}::${handle.persistentId}`;
  }

  public computeSyncKeyForEvent(event: OFCEvent, calendarId: string): string | null {
    const instance = this.getInstance(calendarId);
    if (!instance) return null;

    if (
      'computeSyncKey' in instance &&
      typeof (instance as SyncKeyProvider).computeSyncKey === 'function'
    ) {
      const key = (instance as SyncKeyProvider).computeSyncKey(event);
      return `${calendarId}::${key}`;
    }

    return this.getGlobalIdentifier(event, calendarId);
  }

  public getCanonicalTitle(event: OFCEvent, calendarId: string): string {
    const instance = this.getInstance(calendarId);
    if (
      instance &&
      'getCanonicalTitle' in instance &&
      typeof (instance as CanonicalTitleProvider).getCanonicalTitle === 'function'
    ) {
      return (instance as CanonicalTitleProvider).getCanonicalTitle(event);
    }

    return event.title;
  }

  public buildMap(store: {
    getAllEvents(): { event: OFCEvent; calendarId: string; id: string }[];
  }): void {
    const cache = this.getCache();
    if (!cache) return;
    this.identifierMapPromise = (async () => {
      this.identifierToSessionIdMap.clear();
      this.sessionIdToIdentifierMap.clear();
      const allEvents = store.getAllEvents();
      let frameStart = performance.now();
      for (const storedEvent of allEvents) {
        const globalIdentifier = this.getGlobalIdentifier(
          storedEvent.event,
          storedEvent.calendarId
        );
        if (globalIdentifier) {
          this.identifierToSessionIdMap.set(globalIdentifier, storedEvent.id);
          this.sessionIdToIdentifierMap.set(storedEvent.id, globalIdentifier);
        }
        frameStart = await yieldIfFrameBudgetExceeded(frameStart, 5);
      }
    })();
  }

  public addMapping(event: OFCEvent, calendarId: string, sessionId: string): void {
    const globalIdentifier = this.getGlobalIdentifier(event, calendarId);
    if (globalIdentifier) {
      const existingGlobalId = this.sessionIdToIdentifierMap.get(sessionId);
      if (existingGlobalId && existingGlobalId !== globalIdentifier) {
        this.identifierToSessionIdMap.delete(existingGlobalId);
      }
      this.identifierToSessionIdMap.set(globalIdentifier, sessionId);
      this.sessionIdToIdentifierMap.set(sessionId, globalIdentifier);
    }
  }

  public removeMapping(sessionId: string): void {
    const globalIdentifier = this.sessionIdToIdentifierMap.get(sessionId);
    if (globalIdentifier) {
      this.identifierToSessionIdMap.delete(globalIdentifier);
      this.sessionIdToIdentifierMap.delete(sessionId);
    }
  }

  public clear(): void {
    this.identifierToSessionIdMap.clear();
    this.sessionIdToIdentifierMap.clear();
    this.identifierMapPromise = null;
  }
}
