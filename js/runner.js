// js/runner.js — Project build pipeline (blob bundler + iframe runner)

import { dom, state }    from './state.js';
import { logToConsole }  from './ui.js';
import { saveCurrentProject } from './projects.js';

// Resolve a relative import path against a base file path
function resolvePath(base, rel) {
    const segs = base.includes('/') ? base.split('/').slice(0, -1) : [];
    for (const p of rel.split('/')) {
        if (p === '.' || p === '') continue;
        if (p === '..') segs.pop();
        else            segs.push(p);
    }
    return segs.join('/');
}

function isModule(f) {
    if (!f.name.endsWith('.js')) return false;
    if (f.strategy === 'module') return true;
    return /^\s*(import\s|export\s)/m.test(f.content || '');
}

export async function runProject() {
    dom.console.innerHTML = '';
    logToConsole('info', 'Building and running...');
    await saveCurrentProject();

    const files   = state.currentProject.files.filter(f => f.type === 'file');
    const fileMap = {};
    files.forEach(f => { fileMap[f.name] = f; });

    // ── Step 1: blob URLs for non-JS, non-HTML assets ────────────────────────
    const urlMap = {};
    files.forEach(f => {
        if (f.name.endsWith('.js') || f.name.endsWith('.html')) return;
        if (f.isBinary) {
            try {
                const byteString = atob(f.content.split(',')[1]);
                const ab  = new ArrayBuffer(byteString.length);
                const ia  = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                const mime = f.content.split(';')[0].split(':')[1];
                urlMap[f.name] = URL.createObjectURL(new Blob([ab], { type: mime }));
            } catch (e) { logToConsole('warn', `Could not process binary: ${f.name}`); }
        } else {
            const type = f.name.endsWith('.css') ? 'text/css' : 'text/plain';
            urlMap[f.name] = URL.createObjectURL(new Blob([f.content], { type }));
        }
    });

    // ── Step 2: Recursive ES module bundler ──────────────────────────────────
    const moduleUrlMap = {};
    const processing   = new Set();
    const processed    = new Set();

    function resolveImportPath(fromFile, importPath) {
        if (!importPath.startsWith('./') && !importPath.startsWith('../')) return null;
        return resolvePath(fromFile, importPath);
    }

    function processModule(filePath) {
        if (processed.has(filePath))   return moduleUrlMap[filePath];
        if (processing.has(filePath)) {
            logToConsole('warn', `Circular import detected: ${filePath}`);
            return moduleUrlMap[filePath] || null;
        }
        processing.add(filePath);

        const f = fileMap[filePath];
        if (!f) { logToConsole('error', `Module not found: ${filePath}`); processing.delete(filePath); return null; }

        let code = f.content || '';

        function rewriteSpecifier(importPath) {
            const abs    = resolveImportPath(filePath, importPath);
            if (!abs) return importPath;
            const depUrl = processModule(abs);
            return depUrl || importPath;
        }

        code = code.replace(/\b(from\s*)(["'])(\.\.?\/[^"']+)\2/g,  (m, pre, q, spec) => `${pre}${q}${rewriteSpecifier(spec)}${q}`);
        code = code.replace(/\bimport\s*(["'])(\.\.?\/[^"']+)\1/g,  (m, q, spec) => `import ${q}${rewriteSpecifier(spec)}${q}`);
        code += `\n//# sourceURL=nebula://${filePath}`;

        const blobUrl = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
        moduleUrlMap[filePath] = blobUrl;
        processing.delete(filePath);
        processed.add(filePath);
        return blobUrl;
    }

    files.forEach(f => {
        if (!f.name.endsWith('.js')) return;
        if (isModule(f)) {
            processModule(f.name);
        } else {
            const code = (f.content || '') + `\n//# sourceURL=nebula://${f.name}`;
            moduleUrlMap[f.name] = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
            processed.add(f.name);
        }
    });

    // ── Step 3: Build HTML ────────────────────────────────────────────────────
    const index = files.find(f => f.name === 'index.html') || files.find(f => f.name.endsWith('.html'));
    if (!index) { logToConsole('error', 'No HTML entry point found.'); return; }

    let html = index.content || '';

    // Rewrite <link href>
    html = html.replace(/(<link\b[^>]*?\bhref\s*=\s*)(["'])([^"']+)\2([^>]*>)/g, (match, pre, q, path, post) => {
        if (/^(https?:|\/\/|data:|blob:)/.test(path)) return match;
        const abs = resolvePath('index.html', path);
        return urlMap[abs] ? `${pre}${q}${urlMap[abs]}${q}${post}` : match;
    });

    // Rewrite <script src>
    html = html.replace(/<script(\b[^>]*)>/g, (match, attrs) => {
        const typeMatch  = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
        const scriptType = typeMatch ? typeMatch[1].toLowerCase() : '';
        if (scriptType && !['module','text/javascript','application/javascript'].includes(scriptType)) return match;

        const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
        if (!srcMatch) return match;
        const src = srcMatch[1];
        if (/^(https?:|\/\/|blob:|data:)/.test(src)) return match;

        const abs     = resolvePath('index.html', src);
        const blobUrl = moduleUrlMap[abs];
        if (!blobUrl) return match;

        const f = fileMap[abs];
        let newAttrs = attrs.replace(/\bsrc\s*=\s*["'][^"']*["']/i, '').replace(/\btype\s*=\s*["'][^"']*["']/i, '').trim();
        const finalType = isModule(f) ? 'module' : (scriptType || 'text/javascript');
        return `<script type="${finalType}"${newAttrs ? ' ' + newAttrs : ''} src="${blobUrl}">`;
    });

    // Rewrite img/audio/video src
    html = html.replace(/(<(?:img|audio|video|source)\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/g, (match, pre, q, path) => {
        if (/^(https?:|\/\/|data:|blob:)/.test(path)) return match;
        const abs = resolvePath('index.html', path);
        return urlMap[abs] ? `${pre}${q}${urlMap[abs]}${q}` : match;
    });

    // ── Step 4: Inject console bridge + orphan assets ─────────────────────────
    const consoleScript = `<script>
window.onerror = function(message, url, line, col, error) {
    let f = url || '';
    if (f.includes('nebula://')) f = f.split('nebula://')[1];
    window.parent.postMessage({ type: 'error', msg: message + (error ? '\\n' + error.stack : ''), file: f, line: line }, '*');
};
const _origLog = console.log, _origWarn = console.warn, _origError = console.error;
console.log   = function() { const a = Array.prototype.slice.call(arguments); window.parent.postMessage({ type: 'log',  msg: a.map(String).join(' ') }, '*'); _origLog.apply(console, a); };
console.warn  = function() { const a = Array.prototype.slice.call(arguments); window.parent.postMessage({ type: 'warn', msg: a.map(String).join(' ') }, '*'); _origWarn.apply(console, a); };
console.error = function() { const a = Array.prototype.slice.call(arguments); window.parent.postMessage({ type: 'error',msg: a.map(String).join(' ') }, '*'); _origError.apply(console, a); };
<\/script>`;

    const referencedScripts = new Set();
    (index.content || '').replace(/<script[^>]+src\s*=\s*["']([^"']+)["']/g, (_, s) => referencedScripts.add(resolvePath('index.html', s)));
    const referencedStyles = new Set();
    (index.content || '').replace(/href\s*=\s*["']([^"']+)["']/g, (_, h) => referencedStyles.add(resolvePath('index.html', h)));

    let injections = consoleScript;

    files.forEach(f => {
        if (!f.name.endsWith('.css') || referencedStyles.has(f.name)) return;
        const cssContent = f.content.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (m, p) => {
            const abs = resolvePath(f.name, p);
            return urlMap[abs] ? `url('${urlMap[abs]}')` : m;
        });
        injections += `<style>/* ${f.name} */\n${cssContent}</style>`;
    });

    const importedModules = new Set();
    files.filter(f => f.name.endsWith('.js')).forEach(f => {
        const content = f.content || '';
        let m;
        const fromRe = /\bfrom\s*["'](\.\.?\/[^"']+)['"]/g;
        const sideRe = /\bimport\s*["'](\.\.?\/[^"']+)['"]/g;
        while ((m = fromRe.exec(content)) !== null) importedModules.add(resolvePath(f.name, m[1]));
        while ((m = sideRe.exec(content)) !== null) importedModules.add(resolvePath(f.name, m[1]));
    });

    files.forEach(f => {
        if (!f.name.endsWith('.js')) return;
        if (referencedScripts.has(f.name) || importedModules.has(f.name)) return;
        const blobUrl = moduleUrlMap[f.name];
        if (!blobUrl) return;
        injections += `<script${isModule(f) ? ' type="module"' : ''} src="${blobUrl}"><\/script>`;
    });

    html = html.includes('</body>')
        ? html.replace('</body>', injections + '\n</body>')
        : html + injections;

    // ── Step 5: Load into iframe ──────────────────────────────────────────────
    const finalBlob = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    dom.previewFrame.src = finalBlob;
    dom.previewPanel.style.width = '45%';
    if (state.monacoEditorInstance) state.monacoEditorInstance.layout();

    // Thumbnail capture
    setTimeout(() => {
        try {
            html2canvas(dom.previewFrame.contentWindow.document.body, { width: 600, height: 400, scale: 0.5 })
                .then(c => {
                    state.currentProject.thumbnail = c.toDataURL('image/jpeg', 0.5);
                    import('./db.js').then(m => m.dbPut(state.currentProject));
                });
        } catch (e) { /* ignore */ }
    }, 1500);
}
