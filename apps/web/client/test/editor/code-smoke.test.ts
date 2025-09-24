import { describe, expect, mock, test } from 'bun:test';

mock.module('@onlook/models', () => ({
    CodeActionType: {
        REMOVE: 'REMOVE',
        MOVE: 'MOVE',
        GROUP: 'GROUP',
        UNGROUP: 'UNGROUP',
        REMOVE_IMAGE: 'REMOVE_IMAGE',
    },
}));

mock.module('@onlook/parser', () => ({
    getAstFromContent: mock(() => ({})),
    getContentFromAst: mock(async () => ''),
    transformAst: mock(() => {}),
}));

mock.module('@onlook/constants', () => ({
    DefaultSettings: {},
    EditorAttributes: {},
}));

mock.module('@onlook/models/actions', () => ({
    CodeActionType: {
        REMOVE: 'REMOVE',
        MOVE: 'MOVE',
        GROUP: 'GROUP',
        UNGROUP: 'UNGROUP',
        REMOVE_IMAGE: 'REMOVE_IMAGE',
    },
}));
mock.module('@onlook/models/style', () => ({
    StyleChangeType: {
        Value: 'value',
        Custom: 'custom',
    },
}));
mock.module('tailwind-merge', () => ({
    twMerge: (...classes: Array<string | undefined>) => classes.filter(Boolean).join(' '),
}));

const { CodeManager } = await import('../../src/components/store/editor/code');

const createMockEditorEngine = () => ({
    activeSandbox: {
        writeFile: mock(async () => true),
    },
    frames: {
        reloadAllViews: mock(() => {}),
    },
} as any);

describe('CodeManager smoke tests', () => {
    test('edit-text actions trigger preview reload when writes succeed', async () => {
        const editorEngine = createMockEditorEngine();
        const manager = new CodeManager(editorEngine);

        const fakeRequests = [{} as never];

        (manager as any).collectRequests = mock(async () => fakeRequests);
        (manager as any).writeRequest = mock(async () => true);

        const action = {
            type: 'edit-text',
            targets: [{ frameId: 'frame-1', domId: 'dom-1', oid: 'oid-1' }],
            newContent: 'Updated text',
        } as const;

        await manager.write(action);

        expect((manager as any).collectRequests).toHaveBeenCalledTimes(1);
        expect((manager as any).writeRequest).toHaveBeenCalledWith(fakeRequests);
        expect(editorEngine.frames.reloadAllViews).toHaveBeenCalledTimes(1);
    });

    test('edit-text skips reload when nothing is written', async () => {
        const editorEngine = createMockEditorEngine();
        const manager = new CodeManager(editorEngine);

        (manager as any).collectRequests = mock(async () => []);
        (manager as any).writeRequest = mock(async () => false);

        const action = {
            type: 'edit-text',
            targets: [],
            newContent: '',
        } as const;

        await manager.write(action);

        expect(editorEngine.frames.reloadAllViews).not.toHaveBeenCalled();
    });

    test('write-code diffs write every file then refresh preview once', async () => {
        const editorEngine = createMockEditorEngine();
        const manager = new CodeManager(editorEngine);

        const action = {
            type: 'write-code',
            diffs: [
                { path: 'app/page.tsx', generated: 'page update' },
                { path: 'app/layout.tsx', generated: 'layout update' },
            ],
        } as const;

        await manager.write(action);

        expect(editorEngine.activeSandbox.writeFile).toHaveBeenCalledTimes(2);
        expect(editorEngine.activeSandbox.writeFile).toHaveBeenNthCalledWith(1, 'app/page.tsx', 'page update');
        expect(editorEngine.activeSandbox.writeFile).toHaveBeenNthCalledWith(2, 'app/layout.tsx', 'layout update');
        expect(editorEngine.frames.reloadAllViews).toHaveBeenCalledTimes(1);
    });
});
