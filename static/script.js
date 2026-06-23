document.addEventListener('DOMContentLoaded', () => {
    fetchAppsAndPages();
    fetchSettings();
    initFullscreen();
    initGridSettings();
    initEditView();
    initAddModal();
    setupSwipeDetection();
    setupOrientationChange();
});

// ---------- Global State ----------
let appsData = [];
let pagesData = [];
let settings = {};
let currentPage = 0;
let currentEditPageId = null;

// ---------- LocalStorage ----------
function saveSettingsToLocal(settingsObj) {
    try {
        localStorage.setItem('winlauncher_settings', JSON.stringify(settingsObj));
    } catch(e) {
        console.warn('LocalStorage full or disabled:', e);
    }
}

function loadSettingsFromLocal() {
    try {
        const cached = localStorage.getItem('winlauncher_settings');
        return cached ? JSON.parse(cached) : null;
    } catch(e) {
        console.warn('Error reading LocalStorage:', e);
        return null;
    }
}

// ---------- Fetch Apps & Pages ----------
async function fetchAppsAndPages() {
    try {
        const [appsRes, pagesRes] = await Promise.all([
            fetch('/api/apps'),
            fetch('/api/pages')
        ]);
        appsData = await appsRes.json();
        pagesData = await pagesRes.json();
        renderPages();
    } catch (e) {
        console.error(e);
    }
}

async function fetchSettings() {
    try {
        let cachedSettings = loadSettingsFromLocal();
        if (cachedSettings) {
            settings = cachedSettings;
            applySettings();
        }
        const res = await fetch('/api/settings');
        const serverSettings = await res.json();
        if (JSON.stringify(serverSettings) !== JSON.stringify(cachedSettings)) {
            settings = serverSettings;
            saveSettingsToLocal(settings);
            applySettings();
        }
    } catch (e) {
        console.error('Error fetching settings:', e);
        let cached = loadSettingsFromLocal();
        if (cached) {
            settings = cached;
            applySettings();
        }
    }
}

// ---------- Render Pages ----------
function renderPages() {
    const container = document.getElementById('appContainer');
    container.innerHTML = '';
    const cols = getCols();
    const rows = getRows();
    pagesData.forEach((page, idx) => {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';
        pageDiv.dataset.pageIndex = idx;
        
        // Page name pill
        const namePill = document.createElement('div');
        namePill.className = 'page-name-pill';
        namePill.textContent = page.name || 'Page';
        pageDiv.appendChild(namePill);
        
        // Grid container
        const gridDiv = document.createElement('div');
        gridDiv.className = 'page-grid';
        gridDiv.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        gridDiv.style.gridTemplateRows = `repeat(${rows}, auto)`;
        gridDiv.style.gap = '16px';
        gridDiv.style.width = '100%';
        gridDiv.style.height = '100%';
        gridDiv.style.justifyItems = 'center';
        gridDiv.style.alignContent = 'center';
        
        const appIds = page.appIds || [];
        appIds.forEach(appId => {
            const app = appsData.find(a => a.id === appId);
            if (app) {
                const card = createAppCard(app);
                gridDiv.appendChild(card);
            }
        });
        pageDiv.appendChild(gridDiv);
        container.appendChild(pageDiv);
    });
    updateIndicators(pagesData.length);
    container.scrollLeft = 0;
    currentPage = 0;
}

function createAppCard(app) {
    const card = document.createElement('div');
    card.className = 'app-card glass-button';
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
    card.innerHTML = `${iconHtml}<span class="name">${app.name}</span>`;
    card.addEventListener('click', () => {
        if (app.id === 'edit_shortcuts') {
            openEditView();
        } else if (app.id === 'grid_settings') {
            openGridSettings();
        } else {
            launchApp(app.id);
        }
    });
    return card;
}

// ---------- Fixed cols/rows with swap on landscape ----------
function getCols() {
    const isLandscape = window.innerWidth > window.innerHeight;
    return isLandscape ? 6 : 2;
}

