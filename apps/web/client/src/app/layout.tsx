import '@/styles/globals.css';
import '@onlook/ui/globals.css';

import { TelemetryProvider } from '@/components/telemetry-provider';
import { env } from '@/env';
import { FeatureFlagsProvider } from '@/hooks/use-feature-flags';
import { TRPCReactProvider } from '@/trpc/react';
import { Toaster } from '@onlook/ui/sonner';
import { type Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { ThemeProvider } from './_components/theme';
import { faqSchema, organizationSchema } from './seo';
import RB2BLoader from '@/components/rb2b-loader';

const isProduction = env.NODE_ENV === 'production';

export const metadata: Metadata = {
    title: 'Onlook – Local AI Code Editor',
    description: 'A local-first AI-powered code editor with Cursor integration. Edit, debug, and build with AI assistance - all running locally on your machine.',
    icons: [{ rel: 'icon', url: '/favicon.ico' }],
    openGraph: {
        url: 'http://localhost:3000/',
        type: 'website',
        siteName: 'Onlook',
        title: 'Onlook – Local AI Code Editor',
        description: 'A local-first AI-powered code editor with Cursor integration. Edit, debug, and build with AI assistance - all running locally on your machine.',
    },
    twitter: {
        card: 'summary_large_image',
        site: '@onlookdev',
        creator: '@onlookdev',
        title: 'Onlook – Local AI Code Editor',
        description: 'A local-first AI-powered code editor with Cursor integration. Edit, debug, and build with AI assistance - all running locally on your machine.',
    },
};

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const locale = await getLocale();

    return (
        <html lang={locale} className={inter.variable} suppressHydrationWarning>
            <head>
                <link rel="canonical" href="https://onlook.com/" />
                <meta name="robots" content="index, follow" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
                />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
                />
            </head>
            <body>
                {isProduction && (
                    <>
                        <Script src="https://z.onlook.com/cdn-cgi/zaraz/i.js" strategy="lazyOnload" />
                        <RB2BLoader />
                    </>
                )}
                <TRPCReactProvider>
                    <FeatureFlagsProvider>
                        <TelemetryProvider>
                            <ThemeProvider
                                attribute="class"
                                forcedTheme="dark"
                                enableSystem
                                disableTransitionOnChange
                            >
                                <NextIntlClientProvider>
                                    {children}
                                    <Toaster />
                                </NextIntlClientProvider>
                            </ThemeProvider>
                        </TelemetryProvider>
                    </FeatureFlagsProvider>
                </TRPCReactProvider>
            </body>
        </html>
    );
}
