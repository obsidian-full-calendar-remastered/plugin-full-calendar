import { StateField } from '@codemirror/state';

const toForwardSlashes = (value: string): string => value.replace(/\\/g, "/");
const joinPath = (...parts: string[]): string => {
    const normalizedParts = parts
        .map(toForwardSlashes)
        .filter((part) => part !== "" && part !== ".");
    const joined = normalizedParts.join("/").replace(/\/+/g, "/");
    return joined === "" ? "." : joined;
};
const extname = (fileName: string): string => {
    const base = toForwardSlashes(fileName).split("/").pop() || "";
    const dotIndex = base.lastIndexOf(".");
    return dotIndex >= 0 ? base.slice(dotIndex) : "";
};
const basename = (fileName: string, ext?: string): string => {
    const base = toForwardSlashes(fileName).split("/").pop() || "";
    if (ext && base.endsWith(ext)) {
        return base.slice(0, -ext.length);
    }
    return base;
};

/** Basic obsidian abstraction for any file or folder in a vault. */
export abstract class TAbstractFile {
    /**
     * @public
     */
    get path(): string {
        const parentPath = this.parent?.path || "";
        const path = joinPath(parentPath, this.name);
        if (path.startsWith("/") && path.length > 1) {
            return path.slice(1);
        } else {
            return path;
        }
    }
    /**
     * @public
     */
    name: string = "";
    /**
     * @public
     */
    parent: TFolder | null = null;
}

/** A regular file in the vault. */
export class TFile extends TAbstractFile {
    get basename(): string {
        return basename(this.name, extname(this.name));
    }

    get extension(): string {
        const ext = extname(this.name);
        if (ext.startsWith(".")) {
            return ext.slice(1);
        } else {
            return ext;
        }
    }
}

/** A folder in the vault. */
export class TFolder extends TAbstractFile {
    children: TAbstractFile[] = [];

    isRoot(): boolean {
        return this.path === "/";
    }
}

export function parseYaml(yaml: string): Record<string, string> | null {
    const [k, ...v] = yaml.split(":");
    if (!k || !v) {
        return null;
    }
    return Object.fromEntries([[k.trim(), v.join(":").trim()]]);
}

export function getAllTags(cache: { tags?: { tag: string }[]; frontmatter?: { tags?: string | string[]; tag?: string | string[] } }): string[] | null {
    if (!cache) return null;
    const tags = new Set<string>();
    if (cache.tags) {
        for (const t of cache.tags) {
            tags.add(t.tag);
        }
    }
    const extractTags = (val: unknown) => {
        if (typeof val === 'string') {
            for (const t of val.split(',')) {
                const trimmed = t.trim();
                if (trimmed) tags.add(trimmed.startsWith('#') ? trimmed : `#${trimmed}`);
            }
        } else if (Array.isArray(val)) {
            for (const item of val) {
                if (typeof item === 'string') {
                    const trimmed = item.trim();
                    if (trimmed) tags.add(trimmed.startsWith('#') ? trimmed : `#${trimmed}`);
                }
            }
        }
    };
    if (cache.frontmatter) {
        if (cache.frontmatter.tags) extractTags(cache.frontmatter.tags);
        if (cache.frontmatter.tag) extractTags(cache.frontmatter.tag);
    }
    return tags.size > 0 ? Array.from(tags) : null;
}

export class Notice {
    static notices: string[] = [];

    constructor(message: string) {
        Notice.notices.push(message);
    }
}

export function normalizePath(path: string): string {
    return toForwardSlashes(path).replace(/\/+/g, "/");
}

export const requestUrl = jest.fn().mockImplementation(async (_url: unknown) => ({
    text: "{}",
    status: 200,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: {}
}));

export const getLanguage = jest.fn().mockReturnValue("en");

export const editorInfoField = StateField.define<unknown>({
    create: () => null,
    update: (val: unknown) => val
});

export class Component {}
export class MarkdownRenderChild extends Component {}
export class Modal {
    contentEl: HTMLElement;
    constructor(public app: unknown) {
        this.contentEl = createDiv();
    }
    open() {}
    close() {}
    onOpen() {}
    onClose() {}
}
export class App {}

export class PluginSettingTab {
    containerEl: HTMLElement;
    constructor(public app: unknown, public plugin: unknown) {
        this.containerEl = createDiv();
    }
}

export class WorkspaceLeaf {}
export class ItemView {
    constructor(public leaf: unknown) {}
}

export class DropdownComponent {

    value: string = "";
    addOptions(options: Record<string, string>): this {
        return this;
    }
    getValue(): string {
        return this.value;
    }
    setValue(value: string): this {
        this.value = value;
        return this;
    }
}

export class Setting {
    constructor(public containerEl: HTMLElement) {}
    setName(name: string): this { return this; }
    setDesc(desc: unknown): this { return this; }
    setHeading(): this { return this; }
    addDropdown(cb: (d: DropdownComponent) => unknown): this {
        cb(new DropdownComponent());
        return this;
    }
    addExtraButton(cb: (b: unknown) => unknown): this {
        const button = {
            setTooltip: () => button,
            setIcon: () => button,
            onClick: (onClickCb: unknown) => { return button; }
        };
        cb(button);
        return this;
    }
}


export function setIcon(el: HTMLElement, iconId: string): void {}
export const activeDocument = typeof document !== 'undefined' ? document : null;

export class MarkdownRenderer {
    static async render(
        _app: unknown,
        markdown: string,
        el: HTMLElement,
        _sourcePath?: string,
        _component?: unknown
    ): Promise<void> {
        el.textContent = markdown;
    }
    static async renderMarkdown(
        markdown: string,
        el: HTMLElement,
        _sourcePath?: string,
        _component?: unknown
    ): Promise<void> {
        el.textContent = markdown;
    }
}


