// js/db.js — IndexedDB persistence layer

const DB_NAME    = "NebulaStudioIDB";
const DB_VERSION = 1;

export const dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'id' });
        }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
});

export async function dbGetAll() {
    const db = await dbPromise;
    return new Promise(res => {
        const req = db.transaction('projects', 'readonly').objectStore('projects').getAll();
        req.onsuccess = () => res(req.result || []);
    });
}

export async function dbGet(id) {
    const db = await dbPromise;
    return new Promise(res => {
        const req = db.transaction('projects', 'readonly').objectStore('projects').get(id);
        req.onsuccess = () => res(req.result);
    });
}

export async function dbPut(project) {
    const db = await dbPromise;
    return new Promise(res => {
        const tx = db.transaction('projects', 'readwrite');
        tx.objectStore('projects').put(project);
        tx.oncomplete = () => res();
    });
}

export async function dbDelete(id) {
    const db = await dbPromise;
    return new Promise(res => {
        const tx = db.transaction('projects', 'readwrite');
        tx.objectStore('projects').delete(id);
        tx.oncomplete = () => res();
    });
}
