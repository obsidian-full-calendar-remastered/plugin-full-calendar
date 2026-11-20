/**
 * @file suggestionsParser.test.ts
 * @brief Unit tests for follow-up suggestions extraction and streaming prefix masking.
 */

import { extractFollowUpSuggestions, StreamingSuggestionsFilter } from './suggestionsParser';

describe('suggestionsParser', () => {
  describe('extractFollowUpSuggestions', () => {
    it('extracts JSON array suggestions and strips the tag block cleanly', () => {
      const raw =
        'Here is your schedule for today.\n\n<suggestions>["Check tomorrow", "Add a workout", "Reschedule 3 PM"]</suggestions>';
      const result = extractFollowUpSuggestions(raw);

      expect(result.cleanText).toBe('Here is your schedule for today.');
      expect(result.suggestions).toEqual(['Check tomorrow', 'Add a workout', 'Reschedule 3 PM']);
    });

    it('falls back to bulleted lines, deduplicates case-insensitively, and caps at 3 items', () => {
      const raw = [
        'Done!',
        '<suggestions>',
        '- Review Friday events',
        '* review friday events',
        '1. Check free time next week',
        '- Clean up YouTube titles',
        '- Fourth extra suggestion',
        '</suggestions>'
      ].join('\n');

      const result = extractFollowUpSuggestions(raw);
      expect(result.cleanText).toBe('Done!');
      expect(result.suggestions).toEqual([
        'Review Friday events',
        'Check free time next week',
        'Clean up YouTube titles'
      ]);
    });

    it('handles unclosed trailing <suggestions> tags gracefully', () => {
      const raw = 'Staged 3 updates.\n<suggestions>["Show conflicts", "Summarize week"]';
      const result = extractFollowUpSuggestions(raw);

      expect(result.cleanText).toBe('Staged 3 updates.');
      expect(result.suggestions).toEqual(['Show conflicts', 'Summarize week']);
    });

    it('filters overly long items and fenced JSON blocks', () => {
      const longItem = 'A'.repeat(100);
      const raw = `Ready.\n<suggestions>\`\`\`json\n["Valid follow-up", "${longItem}"]\n\`\`\`</suggestions>`;
      const result = extractFollowUpSuggestions(raw);

      expect(result.cleanText).toBe('Ready.');
      expect(result.suggestions).toEqual(['Valid follow-up']);
    });
  });

  describe('StreamingSuggestionsFilter', () => {
    it('masks <suggestions> even when split across arbitrary token boundaries', () => {
      const filter = new StreamingSuggestionsFilter();
      const deltas = [
        'Here is ',
        'your plan.\n\n<',
        'sug',
        'gestions>',
        '["Check Friday",',
        ' "Add focus block"]',
        '</suggestions>'
      ];

      const visible = deltas.map(d => filter.push(d)).join('');
      const finished = filter.finish();

      expect(visible + finished.remainingVisibleText).toBe('Here is your plan.\n\n');
      expect(finished.fullCleanText).toBe('Here is your plan.');
      expect(finished.suggestions).toEqual(['Check Friday', 'Add focus block']);
    });

    it('does not stall normal prose containing "<" like "meeting < 30 min"', () => {
      const filter = new StreamingSuggestionsFilter();
      const out1 = filter.push('Keep the meeting <');
      expect(out1).toBe('Keep the meeting ');
      const out2 = filter.push(' 30 min.');
      expect(out2).toBe('< 30 min.');
      const finished = filter.finish();
      expect(finished.fullCleanText).toBe('Keep the meeting < 30 min.');
      expect(finished.suggestions).toEqual([]);
    });

    it('discards partial trailing <sug fragment on abort', () => {
      const filter = new StreamingSuggestionsFilter();
      const visible = filter.push('All set.<sug');
      const finished = filter.finish();

      expect(visible).toBe('All set.');
      expect(finished.remainingVisibleText).toBe('');
      expect(finished.fullCleanText).toBe('All set.');
      expect(finished.suggestions).toEqual([]);
    });
  });
});
