document.addEventListener('DOMContentLoaded', () => {
    fetchApps();
    fetchSettings();
    initFullscreen();
    initSettingsUI();
    initEditView();
    initAddModal();
    setupSwipeDetection();
    setupOrientationSwitch();
    setupDock();
    setupPreview();
});

// ---------- Global State ----------
let appsData = [];
let settings = {};
let currentPage = 0;
let currentOrientation = getOrientation();

// ---------- LocalStorage ----------
function saveSettingsToLocal(settingsObj) {
    try {
        localStorage.setItem('winlauncher_settings', JSON.stringify(settingsObj));
    } catch(e) { console.warn('LocalStorage full or disabled:', e); }
}

function loadSettingsFromLocal() {
    try {
        const cached = localStorage.getItem('winlauncher_settings');
        return cached ? JSON.parse(cached) : null;
    } catch(e) { return null; }
}

// ---------- Fetch Apps & Settings ----------
async function fetchApps() {
    try {
        const res = await fetch('/api/apps');
        appsData = await res.json();
        renderPages(appsData);
        updateDockIcons();
        populateDockSelector();
    } catch (e) { console.error('fetchApps error:', e); }
}

async function fetchSettings() {
    try {
        const res = await fetch('/api/settings');
        const serverSettings = await res.json();
        console.log('📡 Server settings:', serverSettings);
        let cached = loadSettingsFromLocal();
        if (JSON.stringify(serverSettings) !== JSON.stringify(cached)) {
            settings = serverSettings;
            saveSettingsToLocal(settings);
        } else if (cached) {
            settings = cached;
        } else {
            settings = serverSettings;
            saveSettingsToLocal(settings);
        }
        applySettings();
    } catch (e) {
        console.error('fetchSettings error:', e);
        let cached = loadSettingsFromLocal();
        if (cached) {
            settings = cached;
            applySettings();
        }
    }
}