function getRows() {
    const isLandscape = window.innerWidth > window.innerHeight;
    return isLandscape ? 2 : 6;
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

function applySettings() {
    const g = settings.grid || {};
    const iconSize = g.icon_size || 64;
    const glowSize = g.glow_size || 20;
    document.documentElement.style.setProperty('--icon-size', iconSize + 'px');
    document.documentElement.style.setProperty('--glow-size', glowSize + 'px');
    
    if (g.bg_type === 'color') {
        document.body.style.background = g.bg_value || '#000000';
        document.body.style.backgroundImage = '';
        document.body.style.backgroundSize = '';
        const vid = document.getElementById('bgVideo');
        if (vid) vid.remove();
    } else if (g.bg_type === 'image') {
        if (g.bg_value) {
            document.body.style.backgroundImage = `url(${g.bg_value})`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
        }
        const vid = document.getElementById('bgVideo');
        if (vid) vid.remove();
    } else if (g.bg_type === 'video') {
        let video = document.getElementById('bgVideo');
        if (!video) {
            video = document.createElement('video');
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
            video.style.zIndex = '-1';
            document.body.prepend(video);
        }
        if (g.bg_value) {
            video.src = g.bg_value;
            video.play().catch(() => {});
        }
    }
    const blur = g.blur || 0;
    document.body.style.backdropFilter = `blur(${blur}px)`;
}

// ---------- Swipe (page navigation) ----------
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
    container.addEventListener('wheel', (e) => {
        if (e.deltaX !== 0) {
            e.preventDefault();
            const pages = container.querySelectorAll('.page');
            const total = pages.length;
            let newPage = currentPage;
            if (e.deltaX > 0 && currentPage < total - 1) newPage++;
            else if (e.deltaX < 0 && currentPage > 0) newPage--;
            if (newPage !== currentPage) {
                currentPage = newPage;
                container.scrollTo({ left: currentPage * container.clientWidth, behavior: 'smooth' });
                updateActiveDot();
            }
        }
    }, { passive: false });
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

// ---------- Launch ----------
async function launchApp(id) {
    try {
        const res = await fetch(`/api/launch/${id}`);
        const data = await res.json();
        if (data.status === 'system') {
            if (data.action === 'edit') openEditView();
            else if (data.action === 'settings') openGridSettings();
        }
    } catch (e) {}
}

// ---------- Fullscreen ----------
function initFullscreen() {
    const btn = document.getElementById('fullscreenBtn');
    btn.addEventListener('click', toggleFullscreen);
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.log(err));
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// ---------- Grid Settings (no cols/rows) ----------
function initGridSettings() {
    const modal = document.getElementById('gridSettingsModal');
    const close = document.getElementById('closeSettings');
    const save = document.getElementById('saveSettingsBtn');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFileInput = document.getElementById('importFileInput');

    window.openGridSettings = function() {
        const g = settings.grid || {};
        document.getElementById('iconSize').value = g.icon_size || 64;
        document.getElementById('iconSizeVal').textContent = g.icon_size || 64;
        document.getElementById('glowSize').value = g.glow_size || 20;
        document.getElementById('glowSizeVal').textContent = g.glow_size || 20;
        document.getElementById('bgBlur').value = g.blur || 0;
        document.getElementById('bgBlurVal').textContent = g.blur || 0;
        document.getElementById('bgType').value = g.bg_type || 'color';
        document.getElementById('bgColor').value = g.bg_value || '#000000';
        document.getElementById('settingsMsg').textContent = '';
        if (g.bg_type === 'image' || g.bg_type === 'video') {
            document.getElementById('bgFileGroup').style.display = 'block';
            document.getElementById('bgColorGroup').style.display = 'none';
        } else {
            document.getElementById('bgFileGroup').style.display = 'none';
            document.getElementById('bgColorGroup').style.display = 'block';
        }
        modal.style.display = 'flex';
    };

    close.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    document.getElementById('iconSize').addEventListener('input', function() {
        document.getElementById('iconSizeVal').textContent = this.value;
    });
    document.getElementById('glowSize').addEventListener('input', function() {
        document.getElementById('glowSizeVal').textContent = this.value;
    });
    document.getElementById('bgBlur').addEventListener('input', function() {
        document.getElementById('bgBlurVal').textContent = this.value;
    });

    document.getElementById('bgType').addEventListener('change', function() {
        if (this.value === 'color') {
            document.getElementById('bgColorGroup').style.display = 'block';
            document.getElementById('bgFileGroup').style.display = 'none';
        } else {
            document.getElementById('bgColorGroup').style.display = 'none';
            document.getElementById('bgFileGroup').style.display = 'block';
        }
    });

    save.addEventListener('click', async () => {
        const iconSize = parseInt(document.getElementById('iconSize').value) || 64;
        const glowSize = parseInt(document.getElementById('glowSize').value) || 20;
        const blur = parseFloat(document.getElementById('bgBlur').value) || 0;
        const bgType = document.getElementById('bgType').value;
        let bgValue = '';
        
        document.getElementById('settingsMsg').textContent = '⏳ Saving...';
        
        if (bgType === 'color') {
            bgValue = document.getElementById('bgColor').value;
            await saveSettingsToServer(iconSize, glowSize, blur, bgType, bgValue);
            modal.style.display = 'none';
        } else {
            const fileInput = document.getElementById('bgFile');
            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                if (file.size > 5 * 1024 * 1024) {
                    document.getElementById('settingsMsg').textContent = '❌ File too large (max 5MB)';
                    return;
                }
                const reader = new FileReader();
                reader.onload = async function(e) {
                    bgValue = e.target.result;
                    await saveSettingsToServer(iconSize, glowSize, blur, bgType, bgValue);
                    modal.style.display = 'none';
                };
                reader.onerror = function() {
                    document.getElementById('settingsMsg').textContent = '❌ Error reading file';
                };
                reader.readAsDataURL(file);
            } else {
                bgValue = settings.grid?.bg_value || '';
                await saveSettingsToServer(iconSize, glowSize, blur, bgType, bgValue);
                modal.style.display = 'none';
            }
        }
    });

    // Export
    exportBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/export');
            const data = await res.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'WinLauncher_Config.sb';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            alert('Export failed: ' + e.message);
        }
    });

    // Import
    importBtn.addEventListener('click', () => {
        importFileInput.click();
    });
    importFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const res = await fetch('/api/import', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            if (res.ok) {
                alert('Import successful! Reloading...');
                location.reload();
            } else {
                alert('Import failed: ' + (await res.text()));
            }
        } catch (err) {
            alert('Invalid file: ' + err.message);
        }
        importFileInput.value = '';
    });
}

