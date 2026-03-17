// js/projects.js — Project management: create, open, save, delete, duplicate, export

import { dom, state, DEFAULT_PROJECT }       from './state.js';
import { dbGetAll, dbGet, dbPut, dbDelete }  from './db.js';
import { showLoader, hideLoader, setDirty, setStatus, updateProjectStats } from './ui.js';
import { renderFileList, initRootDropzone }  from './filetree.js';
import { loadEditor }                        from './editor.js';

// ── Boot ──────────────────────────────────────────────────────────────────────
export async function bootSystem() {
    showLoader('Mounting IDB Volume...');

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
        lastModified: p.lastModified, fileCount: p.files.length,
        gitRepo: p.gitRepo || ''
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
        const el     = document.createElement('div');
        el.className = 'project-card group';
        const th     = p.thumbnail
            ? `<img src="${p.thumbnail}">`
            : `<div class="text-6xl opacity-20 group-hover:opacity-40 text-theme font-mono transition-opacity">&lt;/&gt;</div>`;

        el.onclick = () => openProject(p.id);
        el.innerHTML = `
            <div class="card-preview">${th}
                <!-- Run-in-tab overlay button (top-right of preview) -->
                <button
                    onclick="window._runCardProject(event,'${p.id}')"
                    class="card-run-btn"
                    title="Run in new tab">
                    <i data-lucide="play" width="18" height="18"></i>
                </button>
            </div>
            <div class="p-4 flex-1 flex flex-col justify-between">
                <div>
                    <h3 class="font-bold text-white group-hover:text-theme transition-colors truncate" title="${p.name}">${p.name}</h3>
                    <p class="text-xs text-zinc-500 mt-1">${p.fileCount} Items · ${new Date(p.lastModified).toLocaleDateString()}</p>
                </div>
                <!-- Action row revealed on hover -->
                <div class="card-actions mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div class="flex items-center gap-1">
                        <button onclick="window._duplicateProject(event,'${p.id}')"
                            class="card-action-btn text-emerald-400 hover:bg-emerald-500/15"
                            title="Duplicate">
                            <i data-lucide="copy" width="14" height="14"></i>
                            <span>Duplicate</span>
                        </button>
                        <button onclick="window._deleteProject(event,'${p.id}')"
                            class="card-action-btn text-red-400 hover:bg-red-500/15"
                            title="Delete">
                            <i data-lucide="trash-2" width="14" height="14"></i>
                            <span>Delete</span>
                        </button>
                    </div>
                    <button onclick="window._openQuickGit(event,'${p.id}','${encodeURIComponent(p.name)}')"
                        class="card-action-btn text-zinc-300 hover:bg-zinc-700 border border-zinc-700 ml-auto"
                        title="GitHub Sync">
                        <i data-lucide="github" width="14" height="14"></i>
                        <span>GitHub</span>
                    </button>
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
    const newP  = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
    newP.id     = 'proj-' + Date.now();
    newP.name   = name;
    await dbPut(newP);
    openProject(newP.id);
}

// ── Duplicate ─────────────────────────────────────────────────────────────────
window._duplicateProject = async (e, id) => {
    e.stopPropagation();
    showLoader('Duplicating...');
    const p    = await dbGet(id);
    const copy = JSON.parse(JSON.stringify(p));
    copy.id    = 'proj-' + Date.now();
    copy.name += ' (Copy)';
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

// ── Run card project in new tab ───────────────────────────────────────────────
window._runCardProject = async (e, id) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.classList.add('loading');
    const { runProjectInTab } = await import('./runner.js');
    await runProjectInTab(id);
    btn.classList.remove('loading');
};

// ── Quick GitHub modal (from card, without opening project) ───────────────────
window._openQuickGit = async (e, id, encodedName) => {
    e.stopPropagation();
    const name = decodeURIComponent(encodedName);

    // Populate the quick-git modal
    const modal = document.getElementById('quick-git-modal');
    modal.dataset.projectId = id;
    document.getElementById('qg-project-name').textContent = name;

    // Restore saved credentials for this project
    const project = await dbGet(id);
    document.getElementById('qg-pat').value    = localStorage.getItem('nebula_git_pat') || '';
    document.getElementById('qg-repo').value   = project?.gitRepo || '';
    document.getElementById('qg-branch').value = 'main';
    document.getElementById('qg-msg').value    = '';
    document.getElementById('qg-status').textContent = '';

    // Show modal
    modal.style.display = 'flex';
    lucide.createIcons();
};

// ── Quick Git: pull ───────────────────────────────────────────────────────────
window._quickGitPull = async () => {
    const modal   = document.getElementById('quick-git-modal');
    const id      = modal.dataset.projectId;
    const pat     = document.getElementById('qg-pat').value.trim();
    const repo    = document.getElementById('qg-repo').value.trim();
    const branch  = document.getElementById('qg-branch').value.trim() || 'main';
    const status  = document.getElementById('qg-status');

    if (!pat || !repo) return _setQgStatus('error', 'PAT and repo are required.');

    localStorage.setItem('nebula_git_pat', pat);
    _setQgStatus('loading', 'Pulling from GitHub...');

    try {
        const project = await dbGet(id);
        project.gitRepo = repo;

        const headers = { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${pat}` };
        const treeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`, { headers });
        if (!treeRes.ok) throw new Error(await treeRes.text());
        const tree = await treeRes.json();

        project.files = [];
        for (const item of tree.tree) {
            if (item.type === 'tree') {
                project.files.push({ name: item.path, type: 'folder' });
            } else if (item.type === 'blob') {
                const blobRes = await fetch(`https://api.github.com/repos/${repo}/git/blobs/${item.sha}`, { headers });
                if (!blobRes.ok) throw new Error(await blobRes.text());
                const blob  = await blobRes.json();
                const isText = !item.path.match(/\.(png|jpg|jpeg|gif|ico|mp3|wav|glb)$/i);
                const content = blob.encoding === 'base64'
                    ? (isText
                        ? decodeURIComponent(escape(window.atob(blob.content)))
                        : `data:application/octet-stream;base64,${blob.content.replace(/\n/g, '')}`)
                    : blob.content;
                project.files.push({ name: item.path, type: 'file', content, isBinary: !isText, strategy: item.path.endsWith('.js') ? 'module' : 'classic' });
            }
        }
        project.lastModified = Date.now();
        await dbPut(project);
        _setQgStatus('success', `Pulled ${project.files.length} items from ${branch}.`);
        bootSystem();
    } catch (err) { _setQgStatus('error', 'Pull failed: ' + err.message); }
};

