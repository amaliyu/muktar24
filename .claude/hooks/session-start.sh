#!/bin/bash
set -euo pipefail

echo '{"async": true, "asyncTimeout": 300000}'

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Install markitdown-mcp if not present
if ! python3 -c "import markitdown_mcp" 2>/dev/null; then
  pip3 install markitdown-mcp cffi --quiet
fi

# Install project JS dependencies
if [ -f "$CLAUDE_PROJECT_DIR/package-lock.json" ]; then
  npm install --prefix "$CLAUDE_PROJECT_DIR"
fi
