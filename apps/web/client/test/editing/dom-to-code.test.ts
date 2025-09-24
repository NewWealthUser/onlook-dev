import path from 'path';
import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { StyleChangeType } from '../../../../../packages/models/src/style';
import type { EditTextAction, UpdateStyleAction } from '../../../../../packages/models/src/actions/action';
import type { TemplateNode } from '../../../../../packages/models/src/element/templateNode';

mock.module('@onlook/ui/sonner', () => ({
    toast: {
        error: () => {},
        success: () => {},
        info: () => {},
        warning: () => {},
        promise: () => {},
    },
}));

mock.module('mobx', () => ({
    makeAutoObservable: () => {},
}));

mock.module('@onlook/utility', () => {
    return {
        assertNever: () => {
            throw new Error('Unexpected call to assertNever');
        },
        customTwMerge: (...classes: string[]) => classes.filter(Boolean).join(' '),
        CssToTailwindTranslator: (css: string) => {
            const result: string[] = [];
            if (css.includes('padding') && css.includes('1rem')) {
                result.push('p-4');
            }
            if (/display\s*:\s*flex/.test(css)) {
                result.push('flex');
            }
            if (/display\s*:\s*grid/.test(css)) {
                result.push('grid');
            }
            if (css.includes('grid-template-columns: repeat(3')) {
                result.push('grid-cols-3');
            }
            if (css.includes('grid-template-columns: repeat(2')) {
                result.push('grid-cols-2');
            }
            return { data: result.map((value) => ({ resultVal: value })) };
        },
        propertyMap: new Map(),
    };
});

mock.module('@onlook/models', () => ({
    CodeActionType: {
        MOVE: 'move',
        INSERT: 'insert',
        REMOVE: 'remove',
        GROUP: 'group',
        UNGROUP: 'ungroup',
        INSERT_IMAGE: 'insert-image',
        REMOVE_IMAGE: 'remove-image',
    },
    StyleChangeType: {
        Value: 'value',
        Custom: 'custom',
        Remove: 'remove',
    },
}));

mock.module('@onlook/constants', () => ({
    EditorAttributes: {
        DATA_ONLOOK_ID: 'data-oid',
    },
}));

mock.module('@onlook/models/actions', () => ({
    CodeActionType: {
        MOVE: 'move',
        INSERT: 'insert',
        REMOVE: 'remove',
        GROUP: 'group',
        UNGROUP: 'ungroup',
        INSERT_IMAGE: 'insert-image',
        REMOVE_IMAGE: 'remove-image',
    },
    StyleChangeType: {
        Value: 'value',
        Custom: 'custom',
        Remove: 'remove',
    },
}));

mock.module('@onlook/models/style', () => ({
    StyleChangeType: {
        Value: 'value',
        Custom: 'custom',
        Remove: 'remove',
    },
}));

mock.module('tailwind-merge', () => ({
    twMerge: (...classes: string[]) => classes.filter(Boolean).join(' '),
}));