// ---------- Orientation ----------
function getOrientation() {
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

function setupOrientationSwitch() {
    window.addEventListener('resize', () => {
        const newOrientation = getOrientation();
        if (newOrientation !== currentOrientation) {
            currentOrientation = newOrientation;
            renderPages(appsData);
            applySettings();
        }
    });
}

function getOrientationSettings() {
    const ori = currentOrientation;
    return settings[ori] || settings.portrait || {};
}

// ---------- Render Pages ----------
function renderPages(apps) {
    const container = document.getElementById('appContainer');
    container.innerHTML = '';
    const grid = getOrientationSettings();
    const cols = grid.cols || 3;
    const rows = grid.rows || 4;
    const itemsPerPage = cols * rows;
    const specialItems = [
        { id: '__edit__', name: 'Edit', icon: '✏️', isSpecial: true },
        { id: '__settings__', name: 'Settings', icon: '⚙️', isSpecial: true }
    ];
    const allApps = [...apps, ...specialItems];
    const totalPages = Math.ceil(allApps.length / itemsPerPage) || 1;

    const gap = grid.h_gap || 16;
    const vGap = grid.v_gap || 16;
    const padding = grid.padding || 100;
    const alignment = grid.grid_alignment || 'center';

    for (let p = 0; p < totalPages; p++) {
        const page = document.createElement('div');
        page.className = 'page';
        page.dataset.page = p;
        page.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        page.style.gridTemplateRows = `repeat(${rows}, auto)`;
        page.style.gap = `${vGap}px ${gap}px`;
        page.style.padding = `${padding}px`;
        page.style.justifyContent = alignment === 'left' ? 'start' : alignment === 'right' ? 'end' : 'center';
        page.style.alignContent = 'center';
        const pageApps = allApps.slice(p * itemsPerPage, (p + 1) * itemsPerPage);
        pageApps.forEach(item => {
            if (item.isSpecial) {
                const card = createSpecialCard(item);
                page.appendChild(card);
            } else {
                const card = createAppCard(item);
                page.appendChild(card);
            }
        });
        container.appendChild(page);
    }
    updateIndicators(totalPages);
    container.scrollLeft = 0;
    currentPage = 0;
    applyIconStyles();
}

function createAppCard(app) {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.dataset.id = app.id;
    let iconHtml = `<span class="icon">${app.icon || '📦'}</span>`;
    fetch(`/user-icons/${app.id}.png`, { method: 'HEAD' })
        .then(res => {
            if (res.ok) {
                const iconSpan = card.querySelector('.icon');
                if (iconSpan) {
                    iconSpan.outerHTML = `<img class="icon-img" src="/user-icons/${app.id}.png" alt="icon">`;
                }
            }
        }).catch(() => {});
    const label = settings.labels;
    const hideLabel = label && label.hide;
    const labelColor = label ? label.color : '#ffffff';
    const labelShadow = label && label.shadow ? '0 0 5px rgba(0,0,0,0.8)' : 'none';
    card.innerHTML = `${iconHtml}<span class="name" style="color:${labelColor}; text-shadow:${labelShadow}; ${hideLabel?'display:none;':''}">${app.name}</span>`;
    card.addEventListener('click', () => launchApp(app.id));
    return card;
}

function createSpecialCard(item) {
    const card = document.createElement('div');
    card.className = 'app-card special-card';
    card.dataset.id = item.id;
    card.innerHTML = `<span class="icon">${item.icon}</span><span class="name">${item.name}</span>`;
    card.addEventListener('click', () => {
        if (item.id === '__edit__') {
            openEditView();
        } else if (item.id === '__settings__') {
            document.getElementById('settingsModal').style.display = 'flex';
            populateSettingsUI();
        }
    });
    return card;
}

function applyIconStyles() {
    const grid = getOrientationSettings();
    const effects = settings.effects || {};
    const iconSize = grid.icon_size || 64;
    const iconShape = grid.icon_shape || 'rounded';
    const labelFontSize = grid.label_font_size || 12;
    const glowColor = effects.glow_color || '#ffffff';
    const glowBrightness = (effects.glow_brightness || 50) / 100;
    const glowRadius = effects.glow_radius || 20;
    const shadowStrength = (effects.shadow_strength || 0) / 100;
    const shadowBlur = effects.shadow_blur || 0;
    const borderRadius = effects.border_radius || 16;
    const hoverScale = effects.hover_scale || 1.05;
    const tapAnim = effects.tap_animation !== false;

    const rgb = hexToRgb(glowColor);
    document.documentElement.style.setProperty('--glow-color-rgb', rgb);

    document.documentElement.style.setProperty('--icon-size', iconSize + 'px');
    document.documentElement.style.setProperty('--label-font-size', labelFontSize + 'px');
    document.documentElement.style.setProperty('--glow-color', glowColor);
    document.documentElement.style.setProperty('--glow-brightness', glowBrightness);
    document.documentElement.style.setProperty('--glow-radius', glowRadius + 'px');
    document.documentElement.style.setProperty('--shadow-strength', shadowStrength);
    document.documentElement.style.setProperty('--shadow-blur', shadowBlur + 'px');
    document.documentElement.style.setProperty('--border-radius', borderRadius + 'px');
    document.documentElement.style.setProperty('--hover-scale', hoverScale);
    document.documentElement.style.setProperty('--tap-animation', tapAnim ? '0.15s' : '0s');

    const shapeClass = {
        'square': 'shape-square',
        'rounded': 'shape-rounded',
        'circle': 'shape-circle',
        'squircle': 'shape-squircle'
    }[iconShape] || 'shape-rounded';
    document.querySelectorAll('.app-card .icon-img, .app-card .icon').forEach(el => {
        el.className = el.className.split(' ').filter(c => !c.startsWith('shape-')).join(' ');
        el.classList.add(shapeClass);
    });
}

// ---------- Apply All Settings ----------
function applySettings() {
    applyWallpaper();
    applyIconStyles();
    applyDock();
}

// ---------- Wallpaper ----------
function applyWallpaper() {
    const wp = settings.wallpaper || {};
    const type = wp.type || 'color';
    const value = wp.value || '#000000';
    const dim = (wp.dim || 0) / 100;
    const blur = wp.blur || 0;
    const zoom = (wp.zoom || 100) / 100;
    const brightness = (wp.brightness || 100) / 100;
    const opacity = (wp.opacity || 100) / 100;

    const oldVideo = document.getElementById('bgVideo');
    if (oldVideo) oldVideo.remove();

    if (type === 'color') {
        document.body.style.background = value;
        document.body.style.backgroundImage = '';
        document.body.style.backgroundSize = '';
    } else if (type === 'image') {
        if (value) {
            document.body.style.backgroundImage = `url(${value})`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
        }
    } else if (type === 'video') {
        let video = document.createElement('video');
        video.id = 'bgVideo';
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.style.position = 'fixed';
        video.style.top = '0';
        video.style.left = '0';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.zIndex = '-2';
        if (value) {
            video.src = value;
            video.play().catch(() => {});
        }
        document.body.prepend(video);
    }

    let overlay = document.getElementById('wallpaperOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'wallpaperOverlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '-1';
        document.body.prepend(overlay);
    }
    overlay.style.background = `rgba(0,0,0,${dim})`;
    overlay.style.backdropFilter = `blur(${blur}px) brightness(${brightness})`;
    overlay.style.opacity = opacity;

    if (type === 'image' && value) {
        document.body.style.backgroundSize = `${zoom*100}%`;
    }
}

// ---------- Dock ----------
function setupDock() {
    const container = document.getElementById('dockContainer');
    const dock = settings.dock || {};
    if (dock.enabled) {
        container.style.display = 'flex';
        container.style.backdropFilter = `blur(${dock.background_blur || 20}px)`;
        container.style.opacity = (dock.opacity || 80) / 100;
        container.style.setProperty('--dock-icon-size', (dock.icon_size || 48) + 'px');
        if (dock.auto_hide) {
            container.classList.add('dock-auto-hide');
        } else {
            container.classList.remove('dock-auto-hide');
        }
        renderDockIcons(dock.icons || []);
    } else {
        container.style.display = 'none';
    }
}

function renderDockIcons(iconIds) {
    const container = document.getElementById('dockContainer');
    container.innerHTML = '';
    iconIds.forEach(id => {
        const app = appsData.find(a => a.id === id);
        if (!app) return;
        const card = document.createElement('div');
        card.className = 'dock-item';
        let iconHtml = app.icon || '📦';
        fetch(`/user-icons/${app.id}.png`, { method: 'HEAD' })
            .then(res => {
                if (res.ok) {
                    card.innerHTML = `<img src="/user-icons/${app.id}.png" alt="icon">`;
                } else {
                    card.textContent = iconHtml;
                }
            }).catch(() => { card.textContent = iconHtml; });
        card.addEventListener('click', () => launchApp(app.id));
        container.appendChild(card);
    });
}

function updateDockIcons() {
    const dock = settings.dock || {};
    if (dock.enabled) {
        renderDockIcons(dock.icons || []);
    }
}

// ---------- UI Settings ----------
function initSettingsUI() {
    const modal = document.getElementById('settingsModal');
    const closeBtn = document.getElementById('closeSettings');
    const saveBtn = document.getElementById('saveSettingsBtn');

    closeBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(tc => tc.style.display = 'none');
            const tabId = btn.dataset.tab;
            document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1)).style.display = 'block';
        });
    });

    document.querySelectorAll('input[type="range"]').forEach(range => {
        const valSpan = document.getElementById(range.id + 'Val');
        if (valSpan) {
            range.addEventListener('input', () => {
                valSpan.textContent = range.value;
                applySettings();
            });
        }
    });

    document.getElementById('wallpaperType').addEventListener('change', function() {
        const isFile = this.value === 'image' || this.value === 'video';
        document.getElementById('wallpaperColorGroup').style.display = isFile ? 'none' : 'block';
        document.getElementById('wallpaperFileGroup').style.display = isFile ? 'block' : 'none';
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetName = btn.dataset.preset;
            applyPreset(presetName);
        });
    });

    document.getElementById('resetToDefaultBtn').addEventListener('click', () => {
        if (confirm('Reset all settings to default?')) {
            resetToDefault();
        }
    });

    document.getElementById('exportBtn').addEventListener('click', exportBackup);
    document.getElementById('importFile').addEventListener('change', importBackup);
    saveBtn.addEventListener('click', saveSettings);
}

