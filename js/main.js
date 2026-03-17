// js/main.js — Application entry point

import { initTheme, setTheme }    from './themes.js';
import { initDom, dom, state }    from './state.js';
import { bootSystem, attemptHome, createNewProject, openProject,
         saveCurrentProject, exportProject, renderProjectGrid,
         updateProjectName }       from './projects.js';
import { initMonaco, loadEditor } from './editor.js';
import { renderFileList, addNewFile, triggerNewFolder, initRootDropzone } from './filetree.js';
import { toggleModal, clearConsole, togglePreview, closePreview,
         logToConsole }            from './ui.js';
import { runProject }              from './runner.js';
import { gitPull, gitPush, deployToGHPages } from './git.js';
import { triggerUpload, triggerZipUpload,
         triggerHomeZipImport, initFileInput, initZipInput } from './importer.js';

// ── Bootstrap ─────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    initDom();
    initTheme();
    initMonaco();
    initFileInput();
    initZipInput();
    initRootDropzone();
    bootSystem();

    // ── Strategy selector ─────────────────────────────────────────────────────
    dom.strategy.addEventListener('change', e => {
        const f = state.currentProject.files.find(x => x.name === state.activeFileName);
        if (f) { f.strategy = e.target.value; import('./ui.js').then(m => m.setDirty(true)); }
    });

    // ── Preview panel resize ──────────────────────────────────────────────────
    let isResizing = false;
    dom.resizer.addEventListener('mousedown', () => isResizing = true);
    document.addEventListener('mousemove', e => {
        if (!isResizing) return;
        const p = ((document.body.clientWidth - e.clientX) / document.body.clientWidth) * 100;
        if (p > 10 && p < 90) {
            dom.previewPanel.style.width = p + '%';
            if (state.monacoEditorInstance) state.monacoEditorInstance.layout();
        }
    });
    document.addEventListener('mouseup', () => isResizing = false);

    // ── Global keyboard shortcuts ─────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    });

    // ── Resize editor on window resize ───────────────────────────────────────
    window.addEventListener('resize', () => {
        if (state.monacoEditorInstance) state.monacoEditorInstance.layout();
    });

    // ── Console bridge from iframe ────────────────────────────────────────────
    window.addEventListener('message', e => {
        if (e.data.type === 'log')   logToConsole('info',  e.data.msg);
        if (e.data.type === 'error') logToConsole('error', e.data.msg, e.data.file, e.data.line);
        if (e.data.type === 'warn')  logToConsole('warn',  e.data.msg);
    });

    // ── Unsaved-changes guard ─────────────────────────────────────────────────
    window.addEventListener('beforeunload', e => {
        if (state.hasUnsavedChanges) e.returnValue = 'Unsaved changes!';
    });
});

// ── Expose everything the HTML inline-onclick attributes expect ───────────────
Object.assign(window, {
    setTheme,
    attemptHome,
    createNewProject,
    openProject,
    saveCurrentProject,
    exportProject,
    renderProjectGrid,
    updateProjectName,
    runProject,
    addNewFile,
    triggerNewFolder,
    triggerUpload,
    triggerZipUpload,
    triggerHomeZipImport,
    toggleModal,
    clearConsole,
    togglePreview,
    closePreview,
    gitPull,
    gitPush,
    deployToGHPages,
});
