// js/state.js — Shared application state and DOM references

export const DEFAULT_PROJECT = {
    id: null,
    name: "Welcome Project",
    thumbnail: null,
    lastModified: Date.now(),
    files: [
        { name: "css",       type: "folder" },
        { name: "js",        type: "folder" },
        { name: "js/utils",  type: "folder" },
        {
            name: "index.html", type: "file", isBinary: false,
            content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Nebula Welcome</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <h1>Welcome to <span class="accent">Nebula Studio</span></h1>
  <p>ES Modules, folder paths, and ZIP imports all work.</p>
  <div id="output" class="box"></div>
  <script type="module" src="js/main.js"><\/script>
</body>
</html>`
        },
        {
            name: "css/style.css", type: "file", isBinary: false,
            content: `* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; gap: 1.5rem; padding: 2rem; }
h1 { font-size: 2rem; font-weight: 700; }
.accent { color: #818cf8; }
p { color: #94a3b8; font-size: 1rem; }
.box { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.5rem 2rem; font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; color: #a78bfa; min-width: 320px; text-align: center; line-height: 2; }`
        },
        {
            name: "js/main.js", type: "file", isBinary: false, strategy: "module",
            content: `import { add, multiply } from "./utils/math.js";
import { greet } from "./utils/strings.js";

const result  = add(2, 3);
const product = multiply(4, 5);
const message = greet("Nebula");

console.log(message);
console.log("add(2, 3) =", result);
console.log("multiply(4, 5) =", product);

document.getElementById("output").innerHTML =
  message + "<br>add(2, 3) = " + result + "<br>multiply(4, 5) = " + product;`
        },
        {
            name: "js/utils/math.js", type: "file", isBinary: false, strategy: "module",
            content: `export function add(a, b)      { return a + b; }
export function multiply(a, b) { return a * b; }
export function subtract(a, b) { return a - b; }`
        },
        {
            name: "js/utils/strings.js", type: "file", isBinary: false, strategy: "module",
            content: `export function greet(name) { return "Hello from " + name + " Studio!"; }
export function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }`
        }
    ]
};

// ── Mutable shared state ──────────────────────────────────────────────────────
export const state = {
    projectsMeta:          [],   // lightweight grid data
    currentProject:        null,
    activeFileName:        "index.html",
    expandedFolders:       new Set(),
    monacoEditorInstance:  null,
    isSettingValue:        false,
    hasUnsavedChanges:     false,
};

// ── DOM reference map (populated once DOM is ready) ───────────────────────────
export const dom = {};

export function initDom() {
    Object.assign(dom, {
        home:             document.getElementById('view-home'),
        ide:              document.getElementById('view-ide'),
        projectList:      document.getElementById('project-list'),
        fileList:         document.getElementById('file-list'),
        editorContainer:  document.getElementById('editor-container'),
        assetViewer:      document.getElementById('asset-viewer'),
        assetPreview:     document.getElementById('asset-preview-container'),
        previewPanel:     document.getElementById('preview-panel'),
        previewFrame:     document.getElementById('preview-frame'),
        console:          document.getElementById('console-logs'),
        filename:         document.getElementById('active-filename'),
        strategy:         document.getElementById('file-strategy'),
        toolbar:          document.getElementById('toolbar'),
        projectNameInput: document.getElementById('project-name-input'),
        headerTitleArea:  document.getElementById('header-title-area'),
        homeTitleArea:    document.getElementById('home-title-area'),
        projectSizeMB:    document.getElementById('project-size-mb'),
        statusMsg:        document.getElementById('status-msg'),
        unsavedBadge:     document.getElementById('unsaved-badge'),
        btnSave:          document.getElementById('btn-save'),
        resizer:          document.getElementById('resizer'),
    });
}
