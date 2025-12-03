# GroveCoder Tools Reference

This document describes all tools available to the GroveCoder agent.

## File Operations

### `read_file`

Read the contents of a file from the repository.

**Input:**
```json
{
  "path": "src/index.ts"
}
```

**Output:** File content as string

**Example:**
```
Tool: read_file
Input: { "path": "package.json" }
Output: "{\n  \"name\": \"my-project\",\n  ..."
```

**Errors:**
- File not found (404)
- Path is a directory

---

### `write_file`

Create or overwrite a file in the repository.

**Input:**
```json
{
  "path": "src/utils/helper.ts",
  "content": "export function helper() { ... }"
}
```

**Output:** Success message with commit SHA

**Notes:**
- Creates parent directories automatically
- Commits directly to PR branch via GitHub API
- Protected files (*.env, *.pem, etc.) are blocked

---

### `edit_file`

Make targeted edits to a file using search and replace. Preferred over `write_file` for modifications.

**Input:**
```json
{
  "path": "src/app.ts",
  "old_string": "console.log('debug')",
  "new_string": "logger.debug('message')"
}
```

**Output:** Success message with number of replacements

**Errors:**
- `old_string` not found in file
- `old_string` matches multiple locations (use `write_file` instead)

**Notes:**
- Requires exact string match
- Use for surgical edits, not large rewrites

---

### `list_directory`

List the contents of a directory in the repository.

**Input:**
```json
{
  "path": "src/components"
}
```

**Output:** List of files and directories with types

**Example Output:**
```
src/components/
├── Button.tsx (file)
├── Card.tsx (file)
├── forms/ (directory)
└── utils/ (directory)
```

---

### `search_files`

Search for a pattern across files in the repository.

**Input:**
```json
{
  "pattern": "TODO:",
  "path": "src",
  "file_pattern": "*.ts"
}
```

**Output:** Matching lines with file paths and line numbers

**Example Output:**
```
src/app.ts:42: // TODO: Add error handling
src/utils/api.ts:15: // TODO: Implement retry logic
src/components/Form.tsx:88: // TODO: Validate input
```

**Notes:**
- Supports basic regex patterns
- Optional `path` to limit search scope
- Optional `file_pattern` to filter by extension

---

## Shell Commands

### `run_command`

Execute a shell command. Only whitelisted commands are allowed.

**Input:**
```json
{
  "command": "npm test",
  "cwd": "packages/core"
}
```

**Output:** Command stdout/stderr

**Default Allowed Commands:**
- `npm test`, `npm run test`
- `npm run lint`, `npm run build`
- `npx tsc --noEmit`, `npx eslint`
- `yarn test`, `yarn lint`, `yarn build`
- `pnpm test`, `pnpm lint`, `pnpm build`
- `cargo test`, `cargo check`, `cargo clippy`
- `go test`, `go vet`
- `pytest`, `python -m pytest`
- `ruff check`, `mypy`

**Blocked:**
- Shell operators: `&&`, `||`, `;`, `|`, `` ` ``, `$()`
- Arbitrary commands not in whitelist

**Configuration:**
Additional commands can be allowed via `.github/grovecoder.yml`:
```yaml
commands:
  allowed:
    - make test
    - custom-lint-script
  blocked:
    - npm audit  # Block a default command
```

---

### `git_status`

Get the current git status showing modified, staged, and untracked files.

**Input:** None required

**Output:** Git status output

---

## PR Operations

### `get_pr_diff`

Get the diff of all files changed in the current pull request.

**Input:** None required

**Output:** Unified diff format for all changed files

**Example Output:**
```diff
diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,6 +10,7 @@
 import { logger } from './utils';
+import { validate } from './validation';
```

---

### `get_pr_comments`

Get all comments on the current pull request.

**Input:** None required

**Output:** List of comments with author and body

---

### `add_pr_comment`

Post a comment on the current pull request.

**Input:**
```json
{
  "body": "## Fix Applied\n\nI've updated the error handling..."
}
```

**Output:** Success message with comment ID

**Notes:**
- Supports full GitHub markdown
- Use for progress updates or explanations

---

## Extended Tools

### `web_fetch`

Fetch content from a documentation URL. Only whitelisted documentation sites are allowed.

**Input:**
```json
{
  "url": "https://nodejs.org/api/fs.html"
}
```

**Output:** Page content converted to text

**Allowed Domains:**
- `docs.github.com`
- `developer.mozilla.org` (MDN)
- `nodejs.org`
- `typescriptlang.org`
- `reactjs.org`, `react.dev`
- `vuejs.org`, `angular.io`
- `nextjs.org`
- `npmjs.com`, `pypi.org`, `crates.io`, `pkg.go.dev`
- `eslint.org`, `prettier.io`
- `jestjs.io`, `vitest.dev`
- `github.com`, `raw.githubusercontent.com`

**Notes:**
- HTTPS required
- 10 second timeout
- Responses cached for 5 minutes
- HTML converted to readable text

---

### `request_human_help`

Request help from a human when stuck. This posts a detailed comment and adds a `grovecoder-needs-help` label.

**Input:**
```json
{
  "summary": "Unable to fix the authentication issue",
  "blockers": [
    "Cannot find the auth middleware file",
    "Test failures in unrelated modules"
  ],
  "suggestions": [
    "Check if auth was moved to a different package",
    "Run tests locally to verify environment"
  ],
  "issues_fixed": 2,
  "issues_remaining": 1
}
```

**Output:** Confirmation message

**Effects:**
- Posts detailed help request comment
- Adds `grovecoder-needs-help` label
- Removes `grovecoder-working` label
- Signals agent completion (like `done`)

---

### `done`

Signal that all fixes are complete and the remediation is finished.

**Input:**
```json
{
  "summary": "Fixed type errors and added error handling",
  "issues_fixed": 3,
  "issues_skipped": 1,
  "reason": "One issue requires architectural changes beyond scope"
}
```

**Output:** Summary string

**Notes:**
- Always call this when finished
- Use `request_human_help` instead if stuck
- `issues_skipped` and `reason` are optional

---

## Error Handling

All tools return structured errors:

```json
{
  "success": false,
  "output": "Error: File not found: src/missing.ts"
}
```

**Recoverable Errors:**
- File not found (can try different path)
- Command failed (can check output and retry)
- Network timeout (automatically retried)

**Non-Recoverable Errors:**
- Protected file access blocked
- Invalid tool input
- Authorization failures

The agent tracks consecutive failures and triggers the circuit breaker after 3 failures in a row.
