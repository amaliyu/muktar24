// House rule (apcl-app-ui): no emoji as interface icons — use lucide-react.
// Fails if an emoji / pictograph (U+1F300–U+1FAFF, U+2600–U+27BF) appears in
// any src/**/*.jsx file, except the content lines allow-listed below.
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '..')
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

// Content, not interface: text written into generated report files
// (PDF/Excel rows), where the symbol is part of the report itself.
// Each entry is a file (relative to src/) and a substring of the allowed line.
const ALLOW = [
  { file: 'components/Reports.jsx', line: '⚠ ${S.unvaluedCount} deliveries excluded — could not be priced' },
  { file: 'components/Reports.jsx', line: "'Balance Check: ✓ Balanced'" },
  { file: 'components/Reports.jsx', line: "days > 30 ? `⚠ ${days}` : days" },
  { file: 'components/Reports.jsx', line: "Number(i.current_stock)<=Number(i.reorder_level)?'⚠ LOW':'OK'" },
]

const jsxFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
  const p = path.join(dir, d.name)
  if (d.isDirectory()) return jsxFiles(p)
  return d.name.endsWith('.jsx') ? [p] : []
})

describe('no emoji used as interface icons', () => {
  it('src/**/*.jsx has no emoji outside the content allow-list', () => {
    const hits = []
    for (const file of jsxFiles(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join('/')
      fs.readFileSync(file, 'utf8').split('\n').forEach((text, i) => {
        if (!EMOJI.test(text)) return
        if (ALLOW.some(a => a.file === rel && text.includes(a.line))) return
        hits.push(`${rel}:${i + 1}: ${text.trim().slice(0, 120)}`)
      })
    }
    expect(hits).toEqual([])
  })

  it('every allow-list entry still matches a line (no stale entries)', () => {
    for (const a of ALLOW) {
      const text = fs.readFileSync(path.join(SRC, a.file), 'utf8')
      expect(text.includes(a.line), `${a.file}: ${a.line}`).toBe(true)
    }
  })
})
