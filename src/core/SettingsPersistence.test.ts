import { SettingsPersistence, SettingsPersistenceAdapter } from './SettingsPersistence';

function createMockAdapter(
  overrides: Partial<SettingsPersistenceAdapter> = {}
): SettingsPersistenceAdapter & {
  files: Map<string, string>;
  savedPayloads: unknown[];
  corruptReasons: string[];
} {
  const files = new Map<string, string>();
  const savedPayloads: unknown[] = [];
  const corruptReasons: string[] = [];

  const adapter: SettingsPersistenceAdapter & {
    files: Map<string, string>;
    savedPayloads: unknown[];
    corruptReasons: string[];
  } = {
    dataJsonPath: 'vault-config/plugins/full-calendar-remastered/data.json',
    backupPath: 'vault-config/plugins/full-calendar-remastered/data.json.corrupt.bak',
    files,
    savedPayloads,
    corruptReasons,
    loadRawData: jest.fn(async () => null),
    saveRawData: jest.fn(async (data: unknown) => {
      savedPayloads.push(data);
      files.set(adapter.dataJsonPath, JSON.stringify(data));
    }),
    fileExists: jest.fn(async (path: string) => files.has(path)),
    readRawFile: jest.fn(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`File not found: ${path}`);
      }
      return content;
    }),
    writeRawFile: jest.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
    onCorruptData: (reason: string) => {
      corruptReasons.push(reason);
    },
    ...overrides
  };

  return adapter;
}

describe('SettingsPersistence', () => {
  it('blocks saves before initial load completes', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = createMockAdapter();
    const persistence = new SettingsPersistence(adapter);

    const wrote = await persistence.save({ calendarSources: [] });
    expect(wrote).toBe(false);
    expect(persistence.isLoaded).toBe(false);
    expect(adapter.saveRawData).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('allows saves on a genuine fresh install when data.json does not exist', async () => {
    const adapter = createMockAdapter({
      loadRawData: jest.fn(async () => null)
    });
    const persistence = new SettingsPersistence(adapter);

    const result = await persistence.load();
    expect(result).toEqual({ status: 'fresh', data: null });
    expect(persistence.isLoaded).toBe(true);
    expect(persistence.isSaveBlocked).toBe(false);

    const wrote = await persistence.save({ currentVersion: '0.13.7' });
    expect(wrote).toBe(true);
    expect(adapter.savedPayloads).toEqual([{ currentVersion: '0.13.7' }]);
  });

  it('fails closed, backs up non-empty corrupt data.json, and blocks all saves', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = createMockAdapter();
    const corruptRaw = '{"calendarSources":[{"id":"c1"}], broken_json';
    adapter.files.set(adapter.dataJsonPath, corruptRaw);
    adapter.loadRawData = jest.fn(async () => null);

    const persistence = new SettingsPersistence(adapter);
    const result = await persistence.load();

    expect(result.status).toBe('corrupt');
    expect(persistence.isLoaded).toBe(false);
    expect(persistence.isSaveBlocked).toBe(true);
    expect(adapter.files.get(adapter.backupPath)).toBe(corruptRaw);
    expect(adapter.corruptReasons).toHaveLength(1);

    const wrote = await persistence.save({ calendarSources: [] });
    expect(wrote).toBe(false);
    expect(adapter.saveRawData).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('treats an existing 0-byte data.json as corrupt and does not write an empty backup', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = createMockAdapter();
    adapter.files.set(adapter.dataJsonPath, '');
    adapter.loadRawData = jest.fn(async () => null);

    const persistence = new SettingsPersistence(adapter);
    const result = await persistence.load();

    expect(result.status).toBe('corrupt');
    expect(persistence.isSaveBlocked).toBe(true);
    expect(adapter.files.has(adapter.backupPath)).toBe(false);
    expect(await persistence.save({ calendarSources: [] })).toBe(false);
    expect(adapter.saveRawData).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('blocks saves when loadRawData throws (e.g., EBUSY/EPERM)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = createMockAdapter({
      loadRawData: jest.fn(async () => {
        throw new Error('EBUSY: resource busy or locked');
      })
    });
    adapter.files.set(adapter.dataJsonPath, '{"calendarSources":[{"id":"keep"}]}');

    const persistence = new SettingsPersistence(adapter);
    const result = await persistence.load();

    expect(result.status).toBe('corrupt');
    expect(persistence.isSaveBlocked).toBe(true);
    expect(adapter.files.get(adapter.backupPath)).toBe('{"calendarSources":[{"id":"keep"}]}');
    expect(await persistence.save({ calendarSources: [] })).toBe(false);
    expect(adapter.saveRawData).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('deduplicates corrupt backup writes when backup already has identical content', async () => {
    const adapter = createMockAdapter();
    const corruptRaw = '{invalid';
    adapter.files.set(adapter.dataJsonPath, corruptRaw);
    adapter.files.set(adapter.backupPath, corruptRaw);
    adapter.loadRawData = jest.fn(async () => null);

    const persistence = new SettingsPersistence(adapter);
    const result = await persistence.load();

    expect(result.status).toBe('corrupt');
    expect(adapter.writeRawFile).not.toHaveBeenCalled();
  });

  it('serializes concurrent save() calls strictly FIFO with snapshot isolation', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const writtenOrder: number[] = [];

    const adapter = createMockAdapter({
      loadRawData: jest.fn(async () => ({ count: 0 })),
      saveRawData: jest.fn(async (data: unknown) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(resolve => window.setTimeout(resolve, 10));
        writtenOrder.push((data as { count: number }).count);
        inFlight -= 1;
      })
    });

    const persistence = new SettingsPersistence(adapter);
    const loaded = await persistence.load();
    expect(loaded.status).toBe('loaded');

    const mutableState = { count: 1, nested: { label: 'first' } };
    const p1 = persistence.save(mutableState);
    mutableState.count = 2;
    mutableState.nested.label = 'second';
    const p2 = persistence.save(mutableState);
    mutableState.count = 3;
    mutableState.nested.label = 'third';
    const p3 = persistence.save(mutableState);

    expect(await Promise.all([p1, p2, p3])).toEqual([true, true, true]);
    expect(maxInFlight).toBe(1);
    expect(writtenOrder).toEqual([1, 2, 3]);
  });

  it('recovers queue after a failed saveRawData call', async () => {
    let shouldFail = true;
    const adapter = createMockAdapter({
      loadRawData: jest.fn(async () => ({ ok: true })),
      saveRawData: jest.fn(async (data: unknown) => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error('Transient write error');
        }
        adapter.savedPayloads.push(data);
      })
    });

    const persistence = new SettingsPersistence(adapter);
    await persistence.load();

    await expect(persistence.save({ step: 1 })).rejects.toThrow('Transient write error');
    const secondOk = await persistence.save({ step: 2 });
    expect(secondOk).toBe(true);
    expect(adapter.savedPayloads).toEqual([{ step: 2 }]);
  });
});
