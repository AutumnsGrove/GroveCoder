/**
 * Sample Claude review comments for testing
 */

export const SAMPLE_REVIEW_BASIC = `## Code Review

### Issues & Concerns

1. [Critical] SQL Injection vulnerability in user query
   File: src/db/users.ts:42
   The query string is constructed using string concatenation with user input.
   \`\`\`typescript
   const query = \`SELECT * FROM users WHERE id = '\${userId}'\`;
   \`\`\`
   Should use parameterized queries instead.

2. [Major] Missing error handling in API endpoint
   File: src/api/handlers.ts:15-20
   The async function doesn't have a try-catch block.

3. [Minor] Unused import
   File: src/utils/helpers.ts:1
   The 'lodash' import is not used anywhere in this file.

### Recommendations Summary
- Fix the SQL injection vulnerability immediately
- Add proper error handling to all API endpoints
- Run a linter to catch unused imports

**Recommendation:** Request Changes`;

export const SAMPLE_REVIEW_WITH_SUGGESTIONS = `## Issues & Concerns

1. [Critical] Memory leak in event listener
   File: src/components/Modal.tsx line 25
   The event listener is never removed on unmount:
   \`\`\`javascript
   useEffect(() => {
     window.addEventListener('resize', handleResize);
     return () => window.removeEventListener('resize', handleResize);
   }, []);
   \`\`\`

2. [Major] Race condition in data fetching
   The component may update state after unmount.

3. [Suggestion] Consider using React Query for better data fetching patterns.`;

export const SAMPLE_REVIEW_APPROVE = `## Code Review

LGTM! The changes look good to me.

### Minor Suggestions
- Consider adding a comment explaining the regex pattern
- The variable name \`x\` could be more descriptive

**Recommendation:** Approve`;

export const SAMPLE_REVIEW_NUMBERED = `## PR Review

1. [Critical]: Buffer overflow in parseInput()
   Location: src/parser.c:156
   The buffer size is not checked before copying.

2. [Major]: Missing null check
   Location: src/parser.c:200
   Dereferencing potentially null pointer.

3. [Minor]: Magic number
   Location: src/parser.c:45
   Replace 1024 with a named constant.

4. [Suggestion]: Add documentation
   The parseInput function lacks documentation.

Verdict: Request changes`;

export const NON_REVIEW_COMMENT = `Thanks for the PR! I'll take a look at this tomorrow.

Let me know if you have any questions in the meantime.`;
