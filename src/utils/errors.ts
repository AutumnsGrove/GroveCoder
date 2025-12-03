/**
 * Custom error types for GroveCoder
 */

export class GroveCoderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = false
  ) {
    super(message);
    this.name = 'GroveCoderError';
  }
}

export class SafetyLimitError extends GroveCoderError {
  constructor(message: string, public readonly limitType: string) {
    super(message, 'SAFETY_LIMIT', false);
    this.name = 'SafetyLimitError';
  }
}

export class ApiError extends GroveCoderError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly provider: 'claude' | 'github' = 'claude'
  ) {
    super(message, 'API_ERROR', statusCode !== undefined && statusCode >= 500);
    this.name = 'ApiError';
  }
}

export class ParseError extends GroveCoderError {
  constructor(message: string) {
    super(message, 'PARSE_ERROR', false);
    this.name = 'ParseError';
  }
}

export class ToolExecutionError extends GroveCoderError {
  constructor(
    message: string,
    public readonly toolName: string,
    recoverable = true
  ) {
    super(message, 'TOOL_ERROR', recoverable);
    this.name = 'ToolExecutionError';
  }
}

export class ConfigError extends GroveCoderError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR', false);
    this.name = 'ConfigError';
  }
}

export function isGroveCoderError(error: unknown): error is GroveCoderError {
  return error instanceof GroveCoderError;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