function populateSettingsUI() {
    const gridP = settings.portrait || {};
    const gridL = settings.landscape || {};
    const effects = settings.effects || {};
    const wallpaper = settings.wallpaper || {};
    const dock = settings.dock || {};
    const labels = settings.labels || {};

    setVal('portraitCols', gridP.cols);
    setVal('portraitRows', gridP.rows);
    setVal('portraitIconSize', gridP.icon_size);
    setVal('portraitIconSizeVal', gridP.icon_size);
    setSelect('portraitIconShape', gridP.icon_shape || 'rounded');
    setVal('portraitLabelFontSize', gridP.label_font_size);
    setVal('portraitHGap', gridP.h_gap);
    setVal('portraitVGap', gridP.v_gap);
    setVal('portraitPadding', gridP.padding || 100);
    setSelect('portraitGridAlignment', gridP.grid_alignment || 'center');

    setVal('landscapeCols', gridL.cols);
    setVal('landscapeRows', gridL.rows);
    setVal('landscapeIconSize', gridL.icon_size);
    setVal('landscapeIconSizeVal', gridL.icon_size);
    setSelect('landscapeIconShape', gridL.icon_shape || 'rounded');
    setVal('landscapeLabelFontSize', gridL.label_font_size);
    setVal('landscapeHGap', gridL.h_gap);
    setVal('landscapeVGap', gridL.v_gap);
    setVal('landscapePadding', gridL.padding || 100);
    setSelect('landscapeGridAlignment', gridL.grid_alignment || 'center');

    setVal('glowColor', effects.glow_color);
    setVal('glowBrightness', effects.glow_brightness);
    setVal('glowBrightnessVal', effects.glow_brightness);
    setVal('glowRadius', effects.glow_radius);
    setVal('glowRadiusVal', effects.glow_radius);
    setVal('shadowStrength', effects.shadow_strength);
    setVal('shadowStrengthVal', effects.shadow_strength);
    setVal('shadowBlur', effects.shadow_blur);
    setVal('shadowBlurVal', effects.shadow_blur);
    setVal('borderRadius', effects.border_radius);
    setVal('borderRadiusVal', effects.border_radius);
    setVal('hoverScale', effects.hover_scale);
    document.getElementById('tapAnimation').checked = effects.tap_animation !== false;

    setSelect('wallpaperType', wallpaper.type || 'color');
    document.getElementById('wallpaperColor').value = wallpaper.value || '#000000';
    if (wallpaper.type === 'image' || wallpaper.type === 'video') {
        document.getElementById('wallpaperFileGroup').style.display = 'block';
        document.getElementById('wallpaperColorGroup').style.display = 'none';
    } else {
        document.getElementById('wallpaperFileGroup').style.display = 'none';
        document.getElementById('wallpaperColorGroup').style.display = 'block';
    }
    setVal('wallpaperDim', wallpaper.dim);
    setVal('wallpaperDimVal', wallpaper.dim);
    setVal('wallpaperBlur', wallpaper.blur);
    setVal('wallpaperBlurVal', wallpaper.blur);
    setVal('wallpaperZoom', wallpaper.zoom);
    setVal('wallpaperZoomVal', wallpaper.zoom);
    setVal('wallpaperBrightness', wallpaper.brightness);
    setVal('wallpaperBrightnessVal', wallpaper.brightness);
    setVal('wallpaperOpacity', wallpaper.opacity);
    setVal('wallpaperOpacityVal', wallpaper.opacity);

    document.getElementById('dockEnabled').checked = dock.enabled || false;
    setVal('dockBlur', dock.background_blur);
    setVal('dockBlurVal', dock.background_blur);
    setVal('dockOpacity', dock.opacity);
    setVal('dockOpacityVal', dock.opacity);
    setVal('dockIconSize', dock.icon_size);
    setVal('dockIconSizeVal', dock.icon_size);
    document.getElementById('dockAutoHide').checked = dock.auto_hide || false;
    populateDockSelector();

    document.getElementById('labelsHide').checked = labels.hide || false;
    document.getElementById('labelsShow').checked = labels.show !== false;
    document.getElementById('labelColor').value = labels.color || '#ffffff';
    document.getElementById('labelShadow').checked = labels.shadow || false;

    document.getElementById('currentPresetLabel').textContent = settings.presets?.current || 'default';
}

