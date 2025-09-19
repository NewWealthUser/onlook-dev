'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@onlook/ui/button';
import { Textarea } from '@onlook/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@onlook/ui/card';
import { Badge } from '@onlook/ui/badge';
import { Send, Bot, User, Settings, Zap, Code, FileText, MessageSquare } from 'lucide-react';

interface CursorEditorProps {
  projectId: string;
  onCodeChange?: (code: string) => void;
  initialCode?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isCode?: boolean;
}

export function CursorEditor({ projectId, onCodeChange, initialCode = '' }: CursorEditorProps) {
  const [code, setCode] = useState(initialCode);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'code' | 'files'>('chat');
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    onCodeChange?.(newCode);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Simulate AI response - in real implementation, this would call your AI API
      const response = await simulateAIResponse(input, code);
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        isCode: response.includes('```'),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const simulateAIResponse = async (userInput: string, currentCode: string): Promise<string> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    // Simple response simulation based on input
    if (userInput.toLowerCase().includes('hello') || userInput.toLowerCase().includes('hi')) {
      return `Hello! I'm your AI coding assistant. I can help you with code generation, debugging, and answering questions about your project. What would you like to work on?`;
    }
    
    if (userInput.toLowerCase().includes('function') || userInput.toLowerCase().includes('create')) {
      return `I'll help you create that function. Here's a basic implementation:\n\n\`\`\`javascript\nfunction exampleFunction() {\n  // Your code here\n  return 'Hello, World!';\n}\n\`\`\`\n\nWould you like me to modify this or add more functionality?`;
    }
    
    if (userInput.toLowerCase().includes('bug') || userInput.toLowerCase().includes('error')) {
      return `I can help you debug that issue. Could you share the error message or describe what's not working as expected? I'll analyze the code and suggest fixes.`;
    }
    
    if (userInput.toLowerCase().includes('explain') || userInput.toLowerCase().includes('what')) {
      return `I'd be happy to explain that concept! Could you be more specific about what you'd like me to explain? For example:\n- How a specific function works\n- A programming concept\n- How to implement a feature\n- Best practices for a particular technology`;
    }

    return `I understand you're asking about "${userInput}". I'm here to help with your coding needs. Could you provide more details about what you'd like me to help you with?`;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatCode = (text: string) => {
    if (text.includes('```')) {
      const parts = text.split('```');
      return parts.map((part, index) => {
        if (index % 2 === 1) {
          return (
            <pre key={index} className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-sm font-mono">
              <code>{part}</code>
            </pre>
          );
        }
        return <span key={index}>{part}</span>;
      });
    }
    return text;
  };

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Cursor AI</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">AI-powered code editor</p>
        </div>
        
        <div className="flex-1 p-4">
          <div className="space-y-2">
            <Button
              variant={activeTab === 'chat' ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setActiveTab('chat')}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Chat
            </Button>
            <Button
              variant={activeTab === 'code' ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setActiveTab('code')}
            >
              <Code className="w-4 h-4 mr-2" />
              Code Editor
            </Button>
            <Button
              variant={activeTab === 'files' ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setActiveTab('files')}
            >
              <FileText className="w-4 h-4 mr-2" />
              Files
            </Button>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">AI Ready</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col">
            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <Bot className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Welcome to Cursor AI
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400">
                    Start a conversation to get help with your code
                  </p>
                </div>
              )}
              
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-3xl px-4 py-2 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      {message.role === 'user' ? (
                        <User className="w-4 h-4" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                      <span className="text-xs opacity-70">
                        {message.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap">
                      {formatCode(message.content)}
                    </div>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Bot className="w-4 h-4" />
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-gray-200 dark:border-gray-700 p-4">
              <div className="flex space-x-2">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask me anything about your code... (Cmd+Enter to send)"
                  className="flex-1 min-h-[60px] resize-none"
                  disabled={isLoading}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isLoading}
                  className="px-4"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span>Press Cmd+Enter to send</span>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-xs">
                    <Zap className="w-3 h-3 mr-1" />
                    AI Powered
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'code' && (
          <div className="flex-1 flex flex-col">
            <div className="border-b border-gray-200 dark:border-gray-700 p-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Line {cursorPosition.line}, Column {cursorPosition.column}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Button size="sm" variant="outline">
                    <Settings className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="flex-1 p-4">
              <Textarea
                value={code}
                onChange={(e) => {
                  handleCodeChange(e.target.value);
                  // Simple cursor position calculation
                  const lines = e.target.value.split('\n');
                  const cursorPos = e.target.selectionStart;
                  let line = 1;
                  let column = 1;
                  let currentPos = 0;
                  
                  for (let i = 0; i < lines.length; i++) {
                    if (currentPos + lines[i].length >= cursorPos) {
                      line = i + 1;
                      column = cursorPos - currentPos + 1;
                      break;
                    }
                    currentPos += lines[i].length + 1; // +1 for newline
                  }
                  
                  setCursorPosition({ line, column });
                }}
                className="w-full h-full font-mono text-sm resize-none border-0 focus:ring-0"
                placeholder="Start typing your code here..."
              />
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="flex-1 p-4">
            <Card>
              <CardHeader>
                <CardTitle>Project Files</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-500 dark:text-gray-400">
                  File explorer will be implemented here. This will show the project structure
                  and allow you to navigate between files.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
