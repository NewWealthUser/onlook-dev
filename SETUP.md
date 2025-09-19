# Onlook - Local AI Code Editor

A local-first AI-powered code editor with Cursor integration. Edit, debug, and build with AI assistance - all running locally on your machine.

## Features

- **Local Storage**: All projects stored in `onlook-projects` folder
- **No Authentication**: Start coding immediately
- **AI Integration**: Support for custom API keys (Claude, OpenAI, Google) or Cursor platform
- **Local Sandboxing**: Free local development environment
- **No Docker**: Runs entirely with Bun and Node.js

## Quick Start

1. **Install Dependencies**
   ```bash
   bun install
   ```

2. **Create Environment File**
   Create `apps/web/client/.env.local`:
   ```bash
   # Local Development Environment
   NODE_ENV=development
   NEXT_PUBLIC_SITE_URL=http://localhost:3000

   # Local Storage
   ONLOOK_PROJECTS_DIR=./onlook-projects

   # AI Model Providers (optional - add your own API keys)
   # ANTHROPIC_API_KEY=your_anthropic_key_here
   # OPENAI_API_KEY=your_openai_key_here
   # OPENROUTER_API_KEY=your_openrouter_key_here

   # Cursor Integration (optional)
   # CURSOR_API_KEY=your_cursor_key_here
   # CURSOR_PLATFORM_ENABLED=false
   ```

3. **Start Development Server**
   ```bash
   bun dev
   ```

4. **Open in Browser**
   Navigate to `http://localhost:3000`

## Configuration

### AI Providers

You can configure AI providers by adding API keys to your `.env.local` file:

- **Anthropic Claude**: Add `ANTHROPIC_API_KEY`
- **OpenAI**: Add `OPENAI_API_KEY`
- **OpenRouter**: Add `OPENROUTER_API_KEY` (supports multiple models)

### Cursor Integration

- **Custom API Keys**: Set `CURSOR_PLATFORM_ENABLED=false` and add your API keys
- **Cursor Platform**: Set `CURSOR_PLATFORM_ENABLED=true` and add `CURSOR_API_KEY`

## Project Structure

```
onlook-projects/
├── project-id-1/
│   ├── meta.json          # Project metadata
│   ├── canvases/          # Canvas definitions
│   ├── conversations/     # Chat conversations
│   └── files/            # Project files
└── project-id-2/
    └── ...
```

## Development

- **Type Checking**: `bun run typecheck`
- **Linting**: `bun run lint`
- **Build**: `bun run build`
- **Start**: `bun run start`

## What's Changed

This version of Onlook has been transformed to be:

1. **Local-First**: No external dependencies, everything runs locally
2. **No Authentication**: Start coding immediately without signup
3. **Cursor-Inspired**: Interface designed to feel like Cursor IDE
4. **AI-Powered**: Integrated AI assistance with multiple provider support
5. **Free**: No paid services, everything runs locally

## Troubleshooting

- **Port Conflicts**: The app uses random ports for sandboxes. If you encounter conflicts, restart the app.
- **File Permissions**: Ensure the app has write permissions to the `onlook-projects` directory.
- **AI Not Working**: Check your API keys in the environment file and ensure they're valid.

## License

Apache 2.0
