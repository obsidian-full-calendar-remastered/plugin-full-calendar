/**
 * @file toolDefinitions.ts
 * @brief Tool definitions formatted for OpenAI-compatible function calling.
 *
 * @license See LICENSE.md
 */

import type { ToolDefinition } from '../types';

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description:
        'Returns the current local date, time, day of the week, and user display timezone.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_calendar_sources',
      description:
        'Lists all configured calendars, their IDs, display names, colors, and writable capabilities.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_user_categories',
      description:
        'Returns the list of user-defined categories and colors for event title categorization.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_events',
      description:
        'Queries calendar events within a specified date range. Supports optional filtering by calendarId or category.',
      parameters: {
        type: 'object',
        properties: {
          startDate: {
            type: 'string',
            description: "ISO date string for query start, e.g. '2026-09-09'"
          },
          endDate: {
            type: 'string',
            description: "ISO date string for query end, e.g. '2026-09-16'"
          },
          calendarId: {
            type: 'string',
            description: 'Optional ID of a specific calendar to query'
          },
          category: {
            type: 'string',
            description: 'Optional category name to filter by'
          }
        },
        required: ['startDate', 'endDate']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_event_by_id',
      description: 'Retrieves the full details of a specific event by its ID.',
      parameters: {
        type: 'object',
        properties: {
          eventId: {
            type: 'string',
            description: 'Unique ID of the event'
          }
        },
        required: ['eventId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browse_schedule_online',
      description:
        'Fetches a user-provided external web page or online schedule (syllabus, timetable) via URL and returns clean text. Never use for plugin documentation.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The HTTP or HTTPS URL to browse'
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'lookup_plugin_docs',
      description:
        'Searches the local Full Calendar Remastered documentation index (no web access) for features, setup workflows, and official doc URLs.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Keywords or setup question (e.g. "daily note google calendar availability")'
          },
          category: {
            type: 'string',
            enum: [
              'getting_started',
              'calendars',
              'features',
              'chrono_analyser',
              'embeds',
              'events',
              'views',
              'settings',
              'guides',
              'reference',
              'all'
            ],
            description: 'Optional documentation category to browse or scope search'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_create_event',
      description:
        'Stages a proposal to create a new calendar event. Gated behind user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          calendarId: {
            type: 'string',
            description: 'ID of the target writable calendar'
          },
          title: {
            type: 'string',
            description: 'Event clean title (without category prefix)'
          },
          category: {
            type: 'string',
            description: "Category name from user's configured categories"
          },
          subCategory: {
            type: 'string',
            description: 'Optional subcategory name'
          },
          date: {
            type: 'string',
            description: 'Event start date (YYYY-MM-DD)'
          },
          endDate: {
            type: 'string',
            description: 'Optional end date for multi-day events (YYYY-MM-DD)'
          },
          allDay: {
            type: 'boolean',
            description: 'True if this is an all-day event'
          },
          startTime: {
            type: 'string',
            description: 'Start time in 24h format (HH:mm) if not allDay'
          },
          endTime: {
            type: 'string',
            description: 'End time in 24h format (HH:mm) if not allDay'
          },
          description: {
            type: 'string',
            description: 'Optional event description or notes'
          },
          location: {
            type: 'string',
            description: 'Optional event location or meeting URL'
          }
        },
        required: ['calendarId', 'title', 'date', 'allDay']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_update_event',
      description:
        'Stages a proposal to modify an existing calendar event. Gated behind user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          eventId: {
            type: 'string',
            description: 'ID of the event to update'
          },
          title: {
            type: 'string',
            description: 'New clean title'
          },
          category: {
            type: 'string',
            description: 'New category'
          },
          subCategory: {
            type: 'string',
            description: 'New subcategory'
          },
          date: {
            type: 'string',
            description: 'New date (YYYY-MM-DD)'
          },
          allDay: {
            type: 'boolean',
            description: 'New allDay status'
          },
          startTime: {
            type: 'string',
            description: 'New start time (HH:mm)'
          },
          endTime: {
            type: 'string',
            description: 'New end time (HH:mm)'
          },
          description: {
            type: 'string',
            description: 'New description'
          }
        },
        required: ['eventId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_delete_event',
      description: 'Stages a proposal to delete an event. Gated behind user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          eventId: {
            type: 'string',
            description: 'ID of the event to delete'
          },
          reason: {
            type: 'string',
            description: 'Reason for deleting the event'
          }
        },
        required: ['eventId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_batch_create_events',
      description:
        'Stages a proposal to create multiple events (e.g., imported from an online schedule). Gated behind user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          calendarId: {
            type: 'string',
            description: 'Target calendar ID for the events'
          },
          events: {
            type: 'array',
            description: 'List of event objects to stage',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                category: { type: 'string' },
                subCategory: { type: 'string' },
                date: { type: 'string' },
                allDay: { type: 'boolean' },
                startTime: { type: 'string' },
                endTime: { type: 'string' },
                description: { type: 'string' }
              },
              required: ['title', 'date', 'allDay']
            }
          }
        },
        required: ['calendarId', 'events']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_chrono_overview',
      description:
        'Returns Chrono Analyzer taxonomy: hierarchies, projects, categorization mode, logged date range, and Insight Groups.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_time',
      description:
        'Runs Chrono Analyzer for exact totals, breakdowns, trends, activity patterns, or period comparisons, and embeds an interactive chart.',
      parameters: {
        type: 'object',
        properties: {
          analysisType: {
            type: 'string',
            enum: ['pie', 'sunburst', 'time-series', 'activity', 'compare'],
            description: 'Chart or comparison type'
          },
          metric: {
            type: 'string',
            enum: ['duration', 'count'],
            description: 'Measure hours (duration) or event count'
          },
          startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
          endDate: { type: 'string', description: 'End date YYYY-MM-DD' },
          compareStartDate: { type: 'string', description: 'Comparison period start YYYY-MM-DD' },
          compareEndDate: { type: 'string', description: 'Comparison period end YYYY-MM-DD' },
          hierarchy: { type: 'string', description: 'Filter by hierarchy/category' },
          project: { type: 'string', description: 'Filter by project/subcategory' },
          pattern: {
            type: 'string',
            description: 'Project/subcategory keyword filter (supports -exclude)'
          },
          breakdownBy: {
            type: 'string',
            enum: ['hierarchy', 'project', 'subproject'],
            description: 'Pie breakdown field'
          },
          level: {
            type: 'string',
            enum: ['project', 'subproject'],
            description: 'Sunburst depth'
          },
          granularity: {
            type: 'string',
            enum: ['daily', 'weekly', 'monthly'],
            description: 'Time-series bucket'
          },
          timeSeriesType: {
            type: 'string',
            enum: ['line', 'stackedArea'],
            description: 'Time-series style'
          },
          stackingLevel: {
            type: 'string',
            enum: ['hierarchy', 'project', 'subproject'],
            description: 'Stack field for stackedArea'
          },
          patternType: {
            type: 'string',
            enum: ['dayOfWeek', 'hourOfDay', 'heatmapDOWvsHOD'],
            description: 'Activity pattern view'
          },
          title: { type: 'string', description: 'Short chart title' },
          embedChart: {
            type: 'boolean',
            description: 'Embed interactive chart in chat (default true)'
          }
        },
        required: ['analysisType']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_chrono_insights',
      description:
        'Generates Chrono Analyzer insights (Global Snapshot, group distribution, and Productivity/Wellness persona insights).',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }
];
