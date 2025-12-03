/**
 * GroveCoder - Autonomous PR Remediation Agent
 *
 * Entry point for the GitHub Actions trigger.
 */

import { logger, isGroveCoderError, formatError } from './utils/index.js';
import { handleActionsEvent } from './triggers/actions.js';

export async function main(): Promise<void> {
  logger.info('GroveCoder starting...');

  try {
    await handleActionsEvent();
    logger.info('GroveCoder finished');
  } catch (error) {
    if (isGroveCoderError(error)) {
      logger.error('GroveCoder error', {
        code: error.code,
        message: error.message,
        recoverable: error.recoverable,
      });
    } else {
      logger.error('Unexpected error', { error: formatError(error) });
    }
    process.exitCode = 1;
  }
}

// Run if executed directly
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

// Export modules for programmatic use
export * from './agent/index.js';
export * from './llm/index.js';
// Note: claude module not re-exported due to type conflicts with llm module.
// Import directly from './claude/index.js' if needed for Claude-specific utilities.
export * from './github/index.js';
export * from './tools/index.js';
export * from './utils/index.js';
export * from './config/index.js';