// ── Quick Git: push ───────────────────────────────────────────────────────────
window._quickGitPush = async () => {
    const modal  = document.getElementById('quick-git-modal');
    const id     = modal.dataset.projectId;
    const pat    = document.getElementById('qg-pat').value.trim();
    const repo   = document.getElementById('qg-repo').value.trim();
    const branch = document.getElementById('qg-branch').value.trim() || 'main';
    const msg    = document.getElementById('qg-msg').value.trim() || 'Update via Nebula Studio';

    if (!pat || !repo) return _setQgStatus('error', 'PAT and repo are required.');

    localStorage.setItem('nebula_git_pat', pat);
    _setQgStatus('loading', 'Pushing to GitHub...');

    try {
        const project = await dbGet(id);
        project.gitRepo = repo;
        await dbPut(project);

        const headers = { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${pat}`, 'Content-Type': 'application/json' };

        async function ghFetch(endpoint, method = 'GET', body = null) {
            const res = await fetch(`https://api.github.com/repos/${repo}/${endpoint}`, { method, headers, body: body ? JSON.stringify(body) : null });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        }

        const ref = await ghFetch(`git/refs/heads/${branch}`).catch(async () => {
            const mRef = await ghFetch('git/refs/heads/main').catch(() => ghFetch('git/refs/heads/master'));
            return ghFetch('git/refs', 'POST', { ref: `refs/heads/${branch}`, sha: mRef.object.sha });
        });
        const baseTreeSha = (await ghFetch(`git/commits/${ref.object.sha}`)).tree.sha;

        const newTree = [];
        for (const f of project.files) {
            if (f.type === 'folder') continue;
            const content = f.isBinary ? f.content.split(',')[1] : f.content;
            const blob    = await ghFetch('git/blobs', 'POST', { content, encoding: f.isBinary ? 'base64' : 'utf-8' });
            newTree.push({ path: f.name, mode: '100644', type: 'blob', sha: blob.sha });
        }

        const treeObj  = await ghFetch('git/trees',  'POST', { base_tree: baseTreeSha, tree: newTree });
        const commit   = await ghFetch('git/commits', 'POST', { message: msg, tree: treeObj.sha, parents: [ref.object.sha] });
        await ghFetch(`git/refs/heads/${branch}`, 'PATCH', { sha: commit.sha });

        _setQgStatus('success', `Pushed to ${branch} — "${msg}"`);
    } catch (err) { _setQgStatus('error', 'Push failed: ' + err.message); }
};

function _setQgStatus(type, text) {
    const el = document.getElementById('qg-status');
    el.textContent = text;
    el.className = {
        loading: 'text-zinc-400',
        success: 'text-emerald-400',
        error:   'text-red-400',
    }[type] + ' text-xs mt-3 min-h-[1rem]';
}

// ── Rename (project name input in IDE) ────────────────────────────────────────
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
