# TODOs for grove-coder

## Completed (Phase 0)
- [x] Scaffold project structure with uv
- [x] Create pyproject.toml with dependencies
- [x] Implement config.py (secrets loader with env var overrides)
- [x] Implement database.py (SQLite cost tracking)
- [x] Implement deepseek.py (async DeepSeek client via OpenRouter)
- [x] Implement server.py (MCP server with 4 tools)
- [x] Create cost_report.py CLI script
- [x] Set up .gitignore and secrets_template.json

## Future Enhancements
- [ ] Caching layer for common code patterns
- [ ] Quality scoring via orchestrator feedback
- [ ] Model fallback (DeepSeek → Qwen Coder)
- [ ] Streaming support for long code generation
- [ ] Multi-file generation in single request
