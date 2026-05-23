export interface WidgetContext {
  sourcePath: string;
  onUpdate: (callback: () => void) => void;
}

export interface EmbeddedWidgetInstance {
  updateSize(): void;
  refresh(): Promise<void>;
  destroy(): void;
}

export interface EmbeddedWidgetStrategy {
  render(
    el: HTMLElement,
    config: Record<string, unknown>,
    ctx: WidgetContext
  ): Promise<EmbeddedWidgetInstance>;
}

export class EmbeddedBlockRegistry {
  private static strategies = new Map<string, EmbeddedWidgetStrategy>();

  public static register(type: string, strategy: EmbeddedWidgetStrategy): void {
    this.strategies.set(type, strategy);
  }

  public static get(type: string): EmbeddedWidgetStrategy | undefined {
    return this.strategies.get(type);
  }

  public static has(type: string): boolean {
    return this.strategies.has(type);
  }
}
