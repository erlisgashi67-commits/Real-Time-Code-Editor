import type { FileNode } from '@/lib/types'

/**
 * Client-side code runner. Assembles a preview document for HTML/React projects,
 * and executes standalone JS in a sandboxed iframe while capturing console output.
 */

const fileMap = (files: FileNode[]): Map<string, FileNode> => {
  const m = new Map<string, FileNode>()
  for (const f of files) m.set(f.path, f)
  // also allow lookup by basename
  for (const f of files) {
    const base = f.path.split('/').pop()
    if (base && !m.has(base)) m.set(base, f)
  }
  return m
}

export interface AssemblyResult {
  mode: 'iframe' | 'console' | 'text'
  html?: string
  jsCode?: string
  text?: string
  language?: string
}

/** Decide how to run a set of files and assemble the necessary payload. */
export function assemble(files: FileNode[]): AssemblyResult {
  const map = fileMap(files)
  const html = map.get('index.html')

  if (html) {
    return { mode: 'iframe', html: inlineAssets(html.content, map) }
  }

  const js = files.find((f) => f.path.endsWith('.js') || f.path.endsWith('.jsx'))
  if (js) {
    return { mode: 'console', jsCode: js.content, language: js.path.endsWith('.jsx') ? 'jsx' : 'javascript' }
  }

  const py = files.find((f) => f.path.endsWith('.py'))
  if (py) {
    return { mode: 'text', text: simulatePython(py.content), language: 'python' }
  }

  const md = files.find((f) => f.path.endsWith('.md'))
  if (md) {
    return { mode: 'text', text: md.content, language: 'markdown' }
  }

  return { mode: 'text', text: 'Nothing to run. Add an index.html, .js, or .py file.' }
}

/** Inline local CSS and JS references into a single HTML document for srcdoc. */
function inlineAssets(html: string, map: Map<string, FileNode>): string {
  let out = html

  // Inline <link rel="stylesheet" href="local.css">
  out = out.replace(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
    if (/^https?:\/\//i.test(href)) return match
    const f = map.get(href)
    return f ? `<style>\n${f.content}\n</style>` : match
  })

  // Inline <script src="local.js"></script> (keep type for babel)
  out = out.replace(/<script([^>]*)\ssrc=["']([^"']+)["']([^>]*)><\/script>/gi, (match, pre, src, post) => {
    if (/^https?:\/\//i.test(src)) return match
    const f = map.get(src)
    if (!f) return match
    const attrs = `${pre} ${post}`.trim()
    return `<script ${attrs}>\n${f.content}\n</script>`
  })

  return out
}

/** Heuristic, read-only "execution" of Python — prints the source with line numbers. */
function simulatePython(code: string): string {
  const lines = code.split('\n')
  const out: string[] = ['[simulated python runtime — full execution not available in-browser]', '']
  lines.forEach((line, i) => {
    out.push(`${String(i + 1).padStart(3, ' ')} | ${line}`)
  })
  out.push('')
  out.push('→ Saved to version history. Run locally with `python main.py` for real output.')
  return out.join('\n')
}

export interface ConsoleLine {
  text: string
  kind: 'log' | 'error' | 'warn' | 'info'
}

/**
 * Run JS in a hidden sandboxed iframe, capturing console output.
 * Resolves with the captured lines once execution completes (or errors).
 */
export function runJs(code: string, jsx = false): Promise<ConsoleLine[]> {
  return new Promise((resolve) => {
    const lines: ConsoleLine[] = []
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.style.display = 'none'
    document.body.appendChild(iframe)

    const babelScript = jsx
      ? '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>'
      : ''

    const runner = `
      ${babelScript}
      <script>
        const send = (kind, args) => {
          const text = args.map(a => {
            try {
              if (typeof a === 'string') return a;
              return JSON.stringify(a, null, 2);
            } catch { return String(a); }
          }).join(' ');
          parent.postMessage({ __codesync: true, kind, text }, '*');
        };
        const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
        console.log = (...a) => { send('log', a); orig.log(...a); };
        console.error = (...a) => { send('error', a); orig.error(...a); };
        console.warn = (...a) => { send('warn', a); orig.warn(...a); };
        console.info = (...a) => { send('info', a); orig.info(...a); };
        window.addEventListener('error', (e) => send('error', [e.message]));
        window.addEventListener('unhandledrejection', (e) => send('error', ['Unhandled rejection: ' + (e.reason && e.reason.message || e.reason)]));
        try {
          ${
            jsx
              ? `const __code = ${JSON.stringify(code)}; eval(Babel.transform(__code, { presets: ['react'] }).code);`
              : `eval(${JSON.stringify(code)});`
          }
          setTimeout(() => parent.postMessage({ __codesync: true, __done: true }, '*'), 50);
        } catch (err) {
          send('error', [err && err.message ? err.message : String(err)]);
          parent.postMessage({ __codesync: true, __done: true }, '*');
        }
      </script>
    `

    const handler = (e: MessageEvent) => {
      const d = e.data
      if (!d || !d.__codesync) return
      if (d.__done) {
        window.removeEventListener('message', handler)
        iframe.remove()
        resolve(lines)
        return
      }
      lines.push({ text: d.text, kind: d.kind })
    }
    window.addEventListener('message', handler)

    iframe.srcdoc = `<html><head><meta charset="utf-8">${babelScript}</head><body>${runner}</body></html>`
    // safety timeout
    setTimeout(() => {
      if (iframe.parentNode) {
        window.removeEventListener('message', handler)
        iframe.remove()
        resolve(lines.length ? lines : [{ text: '(no output)', kind: 'info' }])
      }
    }, 4000)
  })
}
