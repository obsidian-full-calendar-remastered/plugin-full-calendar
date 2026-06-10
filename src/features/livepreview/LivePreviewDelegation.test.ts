import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { EditorState, StateField as mockStateField, StateEffect } from '@codemirror/state';
import { TFile, editorInfoField, MarkdownFileInfo } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import {
  LivePreviewCoordinatorPlugin,
  livePreviewStateFieldSpec,
  forceUpdateLivePreviewEffect
} from './LivePreviewCoordinator';
import { LivePreviewDecorator } from './LivePreviewDecorator';
import type { CalendarProvider } from '../../providers/Provider';
import { ProviderRegistry } from '../../providers/ProviderRegistry';
import type FullCalendarPlugin from '../../main';
import { FullCalendarSettings } from '../../types/settings';
import EventCache from '../../core/EventCache';

const updateFileEffect = StateEffect.define<TFile | null>();

// Mock Obsidian modules
jest.mock(
  'obsidian',
  () => {
    class TAbstractFile {
      name = '';
      path = '';
    }
    class TFile extends TAbstractFile {}

    const innerEditorInfoField = mockStateField.define<{ file: TFile | null }>({
      create() {
        return { file: null };
      },
      update(val, tr) {
        for (const effect of tr.effects) {
          if (effect.value instanceof TFile) {
            return { file: effect.value };
          }
        }
        return val;
      }
    });

    return {
      TFile,
      Plugin: class {},
      App: class {},
      editorInfoField: innerEditorInfoField
    };
  },
  { virtual: true }
);

