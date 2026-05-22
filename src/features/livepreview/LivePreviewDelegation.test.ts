import { Decoration, DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';
import { TFile } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import { LivePreviewCoordinatorPlugin } from './LivePreviewCoordinator';
import { LivePreviewDecorator } from './LivePreviewDecorator';
import type { CalendarProvider } from '../../providers/Provider';
import { ProviderRegistry } from '../../providers/ProviderRegistry';
import type FullCalendarPlugin from '../../main';
import { FullCalendarSettings } from '../../types/settings';

// Mock Obsidian modules
jest.mock(
  'obsidian',
  () => {
    class TAbstractFile {
      name = '';
      path = '';
    }
    class TFile extends TAbstractFile {}
    return {
      TFile,
      Plugin: class {},
      App: class {}
    };
  },
  { virtual: true }
);

describe('LivePreviewDelegation Tests', () => {
  let mockPlugin: FullCalendarPlugin;
  let mockRegistry: ProviderRegistry;
  let mockDecorator: LivePreviewDecorator;
  let mockProvider: CalendarProvider<unknown>;
  let mockView: EditorView;

  // Track mock functions directly to resolve unbound-method and type assertions
  let getDecorationsMock: jest.Mock<
    DecorationSet,
    [EditorView, TFile, readonly { from: number; to: number }[]]
  >;
  let getEditorDecoratorMock: jest.Mock<LivePreviewDecorator, []>;
  let isFileRelevantMock: jest.Mock<boolean, [TFile]>;
  let getActiveProvidersMock: jest.Mock<CalendarProvider<unknown>[], []>;
  let getActiveFileMock: jest.Mock<TFile | null, []>;
  let lineAtMock: jest.Mock<{ number: number }, [number]>;

  beforeEach(() => {
    jest.clearAllMocks();

    getDecorationsMock = jest
      .fn<DecorationSet, [EditorView, TFile, readonly { from: number; to: number }[]]>()
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

    // Populate PluginState globals
    PluginState.setSettings({} as FullCalendarSettings);
    PluginState.setProviderRegistry(mockRegistry);

    // We mock PluginState.getPlugin() to return our mockPlugin
    jest.spyOn(PluginState, 'getPlugin').mockReturnValue(mockPlugin);
    jest.spyOn(PluginState, 'getProviderRegistry').mockReturnValue(mockRegistry);

    lineAtMock = jest.fn<{ number: number }, [number]>().mockReturnValue({ number: 1 });

    // Mock EditorView and visibleRanges
    mockView = {
      visibleRanges: [{ from: 0, to: 100 }],
      state: {
        selection: {
          main: { head: 0 }
        },
        doc: {
          lineAt: lineAtMock
        }
      }
    } as unknown as EditorView;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return Decoration.none if there is no active file', () => {
    getActiveFileMock.mockReturnValue(null);
    const coordinator = new LivePreviewCoordinatorPlugin(mockView);
    expect(coordinator.decorations).toBe(Decoration.none);
  });

  it('should return Decoration.none if no provider is active/relevant for the file', () => {
    const file = new TFile();
    file.path = 'test.md';
    getActiveFileMock.mockReturnValue(file);
    isFileRelevantMock.mockReturnValue(false);

    const coordinator = new LivePreviewCoordinatorPlugin(mockView);
    expect(coordinator.decorations).toBe(Decoration.none);
    expect(isFileRelevantMock).toHaveBeenCalledWith(file);
  });

  it('should return Decoration.none if provider does not implement getEditorDecorator', () => {
    const file = new TFile();
    file.path = 'test.md';
    getActiveFileMock.mockReturnValue(file);
    isFileRelevantMock.mockReturnValue(true);
    mockProvider.getEditorDecorator = undefined;

    const coordinator = new LivePreviewCoordinatorPlugin(mockView);
    expect(coordinator.decorations).toBe(Decoration.none);
  });

  it('should delegate to provider decorator if file is relevant and provider has decorator', () => {
    const file = new TFile();
    file.path = 'test.md';
    getActiveFileMock.mockReturnValue(file);
    isFileRelevantMock.mockReturnValue(true);

    const expectedDecorations = {} as DecorationSet;
    getDecorationsMock.mockReturnValue(expectedDecorations);

    const coordinator = new LivePreviewCoordinatorPlugin(mockView);
    expect(coordinator.decorations).toBe(expectedDecorations);
    expect(getEditorDecoratorMock).toHaveBeenCalled();
    expect(getDecorationsMock).toHaveBeenCalledWith(mockView, file, mockView.visibleRanges);
  });

  it('should rebuild decorations when active file path changes during update', () => {
    const file1 = new TFile();
    file1.path = 'file1.md';
    const file2 = new TFile();
    file2.path = 'file2.md';

    getActiveFileMock.mockReturnValue(file1);

    const coordinator = new LivePreviewCoordinatorPlugin(mockView);
    expect(getDecorationsMock).toHaveBeenCalledTimes(1);

    // Change active file
    getActiveFileMock.mockReturnValue(file2);

    const mockUpdate = {
      view: mockView,
      docChanged: false,
      selectionSet: false,
      viewportChanged: false
    } as unknown as ViewUpdate;

    coordinator.update(mockUpdate);
    expect(getDecorationsMock).toHaveBeenCalledTimes(2);
    expect(getDecorationsMock).toHaveBeenLastCalledWith(mockView, file2, mockView.visibleRanges);
  });

  it('should rebuild decorations when document changes during update', () => {
    const file = new TFile();
    file.path = 'file.md';
    getActiveFileMock.mockReturnValue(file);

    const coordinator = new LivePreviewCoordinatorPlugin(mockView);
    expect(getDecorationsMock).toHaveBeenCalledTimes(1);

    const mockUpdate = {
      view: mockView,
      docChanged: true,
      selectionSet: false,
      viewportChanged: false
    } as unknown as ViewUpdate;

    coordinator.update(mockUpdate);
    expect(getDecorationsMock).toHaveBeenCalledTimes(2);
  });

  it('should rebuild decorations when selection changes during update', () => {
    const file = new TFile();
    file.path = 'file.md';
    getActiveFileMock.mockReturnValue(file);

    const coordinator = new LivePreviewCoordinatorPlugin(mockView);
    expect(getDecorationsMock).toHaveBeenCalledTimes(1);

    const mockUpdate = {
      view: mockView,
      docChanged: false,
      selectionSet: true,
      viewportChanged: false
    } as unknown as ViewUpdate;

    coordinator.update(mockUpdate);
    expect(getDecorationsMock).toHaveBeenCalledTimes(2);
  });

  it('should rebuild decorations when viewport changes during update', () => {
    const file = new TFile();
    file.path = 'file.md';
    getActiveFileMock.mockReturnValue(file);

    const coordinator = new LivePreviewCoordinatorPlugin(mockView);
    expect(getDecorationsMock).toHaveBeenCalledTimes(1);

    const mockUpdate = {
      view: mockView,
      docChanged: false,
      selectionSet: false,
      viewportChanged: true
    } as unknown as ViewUpdate;

    coordinator.update(mockUpdate);
    expect(getDecorationsMock).toHaveBeenCalledTimes(2);
  });
});
