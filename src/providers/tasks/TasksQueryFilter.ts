import { CalendarTask } from './taskPayloadAdapter';

export interface QueryRule {
  field: 'path' | 'folder' | 'description' | 'tag' | 'tags' | 'priority';
  operator:
    | 'includes'
    | 'does not include'
    | 'regex matches'
    | 'regex does not match'
    | 'is'
    | 'is not';
  value: string;
}

/**
 * Parses and evaluates Obsidian Tasks queries for the global query feature in the sidebar backlog.
 */
export class TasksQueryFilter {
  private rules: QueryRule[] = [];

  constructor(queryString: string) {
    this.parseQuery(queryString);
  }

  private parseQuery(queryString: string): void {
    if (!queryString) return;

    const lines = queryString.split('\n');
    const lineRegex =
      /^(path|folder|description|tags?|priority)\s+(does not include|do not include|includes?|regex does not match|regex matches|is not|are not|is|are)\s+(.*)$/i;
    const IGNORED_PREFIXES = [
      'explain',
      'limit',
      'sort by',
      'group by',
      'short mode',
      'show',
      'hide',
      'filter by'
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
        continue;
      }
      if (IGNORED_PREFIXES.some(prefix => trimmed.toLowerCase().startsWith(prefix))) {
        continue;
      }

      const match = trimmed.match(lineRegex);
      if (match) {
        const field = match[1].toLowerCase() as QueryRule['field'];
        const rawOp = match[2];
        const value = match[3].trim();

        const operator = this.normalizeOperator(rawOp) as QueryRule['operator'];
        this.rules.push({ field, operator, value });
      }
    }
  }

  private normalizeOperator(op: string): string {
    const o = op.toLowerCase();
    if (o === 'include' || o === 'includes') return 'includes';
    if (o === 'does not include' || o === 'do not include') return 'does not include';
    if (o === 'is' || o === 'are') return 'is';
    if (o === 'is not' || o === 'are not') return 'is not';
    return o;
  }

  /**
   * Filters the list of CalendarTasks based on the parsed query rules.
   */
  public filter(tasks: CalendarTask[]): CalendarTask[] {
    if (this.rules.length === 0) {
      return tasks;
    }
    return tasks.filter(task => this.matchesAll(task));
  }

  /**
   * Evaluates if a given task matches all query rules (logical AND).
   */
  public matchesAll(task: CalendarTask): boolean {
    return this.rules.every(rule => this.matchesRule(task, rule));
  }

  private matchesRule(task: CalendarTask, rule: QueryRule): boolean {
    const { field, operator, value } = rule;

    switch (field) {
      case 'path':
        return this.matchString(task.filePath, operator, value);
      case 'folder':
        return this.matchString(this.getTaskFolder(task.filePath), operator, value);
      case 'description':
        return this.matchString(task.title, operator, value);
      case 'tag':
      case 'tags':
        return this.matchTags(task, operator, value);
      case 'priority':
        return this.matchPriority(task, operator, value);
      default:
        return true;
    }
  }

  private getTaskFolder(filePath: string): string {
    const lastSlashIndex = filePath.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      return '';
    }
    return filePath.slice(0, lastSlashIndex);
  }

  private matchString(target: string, operator: QueryRule['operator'], value: string): boolean {
    const t = target.toLowerCase();
    const v = value.toLowerCase();

    switch (operator) {
      case 'includes':
        return t.includes(v);
      case 'does not include':
        return !t.includes(v);
      case 'is':
        return t === v;
      case 'is not':
        return t !== v;
      case 'regex matches':
        return this.matchRegex(target, value);
      case 'regex does not match':
        return !this.matchRegex(target, value);
      default:
        return true;
    }
  }

  private parseRegex(patternString: string): RegExp | null {
    const match = patternString.match(/^\/(.*)\/([gimy]*)$/);
    if (match) {
      try {
        return new RegExp(match[1], match[2]);
      } catch {
        return null;
      }
    }
    return null;
  }

  private matchRegex(target: string, patternString: string): boolean {
    const regex = this.parseRegex(patternString) || new RegExp(patternString, 'i');
    return regex.test(target);
  }

  private extractTags(task: CalendarTask): string[] {
    const tagRegex = /#([a-zA-Z0-9_\-/]+)/g;
    const tags = new Set<string>();

    let match;
    while ((match = tagRegex.exec(task.originalMarkdown)) !== null) {
      tags.add(match[1].toLowerCase());
    }
    while ((match = tagRegex.exec(task.title)) !== null) {
      tags.add(match[1].toLowerCase());
    }
    return Array.from(tags);
  }

  private matchTags(task: CalendarTask, operator: QueryRule['operator'], value: string): boolean {
    const taskTags = this.extractTags(task);
    const targetTag = value.replace(/^#/, '').toLowerCase();

    switch (operator) {
      case 'includes':
      case 'is':
        return taskTags.includes(targetTag);
      case 'does not include':
      case 'is not':
        return !taskTags.includes(targetTag);
      case 'regex matches':
        return taskTags.some(tag => this.matchRegex(tag, value));
      case 'regex does not match':
        return !taskTags.some(tag => this.matchRegex(tag, value));
      default:
        return true;
    }
  }

  private getTaskPriority(
    task: CalendarTask
  ): 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'none' {
    const markdown = task.originalMarkdown;
    if (markdown.includes('🔺')) return 'highest';
    if (markdown.includes('⏫')) return 'high';
    if (markdown.includes('🔼')) return 'medium';
    if (markdown.includes('🔽')) return 'low';
    if (markdown.includes('⏬')) return 'lowest';
    return 'none';
  }

  private matchPriority(
    task: CalendarTask,
    operator: QueryRule['operator'],
    value: string
  ): boolean {
    const currentPriority = this.getTaskPriority(task);
    const targetPriority = value.toLowerCase();

    switch (operator) {
      case 'is':
        return currentPriority === targetPriority;
      case 'is not':
        return currentPriority !== targetPriority;
      default:
        return true;
    }
  }
}
