// js/themes.js — Theme management

export const themes = {
    indigo:  { main: '#6366f1', hover: '#4f46e5', text: '#818cf8', shadow: 'rgba(99,102,241,0.3)' },
    emerald: { main: '#10b981', hover: '#059669', text: '#34d399', shadow: 'rgba(16,185,129,0.3)' },
    rose:    { main: '#f43f5e', hover: '#e11d48', text: '#fb7185', shadow: 'rgba(244,63,94,0.3)' },
    sky:     { main: '#0ea5e9', hover: '#0284c7', text: '#38bdf8', shadow: 'rgba(14,165,233,0.3)' }
};

export function setTheme(name) {
    const t = themes[name] || themes.indigo;
    const r = document.documentElement;
    r.style.setProperty('--theme-main',   t.main);
    r.style.setProperty('--theme-hover',  t.hover);
    r.style.setProperty('--theme-text',   t.text);
    r.style.setProperty('--theme-shadow', t.shadow);
    localStorage.setItem('nebula_theme', name);
}

export function initTheme() {
    setTheme(localStorage.getItem('nebula_theme') || 'indigo');
}
