'use client';

import { CursorEditor } from '@/components/cursor-editor';
import { useState } from 'react';

export default function Main() {
    const [currentProject, setCurrentProject] = useState<string | null>(null);

    return (
        <div className="h-screen w-screen bg-gray-50 dark:bg-gray-900">
            {currentProject ? (
                <CursorEditor 
                    projectId={currentProject}
                    onCodeChange={(code) => {
                        console.log('Code changed:', code);
                    }}
                />
            ) : (
                <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
                            Welcome to Onlook
                        </h1>
                        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
                            Your AI-powered code editor with Cursor integration
                        </p>
                        <button
                            onClick={() => setCurrentProject('demo-project')}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                        >
                            Start Coding
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
