# MarkItDown MCP — Handoff Document

## What Was Installed

[markitdown-mcp](https://github.com/microsoft/markitdown) is a Microsoft-built MCP server that gives Claude a `convert_to_markdown` tool. It converts virtually any file format into clean Markdown — useful for feeding documents into LLM workflows, summarisation, and search indexing.

## Files Added

```
.claude/
├── settings.json              # Registers markitdown-mcp as an MCP server
└── hooks/
    └── session-start.sh       # Auto-installs deps in remote web sessions
```

## How It Works

**MCP Server (`settings.json`)**
- Registers `markitdown-mcp` as a server named `markitdown`
- Exposes one tool: `convert_to_markdown(uri)`
- Accepted URI schemes: `http:`, `https:`, `file:`, `data:`

**SessionStart Hook (`session-start.sh`)**
- Runs async on every remote Claude Code web session start
- Installs `markitdown-mcp` + `cffi` via pip if not already present
- Also runs `npm install` for the project's JS dependencies
- Only runs in remote environments (`CLAUDE_CODE_REMOTE=true`), skips local

## Supported File Formats

| Category | Formats |
|---|---|
| Documents | PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx/.xls) |
| Web | HTML, URLs |
| Data | CSV, JSON, XML |
| Media | Images (with OCR), Audio (speech-to-text) |
| Other | ZIP, EPub, YouTube URLs |

## Usage Examples

In a Claude session, once the MCP server is active:

```
"Convert file:///home/user/report.pdf to markdown"
"Fetch https://example.com/spec.html and convert it to markdown"
"Convert this local Word doc: file:///home/user/docs/brief.docx"
```

## Re-installation (if needed)

```bash
pip3 install markitdown-mcp cffi
```

Verify it works:
```bash
python3 -c "from markitdown_mcp.__main__ import main; print('OK')"
```

## Known Issues / Notes

- **ffmpeg warning**: At import time, `pydub` warns if `ffmpeg` is not installed. This is non-fatal — audio conversion won't work without it, but all other formats are unaffected.
- **cffi dependency**: The base `cryptography` package on this system required `cffi` to be explicitly installed alongside `markitdown-mcp`. The hook handles this automatically.
- **No authentication**: The MCP server runs with the privileges of the current user and does not support auth. Do not expose it on a public network.
- **markitdown-mcp version**: `0.0.1a4` (alpha) — check for updates before long-term production use.

## Branch

Changes committed on: `claude/markitdown-skill-install-5eUdq`

## References

- GitHub: https://github.com/microsoft/markitdown
- MCP package: `pip install markitdown-mcp`
- MCP spec: https://modelcontextprotocol.io
