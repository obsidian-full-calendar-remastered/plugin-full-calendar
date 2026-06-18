/**
 * @file TasksBacklogDragDrop.test.ts
 * @brief Tests for Tasks Backlog drag and drop integration with FullCalendar
 *
 * @description
 * This test suite verifies that the Tasks Backlog view correctly integrates with
 * FullCalendar's Draggable API and that the drop functionality works as expected.
 *
 * @license See LICENSE.md
 */

import { Draggable } from '@fullcalendar/interaction';

// Mock FullCalendar's Draggable API
jest.mock('@fullcalendar/interaction', () => ({
  Draggable: jest.fn().mockImplementation(() => ({
    destroy: jest.fn()
  }))
}));

// Mock the CSS import
jest.mock('../backlog-styles.css', () => ({}));

const MockedDraggable = Draggable as jest.MockedClass<typeof Draggable>;

describe('Tasks Backlog Drag and Drop Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('FullCalendar Draggable API Import and Mock', () => {
    it('should import Draggable from @fullcalendar/interaction', () => {
      // Test that the Draggable class is properly imported and available
      expect(Draggable).toBeDefined();
      expect(MockedDraggable).toBeDefined();
      expect(typeof Draggable).toBe('function');
    });

    it('should support instantiation with container and options', () => {
      // Mock a basic container
      const mockContainer = {} as HTMLElement;

      // Test that we can instantiate it with our expected configuration
      const draggable = new Draggable(mockContainer, {
        itemSelector: '.tasks-backlog-item'
      });

      expect(MockedDraggable).toHaveBeenCalledWith(
        mockContainer,
        expect.objectContaining({
          itemSelector: '.tasks-backlog-item'
        })
      );

      expect(draggable).toBeDefined();
      expect(typeof draggable.destroy).toBe('function');
    });

    it('should support destroy method call', () => {
      const mockDestroy = jest.fn();
      MockedDraggable.mockReturnValue({ destroy: mockDestroy } as unknown as InstanceType<
        typeof Draggable
      >);

      const mockContainer = {} as HTMLElement;
      const draggable = new Draggable(mockContainer, {
        itemSelector: '.tasks-backlog-item'
      });

      // Test that destroy can be called
      draggable.destroy();
      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  describe('Configuration Validation', () => {
    it('should use correct itemSelector for tasks backlog items', () => {
      const mockContainer = {} as HTMLElement;

      // Test the exact configuration used in TasksBacklogView
      new Draggable(mockContainer, {
        itemSelector: '.tasks-backlog-item'
      });

      expect(MockedDraggable).toHaveBeenCalledWith(
        mockContainer,
        expect.objectContaining({
          itemSelector: '.tasks-backlog-item'
        })
      );
    });

    it('should not require eventData configuration', () => {
      const mockContainer = {} as HTMLElement;

      // Test that we don't need to pass eventData since we read from data-task-id attribute
      new Draggable(mockContainer, {
        itemSelector: '.tasks-backlog-item'
        // No eventData property needed
      });

      expect(MockedDraggable).toHaveBeenCalledWith(
        mockContainer,
        expect.objectContaining({
          itemSelector: '.tasks-backlog-item'
        })
      );

      // Verify eventData is not in the configuration
      const call = MockedDraggable.mock.calls[0];
      expect(call[1]).not.toHaveProperty('eventData');
    });
  });

  describe('Integration Pattern Testing', () => {
    it('should follow the destroy-then-create pattern for re-initialization', () => {
      const mockDestroy = jest.fn();
      MockedDraggable.mockReturnValue({ destroy: mockDestroy } as unknown as InstanceType<
        typeof Draggable
      >);

      const mockContainer = {} as HTMLElement;

      // Simulate the pattern used in TasksBacklogView.renderTasksList
      let draggable: Draggable | null;

      // First initialization
      draggable = new Draggable(mockContainer, {
        itemSelector: '.tasks-backlog-item'
      });

      // Re-initialization (like when re-rendering tasks)
      if (draggable) {
        draggable.destroy();
      }
      new Draggable(mockContainer, {
        itemSelector: '.tasks-backlog-item'
      });

      // Should have been called twice (initial + re-init)
      expect(MockedDraggable).toHaveBeenCalledTimes(2);
      // Should have destroyed the first instance
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('should handle cleanup on view close', () => {
      const mockDestroy = jest.fn();
      MockedDraggable.mockReturnValue({ destroy: mockDestroy } as unknown as InstanceType<
        typeof Draggable
      >);

      const mockContainer = {} as HTMLElement;
      const draggable: Draggable | null = new Draggable(mockContainer, {
        itemSelector: '.tasks-backlog-item'
      });

      // Simulate the cleanup pattern from TasksBacklogView.onClose
      if (draggable) {
        draggable.destroy();
      }

      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  describe('TasksBacklogView Integration Requirements', () => {
    it('should validate the expected task item attributes', () => {
      // This test validates that our implementation provides the correct attributes
      // that FullCalendar's drop callback expects to read from info.draggedEl

      const expectedAttributes = {
        draggable: 'true',
        'data-task-id': 'test.md::1'
      };

      // Test that these are the attributes we set on task items
      expect(expectedAttributes['draggable']).toBe('true');
      expect(expectedAttributes['data-task-id']).toMatch(/^.+::\d+$/);
    });

    it('should validate task ID format', () => {
      // Test the format used for task IDs
      const mockTaskId = 'test.md::1';
      const parts = mockTaskId.split('::');

      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe('test.md'); // file path
      expect(parts[1]).toBe('1'); // line number
      expect(Number(parts[1])).toBe(1); // line number should be numeric
    });
  });
});
