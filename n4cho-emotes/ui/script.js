let currentData = {
    emotes: [],
    dances: [],
    props: [],
    animals: [],
    walks: [],
    expressions: [],
    shared: [],
    favorites: [],
    keybinds: []
};

let isFirstOpen = true;

let categoryStates = {}; // Tracks collapsed state: { "DANCES": true }
let previewEnabled = localStorage.getItem('rpemotes_preview_enabled') === 'true'; // Default to false
let soundsEnabled = localStorage.getItem('rpemotes_sounds_enabled') !== 'false'; // Default to true
let currentAccentColor = localStorage.getItem('rpemotes_accent_color') || '#7c52c5'; // Default Magenta
let previewPedEnabled = true;

const soundClick = new Audio('fx/click.mp3');
const soundHover = new Audio('fx/hover.mp3');
soundClick.volume = 0.3;
soundHover.volume = 0.15;

function playSound(audio) {
    if (!audio || !soundsEnabled) return;
    audio.pause();
    audio.currentTime = 0;
    audio.play().catch(e => {
        // ignore errors (like user hasn't interacted yet)
    });
}

function applyAccentColor(hex) {
    currentAccentColor = hex;
    document.documentElement.style.setProperty('--accent-color', hex);
    localStorage.setItem('rpemotes_accent_color', hex);
}

// Initial apply
applyAccentColor(currentAccentColor);

// Listen for NUI Messages from Lua
window.addEventListener('message', (event) => {
    let data = event.data;

    if (data.action === 'openMenu') {
        populateData(data.payload);
        document.getElementById('app').classList.remove('hidden');
        const searchText = document.getElementById('search-input').value.toLowerCase();
        renderTab(document.querySelector('.tab.active').dataset.tab, searchText);
        setTimeout(updateTabIndicator, 100);
    } else if (data.action === 'closeMenu') {
        document.getElementById('app').classList.add('hidden');
    }
});

