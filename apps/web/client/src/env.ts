import { createEnv } from '@t3-oss/env-nextjs';
import { homedir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const expandHomePath = (rawValue: string) => {
    const trimmed = rawValue.trim();
    const unquoted = trimmed.replace(/^['"]|['"]$/g, '');

    if (!unquoted) {
        return unquoted;
    }

    const homeDirectory = homedir();
    if (!homeDirectory) {
        return unquoted;
    }

    if (unquoted === '~') {
        return homeDirectory;
    }

    if (unquoted.startsWith('~/')) {
        return path.join(homeDirectory, unquoted.slice(2));
    }

    if (unquoted.startsWith('$HOME')) {
        const remainder = unquoted.slice('$HOME'.length);
        if (!remainder) {
            return homeDirectory;
        }

        return path.join(homeDirectory, remainder.replace(/^[/\\]/, ''));
    }

    return unquoted;
};

export const env = createEnv({
    /**
     * Specify your server-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars.
     */
    server: {
        NODE_ENV: z.enum(['development', 'test', 'production']),
        
        // Local storage
        ONLOOK_PROJECTS_DIR: z
            .string()
            .default('./onlook-projects')
            .transform((value) => expandHomePath(value) || './onlook-projects'),

        // AI Model providers
        OPENROUTER_API_KEY: z.string().optional(),
        ANTHROPIC_API_KEY: z.string().optional(),
        GOOGLE_AI_STUDIO_API_KEY: z.string().optional(),
        OPENAI_API_KEY: z.string().optional(),

        // Cursor integration
        CURSOR_API_KEY: z.string().optional(),
        CURSOR_PLATFORM_ENABLED: z.boolean().default(false),

        // Apply models
        MORPH_API_KEY: z.string().optional(),
        RELACE_API_KEY: z.string().optional(),

        // Bedrock
        AWS_ACCESS_KEY_ID: z.string().optional(),
        AWS_SECRET_ACCESS_KEY: z.string().optional(),
        AWS_REGION: z.string().optional(),

        // Google Vertex AI
        GOOGLE_CLIENT_EMAIL: z.string().optional(),
        GOOGLE_PRIVATE_KEY: z.string().optional(),
        GOOGLE_PRIVATE_KEY_ID: z.string().optional(),

        // Langfuse
        LANGFUSE_SECRET_KEY: z.string().optional(),
        LANGFUSE_PUBLIC_KEY: z.string().optional(),
        LANGFUSE_BASEURL: z.string().url().optional(),

        // GitHub
        GITHUB_APP_ID: z.string().optional(),
        GITHUB_APP_PRIVATE_KEY: z.string().optional(),
        GITHUB_APP_SLUG: z.string().optional(),
    },
    /**
     * Specify your client-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars. To expose them to the client, prefix them with
     * `NEXT_PUBLIC_`.
     */
    client: {
        NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
        NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
        NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
        NEXT_PUBLIC_GLEAP_API_KEY: z.string().optional(),
        NEXT_PUBLIC_FEATURE_COLLABORATION: z.boolean().default(false),
        NEXT_PUBLIC_RB2B_ID: z.string().optional(),
    },

    /**
     * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
     * middlewares) or client-side so we need to destruct manually.
     */
    runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_FEATURE_COLLABORATION: process.env.NEXT_PUBLIC_FEATURE_COLLABORATION,

        // Local storage
        ONLOOK_PROJECTS_DIR: process.env.ONLOOK_PROJECTS_DIR,

        // Posthog
        NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        NEXT_PUBLIC_GLEAP_API_KEY: process.env.NEXT_PUBLIC_GLEAP_API_KEY,

        // RB2B
        NEXT_PUBLIC_RB2B_ID: process.env.NEXT_PUBLIC_RB2B_ID,

        // Site URL
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,

        // Apply models
        MORPH_API_KEY: process.env.MORPH_API_KEY,
        RELACE_API_KEY: process.env.RELACE_API_KEY,

        // Bedrock
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        AWS_REGION: process.env.AWS_REGION,

        // Google Vertex AI
        GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
        GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
        GOOGLE_PRIVATE_KEY_ID: process.env.GOOGLE_PRIVATE_KEY_ID,

        // Model providers
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        GOOGLE_AI_STUDIO_API_KEY: process.env.GOOGLE_AI_STUDIO_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,

        // Cursor integration
        CURSOR_API_KEY: process.env.CURSOR_API_KEY,
        CURSOR_PLATFORM_ENABLED: process.env.CURSOR_PLATFORM_ENABLED,

        // Langfuse
        LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
        LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
        LANGFUSE_BASEURL: process.env.LANGFUSE_BASEURL,

        // GitHub
        GITHUB_APP_ID: process.env.GITHUB_APP_ID,
        GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
        GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,
    },
    /**
     * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
     * useful for Docker builds.
     */
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    /**
     * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
     * `SOME_VAR=''` will throw an error.
     */
    emptyStringAsUndefined: true,
});
