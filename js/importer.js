// js/importer.js — ZIP/file import helpers

import { dom, state }           from './state.js';
import { setDirty, showLoader, hideLoader, setStatus, updateProjectStats } from './ui.js';
import { renderFileList }       from './filetree.js';
import { openProject }          from './projects.js';
import { dbPut }                from './db.js';

const TEXT_EXTS = ['html','htm','css','js','ts','json','md','txt','xml','svg','yaml','yml','toml','ini','sh','py','rb','php','vue','jsx','tsx'];

export function guessMime(ext) {
    const map = {
        png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
        webp:'image/webp', ico:'image/x-icon', svg:'image/svg+xml',
        mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg',
        mp4:'video/mp4', webm:'video/webm',
        woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf',
        pdf:'application/pdf'
    };
    return map[ext] || 'application/octet-stream';
}

// ── Core ZIP → project files importer ────────────────────────────────────────
export async function importZipToProject(file, projectName) {
    const zip      = await JSZip.loadAsync(file);
    const newFiles = [];
    const seenFolders = new Set();

    const entries = Object.values(zip.files).sort((a, b) => {
        if (a.dir && !b.dir) return -1;
        if (!a.dir && b.dir) return 1;
        return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
        let entryPath = entry.name.replace(/\\/g, '/').replace(/^\//, '');
        if (entryPath.includes('__MACOSX') || entryPath.includes('.DS_Store')) continue;
        if (/[{}*?!|]/.test(entryPath)) continue;
        if (!entryPath || entryPath === '/') continue;

        if (entry.dir) {
            const clean = entryPath.replace(/\/$/, '');
            if (clean && !seenFolders.has(clean)) {
                seenFolders.add(clean);
                newFiles.push({ name: clean, type: 'folder' });
            }
        } else {
            const ext    = entryPath.split('.').pop().toLowerCase();
            const isText = TEXT_EXTS.includes(ext);
            let content;
            if (isText) {
                content = await entry.async('string');
            } else {
                const b64  = await entry.async('base64');
                const mime = guessMime(ext);
                content = `data:${mime};base64,${b64}`;
            }
            newFiles.push({ name: entryPath, type: 'file', isBinary: !isText, content, strategy: 'classic' });
        }
    }

    // Strip common top-level wrapper folder
    const filePaths  = newFiles.filter(f => f.type === 'file').map(f => f.name);
    if (filePaths.length > 0) {
        const firstParts  = filePaths.map(p => p.split('/')[0]);
        const allSameRoot = firstParts.every(p => p === firstParts[0]);
        if (allSameRoot && firstParts[0]) {
            const prefix = firstParts[0] + '/';
            newFiles.forEach(f => {
                if      (f.name.startsWith(prefix))  f.name = f.name.slice(prefix.length);
                else if (f.name === firstParts[0])   f.name = '';
            });
            const filtered = newFiles.filter(f => f.name !== '');
            newFiles.length = 0;
            newFiles.push(...filtered);
        }
    }

    // Ensure all parent folders are registered
    const folderSet = new Set(newFiles.filter(f => f.type === 'folder').map(f => f.name));
    newFiles.filter(f => f.type === 'file').forEach(f => {
        const parts = f.name.split('/');
        for (let i = 1; i < parts.length; i++) {
            const fp = parts.slice(0, i).join('/');
            if (!folderSet.has(fp)) {
                folderSet.add(fp);
                newFiles.unshift({ name: fp, type: 'folder' });
            }
        }
    });

    return { id: 'proj-' + Date.now(), name: projectName, thumbnail: null, lastModified: Date.now(), files: newFiles };
}

// ── Home-page ZIP import (creates new project) ────────────────────────────────
export function triggerHomeZipImport() {
    const input    = document.createElement('input');
    input.type     = 'file';
    input.accept   = '.zip';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const projName = prompt("Project name for imported ZIP:", file.name.replace(/\.zip$/i, '') || "Imported Project");
        if (!projName) return;
        showLoader('Importing ZIP...');
        try {
            const newP = await importZipToProject(file, projName);
            await dbPut(newP);
            hideLoader();
            openProject(newP.id);
        } catch (err) { hideLoader(); alert("ZIP Import Failed: " + err.message); }
    };
    input.click();
}

// ── In-project ZIP upload (merges into current project) ──────────────────────
export function initZipInput() {
    document.getElementById('zipInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        showLoader('Extracting ZIP...');
        try {
            const imported = await importZipToProject(file, '');
            let added = 0;
            imported.files.forEach(f => {
                if (!state.currentProject.files.some(x => x.name === f.name)) {
                    state.currentProject.files.push(f);
                    if (f.type === 'folder') state.expandedFolders.add(f.name);
                    added++;
                }
            });
            setDirty(true);
            renderFileList();
            updateProjectStats();
            hideLoader();
            setStatus(`ZIP imported: ${added} items added`, 3000);
        } catch (err) { hideLoader(); alert("ZIP Import Failed: " + err.message); }
        e.target.value = '';
    });
}

// ── Individual file upload ────────────────────────────────────────────────────
export function initFileInput() {
    document.getElementById('fileInput').addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(file => {
            if (file.size > 5 * 1024 * 1024) return alert(`File ${file.name} exceeds 5MB limit.`);
            const reader   = new FileReader();
            const isBinary = !['html','css','js','txt','json','md','xml'].includes(file.name.split('.').pop().toLowerCase());
            reader.onload  = (ev) => {
                const path = file.webkitRelativePath || file.name;
                if (!state.currentProject.files.some(f => f.name === path)) {
                    state.currentProject.files.push({ name: path, type: 'file', content: ev.target.result, isBinary, strategy: path.endsWith('.js') ? 'module' : 'classic' });
                    const parts = path.split('/');
                    for (let i = 1; i < parts.length; i++) {
                        const fp = parts.slice(0, i).join('/');
                        if (!state.currentProject.files.some(f => f.name === fp && f.type === 'folder')) {
                            state.currentProject.files.unshift({ name: fp, type: 'folder' });
                            state.expandedFolders.add(fp);
                        }
                    }
                    setDirty(true);
                    renderFileList();
                    updateProjectStats();
                }
            };
            if (isBinary) reader.readAsDataURL(file); else reader.readAsText(file);
        });
        e.target.value = '';
    });
}

export function triggerUpload()    { document.getElementById('fileInput').click(); }
export function triggerZipUpload() { document.getElementById('zipInput').click(); }