function populateDockSelector() {
    const selector = document.getElementById('dockIconSelector');
    if (!selector) return;
    selector.innerHTML = '';
    const dock = settings.dock || {};
    const selectedIds = dock.icons || [];
    appsData.forEach(app => {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = app.id;
        cb.checked = selectedIds.includes(app.id);
        label.appendChild(cb);
        label.appendChild(document.createTextNode(app.name || app.id));
        selector.appendChild(label);
    });
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined ? val : '';
}

function setSelect(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
}

// ---------- Save Settings ----------
async function saveSettings() {
    const gridP = getGridFromUI('portrait');
    const gridL = getGridFromUI('landscape');
    const effects = {
        glow_color: document.getElementById('glowColor').value,
        glow_brightness: parseInt(document.getElementById('glowBrightness').value) || 50,
        glow_radius: parseInt(document.getElementById('glowRadius').value) || 20,
        shadow_strength: parseInt(document.getElementById('shadowStrength').value) || 0,
        shadow_blur: parseInt(document.getElementById('shadowBlur').value) || 0,
        border_radius: parseInt(document.getElementById('borderRadius').value) || 16,
        hover_scale: parseFloat(document.getElementById('hoverScale').value) || 1.05,
        tap_animation: document.getElementById('tapAnimation').checked
    };
    const wallpaper = {
        type: document.getElementById('wallpaperType').value,
        value: document.getElementById('wallpaperColor').value,
        dim: parseInt(document.getElementById('wallpaperDim').value) || 0,
        blur: parseFloat(document.getElementById('wallpaperBlur').value) || 0,
        zoom: parseInt(document.getElementById('wallpaperZoom').value) || 100,
        brightness: parseInt(document.getElementById('wallpaperBrightness').value) || 100,
        opacity: parseInt(document.getElementById('wallpaperOpacity').value) || 100
    };
    // Handle file upload for wallpaper
    const fileInput = document.getElementById('wallpaperFile');
    if (fileInput.files.length > 0 && (wallpaper.type === 'image' || wallpaper.type === 'video')) {
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('wallpaper', file);
        try {
            const res = await fetch('/api/upload_wallpaper', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.path) {
                wallpaper.value = data.path;
            } else {
                alert('Failed to upload wallpaper');
                return;
            }
        } catch (e) {
            alert('Upload error');
            return;
        }
    }

    const dock = {
        enabled: document.getElementById('dockEnabled').checked,
        icons: Array.from(document.querySelectorAll('#dockIconSelector input:checked')).map(cb => cb.value),
        background_blur: parseInt(document.getElementById('dockBlur').value) || 20,
        opacity: parseInt(document.getElementById('dockOpacity').value) || 80,
        icon_size: parseInt(document.getElementById('dockIconSize').value) || 48,
        auto_hide: document.getElementById('dockAutoHide').checked
    };
    const labels = {
        hide: document.getElementById('labelsHide').checked,
        show: document.getElementById('labelsShow').checked,
        color: document.getElementById('labelColor').value,
        shadow: document.getElementById('labelShadow').checked
    };
    const presets = settings.presets || { current: 'default', list: {} };

    const newSettings = {
        version: '2.0',
        portrait: gridP,
        landscape: gridL,
        effects,
        wallpaper,
        dock,
        labels,
        presets
    };

    settings = newSettings;
    saveSettingsToLocal(settings);
    applySettings();
    renderPages(appsData);

    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings)
        });
        const data = await res.json();
        console.log('📤 Save response:', data);
        document.getElementById('settingsMsg').textContent = data.message || 'Saved!';
        setTimeout(() => document.getElementById('settingsMsg').textContent = '', 2000);
        // Re-fetch to confirm server saved
        await fetchSettings();
    } catch (e) {
        console.error('Save error:', e);
        document.getElementById('settingsMsg').textContent = '⚠️ Offline - Settings cached locally';
    }
}

