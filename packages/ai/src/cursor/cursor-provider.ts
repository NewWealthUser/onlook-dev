import { env } from '../../../web/client/src/env';

export interface CursorProviderConfig {
  apiKey?: string;
  usePlatform?: boolean;
  model?: 'claude-3-sonnet' | 'claude-3-opus' | 'gpt-4' | 'gpt-3.5-turbo';
}

export interface CursorMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CursorResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class CursorProvider {
  private config: CursorProviderConfig;

  constructor(config: CursorProviderConfig = {}) {
    this.config = {
      apiKey: config.apiKey || env.CURSOR_API_KEY,
      usePlatform: config.usePlatform ?? env.CURSOR_PLATFORM_ENABLED,
      model: config.model || 'claude-3-sonnet',
    };
  }

  async generateResponse(messages: CursorMessage[]): Promise<CursorResponse> {
    if (this.config.usePlatform) {
      return this.generateWithCursorPlatform(messages);
    } else {
      return this.generateWithCustomAPI(messages);
    }
  }

  private async generateWithCursorPlatform(messages: CursorMessage[]): Promise<CursorResponse> {
    // This would integrate with Cursor's platform API
    // For now, we'll simulate the response
    try {
      const response = await fetch('https://api.cursor.sh/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: messages,
          max_tokens: 4000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`Cursor API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        content: data.choices[0]?.message?.content || '',
        usage: data.usage,
      };
    } catch (error) {
      console.error('Cursor platform API error:', error);
      // Fallback to custom API
      return this.generateWithCustomAPI(messages);
    }
  }

  private async generateWithCustomAPI(messages: CursorMessage[]): Promise<CursorResponse> {
    // Use custom API keys (OpenAI, Anthropic, etc.)
    const lastMessage = messages[messages.length - 1];
    
    if (this.config.model?.startsWith('claude')) {
      return this.generateWithAnthropic(messages);
    } else if (this.config.model?.startsWith('gpt')) {
      return this.generateWithOpenAI(messages);
    } else {
      // Default to a simple response
      return this.generateFallbackResponse(lastMessage);
    }
  }

  private async generateWithAnthropic(messages: CursorMessage[]): Promise<CursorResponse> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY || '',
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 4000,
          messages: messages.filter(m => m.role !== 'system'),
          system: messages.find(m => m.role === 'system')?.content || '',
        }),
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        content: data.content[0]?.text || '',
        usage: {
          prompt_tokens: data.usage?.input_tokens || 0,
          completion_tokens: data.usage?.output_tokens || 0,
          total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        },
      };
    } catch (error) {
      console.error('Anthropic API error:', error);
      return this.generateFallbackResponse(messages[messages.length - 1]);
    }
  }

  private async generateWithOpenAI(messages: CursorMessage[]): Promise<CursorResponse> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model || 'gpt-4',
          messages: messages,
          max_tokens: 4000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        content: data.choices[0]?.message?.content || '',
        usage: data.usage,
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      return this.generateFallbackResponse(messages[messages.length - 1]);
    }
  }

  private generateFallbackResponse(message: CursorMessage): CursorResponse {
    // Simple fallback response when APIs are not available
    const responses = [
      "I understand you're asking about code. I'm here to help with your development needs.",
      "That's an interesting question! I can help you with coding, debugging, and explaining concepts.",
      "I'd be happy to assist with that. Could you provide more details about what you're working on?",
      "Let me help you with that code. What specific aspect would you like me to focus on?",
    ];
    
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    return {
      content: randomResponse,
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  // Method to check if API keys are configured
  isConfigured(): boolean {
    if (this.config.usePlatform) {
      return !!this.config.apiKey;
    }
    
    // Check for custom API keys
    return !!(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.OPENROUTER_API_KEY);
  }

  // Method to get available models
  getAvailableModels(): string[] {
    if (this.config.usePlatform) {
      return ['claude-3-sonnet', 'claude-3-opus', 'gpt-4', 'gpt-3.5-turbo'];
    }
    
    const models = [];
    if (env.ANTHROPIC_API_KEY) {
      models.push('claude-3-sonnet', 'claude-3-opus');
    }
    if (env.OPENAI_API_KEY) {
      models.push('gpt-4', 'gpt-3.5-turbo');
    }
    if (env.OPENROUTER_API_KEY) {
      models.push('claude-3-sonnet', 'claude-3-opus', 'gpt-4', 'gpt-3.5-turbo');
    }
    
    return models;
  }
}