async function saveSettingsToServer(iconSize, glowSize, blur, bgType, bgValue) {
    const newSettings = {
        grid: {
            cols: 2,  // fixed
            rows: 6,  // fixed
            icon_size: iconSize,
            glow_size: glowSize,
            blur: blur,
            bg_type: bgType,
            bg_value: bgValue
        }
    };
    
    saveSettingsToLocal(newSettings);
    settings = newSettings;
    applySettings();
    // No need to re-render pages for size changes (CSS variables)
    
    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings)
        });
        if (res.ok) {
            document.getElementById('settingsMsg').textContent = '✅ Settings saved!';
            setTimeout(() => document.getElementById('settingsMsg').textContent = '', 2000);
        } else {
            document.getElementById('settingsMsg').textContent = '⚠️ Server save failed, but local cache updated';
        }
    } catch (e) {
        console.error('Save error:', e);
        document.getElementById('settingsMsg').textContent = '⚠️ Offline - Settings cached locally';
    }
}

// ---------- Edit View with Pages ----------
function initEditView() {
    const closeEdit = document.getElementById('closeEdit');
    const addPageBtn = document.getElementById('addPageBtn');
    const addMoreBtn = document.getElementById('addMoreBtn');

    closeEdit.addEventListener('click', closeEditView);
    addPageBtn.addEventListener('click', addNewPage);
    addMoreBtn.addEventListener('click', () => openModal(null));
}

