// js/projects.js — Project management: create, open, save, delete, duplicate, export

import { dom, state, DEFAULT_PROJECT }  from './state.js';
import { dbGetAll, dbGet, dbPut, dbDelete } from './db.js';
import { showLoader, hideLoader, setDirty, setStatus, updateProjectStats } from './ui.js';
import { renderFileList, initRootDropzone } from './filetree.js';
import { loadEditor }   from './editor.js';

// ── Boot ──────────────────────────────────────────────────────────────────────
export async function bootSystem() {
    showLoader('Mounting IDB Volume...');

    // Migrate legacy localStorage
    const old = localStorage.getItem('nebula_ultra_projects');
    if (old) {
        try {
            const parsed = JSON.parse(old);
            for (const p of parsed) await dbPut(p);
            localStorage.removeItem('nebula_ultra_projects');
        } catch (e) { console.error("Migration failed", e); }
    }

    let all = await dbGetAll();
    if (all.length === 0) {
        const welcome    = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
        welcome.id       = 'proj-' + Date.now();
        await dbPut(welcome);
        all = [welcome];
    }

    state.projectsMeta = all.map(p => ({
        id: p.id, name: p.name, thumbnail: p.thumbnail,
        lastModified: p.lastModified, fileCount: p.files.length
    }));

    hideLoader();
    renderProjectGrid();
    lucide.createIcons();
}

// ── Grid ──────────────────────────────────────────────────────────────────────
export function renderProjectGrid() {
    dom.projectList.innerHTML = '';
    const term     = document.getElementById('project-search').value.toLowerCase();
    const filtered = state.projectsMeta.filter(p => p.name.toLowerCase().includes(term));

    if (filtered.length === 0) {
        dom.projectList.innerHTML = `<div class="col-span-full text-center text-zinc-500 py-12">No projects found.</div>`;
        return;
    }

    filtered.sort((a, b) => b.lastModified - a.lastModified).forEach(p => {
        const el       = document.createElement('div');
        el.className   = 'project-card group';
        const th       = p.thumbnail
            ? `<img src="${p.thumbnail}">`
            : `<div class="text-6xl opacity-20 group-hover:opacity-40 text-theme font-mono transition-opacity">&lt;/&gt;</div>`;
        el.onclick     = () => openProject(p.id);
        el.innerHTML   = `
            <div class="card-preview">${th}</div>
            <div class="p-4 flex-1 flex flex-col justify-between">
                <div>
                    <h3 class="font-bold text-white group-hover:text-theme transition-colors truncate" title="${p.name}">${p.name}</h3>
                    <p class="text-xs text-zinc-500 mt-1">${p.fileCount} Items • ${new Date(p.lastModified).toLocaleDateString()}</p>
                </div>
                <div class="mt-4 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="window._duplicateProject(event,'${p.id}')" class="text-emerald-500 text-xs px-2 py-1 rounded hover:bg-emerald-500/10"><i data-lucide="copy" width="14" height="14"></i></button>
                    <button onclick="window._deleteProject(event,'${p.id}')" class="text-red-500 text-xs px-2 py-1 rounded hover:bg-red-500/10"><i data-lucide="trash-2" width="14" height="14"></i></button>
                </div>
            </div>`;
        dom.projectList.appendChild(el);
    });
    lucide.createIcons();
}

// ── Open ──────────────────────────────────────────────────────────────────────
export async function openProject(id) {
    showLoader('Loading Project Data...');
    state.currentProject = await dbGet(id);
    if (!state.currentProject) { hideLoader(); return alert("Project corrupted or missing."); }

    dom.home.classList.add('hidden');
    dom.ide.classList.remove('hidden');
    dom.toolbar.classList.remove('hidden');
    dom.homeTitleArea.classList.add('hidden');
    dom.headerTitleArea.classList.remove('hidden');
    dom.projectNameInput.value = state.currentProject.name;
    setDirty(false);

    const index = state.currentProject.files.find(f => f.name === 'index.html');
    state.activeFileName = index ? index.name : state.currentProject.files.find(f => f.type === 'file')?.name;

    state.expandedFolders = new Set();
    state.currentProject.files.filter(f => f.type === 'folder').forEach(f => state.expandedFolders.add(f.name));

    initRootDropzone();
    renderFileList();
    setTimeout(loadEditor, 100);
    updateProjectStats();
    lucide.createIcons();

    document.getElementById('git-pat').value  = localStorage.getItem('nebula_git_pat') || '';
    document.getElementById('git-repo').value = state.currentProject.gitRepo || '';
    hideLoader();
}

// ── Save ──────────────────────────────────────────────────────────────────────
export async function saveCurrentProject() {
    if (!state.currentProject) return;
    state.currentProject.lastModified = Date.now();
    await dbPut(state.currentProject);
    setDirty(false);
    setStatus("Saved successfully", 2000);
    updateProjectStats();
}

// ── Create ────────────────────────────────────────────────────────────────────
export async function createNewProject() {
    const name = prompt("Enter Project Name:", "My App");
    if (!name || name.trim() === '') return;
    const newP    = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
    newP.id       = 'proj-' + Date.now();
    newP.name     = name;
    await dbPut(newP);
    openProject(newP.id);
}

// ── Duplicate ─────────────────────────────────────────────────────────────────
window._duplicateProject = async (e, id) => {
    e.stopPropagation();
    showLoader('Duplicating...');
    const p     = await dbGet(id);
    const copy  = JSON.parse(JSON.stringify(p));
    copy.id     = 'proj-' + Date.now();
    copy.name  += ' (Copy)';
    copy.lastModified = Date.now();
    copy.thumbnail    = null;
    await dbPut(copy);
    hideLoader();
    bootSystem();
};

// ── Delete ────────────────────────────────────────────────────────────────────
window._deleteProject = async (e, id) => {
    e.stopPropagation();
    if (!confirm("Permanently delete project?")) return;
    await dbDelete(id);
    bootSystem();
};

// ── Rename (project name input) ───────────────────────────────────────────────
export function updateProjectName(name) {
    if (name.trim()) { state.currentProject.name = name; setDirty(true); }
}

// ── Export ZIP ────────────────────────────────────────────────────────────────
export function exportProject() {
    const zip = new JSZip();
    state.currentProject.files.forEach(f => {
        if      (f.type === 'folder') zip.folder(f.name);
        else if (f.isBinary)          zip.file(f.name, f.content.split(',')[1], { base64: true });
        else                          zip.file(f.name, f.content);
    });
    zip.generateAsync({ type: 'blob' }).then(c => {
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(c);
        a.download = state.currentProject.name.replace(/\s+/g, '_') + '.zip';
        a.click();
    });
}

// ── Home / navigation ─────────────────────────────────────────────────────────
export function attemptHome() {
    if (state.hasUnsavedChanges) {
        if (!confirm("You have unsaved changes. Discard and return to home?")) return;
    }
    showHome();
}

export function showHome() {
    state.currentProject = null;
    setDirty(false);
    dom.ide.classList.add('hidden');
    dom.home.classList.remove('hidden');
    dom.toolbar.classList.add('hidden');
    dom.headerTitleArea.classList.add('hidden');
    dom.homeTitleArea.classList.remove('hidden');
    bootSystem();
}
