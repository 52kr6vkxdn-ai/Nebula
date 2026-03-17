// js/filetree.js — File tree rendering, drag-and-drop, file/folder CRUD

import { dom, state }              from './state.js';
import { setDirty, updateProjectStats } from './ui.js';
import { loadEditor }              from './editor.js';

// ── Render ────────────────────────────────────────────────────────────────────
export function renderFileList() {
    dom.fileList.innerHTML = '';

    const tree = { name: 'root', children: {}, files: [] };

    state.currentProject.files.forEach(file => {
        const parts = file.name.split('/');
        let cur = tree;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!cur.children[part]) {
                cur.children[part] = { name: part, path: parts.slice(0, i + 1).join('/'), children: {}, files: [] };
            }
            cur = cur.children[part];
        }
        const lastName = parts[parts.length - 1];
        if (file.type === 'folder') {
            if (!cur.children[lastName]) {
                cur.children[lastName] = { name: lastName, path: file.name, children: {}, files: [] };
            }
        } else {
            cur.files.push({ ...file, shortName: lastName });
        }
    });

    dom.fileList.appendChild(renderNode(tree, 0));
    lucide.createIcons();
}

function renderNode(node, depth) {
    const container = document.createElement('div');
    const folders = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
    const files   = node.files.sort((a, b) => a.shortName.localeCompare(b.shortName));

    folders.forEach(folder => {
        const isExpanded = state.expandedFolders.has(folder.path);
        const folderEl   = document.createElement('div');
        folderEl.className       = 'file-tree-item group';
        folderEl.style.paddingLeft = (depth * 12 + 8) + 'px';
        folderEl.dataset.path    = folder.path;
        folderEl.dataset.type    = 'folder';
        folderEl.draggable       = true;

        folderEl.ondragstart = (e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', folder.path); e.target.style.opacity = '0.5'; };
        folderEl.ondragend   = (e) => { e.target.style.opacity = '1'; };
        folderEl.ondragover  = (e) => { e.preventDefault(); e.stopPropagation(); folderEl.classList.add('drag-over'); };
        folderEl.ondragleave = ()  => { folderEl.classList.remove('drag-over'); };
        folderEl.ondrop      = (e) => { handleDrop(e, folder.path, true); folderEl.classList.remove('drag-over'); };

        folderEl.innerHTML = `
            <div class="flex items-center flex-1 overflow-hidden" onclick="window._toggleFolder(event,'${folder.path}')">
                <i data-lucide="${isExpanded ? 'folder-open' : 'folder'}" width="14" height="14" class="mr-2 text-amber-400 shrink-0"></i>
                <span class="truncate">${folder.name}</span>
            </div>
            <div class="tree-actions">
                <button onclick="window._triggerRename(event,'${folder.path}')" class="action-btn"><i data-lucide="pencil" width="12" height="12"></i></button>
                <button onclick="window._deleteNode(event,'${folder.path}',true)" class="action-btn delete"><i data-lucide="trash-2" width="12" height="12"></i></button>
            </div>`;
        container.appendChild(folderEl);
        if (isExpanded) container.appendChild(renderNode(folder, depth + 1));
    });

    files.forEach(file => {
        let icon = 'file', color = 'text-zinc-500';
        if      (file.name.endsWith('.html')) { icon = 'file-code';   color = 'text-orange-500'; }
        else if (file.name.endsWith('.css'))  { icon = 'palette';     color = 'text-blue-400'; }
        else if (file.name.endsWith('.js'))   { icon = 'file-code-2'; color = 'text-yellow-400'; }
        else if (file.isBinary)               { icon = 'image';       color = 'text-pink-400'; }

        const fileEl = document.createElement('div');
        fileEl.className       = `file-tree-item ${file.name === state.activeFileName ? 'active' : ''} group`;
        fileEl.style.paddingLeft = (depth * 12 + 8) + 'px';
        fileEl.dataset.path    = file.name;
        fileEl.dataset.type    = 'file';
        fileEl.draggable       = true;

        fileEl.ondragstart = (e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', file.name); e.target.style.opacity = '0.5'; };
        fileEl.ondragend   = (e) => { e.target.style.opacity = '1'; };
        fileEl.ondragover  = (e) => { e.preventDefault(); e.stopPropagation(); fileEl.classList.add('drag-over'); };
        fileEl.ondragleave = ()  => { fileEl.classList.remove('drag-over'); };
        fileEl.ondrop      = (e) => { handleDrop(e, file.name, false); fileEl.classList.remove('drag-over'); };

        fileEl.innerHTML = `
            <div class="flex items-center flex-1 overflow-hidden" onclick="window._openFile('${file.name}')">
                <i data-lucide="${icon}" width="14" height="14" class="mr-2 ${color} shrink-0"></i>
                <span class="truncate">${file.shortName}</span>
            </div>
            <div class="tree-actions">
                <button onclick="window._triggerRename(event,'${file.name}')" class="action-btn"><i data-lucide="pencil" width="12" height="12"></i></button>
                <button onclick="window._deleteNode(event,'${file.name}',false)" class="action-btn delete"><i data-lucide="trash-2" width="12" height="12"></i></button>
            </div>`;
        container.appendChild(fileEl);
    });

    return container;
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────
function handleDrop(e, targetPath, isFolder) {
    e.preventDefault(); e.stopPropagation();
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath || sourcePath === targetPath) return;
    if (targetPath.startsWith(sourcePath + '/')) return alert("Cannot move a folder into itself.");

    let newDir  = isFolder ? targetPath : targetPath.split('/').slice(0, -1).join('/');
    let srcName = sourcePath.split('/').pop();
    let newPath = newDir ? `${newDir}/${srcName}` : srcName;

    if (sourcePath === newPath) return;
    if (state.currentProject.files.some(f => f.name === newPath)) return alert("Destination already exists!");

    const isSourceFolder = state.currentProject.files.find(f => f.name === sourcePath)?.type === 'folder';

    if (isSourceFolder) {
        state.currentProject.files.forEach(f => {
            if      (f.name === sourcePath)                  f.name = newPath;
            else if (f.name.startsWith(sourcePath + '/'))    f.name = f.name.replace(sourcePath + '/', newPath + '/');
        });
        state.expandedFolders.delete(sourcePath);
        state.expandedFolders.add(newPath);
    } else {
        const file = state.currentProject.files.find(f => f.name === sourcePath);
        if (file) file.name = newPath;
    }

    if      (state.activeFileName === sourcePath)                  state.activeFileName = newPath;
    else if (state.activeFileName.startsWith(sourcePath + '/'))    state.activeFileName = state.activeFileName.replace(sourcePath + '/', newPath + '/');

    if (newDir) state.expandedFolders.add(newDir);
    setDirty(true);
    renderFileList();
}

// Expose root drop zone
export function initRootDropzone() {
    dom.fileList.ondragover  = (e) => { e.preventDefault(); dom.fileList.classList.add('drag-over'); };
    dom.fileList.ondragleave = ()  => { dom.fileList.classList.remove('drag-over'); };
    dom.fileList.ondrop      = (e) => { handleDrop(e, '', true); dom.fileList.classList.remove('drag-over'); };
}

// ── Folder toggle ─────────────────────────────────────────────────────────────
window._toggleFolder = (e, path) => {
    e.stopPropagation();
    if (state.expandedFolders.has(path)) state.expandedFolders.delete(path);
    else                                  state.expandedFolders.add(path);
    renderFileList();
};

// ── Open file ─────────────────────────────────────────────────────────────────
window._openFile = (name) => {
    state.activeFileName = name;
    renderFileList();
    loadEditor();
};

// ── Rename ────────────────────────────────────────────────────────────────────
window._triggerRename = (e, oldName) => {
    e.stopPropagation();
    const newName = prompt("Enter new path/name:", oldName);
    if (!newName || newName === oldName) return;
    if (state.currentProject.files.some(f => f.name === newName)) return alert("Name exists!");

    const isFolder = state.currentProject.files.find(f => f.name === oldName)?.type === 'folder';
    if (isFolder) {
        state.currentProject.files.forEach(f => {
            if      (f.name === oldName)                   f.name = newName;
            else if (f.name.startsWith(oldName + '/'))     f.name = f.name.replace(oldName + '/', newName + '/');
        });
    } else {
        const t = state.currentProject.files.find(f => f.name === oldName);
        if (t) t.name = newName;
    }

    if      (state.activeFileName === oldName)                  state.activeFileName = newName;
    else if (state.activeFileName.startsWith(oldName + '/'))    state.activeFileName = state.activeFileName.replace(oldName + '/', newName + '/');

    setDirty(true);
    renderFileList();
    loadEditor();
};

// ── Delete ────────────────────────────────────────────────────────────────────
window._deleteNode = (e, path, isFolder) => {
    e.stopPropagation();
    if (!confirm(`Delete "${path}"?`)) return;
    if (isFolder) state.currentProject.files = state.currentProject.files.filter(f => f.name !== path && !f.name.startsWith(path + '/'));
    else          state.currentProject.files = state.currentProject.files.filter(f => f.name !== path);

    if (state.activeFileName === path || state.activeFileName.startsWith(path + '/')) {
        state.activeFileName = state.currentProject.files.find(f => f.type === 'file')?.name || '';
    }
    setDirty(true);
    renderFileList();
    loadEditor();
    updateProjectStats();
};

// ── Add new file / folder ─────────────────────────────────────────────────────
export function addNewFile() {
    const path = prompt("Enter file path (e.g., src/utils.js):", "new.js");
    if (path && !state.currentProject.files.some(f => f.name === path)) {
        state.currentProject.files.push({
            name: path, type: 'file', content: '', isBinary: false,
            strategy: path.endsWith('.js') ? 'module' : 'classic'
        });
        const parts = path.split('/');
        if (parts.length > 1) state.expandedFolders.add(parts.slice(0, -1).join('/'));
        setDirty(true);
        state.activeFileName = path;
        renderFileList();
        loadEditor();
        updateProjectStats();
    }
}

export function triggerNewFolder() {
    const path = prompt("Enter folder path:");
    if (path && !state.currentProject.files.some(f => f.name === path)) {
        state.currentProject.files.push({ name: path, type: 'folder' });
        state.expandedFolders.add(path);
        setDirty(true);
        renderFileList();
    }
}
