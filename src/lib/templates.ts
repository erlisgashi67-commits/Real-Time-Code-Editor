export interface TemplateFile {
  path: string
  content: string
}

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  language: string
  icon: string
  files: TemplateFile[]
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'A single empty JavaScript file to start from scratch.',
    language: 'javascript',
    icon: 'FileCode',
    files: [
      {
        path: 'main.js',
        content:
          '// Welcome to CodeSync — a real-time collaborative editor.\n' +
          '// Share this project with a teammate and edit together live.\n\n' +
          'function greet(name) {\n  return `Hello, ${name}! Welcome to CodeSync.`;\n}\n\n' +
          'console.log(greet("collaborator"));\n',
      },
    ],
  },
  {
    id: 'web-page',
    name: 'Web Page',
    description: 'HTML + CSS + JS playground that renders live in the preview pane.',
    language: 'html',
    icon: 'Globe',
    files: [
      {
        path: 'index.html',
        content:
          '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n' +
          '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
          '  <title>CodeSync Preview</title>\n  <link rel="stylesheet" href="styles.css" />\n</head>\n<body>\n' +
          '  <main class="card">\n    <h1>Live Preview</h1>\n    <p>Edit the files and hit <strong>Run</strong> to see changes.</p>\n' +
          '    <button id="btn">Click me</button>\n    <p id="count">Clicks: 0</p>\n  </main>\n' +
          '  <script src="script.js"></script>\n</body>\n</html>\n',
      },
      {
        path: 'styles.css',
        content:
          '* { box-sizing: border-box; }\nbody {\n  margin: 0;\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n' +
          '  font-family: system-ui, sans-serif;\n  background: linear-gradient(135deg, #0f172a, #134e4a);\n  color: #e2e8f0;\n}\n' +
          '.card {\n  background: rgba(15, 23, 42, 0.6);\n  border: 1px solid rgba(16, 185, 129, 0.4);\n' +
          '  border-radius: 16px; padding: 2.5rem; text-align: center; backdrop-filter: blur(8px);\n}\n' +
          'h1 { color: #34d399; margin-top: 0; }\nbutton {\n  background: #10b981; color: #022c22; border: none;\n' +
          '  padding: 0.6rem 1.2rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 1rem;\n}\n' +
          'button:hover { background: #34d399; }\n',
      },
      {
        path: 'script.js',
        content:
          'const btn = document.getElementById("btn");\nconst count = document.getElementById("count");\nlet n = 0;\n' +
          'btn.addEventListener("click", () => {\n  n++;\n  count.textContent = `Clicks: ${n}`;\n});\n',
      },
    ],
  },
  {
    id: 'node-cli',
    name: 'Node CLI',
    description: 'A JavaScript module you can execute in the in-browser terminal.',
    language: 'javascript',
    icon: 'Terminal',
    files: [
      {
        path: 'index.js',
        content:
          '// Runs in the in-browser JS sandbox (Node built-ins are limited).\n\n' +
          'const fibonacci = (n) => {\n  const seq = [0, 1];\n  for (let i = 2; i < n; i++) seq.push(seq[i-1] + seq[i-2]);\n' +
          '  return seq.slice(0, n);\n};\n\nconsole.log("Fibonacci sequence:");\nconsole.log(fibonacci(10).join(", "));\n\n' +
          'const total = fibonacci(10).reduce((a, b) => a + b, 0);\nconsole.log(`\\nSum of first 10: ${total}`);\n',
      },
      {
        path: 'package.json',
        content: '{\n  "name": "codesync-cli",\n  "version": "1.0.0",\n  "description": "A CodeSync Node CLI demo",\n  "main": "index.js"\n}\n',
      },
    ],
  },
  {
    id: 'react-snippet',
    name: 'React Snippet',
    description: 'A React component rendered live via in-browser Babel transpile.',
    language: 'javascript',
    icon: 'Atom',
    files: [
      {
        path: 'App.jsx',
        content:
          '// Rendered with React + Babel in the preview pane.\nconst { useState } = React;\n\n' +
          'function App() {\n  const [count, setCount] = useState(0);\n  return (\n    <div style={{ fontFamily: "system-ui", padding: 32, textAlign: "center" }}>\n' +
          '      <h1 style={{ color: "#10b981" }}>CodeSync React</h1>\n      <p>Stateful counter, live in your browser.</p>\n' +
          '      <button onClick={() => setCount(c => c + 1)}\n        style={{ background: "#10b981", color: "#022c22", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}>\n' +
          '        Clicked {count} times\n      </button>\n    </div>\n  );\n}\n\nReactDOM.render(<App />, document.getElementById("root"));\n',
      },
      {
        path: 'index.html',
        content:
          '<!DOCTYPE html>\n<html><head><meta charset="utf-8" />\n' +
          '<script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>\n' +
          '<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>\n' +
          '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>\n</head>\n<body>\n' +
          '  <div id="root"></div>\n  <script type="text/babel" src="App.jsx"></script>\n</body></html>\n',
      },
    ],
  },
  {
    id: 'markdown-docs',
    name: 'Markdown Docs',
    description: 'A README with markdown — great for collaboration on documentation.',
    language: 'markdown',
    icon: 'FileText',
    files: [
      {
        path: 'README.md',
        content:
          '# CodeSync Project\n\n> Real-time collaborative editing, like Google Docs — for code.\n\n## Features\n\n' +
          '- Multi-user live editing with cursors\n- File tree & tabs\n- In-browser code execution\n' +
          '- Version history (commits)\n- Inline comments & chat\n- Shareable links with permissions\n\n## Getting Started\n\n' +
          '1. Invite a collaborator via **Share**\n2. Pick a file and start typing\n3. Open **Chat** to talk while you code\n\n' +
          '```js\nfunction hello(name) {\n  return `Hello, ${name}!`;\n}\n```\n',
      },
    ],
  },
  {
    id: 'python-script',
    name: 'Python Script',
    description: 'A Python file — editable and version-controlled (execution is simulated).',
    language: 'python',
    icon: 'Python',
    files: [
      {
        path: 'main.py',
        content:
          '# Python scripts are fully editable & version-controlled in CodeSync.\n' +
          '# In-browser execution is simulated for non-JS languages.\n\n' +
          'def quicksort(arr):\n    if len(arr) <= 1:\n        return arr\n' +
          '    pivot = arr[len(arr) // 2]\n    left = [x for x in arr if x < pivot]\n' +
          '    middle = [x for x in arr if x == pivot]\n    right = [x for x in arr if x > pivot]\n' +
          '    return quicksort(left) + middle + quicksort(right)\n\n' +
          'if __name__ == "__main__":\n    data = [3, 6, 8, 10, 1, 2, 1]\n    print("Sorted:", quicksort(data))\n',
      },
    ],
  },
]

export function getTemplate(id: string): ProjectTemplate {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0]
}
