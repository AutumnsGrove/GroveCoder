# Contributing to GroveCoder

Thank you for your interest in contributing to GroveCoder! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/AutumnsGrove/GroveCoder.git
cd GroveCoder

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Environment Variables

For local development, create a `.env` file:

```bash
# Required for GitHub API operations
GITHUB_TOKEN=ghp_your_token_here

# Required for Claude API
ANTHROPIC_API_KEY=sk-ant-your_key_here

# Optional: Enable dry run mode
GROVECODER_DRY_RUN=true
```

## Project Structure

```
src/
├── agent/       # Core agent logic
├── claude/      # Claude API client
├── config/      # Configuration system
├── github/      # GitHub API client
├── tools/       # Tool implementations
├── triggers/    # Event handlers
└── utils/       # Shared utilities

tests/
├── agent/       # Agent tests
├── config/      # Config tests
├── tools/       # Tool tests
└── fixtures/    # Test data
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

Follow the code style guidelines below.

### 3. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- tests/agent/parser.test.ts
```

### 4. Build

```bash
npm run build
```

### 5. Commit

Use conventional commits:

```bash
git commit -m "feat: add new tool for X"
git commit -m "fix: handle edge case in parser"
git commit -m "docs: update TOOLS.md"
```

### 6. Push and Create PR

```bash
git push -u origin feature/your-feature-name
```

## Code Style Guidelines

### TypeScript

- Use strict TypeScript (`strict: true`)
- Prefer `interface` over `type` for object shapes
- Use explicit return types for exported functions
- Avoid `any` - use `unknown` and narrow types

```typescript
// Good
export function parseReview(content: string): ParsedReview {
  // ...
}

// Avoid
export function parseReview(content: any) {
  // ...
}
```

### Naming Conventions

- **Files**: kebab-case (`file-ops.ts`, `web-fetch.ts`)
- **Classes**: PascalCase (`ClaudeClient`, `SafetyChecker`)
- **Functions/Variables**: camelCase (`parseReview`, `maxIterations`)
- **Constants**: SCREAMING_SNAKE_CASE (`DEFAULT_LIMITS`, `TOOL_DEFINITIONS`)
- **Types/Interfaces**: PascalCase (`ToolContext`, `AgentState`)

### Error Handling

- Use custom error classes from `src/utils/errors.ts`
- Always include context in error messages
- Log errors before throwing

```typescript
import { ToolExecutionError, logger } from '../utils/index.js';

if (!isAllowed) {
  const error = new ToolExecutionError(
    `Command not allowed: ${command}`,
    'run_command',
    false // not recoverable
  );
  logger.warn('Blocked command', { command });
  throw error;
}
```

### Logging

Use the structured logger:

```typescript
import { logger } from '../utils/index.js';

logger.info('Operation completed', {
  duration: elapsed,
  itemCount: items.length
});

logger.error('Operation failed', { error: message });
```

## Testing Guidelines

### Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('functionName', () => {
  describe('scenario', () => {
    it('should do expected behavior', () => {
      // Arrange
      const input = createTestInput();

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toEqual(expected);
    });
  });
});
```

### Mocking

Use Vitest's mocking utilities:

```typescript
import { vi } from 'vitest';

// Mock a module
vi.mock('../github/client.js', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    getFileContent: vi.fn().mockResolvedValue({ content: 'test' }),
  })),
}));

// Mock a function
const mockFetch = vi.fn().mockResolvedValue({ ok: true });
global.fetch = mockFetch;
```

### Test Coverage

- Aim for high coverage on critical paths (parser, safety, loop)
- Test error cases and edge cases
- Use fixtures for complex test data

## Adding New Features

### Adding a New Tool

1. **Define the schema** in `src/tools/definitions.ts`:

```typescript
{
  name: 'my_new_tool',
  description: 'Does something useful',
  input_schema: {
    type: 'object',
    properties: {
      param: { type: 'string', description: '...' }
    },
    required: ['param']
  }
}
```

2. **Implement the handler** in `src/tools/my-tool.ts`:

```typescript
export async function myNewTool(param: string): Promise<string> {
  // Implementation
}
```

3. **Register in dispatcher** in `src/tools/index.ts`:

```typescript
case 'my_new_tool':
  output = await myNewTool(input['param'] as string);
  break;
```

4. **Add tests** in `tests/tools/my-tool.test.ts`

### Adding Configuration Options

1. **Add types** in `src/config/types.ts`
2. **Add validation** in `src/config/loader.ts`
3. **Add tests** in `tests/config/loader.test.ts`
4. **Document** in relevant markdown files

## Pull Request Process

1. **Update documentation** if adding features
2. **Add tests** for new functionality
3. **Ensure all tests pass** (`npm test`)
4. **Ensure build succeeds** (`npm run build`)
5. **Fill out the PR template**
6. **Request review**

### PR Title Format

```
feat: add web_fetch tool for documentation lookup
fix: handle empty file content in parser
docs: add CONTRIBUTING.md guide
refactor: extract safety checks to separate module
test: add integration tests for agent loop
```

## Questions?

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Tag maintainers for urgent issues

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