describe('LivePreviewDelegation Tests', () => {
  let mockPlugin: FullCalendarPlugin;
  let mockRegistry: ProviderRegistry;
  let mockDecorator: LivePreviewDecorator;
  let mockProvider: CalendarProvider<unknown>;
  let mockCache: {
    on: jest.Mock<void, [string, () => void]>;
    off: jest.Mock<void, [string, () => void]>;
    store: {
      getEventsInFile: jest.Mock<unknown[], [TFile]>;
    };
  };

  // Track mock functions directly to resolve unbound-method and type assertions
  let getDecorationsMock: jest.Mock<DecorationSet, [EditorState, TFile]>;
  let getEditorDecoratorMock: jest.Mock<LivePreviewDecorator, []>;
  let isFileRelevantMock: jest.Mock<boolean, [TFile]>;
  let getActiveProvidersMock: jest.Mock<CalendarProvider<unknown>[], []>;
  let getActiveFileMock: jest.Mock<TFile | null, []>;

  function createTestState(file: TFile | null): EditorState {
    return EditorState.create({
      doc: 'hello world',
      extensions: [editorInfoField.init(() => ({ file }) as unknown as MarkdownFileInfo)]
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();

    getDecorationsMock = jest
      .fn<DecorationSet, [EditorState, TFile]>()
      .mockReturnValue(Decoration.none);

    mockDecorator = {
      getDecorations: getDecorationsMock
    };

    getEditorDecoratorMock = jest.fn<LivePreviewDecorator, []>().mockReturnValue(mockDecorator);
    isFileRelevantMock = jest.fn<boolean, [TFile]>().mockReturnValue(true);

    mockProvider = {
      type: 'mock',
      displayName: 'Mock Provider',
      isRemote: false,
      loadPriority: 10,
      isFileRelevant: isFileRelevantMock,
      getEditorDecorator: getEditorDecoratorMock,
      getEvents: jest.fn(),
      getCapabilities: jest.fn(),
      getEventHandle: jest.fn(),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      createInstanceOverride: jest.fn(),
      getConfigurationComponent: jest.fn(),
      getSettingsRowComponent: jest.fn()
    };

    getActiveProvidersMock = jest
      .fn<CalendarProvider<unknown>[], []>()
      .mockReturnValue([mockProvider]);

    mockRegistry = {
      getActiveProviders: getActiveProvidersMock,
      getSource: jest.fn()
    } as unknown as ProviderRegistry;

    getActiveFileMock = jest.fn<TFile | null, []>().mockReturnValue(null);

    mockPlugin = {
      app: {
        workspace: {
          getActiveFile: getActiveFileMock
        }
      }
    } as unknown as FullCalendarPlugin;

    // Mock cache to support update events and store retrieval
    mockCache = {
      on: jest.fn<void, [string, () => void]>(),
      off: jest.fn<void, [string, () => void]>(),
      store: {
        getEventsInFile: jest.fn<unknown[], [TFile]>().mockReturnValue([])
      }
    };

    // Populate PluginState globals
    PluginState.setSettings({} as FullCalendarSettings);
    PluginState.setProviderRegistry(mockRegistry);

    // We mock PluginState methods
    jest.spyOn(PluginState, 'getPlugin').mockReturnValue(mockPlugin);
    jest.spyOn(PluginState, 'getProviderRegistry').mockReturnValue(mockRegistry);
    jest.spyOn(PluginState, 'getCache').mockReturnValue(mockCache as unknown as EventCache);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return Decoration.none if there is no active file', () => {
    getActiveFileMock.mockReturnValue(null);
    const state = createTestState(null);

    const decos = livePreviewStateFieldSpec.create(state);
    expect(decos).toBe(Decoration.none);
  });

  it('should return Decoration.none if no provider is active/relevant for the file', () => {
    const file = new TFile();
    file.path = 'test.md';
    getActiveFileMock.mockReturnValue(file);
    isFileRelevantMock.mockReturnValue(false);
    const state = createTestState(file);

    const decos = livePreviewStateFieldSpec.create(state);
    expect(decos).toBe(Decoration.none);
    expect(isFileRelevantMock).toHaveBeenCalledWith(file);
  });

  it('should return Decoration.none if provider does not implement getEditorDecorator', () => {
    const file = new TFile();
    file.path = 'test.md';
    getActiveFileMock.mockReturnValue(file);
    isFileRelevantMock.mockReturnValue(true);
    mockProvider.getEditorDecorator = undefined;
    const state = createTestState(file);

    const decos = livePreviewStateFieldSpec.create(state);
    expect(decos).toBe(Decoration.none);
  });

  it('should skip a provider without getEditorDecorator and select a subsequent relevant provider that implements it', () => {
    const file = new TFile();
    file.path = 'test.md';
    getActiveFileMock.mockReturnValue(file);
    const state = createTestState(file);

    // Mock first provider: relevant but has no getEditorDecorator
    const firstProvider: CalendarProvider<unknown> = {
      type: 'first',
      displayName: 'First Provider',
      isRemote: false,
      loadPriority: 10,
      isFileRelevant: () => true,
      getEvents: jest.fn(),
      getCapabilities: jest.fn(),
      getEventHandle: jest.fn(),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      createInstanceOverride: jest.fn(),
      getConfigurationComponent: jest.fn(),
      getSettingsRowComponent: jest.fn()
    };

    // Second provider is mockProvider (which has getEditorDecorator)
    getActiveProvidersMock.mockReturnValue([firstProvider, mockProvider]);

    const expectedDecorations = {} as DecorationSet;
    getDecorationsMock.mockReturnValue(expectedDecorations);

    const decos = livePreviewStateFieldSpec.create(state);
    expect(decos).toBe(expectedDecorations);
    expect(getEditorDecoratorMock).toHaveBeenCalled();
  });

  it('should delegate to provider decorator if file is relevant and provider has decorator', () => {
    const file = new TFile();
    file.path = 'test.md';
    getActiveFileMock.mockReturnValue(file);
    isFileRelevantMock.mockReturnValue(true);
    const state = createTestState(file);

    const expectedDecorations = {} as DecorationSet;
    getDecorationsMock.mockReturnValue(expectedDecorations);

    const decos = livePreviewStateFieldSpec.create(state);
    expect(decos).toBe(expectedDecorations);
    expect(getEditorDecoratorMock).toHaveBeenCalled();
    expect(getDecorationsMock).toHaveBeenCalledWith(state, file);
  });

  it('should rebuild decorations when document changes during update', () => {
    const file = new TFile();
    file.path = 'file.md';
    getActiveFileMock.mockReturnValue(file);

    const state = createTestState(file);
    const tr = state.update({
      changes: { from: 0, insert: 'hello' }
    });

    livePreviewStateFieldSpec.update(Decoration.none, tr);
    expect(getDecorationsMock).toHaveBeenCalledWith(tr.state, file);
  });

  it('should rebuild decorations when selection changes during update', () => {
    const file = new TFile();
    file.path = 'file.md';
    getActiveFileMock.mockReturnValue(file);

    const state = createTestState(file);
    const tr = state.update({
      selection: { anchor: 5 }
    });

    livePreviewStateFieldSpec.update(Decoration.none, tr);
    expect(getDecorationsMock).toHaveBeenCalledWith(tr.state, file);
  });

  it('should rebuild decorations when active file changes during update', () => {
    const file1 = new TFile();
    file1.path = 'file1.md';
    const file2 = new TFile();
    file2.path = 'file2.md';

    const state = createTestState(file1);
    const tr = state.update({
      effects: updateFileEffect.of(file2)
    });

    livePreviewStateFieldSpec.update(Decoration.none, tr);
    expect(getDecorationsMock).toHaveBeenCalledWith(tr.state, file2);
  });

  it('should rebuild decorations when forceUpdateLivePreviewEffect is dispatched', () => {
    const file = new TFile();
    file.path = 'file.md';
    getActiveFileMock.mockReturnValue(file);

    const state = createTestState(file);
    const tr = state.update({
      effects: forceUpdateLivePreviewEffect.of()
    });

    livePreviewStateFieldSpec.update(Decoration.none, tr);
    expect(getDecorationsMock).toHaveBeenCalledWith(tr.state, file);
  });

  it('should dispatch forceUpdateLivePreviewEffect when cache updates', () => {
    const dispatchMock = jest.fn();
    const mockViewWithDispatch = {
      dispatch: dispatchMock
    } as unknown as EditorView;

    const coordinator = new LivePreviewCoordinatorPlugin(mockViewWithDispatch);

    // Simulate cache update
    expect(mockCache.on).toHaveBeenCalledWith('update', expect.any(Function));
    const cacheCalls = mockCache.on.mock.calls as unknown as [string, () => void][];
    const updateCall = cacheCalls.find(call => call[0] === 'update');
    expect(updateCall).toBeDefined();
    if (updateCall) {
      const updateListener = updateCall[1];
      updateListener();
    }

    expect(dispatchMock).toHaveBeenCalled();
    const dispatchCalls = dispatchMock.mock.calls as unknown as {
      effects: { is: (effect: unknown) => boolean } | { is: (effect: unknown) => boolean }[];
    }[][];
    const lastCall = dispatchCalls[0][0];
    expect(lastCall.effects).toBeDefined();

    let hasEffect = false;
    const effects = lastCall.effects;
    if (Array.isArray(effects)) {
      hasEffect = effects.some(
        (e: { is: (effect: unknown) => boolean }) =>
          typeof e.is === 'function' && e.is(forceUpdateLivePreviewEffect)
      );
    } else {
      hasEffect = typeof effects.is === 'function' && effects.is(forceUpdateLivePreviewEffect);
    }
    expect(hasEffect).toBe(true);

    coordinator.destroy();
    expect(mockCache.off).toHaveBeenCalledWith('update', expect.any(Function));
  });
});