function openEditView() {
    document.getElementById('editView').style.display = 'flex';
    renderPageTabs();
    if (pagesData.length > 0) {
        currentEditPageId = pagesData[0].id;
        renderEditList(pagesData[0]);
    }
}

function closeEditView() {
    document.getElementById('editView').style.display = 'none';
}

// ---------- Page Tabs with drag reorder ----------
function renderPageTabs() {
    const tabsContainer = document.getElementById('pageTabs');
    tabsContainer.innerHTML = '';
    pagesData.forEach((page, index) => {
        const tab = document.createElement('div');
        tab.className = 'page-tab' + (page.id === currentEditPageId ? ' active' : '');
        tab.textContent = page.name || 'Page';
        tab.dataset.pageId = page.id;
        tab.draggable = true;
        tab.addEventListener('click', () => {
            currentEditPageId = page.id;
            renderPageTabs();
            renderEditList(page);
        });
        // Double-click to rename
        tab.addEventListener('dblclick', () => {
            const newName = prompt('Enter new page name:', page.name);
            if (newName && newName.trim() !== '') {
                renamePage(page.id, newName.trim());
            }
        });
        // Delete page (except if only one page)
        if (pagesData.length > 1) {
            const del = document.createElement('span');
            del.className = 'page-tab-delete';
            del.textContent = '✕';
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Delete page "${page.name}"?`)) {
                    deletePage(page.id);
                }
            });
            tab.appendChild(del);
        }
        // Drag events for reordering pages
        tab.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', page.id);
            tab.classList.add('dragging');
        });
        tab.addEventListener('dragend', () => {
            tab.classList.remove('dragging');
        });
        tab.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingTab = document.querySelector('.page-tab.dragging');
            if (!draggingTab) return;
            const rect = tab.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;
            if (e.clientX < midX) {
                tabsContainer.insertBefore(draggingTab, tab);
            } else {
                tabsContainer.insertBefore(draggingTab, tab.nextSibling);
            }
        });
        tab.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId === page.id) return;
            // Reorder pagesData based on new DOM order
            const tabs = tabsContainer.querySelectorAll('.page-tab');
            const newOrder = Array.from(tabs).map(el => el.dataset.pageId);
            reorderPages(newOrder);
        });
        tabsContainer.appendChild(tab);
    });
}

async function reorderPages(newOrder) {
    try {
        await fetch('/api/pages/reorder', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({order: newOrder})
        });
        // Update local data
        const pageMap = {};
        pagesData.forEach(p => pageMap[p.id] = p);
        pagesData = newOrder.map(id => pageMap[id]);
        // Re-render main pages
        renderPages();
        // Re-render tabs (keeping current selection)
        renderPageTabs();
        const currentPage = pagesData.find(p => p.id === currentEditPageId);
        if (currentPage) renderEditList(currentPage);
    } catch (e) {
        alert('Failed to reorder pages');
    }
}

function renderEditList(page) {
    const list = document.getElementById('editList');
    list.innerHTML = '';
    if (!page) return;
    const appIds = page.appIds || [];
    appIds.forEach((appId, index) => {
        const app = appsData.find(a => a.id === appId);
        if (!app) return;
        const item = document.createElement('div');
        item.className = 'edit-item';
        item.draggable = true;
        item.dataset.appId = app.id;
        item.dataset.pageId = page.id;
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

        // Drag within/between pages
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({appId: app.id, fromPageId: page.id, index: index}));
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
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            const fromPageId = data.fromPageId;
            const appId = data.appId;
            const fromIndex = data.index;
            // Determine new position
            const items = list.querySelectorAll('.edit-item:not(.dragging)');
            let newIndex = 0;
            for (let i = 0; i < items.length; i++) {
                if (items[i] === item) {
                    newIndex = i;
                    break;
                }
            }
            const targetPageId = currentEditPageId;
            moveApp(appId, fromPageId, targetPageId, fromIndex, newIndex);
        });

        list.appendChild(item);
    });
}

// ---------- Page CRUD ----------
async function addNewPage() {
    const name = prompt('Enter page name:', 'New Page');
    if (!name || name.trim() === '') return;
    try {
        const res = await fetch('/api/pages', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: name.trim()})
        });
        if (res.ok) {
            const data = await res.json();
            pagesData.push(data.page);
            renderPageTabs();
            currentEditPageId = data.page.id;
            renderPageTabs();
            renderEditList(data.page);
            renderPages();
        }
    } catch (e) {
        alert('Failed to add page');
    }
}

async function renamePage(pageId, newName) {
    try {
        await fetch(`/api/pages/${pageId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: newName})
        });
        const page = pagesData.find(p => p.id === pageId);
        if (page) page.name = newName;
        renderPageTabs();
        renderPages();
    } catch (e) {}
}