// Post method to Lua
function postAction(action, payload = {}) {
    fetch(`https://${GetParentResourceName()}/${action}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(payload)
    }).catch(err => console.log('Error posting to lua', err));
}

// Close on ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        postAction('closeMenu');
        document.getElementById('app').classList.add('hidden');
    }
});

// Setup Tabs
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');

        renderTab(tab.dataset.tab);
        updateTabIndicator();
    });
});

function updateTabIndicator() {
    const activeTab = document.querySelector('.tab.active');
    const indicator = document.querySelector('.tab-indicator');
    if (activeTab && indicator) {
        indicator.style.width = `${activeTab.offsetWidth}px`;
        indicator.style.left = `${activeTab.offsetLeft}px`;
    }
}

// Global Interaction Sounds
let lastHoverTime = 0;
let lastHoverTarget = null;
document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('.tab, .item-btn, .bind-btn, .category-header, #cancel-emote-btn');
    if (target && target !== lastHoverTarget) {
        const now = Date.now();
        if (now - lastHoverTime > 80) { // 80ms global cooldown
            playSound(soundHover);
            lastHoverTime = now;
        }
        lastHoverTarget = target;
    } else if (!target) {
        lastHoverTarget = null;
    }
});

document.addEventListener('mousedown', (e) => {
    const target = e.target.closest('.item-btn, .bind-btn, .category-header, #cancel-emote-btn, .tab');
    if (target) {
        playSound(soundClick);
    }
});

// Search functionality
document.getElementById('search-input').addEventListener('input', (e) => {
    renderTab(document.querySelector('.tab.active').dataset.tab, e.target.value.toLowerCase());
});

document.getElementById('cancel-emote-btn').addEventListener('click', () => {
    const activeTab = document.querySelector('.tab.active').dataset.tab;
    if (activeTab === 'walks') {
        postAction('resetWalk');
    } else if (activeTab === 'settings') {
        postAction('closeMenu');
        document.getElementById('app').classList.add('hidden');
    } else {
        postAction('cancelEmote');
    }
});

// Helper to create grid section
function buildCategorySection(title, items, filterText = '', hideHeader = false) {
    if (!items || items.length === 0) return '';

    let filteredItems = items.filter(item => item.label.toLowerCase().includes(filterText) || item.name.toLowerCase().includes(filterText));
    if (filteredItems.length === 0) return '';

    const isCollapsed = categoryStates[title] || false;
    const chevronClass = isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';
    const gridStyle = isCollapsed ? 'style="display: none;"' : '';

    let html = '';

    if (!hideHeader) {
        html += `
            <div class="category-header" onclick="toggleCategory('${title}', this)">
                <span>${title}</span>
                <i class="fa-solid ${chevronClass}"></i>
            </div>`;
    }

    html += `<div class="item-grid" id="category-${title.replace(/\s+/g, '-')}" ${gridStyle}>`;

    filteredItems.forEach(item => {
        // Icon mapping based on emoteType
        let icon = 'fa-play';
        if (item.type === 'Prop Emotes') icon = 'fa-box';
        else if (item.type === 'Animal Emotes') icon = 'fa-dog';
        else if (item.type === 'Dances') icon = 'fa-music';
        else if (item.type === 'Walks') icon = 'fa-person-walking';
        else if (item.type === 'Expressions') icon = 'fa-face-smile';
        else if (item.type === 'Shared') icon = 'fa-user-group';

        html += `<button class="item-btn" 
                    onclick="playEmote('${item.name}', '${item.type}')" 
                    data-emote="${item.name}" 
                    data-type="${item.type}"
                    title="${item.label}">
                    <i class="fa-solid ${icon}"></i> ${item.label}
                 </button>`;
    });

    html += `</div>`;
    return html;
}


function buildSettingsToggleHTML() {
    const previewChecked = previewEnabled ? 'checked' : '';
    const soundsChecked = soundsEnabled ? 'checked' : '';

    // Premium presets
    const presets = [
        { hex: '#7c52c5', name: 'Amethyst' },
        { hex: '#ff4e00', name: 'Inferno' },
        { hex: '#ff003c', name: 'Crimson' }
        // { hex: '#ff4e00', name: 'Inferno' },
        // { hex: '#ffbe0b', name: 'Gold' },
        // { hex: '#ff003c', name: 'Crimson' },
        // { hex: '#00b4d8', name: 'Ocean' },
        // { hex: '#ff006e', name: 'Rose' },
        // { hex: '#ffffff', name: 'Ghost' }
    ];

    let swatchesHTML = '';
    presets.forEach(p => {
        const activeClass = currentAccentColor.toLowerCase() === p.hex.toLowerCase() ? 'active' : '';
        swatchesHTML += `
            <div class="swatch-item">
                <div class="swatch ${activeClass}" style="background-color: ${p.hex}" onclick="setThemeColor('${p.hex}', this)"></div>
                <span class="swatch-name">${p.name}</span>
            </div>`;
    });

    let previewSectionHTML = '';
    if (previewPedEnabled) {
        previewSectionHTML = `
        <div class="settings-section">
            <div class="settings-label">
                <span class="settings-title">Character Preview</span>
                <span class="settings-desc">Show a 3D preview of the emote when hovering</span>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="preview-toggle" ${previewChecked} onmouseover="playSound(soundHover)" onchange="playSound(soundClick)">
                <span class="slider"></span>
            </label>
        </div>`;
    }

    return `
        ${previewSectionHTML}

        <div class="settings-section">
            <div class="settings-label">
                <span class="settings-title">Menu Sounds</span>
                <span class="settings-desc">Enable or disable UI hover and click sounds</span>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="sounds-toggle" ${soundsChecked} onmouseover="playSound(soundHover)" onchange="playSound(soundClick)">
                <span class="slider"></span>
            </label>
        </div>

        <div class="settings-section">
            <div class="settings-label">
                <span class="settings-title">Change Color</span>
                <span class="settings-desc">Change the highlight and button colors</span>
            </div>
            <button class="color-btn" onclick="toggleColorPicker(this)" onmouseover="playSound(soundHover)">
                Change <i class="fas fa-chevron-down"></i>
            </button>
        </div>
        <div class="color-picker-expansion" id="color-picker-panel">
            <div class="swatch-grid">
                ${swatchesHTML}
            </div>
        </div>

        <div class="settings-section">
            <div class="settings-label">
                <span class="settings-title">Reset Settings</span>
                <span class="settings-desc">Restore all original menu settings and colors</span>
            </div>
            <button class="color-btn" onclick="resetMenuSettings()" onmouseover="playSound(soundHover)">
                Reset
            </button>
        </div>
    `;
}

function resetMenuSettings() {
    playSound(soundClick);

    // Clear localStorage
    localStorage.removeItem('rpemotes_preview_enabled');
    localStorage.removeItem('rpemotes_sounds_enabled');
    localStorage.removeItem('rpemotes_accent_color');

    // Reset global variables
    previewEnabled = false;
    soundsEnabled = true;
    currentAccentColor = currentData.menuColor || '#7c52c5';

    // Apply defaults
    applyAccentColor(currentAccentColor);
    postAction('togglePreview', { enabled: previewEnabled });

    // Refresh settings tab UI
    renderTab('settings');
}

function toggleColorPicker(btn) {
    const panel = document.getElementById('color-picker-panel');
    const isOpen = panel.classList.toggle('open');
    btn.classList.toggle('active');

    if (isOpen) {
        playSound(soundClick);
        // Auto-scroll to the absolute bottom of the active tab
        setTimeout(() => {
            const container = btn.closest('.tab-content');
            if (container) {
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: 'smooth'
                });
            }
        }, 150);
    }
}

function setThemeColor(hex, el) {
    applyAccentColor(hex);
    playSound(soundClick);

    // Update active class
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    if (el) el.classList.add('active');
}

function toggleCategory(title, headerElement) {
    categoryStates[title] = !categoryStates[title];
    const grid = headerElement.nextElementSibling;
    const icon = headerElement.querySelector('i');

    if (categoryStates[title]) {
        grid.style.display = 'none';
        icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
    } else {
        grid.style.display = 'grid';
        icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
    }
}

function playEmote(name, type) {
    postAction('playEmote', { name, type });
}

function clickBind(slot) {
    // If user has a selected emote, this could set it. 
    // Usually handled via chat command or right click in NativeUI. 
    // We will just send action to Lua to trigger the bind or set it.
    postAction('clickBind', { slot });
}

function populateData(payload) {
    if (payload) {
        currentData = payload;

        if (isFirstOpen) {
            document.body.classList.add('no-transition');
        }

        if (payload.previewPedEnabled !== undefined) {
            previewPedEnabled = payload.previewPedEnabled;
        }

        // Handle Shared Emotes visibility
        const sharedTab = document.querySelector('.tab[data-tab="shared"]');
        if (sharedTab) {
            sharedTab.style.display = payload.sharedEmotesEnabled === false ? 'none' : '';
        }

        // Handle menu position mapping
        if (payload.menuPosition === 'right') {
            document.body.classList.add('position-right');
        } else {
            document.body.classList.remove('position-right');
        }

        if (isFirstOpen) {
            // Force reflow and remove no-transition
            void document.body.offsetHeight;
            document.body.classList.remove('no-transition');
            isFirstOpen = false;
        }

        // Apply dynamic menu colors (only if no user preference is saved)
        if (!localStorage.getItem('rpemotes_accent_color') && payload.menuColor) {
            applyAccentColor(payload.menuColor);
        } else {
            // Re-apply the user's saved color to ensure it overrides the default CSS
            document.documentElement.style.setProperty('--accent-color', currentAccentColor);
        }

        // Apply character preview setting from Lua
        if (payload.previewEnabled !== undefined) {
            previewEnabled = payload.previewEnabled;
            // Update toggle switch UI if it exists (might be in a different tab)
            const toggle = document.getElementById('preview-toggle');
            if (toggle) toggle.checked = previewEnabled;
        }
    }
}

function renderTab(tabName, filterText = '') {
    const container = document.getElementById(`tab-${tabName}`);
    const cancelBtn = document.getElementById('cancel-emote-btn');
    container.innerHTML = ''; // clear

    if (tabName === 'walks') {
        cancelBtn.innerText = 'RESET WALK';
    } else if (tabName === 'settings') {
        cancelBtn.innerText = 'CLOSE MENU';
    } else {
        cancelBtn.innerText = 'CANCEL EMOTE';
    }

    if (tabName === 'emotes') {
        container.innerHTML += buildCategorySection('MAIN OPTIONS', currentData.emotes, filterText);
        container.innerHTML += buildCategorySection('DANCES', currentData.dances, filterText);
        container.innerHTML += buildCategorySection('PROP EMOTES', currentData.props, filterText);
        // Animal emotes if any
        if (currentData.animals && currentData.animals.length > 0) {
            container.innerHTML += buildCategorySection('ANIMAL EMOTES', currentData.animals, filterText);
        }
    } else if (tabName === 'walks') {
        container.innerHTML += buildCategorySection('WALKING STYLES', currentData.walks, filterText);
        container.innerHTML += buildCategorySection('EXPRESSIONS', currentData.expressions, filterText);
    } else if (tabName === 'shared') {
        container.innerHTML += buildCategorySection('SHARED EMOTES', currentData.shared, filterText, true);
    } else if (tabName === 'settings') {
        container.innerHTML += buildSettingsToggleHTML();
        container.innerHTML += buildCategorySection('FAVORITES', currentData.favorites, filterText);
    }

    // Fixed footer visibility
    const creditsEl = document.getElementById('menu-credits');
    if (tabName === 'settings') creditsEl.classList.remove('hidden');
    else creditsEl.classList.add('hidden');
}

// Emote Preview Logic
let currentHoveredEmote = null;
let previewStopTimeout = null;

document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('.item-btn');
    const emoteName = target ? target.dataset.emote : null;

    if (emoteName) {
        if (previewStopTimeout) {
            clearTimeout(previewStopTimeout);
            previewStopTimeout = null;
        }

        if (emoteName !== currentHoveredEmote) {
            currentHoveredEmote = emoteName;
            if (previewEnabled) {
                postAction('startPreview', {
                    name: currentHoveredEmote,
                    type: target.dataset.type
                });
            }
        }
    } else {
        if (previewStopTimeout) {
            clearTimeout(previewStopTimeout);
            previewStopTimeout = null;
        }
        // Removed stopPreview call to keep ped always shown while menu is open
    }
});

// Settings Toggle Listener
document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'preview-toggle') {
        previewEnabled = e.target.checked;
        localStorage.setItem('rpemotes_preview_enabled', previewEnabled);
        postAction('togglePreview', { enabled: previewEnabled });
    } else if (e.target && e.target.id === 'sounds-toggle') {
        soundsEnabled = e.target.checked;
        localStorage.setItem('rpemotes_sounds_enabled', soundsEnabled);
    }
});

// Initial sync with Lua on open
window.addEventListener('message', (event) => {
    if (event.data.action === 'openMenu') {
        // We no longer need to sync manually here as Lua is the source of truth
    }
});

