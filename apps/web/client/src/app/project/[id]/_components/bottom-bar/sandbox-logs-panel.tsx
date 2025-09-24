'use client';

import { useEditorEngine } from '@/components/store/editor';
import { Button } from '@onlook/ui/button';
import { cn } from '@onlook/ui/utils';
import type { LocalSandboxLogEntry, LocalSandboxLogLevel } from '@onlook/code-provider';
import { useEffect, useMemo, useRef, useState } from 'react';

type LogLevelFilter = 'all' | LocalSandboxLogLevel;

interface DisplayLogEntry {
    id: string;
    level: LocalSandboxLogLevel;
    message: string;
    timestamp: string;
}

const LEVEL_OPTIONS: { label: string; value: LogLevelFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Info', value: 'info' },
    { label: 'Warn', value: 'warn' },
    { label: 'Error', value: 'error' },
];

const LEVEL_CLASS: Record<LocalSandboxLogLevel, string> = {
    info: 'text-foreground-secondary',
    warn: 'text-amber-400',
    error: 'text-red-400',
};

function parseRemoteLogs(rawLogs: string): DisplayLogEntry[] {
    const lines = rawLogs.split(/\r?\n/).filter(Boolean);
    return lines.map((line, index) => {
        const lowered = line.toLowerCase();
        let level: LocalSandboxLogLevel = 'info';
        if (lowered.includes('error')) {
            level = 'error';
        } else if (lowered.includes('warn')) {
            level = 'warn';
        }
        const timestampMatch = line.match(/\[(\d{1,2}:\d{2}:\d{2})\]/);
        const timestamp = timestampMatch?.[1] ?? '';
        return {
            id: `${index}-${line}`,
            level,
            message: line,
            timestamp,
        };
    });
}

function normalizeLocalLogs(entries: LocalSandboxLogEntry[]): DisplayLogEntry[] {
    return entries.map((entry, index) => ({
        id: `${entry.timestamp.getTime()}-${index}`,
        level: entry.level,
        message: entry.message,
        timestamp: entry.timestamp.toLocaleTimeString([], { hour12: false }),
    }));
}

export function SandboxLogsPanel({
    hidden,
}: {
    hidden: boolean;
}) {
    const editorEngine = useEditorEngine();
    const [level, setLevel] = useState<LogLevelFilter>('all');
    const [logs, setLogs] = useState<DisplayLogEntry[]>([]);
    const unsubscribeRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (hidden) {
            setLogs([]);
            unsubscribeRef.current?.();
            unsubscribeRef.current = null;
            return;
        }
        const activeBranch = editorEngine.branches.activeBranch;
        const sandbox = activeBranch ? editorEngine.branches.getSandboxById(activeBranch.id) : null;
        if (!sandbox?.session) {
            setLogs([]);
            return;
        }

        const loadLogs = async () => {
            try {
                const result = await sandbox.session.readDevServerLogs(level);
                if (Array.isArray(result)) {
                    setLogs(normalizeLocalLogs(result).slice(-200));
                } else if (typeof result === 'string') {
                    setLogs(parseRemoteLogs(result).slice(-200));
                }
            } catch (error) {
                console.error('Failed to read sandbox logs:', error);
            }
        };

        loadLogs();

        unsubscribeRef.current?.();
        unsubscribeRef.current = sandbox.session.subscribeToDevServerLogs(level, (entry) => {
            setLogs(prev => {
                const next = [...prev, ...normalizeLocalLogs([entry])];
                if (next.length > 200) {
                    return next.slice(next.length - 200);
                }
                return next;
            });
        });

        return () => {
            unsubscribeRef.current?.();
            unsubscribeRef.current = null;
        };
    }, [editorEngine, level, hidden]);

    const groupedLogs = useMemo(() => logs, [logs]);

    return (
        <div
            className={cn(
                'flex h-full w-full flex-col border border-border/40 rounded-lg bg-background/95 backdrop-blur transition-opacity duration-200',
                hidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
        >
            <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
                <span className="text-xs font-medium text-foreground-secondary">Sandbox Logs</span>
                <div className="flex items-center gap-1">
                    {LEVEL_OPTIONS.map((option) => (
                        <Button
                            key={option.value}
                            variant={level === option.value ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setLevel(option.value)}
                            className={cn(
                                'h-7 px-2 text-xs',
                                level === option.value
                                    ? 'bg-foreground/10 text-foreground'
                                    : 'text-foreground-secondary hover:text-foreground'
                            )}
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>
            </div>
            <div className="flex-1 overflow-auto px-3 py-2 text-xs font-mono">
                {groupedLogs.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-foreground-tertiary">
                        No logs available
                    </div>
                ) : (
                    <ul className="space-y-1">
                        {groupedLogs.map((entry) => (
                            <li key={entry.id} className="flex gap-2">
                                <span className="text-[10px] text-foreground-tertiary min-w-[48px]">
                                    {entry.timestamp}
                                </span>
                                <span className={cn('flex-1 break-words', LEVEL_CLASS[entry.level])}>{entry.message}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