function getGridFromUI(prefix) {
    return {
        cols: parseInt(document.getElementById(prefix + 'Cols').value) || 3,
        rows: parseInt(document.getElementById(prefix + 'Rows').value) || 4,
        icon_size: parseInt(document.getElementById(prefix + 'IconSize').value) || 64,
        icon_shape: document.getElementById(prefix + 'IconShape').value,
        label_font_size: parseInt(document.getElementById(prefix + 'LabelFontSize').value) || 12,
        h_gap: parseInt(document.getElementById(prefix + 'HGap').value) || 16,
        v_gap: parseInt(document.getElementById(prefix + 'VGap').value) || 16,
        padding: parseInt(document.getElementById(prefix + 'Padding').value) || 100,
        grid_alignment: document.getElementById(prefix + 'GridAlignment').value || 'center'
    };
}

// ---------- Presets (updated) ----------
function applyPreset(name) {
    const presets = {
        'Apple Clean': {
            portrait: { cols:3, rows:4, icon_size:64, icon_shape:'squircle', label_font_size:14, h_gap:20, v_gap:20, padding:100, grid_alignment:'center' },
            landscape: { cols:4, rows:3, icon_size:60, icon_shape:'squircle', label_font_size:14, h_gap:20, v_gap:20, padding:100, grid_alignment:'center' },
            effects: { glow_color:'#ffffff', glow_brightness:40, glow_radius:20, shadow_strength:10, shadow_blur:10, border_radius:20, hover_scale:1.05, tap_animation:true },
            wallpaper: { type:'color', value:'#1a1a1a', dim:0, blur:0, zoom:100, brightness:100, opacity:100 },
            dock: { enabled:true, icons:['whatsapp','youtube','gmail','chatgpt','deepseek'], background_blur:30, opacity:85, icon_size:50, auto_hide:false },
            labels: { hide:false, show:true, color:'#ffffff', shadow:true }
        },
        'Samsung OneUI': {
            portrait: { cols:4, rows:5, icon_size:60, icon_shape:'rounded', label_font_size:11, h_gap:10, v_gap:10, padding:100, grid_alignment:'center' },
            landscape: { cols:5, rows:4, icon_size:55, icon_shape:'rounded', label_font_size:11, h_gap:10, v_gap:10, padding:100, grid_alignment:'center' },
            effects: { glow_color:'#00aaff', glow_brightness:30, glow_radius:15, shadow_strength:20, shadow_blur:15, border_radius:12, hover_scale:1.05, tap_animation:true },
            wallpaper: { type:'color', value:'#0a0a0a', dim:0, blur:0, zoom:100, brightness:100, opacity:100 },
            dock: { enabled:true, icons:['whatsapp','youtube','gmail','chatgpt','deepseek'], background_blur:20, opacity:90, icon_size:45, auto_hide:false },
            labels: { hide:false, show:true, color:'#cccccc', shadow:false }
        },
        'Windows 11': {
            portrait: { cols:3, rows:3, icon_size:80, icon_shape:'square', label_font_size:12, h_gap:20, v_gap:20, padding:100, grid_alignment:'center' },
            landscape: { cols:4, rows:2, icon_size:70, icon_shape:'square', label_font_size:12, h_gap:20, v_gap:20, padding:100, grid_alignment:'center' },
            effects: { glow_color:'#0078d4', glow_brightness:20, glow_radius:10, shadow_strength:30, shadow_blur:20, border_radius:0, hover_scale:1.02, tap_animation:true },
            wallpaper: { type:'color', value:'#1a1a2e', dim:0, blur:0, zoom:100, brightness:100, opacity:100 },
            dock: { enabled:true, icons:['explorer','notepad','calc','cmd','control'], background_blur:10, opacity:95, icon_size:45, auto_hide:false },
            labels: { hide:false, show:true, color:'#ffffff', shadow:false }
        },
        'AMOLED Black': {
            portrait: { cols:4, rows:5, icon_size:56, icon_shape:'circle', label_font_size:11, h_gap:8, v_gap:8, padding:100, grid_alignment:'center' },
            landscape: { cols:5, rows:4, icon_size:52, icon_shape:'circle', label_font_size:11, h_gap:8, v_gap:8, padding:100, grid_alignment:'center' },
            effects: { glow_color:'#00ffcc', glow_brightness:60, glow_radius:25, shadow_strength:0, shadow_blur:0, border_radius:50, hover_scale:1.1, tap_animation:true },
            wallpaper: { type:'color', value:'#000000', dim:0, blur:0, zoom:100, brightness:100, opacity:100 },
            dock: { enabled:false, icons:[], background_blur:20, opacity:80, icon_size:48, auto_hide:false },
            labels: { hide:false, show:true, color:'#00ffcc', shadow:true }
        },
        'RGB Gaming': {
            portrait: { cols:3, rows:4, icon_size:72, icon_shape:'rounded', label_font_size:14, h_gap:16, v_gap:16, padding:100, grid_alignment:'center' },
            landscape: { cols:4, rows:3, icon_size:68, icon_shape:'rounded', label_font_size:14, h_gap:16, v_gap:16, padding:100, grid_alignment:'center' },
            effects: { glow_color:'#ff00ff', glow_brightness:80, glow_radius:30, shadow_strength:20, shadow_blur:20, border_radius:16, hover_scale:1.15, tap_animation:true },
            wallpaper: { type:'color', value:'#0a0a0a', dim:0, blur:0, zoom:100, brightness:100, opacity:100 },
            dock: { enabled:true, icons:['whatsapp','youtube','chatgpt','deepseek','gmail'], background_blur:5, opacity:70, icon_size:55, auto_hide:true },
            labels: { hide:false, show:true, color:'#ff00ff', shadow:true }
        },
        'Minimal': {
            portrait: { cols:3, rows:3, icon_size:48, icon_shape:'square', label_font_size:10, h_gap:20, v_gap:20, padding:100, grid_alignment:'center' },
            landscape: { cols:4, rows:2, icon_size:44, icon_shape:'square', label_font_size:10, h_gap:20, v_gap:20, padding:100, grid_alignment:'center' },
            effects: { glow_color:'#ffffff', glow_brightness:10, glow_radius:5, shadow_strength:0, shadow_blur:0, border_radius:0, hover_scale:1.02, tap_animation:false },
            wallpaper: { type:'color', value:'#1a1a1a', dim:0, blur:0, zoom:100, brightness:100, opacity:100 },
            dock: { enabled:false, icons:[], background_blur:20, opacity:80, icon_size:48, auto_hide:false },
            labels: { hide:true, show:false, color:'#ffffff', shadow:false }
        },
        'Large Icons': {
            portrait: { cols:2, rows:3, icon_size:120, icon_shape:'rounded', label_font_size:16, h_gap:30, v_gap:30, padding:100, grid_alignment:'center' },
            landscape: { cols:3, rows:2, icon_size:110, icon_shape:'rounded', label_font_size:16, h_gap:30, v_gap:30, padding:100, grid_alignment:'center' },
            effects: { glow_color:'#ffffff', glow_brightness:60, glow_radius:30, shadow_strength:30, shadow_blur:20, border_radius:24, hover_scale:1.05, tap_animation:true },
            wallpaper: { type:'color', value:'#0a0a0a', dim:0, blur:0, zoom:100, brightness:100, opacity:100 },
            dock: { enabled:false, icons:[], background_blur:20, opacity:80, icon_size:48, auto_hide:false },
            labels: { hide:false, show:true, color:'#ffffff', shadow:true }
        },
        'Compact Grid': {
            portrait: { cols:5, rows:6, icon_size:44, icon_shape:'square', label_font_size:9, h_gap:4, v_gap:4, padding:100, grid_alignment:'center' },
            landscape: { cols:6, rows:5, icon_size:40, icon_shape:'square', label_font_size:9, h_gap:4, v_gap:4, padding:100, grid_alignment:'center' },
            effects: { glow_color:'#ffffff', glow_brightness:0, glow_radius:0, shadow_strength:0, shadow_blur:0, border_radius:0, hover_scale:1.0, tap_animation:false },
            wallpaper: { type:'color', value:'#000000', dim:0, blur:0, zoom:100, brightness:100, opacity:100 },
            dock: { enabled:false, icons:[], background_blur:20, opacity:80, icon_size:48, auto_hide:false },
            labels: { hide:false, show:true, color:'#888888', shadow:false }
        }
    };

    const presetData = presets[name];
    if (!presetData) return;

    const newSettings = {
        version: '2.0',
        portrait: presetData.portrait,
        landscape: presetData.landscape,
        effects: presetData.effects,
        wallpaper: presetData.wallpaper,
        dock: presetData.dock,
        labels: presetData.labels,
        presets: settings.presets || { current: name, list: {} }
    };
    settings = newSettings;
    saveSettingsToLocal(settings);
    applySettings();
    renderPages(appsData);
    document.getElementById('currentPresetLabel').textContent = name;
    fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
    }).then(() => fetchSettings()).catch(console.error);
}

