// js/editor.js — Monaco editor initialisation and file loading

import { dom, state } from './state.js';
import { setDirty }    from './ui.js';
import { saveCurrentProject } from './projects.js';

export function initMonaco() {
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.41.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
        state.monacoEditorInstance = monaco.editor.create(dom.editorContainer, {
            value: '',
            language: 'html',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: true, scale: 0.75 },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            roundedSelection: false,
            padding: { top: 16 },
        });

        state.monacoEditorInstance.onDidChangeModelContent(() => {
            if (state.isSettingValue || !state.currentProject) return;
            const file = state.currentProject.files.find(f => f.name === state.activeFileName);
            if (file) {
                file.content = state.monacoEditorInstance.getValue();
                setDirty(true);
            }
        });

        state.monacoEditorInstance.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
            () => saveCurrentProject()
        );
        state.monacoEditorInstance.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
            () => import('./runner.js').then(m => m.runProject())
        );
    });
}

export function loadEditor() {
    if (!state.currentProject || !state.monacoEditorInstance) return;
    const file = state.currentProject.files.find(f => f.name === state.activeFileName);
    if (!file) return;

    dom.filename.innerText = file.name;

    if (file.isBinary) {
        dom.editorContainer.classList.add('hidden');
        dom.assetViewer.style.display = 'flex';
        dom.strategy.style.display = 'none';

        const ext = file.name.split('.').pop().toLowerCase();
        if (['png','jpg','jpeg','gif','svg','webp'].includes(ext)) {
            dom.assetPreview.innerHTML = `<img src="${file.content}" class="asset-preview-image">`;
        } else if (['mp3','wav'].includes(ext)) {
            dom.assetPreview.innerHTML = `<audio controls src="${file.content}"></audio>`;
        } else {
            dom.assetPreview.innerHTML = `<div class="text-6xl mb-4 text-theme">📦</div><div>Binary Asset</div>`;
        }
        document.getElementById('asset-usage-code').innerText = `./${file.name}`;
    } else {
        dom.editorContainer.classList.remove('hidden');
        dom.assetViewer.style.display = 'none';
        dom.strategy.style.display = file.name.endsWith('.js') ? 'block' : 'none';

        // Auto-detect module type from content
        if (file.name.endsWith('.js')) {
            const looksLikeModule = /^\s*(import\s|export\s)/m.test(file.content || '');
            if (!file.strategy || file.strategy === 'classic') {
                file.strategy = looksLikeModule ? 'module' : 'classic';
            }
        }
        dom.strategy.value = file.strategy || 'classic';

        state.isSettingValue = true;
        state.monacoEditorInstance.setValue(file.content || '');
        const ext = file.name.split('.').pop();
        monaco.editor.setModelLanguage(
            state.monacoEditorInstance.getModel(),
            { js:'javascript', html:'html', css:'css', json:'json', md:'markdown' }[ext] || 'plaintext'
        );
        state.isSettingValue = false;
    }
}
