// js/git.js — GitHub API sync: pull, push, deploy to gh-pages

import { state }                         from './state.js';
import { showLoader, hideLoader, setStatus, toggleModal } from './ui.js';
import { renderFileList }                from './filetree.js';
import { loadEditor }                    from './editor.js';
import { saveCurrentProject }            from './projects.js';
import { dbPut }                         from './db.js';

async function gitApi(endpoint, method = 'GET', body = null) {
    const pat  = document.getElementById('git-pat').value.trim();
    localStorage.setItem('nebula_git_pat', pat);
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (pat) headers['Authorization'] = `token ${pat}`;
    const res = await fetch(
        `https://api.github.com/repos/${document.getElementById('git-repo').value}/${endpoint}`,
        { method, headers, body: body ? JSON.stringify(body) : null }
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function gitPull() {
    try {
        showLoader('Cloning Repository...');
        state.currentProject.gitRepo = document.getElementById('git-repo').value;
        const branch  = document.getElementById('git-branch').value || 'main';
        const treeRes = await gitApi(`git/trees/${branch}?recursive=1`);
        state.currentProject.files = [];
        for (const item of treeRes.tree) {
            if (item.type === 'tree') {
                state.currentProject.files.push({ name: item.path, type: 'folder' });
                state.expandedFolders.add(item.path);
            } else if (item.type === 'blob') {
                const blobRes  = await gitApi(`git/blobs/${item.sha}`);
                const isText   = !item.path.match(/\.(png|jpg|jpeg|gif|ico|mp3|wav|glb)$/i);
                const content  = blobRes.encoding === 'base64'
                    ? (isText
                        ? decodeURIComponent(escape(window.atob(blobRes.content)))
                        : `data:application/octet-stream;base64,${blobRes.content.replace(/\n/g, '')}`)
                    : blobRes.content;
                state.currentProject.files.push({ name: item.path, type: 'file', content, isBinary: !isText, strategy: item.path.endsWith('.js') ? 'module' : 'classic' });
            }
        }
        state.currentProject.dirty = true;
        await saveCurrentProject();
        renderFileList();
        loadEditor();
        toggleModal('git-modal');
        hideLoader();
    } catch (e) { hideLoader(); alert("Pull Failed: " + e.message); }
}

async function pushToBranch(branch, msg) {
    showLoader(`Pushing to ${branch}...`);
    const ref = await gitApi(`git/refs/heads/${branch}`).catch(async () => {
        const mRef = await gitApi('git/refs/heads/main').catch(() => gitApi('git/refs/heads/master'));
        return gitApi('git/refs', 'POST', { ref: `refs/heads/${branch}`, sha: mRef.object.sha });
    });
    const baseTreeSha = (await gitApi(`git/commits/${ref.object.sha}`)).tree.sha;

    const newTree = [];
    for (const f of state.currentProject.files) {
        if (f.type === 'folder') continue;
        const content = f.isBinary ? f.content.split(',')[1] : f.content;
        const blob    = await gitApi('git/blobs', 'POST', { content, encoding: f.isBinary ? 'base64' : 'utf-8' });
        newTree.push({ path: f.name, mode: '100644', type: 'blob', sha: blob.sha });
    }

    const tree      = await gitApi('git/trees',   'POST', { base_tree: baseTreeSha, tree: newTree });
    const newCommit = await gitApi('git/commits',  'POST', { message: msg, tree: tree.sha, parents: [ref.object.sha] });
    await gitApi(`git/refs/heads/${branch}`, 'PATCH', { sha: newCommit.sha });
    hideLoader();
}

export async function gitPush() {
    try {
        await pushToBranch(
            document.getElementById('git-branch').value || 'main',
            document.getElementById('git-msg').value   || 'Update via Nebula'
        );
        toggleModal('git-modal');
        document.getElementById('git-msg').value = '';
        setStatus("Push Successful!", 4000);
    } catch (e) { hideLoader(); alert("Push Failed: " + e.message); }
}

export async function deployToGHPages() {
    try {
        if (!document.getElementById('git-repo').value || !document.getElementById('git-pat').value) {
            toggleModal('deploy-modal');
            toggleModal('git-modal');
            return alert("Please configure GitHub Sync details first.");
        }
        await pushToBranch('gh-pages', '🚀 Deploy from Nebula Studio');
        toggleModal('deploy-modal');
        alert("Deployed to gh-pages branch! If Pages is enabled on GitHub, it will be live shortly.");
    } catch (e) { hideLoader(); alert("Deploy Failed: " + e.message); }
}