function resetToDefault() {
    const defaultSettings = {
        version: '2.0',
        portrait: { cols:3, rows:4, icon_size:64, icon_shape:'rounded', label_font_size:12, h_gap:16, v_gap:16, padding:100, grid_alignment:'center' },
        landscape: { cols:4, rows:3, icon_size:64, icon_shape:'rounded', label_font_size:12, h_gap:16, v_gap:16, padding:100, grid_alignment:'center' },
        effects: { glow_color:'#ffffff', glow_brightness:50, glow_radius:20, shadow_strength:0, shadow_blur:0, border_radius:16, hover_scale:1.05, tap_animation:true },
        wallpaper: { type:'color', value:'#000000', dim:0, blur:0, zoom:100, brightness:100, opacity:100 },
        dock: { enabled:false, icons:[], background_blur:20, opacity:80, icon_size:48, auto_hide:false },
        labels: { hide:false, show:true, color:'#ffffff', shadow:false },
        presets: { current:'default', list:{} }
    };
    settings = defaultSettings;
    saveSettingsToLocal(settings);
    applySettings();
    renderPages(appsData);
    document.getElementById('currentPresetLabel').textContent = 'default';
    fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaultSettings)
    }).then(() => fetchSettings()).catch(console.error);
}

// ---------- Export/Import ----------
async function exportBackup() {
    try {
        const res = await fetch('/api/export');
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'WinLauncherBackup.wlbackup';
        link.click();
        URL.revokeObjectURL(link.href);
    } catch (e) {
        document.getElementById('backupMsg').textContent = '❌ Export failed';
    }
}

