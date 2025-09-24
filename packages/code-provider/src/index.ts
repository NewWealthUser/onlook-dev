import { CodeProvider } from './providers';
import {
    LocalProvider,
    type LocalCreateSessionOutput,
    type LocalProviderGetSession,
    type LocalProviderOptions,
    type LocalSandboxLogEntry,
    type LocalSandboxLogLevel,
} from './providers/local';
import { CodesandboxProvider, type CodesandboxProviderOptions } from './providers/codesandbox';
import { NodeFsProvider, type NodeFsProviderOptions } from './providers/nodefs';
export * from './providers';
export { LocalProvider } from './providers/local';
export type {
    LocalProviderOptions,
    LocalProviderGetSession,
    LocalCreateSessionOutput,
    LocalSandboxLogEntry,
    LocalSandboxLogLevel,
} from './providers/local';
export { CodesandboxProvider } from './providers/codesandbox';
export { NodeFsProvider } from './providers/nodefs';
export * from './types';

export interface CreateClientOptions {
    providerOptions: ProviderInstanceOptions;
}

/**
 * Providers are designed to be singletons; be mindful of this when creating multiple clients
 * or when instantiating in the backend (stateless vs stateful).
 */
export async function createCodeProviderClient(
    codeProvider: CodeProvider,
    { providerOptions }: CreateClientOptions,
) {
    const provider = newProviderInstance(codeProvider, providerOptions);
    await provider.initialize({});
    return provider;
}

export async function getStaticCodeProvider(
    codeProvider: CodeProvider,
): Promise<typeof LocalProvider | typeof CodesandboxProvider | typeof NodeFsProvider> {
    if (codeProvider === CodeProvider.Local) {
        return LocalProvider;
    }

    if (codeProvider === CodeProvider.CodeSandbox) {
        return CodesandboxProvider;
    }

    if (codeProvider === CodeProvider.NodeFs) {
        return NodeFsProvider;
    }
    throw new Error(`Unimplemented code provider: ${codeProvider}`);
}

export interface ProviderInstanceOptions {
    local?: LocalProviderOptions;
    codesandbox?: CodesandboxProviderOptions;
    nodefs?: NodeFsProviderOptions;
}

function newProviderInstance(codeProvider: CodeProvider, providerOptions: ProviderInstanceOptions) {
    if (codeProvider === CodeProvider.Local) {
        if (!providerOptions.local) {
            throw new Error('Local provider options are required.');
        }
        return new LocalProvider(providerOptions.local);
    }

    if (codeProvider === CodeProvider.CodeSandbox) {
        if (!providerOptions.codesandbox) {
            throw new Error('Codesandbox provider options are required.');
        }
        return new CodesandboxProvider(providerOptions.codesandbox);
    }

    if (codeProvider === CodeProvider.NodeFs) {
        if (!providerOptions.nodefs) {
            throw new Error('NodeFs provider options are required.');
        }
        return new NodeFsProvider(providerOptions.nodefs);
    }

    throw new Error(`Unimplemented code provider: ${codeProvider}`);
}