mock.module('@onlook/parser', () => {
    function escapeForRegex(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function replaceText(content: string, oid: string, text: string): string {
        const escapedOid = escapeForRegex(oid);
        const regex = new RegExp(`(data-oid="${escapedOid}"[^>]*>)([^<]*)`, 'm');
        return content.replace(regex, (_, prefix: string) => `${prefix}${text}`);
    }

    function replaceClass(content: string, oid: string, className: string): string {
        const escapedOid = escapeForRegex(oid);
        const regex = new RegExp('className="([^"]*)"(?=\\s+data-oid="' + escapedOid + '")');
        return content.replace(regex, (_match, existing: string) => {
            const merged = mergeClasses(existing, className);
            return `className="${merged}"`;
        });
    }

    function mergeClasses(existing: string, added: string): string {
        const parts = existing.split(/\s+/).filter(Boolean);
        const seen = new Set(parts);
        for (const part of added.split(/\s+/).filter(Boolean)) {
            if (!seen.has(part)) {
                parts.push(part);
                seen.add(part);
            }
        }
        return parts.join(' ');
    }

    return {
        getAstFromContent: (code: string) => ({ code }),
        getContentFromAst: async (ast: { code: string }) => ast.code,
        addOidsToAst: (ast: unknown) => ({ ast, modified: false }),
        createTemplateNodeMap: () => new Map(),
        getOidFromJsxElement: () => null,
        traverse: () => {},
        types: {},
        transformAst: (ast: { code: string }, oidToCodeDiff: Map<string, any>) => {
            let updated = ast.code;
            for (const [oid, diff] of oidToCodeDiff.entries()) {
                if (diff.textContent != null) {
                    updated = replaceText(updated, oid, diff.textContent);
                }
                const className = diff.attributes?.className;
                if (className) {
                    updated = replaceClass(updated, oid, className);
                }
            }
            ast.code = updated;
        },
    };
});

let CodeManager: any;

type SandboxFile = {
    type: 'text';
    path: string;
    content: string;
};

type Harness = {
    codeManager: any;
    filePath: string;
    frameId: string;
    branchId: string;
    fileSystem: Map<string, string>;
    templateNodes: Map<string, TemplateNode>;
    oids: {
        heading: string;
        section: string;
        cards: string;
    };
};

const FIXTURE_ROOT = path.join(import.meta.dir, '__fixtures__', 'disk-app');
const RELATIVE_FILE = 'app/page.tsx';
const FRAME_ID = 'frame-local';
const BRANCH_ID = 'branch-local';
const OIDS = {
    heading: 'heading-oid',
    section: 'section-oid',
    cards: 'cards-oid',
};

beforeAll(async () => {
    ({ CodeManager } = await import('../../src/components/store/editor/code'));
});

async function createHarness(): Promise<Harness> {
    const absolutePath = path.join(FIXTURE_ROOT, RELATIVE_FILE);
    const original = await Bun.file(absolutePath).text();
    const initialContent = original
        .replace('<section className="panel">', `<section className="panel" data-oid="${OIDS.section}">`)
        .replace('<h1>Hello from disk</h1>', `<h1 data-oid="${OIDS.heading}">Hello from disk</h1>`)
        .replace(
            '<div className="cards">',
            `<div className="cards" data-oid="${OIDS.cards}">`,
        );
    const fileSystem = new Map<string, string>([[RELATIVE_FILE, initialContent]]);

    const sandbox = {
        async readFile(pathname: string): Promise<SandboxFile> {
            const content = fileSystem.get(pathname);
            if (content == null) {
                throw new Error(`Missing file in sandbox: ${pathname}`);
            }
            return { type: 'text', path: pathname, content };
        },
        async writeFile(pathname: string, content: string): Promise<boolean> {
            fileSystem.set(pathname, content);
            return true;
        },
    };

    const editorEngineStub: any = {
        activeSandbox: sandbox,
        templateNodes: {
            getTemplateNode: (oid: string) => templateNodeMap.get(oid) ?? null,
        },
        branches: {
            activeError: {
                addCodeApplicationError: () => {},
            },
        },
        posthog: {
            capture: () => {},
        },
    };

    const codeManager = new CodeManager(editorEngineStub);

    const templateNodeMap = new Map<string, TemplateNode>();
    for (const oid of Object.values(OIDS)) {
        templateNodeMap.set(oid, createTemplateNode(oid, initialContent));
    }
    editorEngineStub.templateNodes.getTemplateNode = (oid: string) => templateNodeMap.get(oid) ?? null;

    return {
        codeManager,
        filePath: RELATIVE_FILE,
        frameId: FRAME_ID,
        branchId: BRANCH_ID,
        fileSystem,
        templateNodes: templateNodeMap,
        oids: OIDS,
    };
}

function createTemplateNode(oid: string, content: string): TemplateNode {
    const lines = content.split('\n');
    const lineIndex = lines.findIndex((line) => line.includes(`data-oid="${oid}"`));
    const column = lineIndex >= 0 ? lines[lineIndex].indexOf(`data-oid="${oid}"`) + 1 : 1;
    return {
        path: RELATIVE_FILE,
        branchId: BRANCH_ID,
        startTag: {
            start: { line: lineIndex + 1, column },
            end: { line: lineIndex + 1, column: column + 1 },
        },
        endTag: null,
        component: 'DiskProjectPage',
        dynamicType: null,
        coreElementType: null,
    };
}

describe('DOM ↔ code mapping for disk-based projects', () => {
    let harness: Harness;

    beforeEach(async () => {
        harness = await createHarness();
    });

    it('writes text edits back to the source file', async () => {
        const action: EditTextAction = {
            type: 'edit-text',
            originalContent: 'Hello from disk',
            newContent: 'Updated heading from canvas',
            targets: [
                {
                    domId: 'odid-heading',
                    frameId: harness.frameId,
                    oid: harness.oids.heading,
                },
            ],
        };

        await harness.codeManager.write(action);

        const updated = harness.fileSystem.get(harness.filePath);
        expect(updated).toBeDefined();
        expect(updated).toContain(`>${action.newContent}<`);
    });

    it('appends Tailwind utilities for style updates', async () => {
        const action: UpdateStyleAction = {
            type: 'update-style',
            targets: [
                {
                    domId: 'odid-section',
                    frameId: harness.frameId,
                    oid: harness.oids.section,
                    change: {
                        original: {
                            padding: { value: '0px', type: StyleChangeType.Value },
                        },
                        updated: {
                            padding: { value: '1rem', type: StyleChangeType.Value },
                        },
                    },
                },
            ],
        };

        await harness.codeManager.write(action);
        const updated = harness.fileSystem.get(harness.filePath);
        expect(updated).toBeDefined();
        expect(updated).toMatch(/className="[^"]*panel[\s\S]*p-4[^"]*"/);
    });

    it('generates grid utility classes for layout changes', async () => {
        const action: UpdateStyleAction = {
            type: 'update-style',
            targets: [
                {
                    domId: 'odid-cards',
                    frameId: harness.frameId,
                    oid: harness.oids.cards,
                    change: {
                        original: {
                            display: { value: 'block', type: StyleChangeType.Value },
                            gridTemplateColumns: {
                                value: 'repeat(2,minmax(0,1fr))',
                                type: StyleChangeType.Value,
                            },
                        },
                        updated: {
                            display: { value: 'grid', type: StyleChangeType.Value },
                            gridTemplateColumns: {
                                value: 'repeat(3,minmax(0,1fr))',
                                type: StyleChangeType.Value,
                            },
                        },
                    },
                },
            ],
        };

        await harness.codeManager.write(action);
        const updated = harness.fileSystem.get(harness.filePath);
        expect(updated).toBeDefined();
        expect(updated).toMatch(/className="[^"]*cards[\s\S]*grid[\s\S]*grid-cols-3[^"]*"/);
    });

    it('preserves source locations for mapped template nodes', () => {
        const headingNode = harness.templateNodes.get(harness.oids.heading);
        expect(headingNode).toBeDefined();
        const startLine = headingNode?.startTag.start.line ?? 0;
        expect(startLine).toBeGreaterThan(0);

        const content = harness.fileSystem.get(harness.filePath);
        expect(content).toBeDefined();
        if (!content) {
            return;
        }
        const lines = content.split('\n');
        expect(lines[startLine - 1]).toContain('Hello from disk');
    });
});