async function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('backup', file);
    try {
        const res = await fetch('/api/import', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.status === 'ok') {
            alert('Import successful! Reloading...');
            location.reload();
        } else {
            document.getElementById('backupMsg').textContent = '❌ ' + (data.msg || 'Import failed');
        }
    } catch (e) {
        document.getElementById('backupMsg').textContent = '❌ Network error';
    }
}

// ---------- Preview ----------
function setupPreview() {
    document.querySelectorAll('#tabEffects input, #tabEffects select').forEach(el => {
        el.addEventListener('input', () => {
            const card = document.getElementById('previewApp');
            const icon = card.querySelector('.icon');
            const effects = {
                glow_color: document.getElementById('glowColor').value,
                glow_brightness: parseInt(document.getElementById('glowBrightness').value) / 100,
                glow_radius: parseInt(document.getElementById('glowRadius').value),
                shadow_strength: parseInt(document.getElementById('shadowStrength').value) / 100,
                shadow_blur: parseInt(document.getElementById('shadowBlur').value),
                border_radius: parseInt(document.getElementById('borderRadius').value),
                hover_scale: parseFloat(document.getElementById('hoverScale').value),
                tap_animation: document.getElementById('tapAnimation').checked
            };
            const rgb = hexToRgb(effects.glow_color);
            icon.style.filter = `drop-shadow(0 0 ${effects.glow_radius}px rgba(${rgb}, ${effects.glow_brightness}))`;
            icon.style.borderRadius = effects.border_radius + 'px';
            card.style.transform = `scale(${effects.hover_scale})`;
            if (effects.shadow_strength > 0) {
                card.style.boxShadow = `0 ${effects.shadow_strength*20}px ${effects.shadow_blur}px rgba(0,0,0,${effects.shadow_strength})`;
            } else {
                card.style.boxShadow = 'none';
            }
        });
    });
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1],16)},${parseInt(result[2],16)},${parseInt(result[3],16)}` : '255,255,255';
}

// ---------- Swipe, Edit, Launch, Fullscreen ----------
function setupSwipeDetection() {
    const container = document.getElementById('appContainer');
    let startX = 0, startY = 0, isSwiping = false;
    container.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        isSwiping = true;
    }, { passive: true });
    container.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        const touch = e.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
            e.preventDefault();
        }
    }, { passive: false });
    container.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        isSwiping = false;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - startX;
        const threshold = 50;
        if (Math.abs(dx) > threshold) {
            const pages = container.querySelectorAll('.page');
            const total = pages.length;
            let newPage = currentPage;
            if (dx < 0 && currentPage < total - 1) newPage++;
            else if (dx > 0 && currentPage > 0) newPage--;
            if (newPage !== currentPage) {
                currentPage = newPage;
                container.scrollTo({ left: currentPage * container.clientWidth, behavior: 'smooth' });
                updateActiveDot();
            }
        }
    }, { passive: true });
    container.addEventListener('scroll', () => {
        const pageWidth = container.clientWidth;
        const newPage = Math.round(container.scrollLeft / pageWidth);
        if (newPage !== currentPage) {
            currentPage = newPage;
            updateActiveDot();
        }
    });
}

function updateActiveDot() {
    const dots = document.querySelectorAll('.dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentPage);
    });
}

function updateIndicators(total) {
    const container = document.getElementById('pageIndicators');
    container.innerHTML = '';
    for (let i = 0; i < total; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot' + (i === 0 ? ' active' : '');
        container.appendChild(dot);
    }
}

async function launchApp(id) {
    if (id === '__edit__' || id === '__settings__') return;
    try {
        await fetch(`/api/launch/${id}`);
    } catch (e) {}
}

function initFullscreen() {
    document.getElementById('fullscreenBtn').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(console.log);
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
        }
    });
}

// ---------- Edit View ----------
function initEditView() {
    const closeEdit = document.getElementById('closeEdit');
    const addMoreBtn = document.getElementById('addMoreBtn');
    closeEdit.addEventListener('click', closeEditView);
    addMoreBtn.addEventListener('click', () => openModal(null));
}

function openEditView() {
    document.getElementById('editView').style.display = 'flex';
    renderEditList(appsData);
}

function closeEditView() {
    document.getElementById('editView').style.display = 'none';
}

function renderEditList(apps) {
    const list = document.getElementById('editList');
    list.innerHTML = '';
    apps.forEach((app, index) => {
        const item = document.createElement('div');
        item.className = 'edit-item';
        item.draggable = true;
        item.dataset.id = app.id;
        item.dataset.index = index;

        const handle = document.createElement('span');
        handle.className = 'drag-handle';
        handle.textContent = '☰';
        item.appendChild(handle);

        const iconDiv = document.createElement('div');
        iconDiv.className = 'item-icon';
        fetch(`/user-icons/${app.id}.png`, { method: 'HEAD' })
            .then(res => {
                if (res.ok) {
                    iconDiv.innerHTML = `<img src="/user-icons/${app.id}.png" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
                } else {
                    iconDiv.textContent = app.icon || '📦';
                }
            }).catch(() => { iconDiv.textContent = app.icon || '📦'; });
        item.appendChild(iconDiv);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'item-name';
        nameSpan.textContent = app.name || '(no name)';
        item.appendChild(nameSpan);

        const actions = document.createElement('div');
        actions.className = 'item-actions';
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = '✏️';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openModal(app.id);
        });
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteApp(app.id);
        });
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        item.appendChild(actions);

        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', app.id);
            item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingItem = document.querySelector('.edit-item.dragging');
            if (!draggingItem) return;
            const rect = item.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                list.insertBefore(draggingItem, item);
            } else {
                list.insertBefore(draggingItem, item.nextSibling);
            }
        });
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            const items = list.querySelectorAll('.edit-item');
            const newOrder = Array.from(items).map(el => el.dataset.id);
            const newApps = newOrder.map(id => appsData.find(a => a.id === id));
            appsData = newApps;
            saveOrder(appsData);
            renderEditList(appsData);
        });

        list.appendChild(item);
    });
}