async function deletePage(pageId) {
    try {
        await fetch(`/api/pages/${pageId}`, {method: 'DELETE'});
        pagesData = pagesData.filter(p => p.id !== pageId);
        if (currentEditPageId === pageId) {
            currentEditPageId = pagesData.length > 0 ? pagesData[0].id : null;
        }
        renderPageTabs();
        if (currentEditPageId) {
            const page = pagesData.find(p => p.id === currentEditPageId);
            renderEditList(page);
        } else {
            document.getElementById('editList').innerHTML = '';
        }
        renderPages();
    } catch (e) {}
}

// ---------- Move App between pages ----------
async function moveApp(appId, fromPageId, toPageId, fromIndex, toIndex) {
    try {
        await fetch('/api/pages/move-app', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({appId, fromPageId, toPageId, fromIndex, toIndex})
        });
        // Update local data
        if (fromPageId === toPageId) {
            const page = pagesData.find(p => p.id === fromPageId);
            if (page) {
                const appIds = page.appIds;
                const [removed] = appIds.splice(fromIndex, 1);
                appIds.splice(toIndex, 0, removed);
            }
        } else {
            const fromPage = pagesData.find(p => p.id === fromPageId);
            const toPage = pagesData.find(p => p.id === toPageId);
            if (fromPage && toPage) {
                const [removed] = fromPage.appIds.splice(fromIndex, 1);
                toPage.appIds.splice(toIndex, 0, removed);
            }
        }
        const currentPage = pagesData.find(p => p.id === currentEditPageId);
        renderEditList(currentPage);
        renderPages();
    } catch (e) {
        alert('Failed to move app');
    }
}

// ---------- Delete App ----------
async function deleteApp(appId) {
    if (!confirm('Remove this shortcut?')) return;
    await fetch(`/api/apps/${appId}`, { method: 'DELETE' });
    appsData = appsData.filter(a => a.id !== appId);
    for (let page of pagesData) {
        page.appIds = page.appIds.filter(id => id !== appId);
    }
    const currentPage = pagesData.find(p => p.id === currentEditPageId);
    renderEditList(currentPage);
    renderPages();
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
            const data = await res.json();
            closeModalFn();
            // Reload apps and pages
            await fetchAppsAndPages();
            if (document.getElementById('editView').style.display === 'flex') {
                renderPageTabs();
                const currentPage = pagesData.find(p => p.id === currentEditPageId);
                renderEditList(currentPage);
            }
        } else {
            const err = await res.json();
            document.getElementById('modalMsg').innerText = '❌ ' + (err.msg || 'Server error!');
        }
    } catch (e) {
        document.getElementById('modalMsg').innerText = '❌ Connection error!';
    }
}

// ---------- Orientation Change ----------
function setupOrientationChange() {
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const currentPageBefore = currentPage;
            renderPages();
            const container = document.getElementById('appContainer');
            const pages = container.querySelectorAll('.page');
            if (pages.length > 0) {
                const newPage = Math.min(currentPageBefore, pages.length - 1);
                currentPage = newPage;
                container.scrollTo({ left: newPage * container.clientWidth, behavior: 'auto' });
                updateActiveDot();
            }
        }, 200);
    });
}