async function saveOrder(apps) {
    const order = apps.map(a => a.id);
    await fetch('/api/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
    });
    renderPages(appsData);
}

async function deleteApp(id) {
    if (!confirm('Remove this shortcut?')) return;
    await fetch(`/api/apps/${id}`, { method: 'DELETE' });
    await fetchApps();
    if (document.getElementById('editView').style.display === 'flex') {
        renderEditList(appsData);
    }
}

// ---------- Add/Edit Modal ----------
function initAddModal() {
    const closeModal = document.getElementById('closeModal');
    const saveAppBtn = document.getElementById('saveAppBtn');
    closeModal.addEventListener('click', closeModalFn);
    saveAppBtn.addEventListener('click', saveApp);
    window.addEventListener('click', (e) => {
        if (e.target === document.getElementById('addModal')) closeModalFn();
    });
    document.getElementById('iconFile').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(ev) {
                const preview = document.getElementById('iconPreview');
                preview.style.display = 'block';
                preview.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:16px;">`;
                const currentDisplay = document.getElementById('currentIconDisplay');
                currentDisplay.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:16px;">`;
                currentDisplay.classList.add('glow');
            };
            reader.readAsDataURL(file);
        }
    });
}

function openModal(appId) {
    const modal = document.getElementById('addModal');
    modal.style.display = 'flex';
    document.getElementById('modalMsg').innerText = '';
    document.getElementById('editId').value = '';
    document.getElementById('appName').value = '';
    document.getElementById('appPath').value = '';
    document.getElementById('iconFile').value = '';
    document.getElementById('iconPreview').style.display = 'none';
    document.getElementById('modalTitle').innerText = 'Add New Shortcut';

    const currentDisplay = document.getElementById('currentIconDisplay');
    currentDisplay.innerHTML = '📦';
    currentDisplay.classList.add('glow');

    if (appId) {
        const app = appsData.find(a => a.id === appId);
        if (app) {
            document.getElementById('modalTitle').innerText = 'Edit Shortcut';
            document.getElementById('editId').value = app.id;
            document.getElementById('appName').value = app.name || '';
            document.getElementById('appPath').value = app.path;
            fetch(`/user-icons/${app.id}.png`, { method: 'HEAD' })
                .then(res => {
                    if (res.ok) {
                        currentDisplay.innerHTML = `<img src="/user-icons/${app.id}.png" alt="icon">`;
                        currentDisplay.classList.add('glow');
                    } else {
                        currentDisplay.textContent = app.icon || '📦';
                    }
                }).catch(() => {
                    currentDisplay.textContent = app.icon || '📦';
                });
        }
    }
}

function closeModalFn() {
    document.getElementById('addModal').style.display = 'none';
}

async function saveApp() {
    const editId = document.getElementById('editId').value;
    const name = document.getElementById('appName').value.trim();
    const path = document.getElementById('appPath').value.trim();
    const fileInput = document.getElementById('iconFile');
    const file = fileInput.files[0];

    if (!path) {
        document.getElementById('modalMsg').innerText = '⚠️ Path is required!';
        return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('path', path);
    if (editId) {
        formData.append('edit_id', editId);
        if (!file) {
            const existing = appsData.find(a => a.id === editId);
            formData.append('icon', existing ? existing.icon : '📦');
        }
    } else {
        formData.append('icon', '📦');
    }
    if (file) {
        formData.append('icon_file', file);
    }

    try {
        const res = await fetch('/api/apps', {
            method: 'POST',
            body: formData
        });
        if (res.ok) {
            closeModalFn();
            await fetchApps();
            if (document.getElementById('editView').style.display === 'flex') {
                renderEditList(appsData);
            }
        } else {
            const err = await res.json();
            document.getElementById('modalMsg').innerText = '❌ ' + (err.msg || 'Server error!');
        }
    } catch (e) {
        document.getElementById('modalMsg').innerText = '❌ Connection error!';
    }
}
