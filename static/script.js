document.addEventListener('DOMContentLoaded', () => {
    fetchApps();
    fetchSettings();
    initFullscreen();
    initGridSettings();
    initEditView();
    initAddModal();
    setupSwipeDetection();
    setupOrientationChange();
    setupDragAndDrop();
});

// ---------- Global State ----------
let appsData = [];
let settings = {};
let currentPage = 0;

// ---------- LocalStorage Management ----------
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

// ---------- Fetch Apps & Settings ----------
async function fetchApps() {
    try {
        const res = await fetch('/api/apps');
        appsData = await res.json();
        renderPages(appsData);
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
function renderPages(apps) {
    const container = document.getElementById('appContainer');
    container.innerHTML = '';
    const cols = getCols();
    const rows = getRows();
    const itemsPerPage = cols * rows;
    const totalPages = Math.ceil(apps.length / itemsPerPage) || 1;
    for (let p = 0; p < totalPages; p++) {
        const page = document.createElement('div');
        page.className = 'page';
        page.dataset.page = p;
        page.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        page.style.gridTemplateRows = `repeat(${rows}, auto)`;
        const pageApps = apps.slice(p * itemsPerPage, (p + 1) * itemsPerPage);
        pageApps.forEach(app => {
            const card = createAppCard(app);
            page.appendChild(card);
        });
        container.appendChild(page);
    }
    updateIndicators(totalPages);
    container.scrollLeft = 0;
    currentPage = 0;
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
    card.innerHTML = `${iconHtml}<span class="name">${app.name}</span>`;
    // Handle click based on system apps
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

function getCols() {
    const isLandscape = window.innerWidth > window.innerHeight;
    if (isLandscape) return settings.grid?.landscape_cols || 4;
    return settings.grid?.portrait_cols || 3;
}

function getRows() {
    const isLandscape = window.innerWidth > window.innerHeight;
    if (isLandscape) return settings.grid?.landscape_rows || 3;
    return settings.grid?.portrait_rows || 4;
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
        document.querySelectorAll('.page').forEach(p => {
            p.style.background = 'rgba(255,255,255,0.05)';
            p.style.backdropFilter = 'blur(10px)';
        });
        const vid = document.getElementById('bgVideo');
        if (vid) vid.remove();
    } else if (g.bg_type === 'image') {
        if (g.bg_value) {
            document.body.style.backgroundImage = `url(${g.bg_value})`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
        }
        document.querySelectorAll('.page').forEach(p => {
            p.style.background = 'rgba(255,255,255,0.1)';
            p.style.backdropFilter = 'blur(15px)';
        });
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
        document.querySelectorAll('.page').forEach(p => {
            p.style.background = 'rgba(0,0,0,0.2)';
            p.style.backdropFilter = 'blur(10px)';
        });
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

// ---------- Grid Settings ----------
function initGridSettings() {
    const modal = document.getElementById('gridSettingsModal');
    const close = document.getElementById('closeSettings');
    const save = document.getElementById('saveSettingsBtn');

    // We'll call openGridSettings from elsewhere
    window.openGridSettings = function() {
        const g = settings.grid || {};
        document.getElementById('portraitCols').value = g.portrait_cols || 3;
        document.getElementById('portraitRows').value = g.portrait_rows || 4;
        document.getElementById('landscapeCols').value = g.landscape_cols || 4;
        document.getElementById('landscapeRows').value = g.landscape_rows || 3;
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
        const portraitCols = parseInt(document.getElementById('portraitCols').value) || 3;
        const portraitRows = parseInt(document.getElementById('portraitRows').value) || 4;
        const landscapeCols = parseInt(document.getElementById('landscapeCols').value) || 4;
        const landscapeRows = parseInt(document.getElementById('landscapeRows').value) || 3;
        const iconSize = parseInt(document.getElementById('iconSize').value) || 64;
        const glowSize = parseInt(document.getElementById('glowSize').value) || 20;
        const blur = parseFloat(document.getElementById('bgBlur').value) || 0;
        const bgType = document.getElementById('bgType').value;
        let bgValue = '';
        
        document.getElementById('settingsMsg').textContent = '⏳ Saving...';
        
        if (bgType === 'color') {
            bgValue = document.getElementById('bgColor').value;
            await saveSettingsToServer(portraitCols, portraitRows, landscapeCols, landscapeRows, iconSize, glowSize, blur, bgType, bgValue);
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
                    await saveSettingsToServer(portraitCols, portraitRows, landscapeCols, landscapeRows, iconSize, glowSize, blur, bgType, bgValue);
                    modal.style.display = 'none';
                };
                reader.onerror = function() {
                    document.getElementById('settingsMsg').textContent = '❌ Error reading file';
                };
                reader.readAsDataURL(file);
            } else {
                bgValue = settings.grid?.bg_value || '';
                await saveSettingsToServer(portraitCols, portraitRows, landscapeCols, landscapeRows, iconSize, glowSize, blur, bgType, bgValue);
                modal.style.display = 'none';
            }
        }
    });
}

async function saveSettingsToServer(portraitCols, portraitRows, landscapeCols, landscapeRows, iconSize, glowSize, blur, bgType, bgValue) {
    const newSettings = {
        grid: {
            portrait_cols: portraitCols,
            portrait_rows: portraitRows,
            landscape_cols: landscapeCols,
            landscape_rows: landscapeRows,
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
    renderPages(appsData);
    
    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings)
        });
        if (res.ok) {
            document.getElementById('settingsMsg').textContent = '✅ Settings saved successfully!';
            setTimeout(() => {
                document.getElementById('settingsMsg').textContent = '';
            }, 2000);
        } else {
            document.getElementById('settingsMsg').textContent = '⚠️ Server save failed, but local cache updated';
        }
    } catch (e) {
        console.error('Save error:', e);
        document.getElementById('settingsMsg').textContent = '⚠️ Offline - Settings cached locally';
    }
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

        // Drag events for edit list
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

// ---------- Orientation Change ----------
function setupOrientationChange() {
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const currentPageBefore = currentPage;
            renderPages(appsData);
            // Restore page
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

// ---------- Drag and Drop on Main Grid ----------
function setupDragAndDrop() {
    let dragData = null;
    const container = document.getElementById('appContainer');

    // Mouse events
    container.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', moveDrag);
    document.addEventListener('mouseup', endDrag);

    // Touch events
    container.addEventListener('touchstart', startDragTouch, { passive: true });
    document.addEventListener('touchmove', moveDragTouch, { passive: false });
    document.addEventListener('touchend', endDragTouch, { passive: true });

    let dragElement = null;
    let clone = null;
    let startX, startY;
    let dragId = null;
    let isDragging = false;
    let dragOffsetX, dragOffsetY;

    function startDrag(e) {
        if (e.button !== 0) return;
        const card = e.target.closest('.app-card');
        if (!card) return;
        // Don't drag system apps
        const appId = card.dataset.id;
        if (appId === 'edit_shortcuts' || appId === 'grid_settings') return;
        dragData = {
            id: appId,
            card: card,
            page: card.closest('.page'),
            offsetX: e.offsetX,
            offsetY: e.offsetY,
        };
        e.preventDefault();
    }

    function startDragTouch(e) {
        const touch = e.touches[0];
        const card = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.app-card');
        if (!card) return;
        const appId = card.dataset.id;
        if (appId === 'edit_shortcuts' || appId === 'grid_settings') return;
        // Long press detection
        let longPressTimer = setTimeout(() => {
            // Start drag
            const rect = card.getBoundingClientRect();
            dragData = {
                id: appId,
                card: card,
                page: card.closest('.page'),
                offsetX: touch.clientX - rect.left,
                offsetY: touch.clientY - rect.top,
                touch: true
            };
            isDragging = true;
            createClone(touch.clientX, touch.clientY);
            card.style.opacity = '0.3';
            e.preventDefault();
        }, 400);
        card._longPressTimer = longPressTimer;
        card._touchStart = { x: touch.clientX, y: touch.clientY };
    }

    function moveDrag(e) {
        if (!dragData) return;
        if (!isDragging) {
            // Check if moved enough to start drag
            const dx = e.clientX - dragData.card.getBoundingClientRect().left - dragData.offsetX;
            const dy = e.clientY - dragData.card.getBoundingClientRect().top - dragData.offsetY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                isDragging = true;
                createClone(e.clientX, e.clientY);
                dragData.card.style.opacity = '0.3';
            }
            return;
        }
        e.preventDefault();
        moveClone(e.clientX, e.clientY);
        // Check for drop target
        const target = getDropTarget(e.clientX, e.clientY);
        if (target) {
            highlightTarget(target);
        } else {
            clearHighlight();
        }
    }

    function moveDragTouch(e) {
        if (!dragData) return;
        const touch = e.touches[0];
        if (!isDragging) {
            // Check if moved enough
            const dx = touch.clientX - dragData.card._touchStart.x;
            const dy = touch.clientY - dragData.card._touchStart.y;
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                clearTimeout(dragData.card._longPressTimer);
                isDragging = true;
                createClone(touch.clientX, touch.clientY);
                dragData.card.style.opacity = '0.3';
                e.preventDefault();
            }
            return;
        }
        e.preventDefault();
        moveClone(touch.clientX, touch.clientY);
        const target = getDropTarget(touch.clientX, touch.clientY);
        if (target) {
            highlightTarget(target);
        } else {
            clearHighlight();
        }
    }

    function endDrag(e) {
        if (!dragData) return;
        if (isDragging) {
            const target = getDropTarget(e.clientX, e.clientY);
            if (target) {
                performDrop(target, dragData.id);
            }
            cleanupDrag();
        }
        // Reset long press timer
        if (dragData.card) {
            clearTimeout(dragData.card._longPressTimer);
            dragData.card.style.opacity = '1';
        }
        dragData = null;
        isDragging = false;
    }

    function endDragTouch(e) {
        if (!dragData) return;
        if (isDragging) {
            const touch = e.changedTouches[0];
            const target = getDropTarget(touch.clientX, touch.clientY);
            if (target) {
                performDrop(target, dragData.id);
            }
            cleanupDrag();
        }
        if (dragData.card) {
            clearTimeout(dragData.card._longPressTimer);
            dragData.card.style.opacity = '1';
        }
        dragData = null;
        isDragging = false;
    }

    function createClone(x, y) {
        if (clone) return;
        const card = dragData.card;
        const rect = card.getBoundingClientRect();
        clone = card.cloneNode(true);
        clone.style.position = 'fixed';
        clone.style.pointerEvents = 'none';
        clone.style.zIndex = '9999';
        clone.style.width = rect.width + 'px';
        clone.style.height = rect.height + 'px';
        clone.style.opacity = '0.8';
        clone.style.transform = 'scale(1.1)';
        clone.style.transition = 'none';
        document.body.appendChild(clone);
        moveClone(x, y);
    }

    function moveClone(x, y) {
        if (!clone) return;
        const card = dragData.card;
        const rect = card.getBoundingClientRect();
        clone.style.left = (x - dragData.offsetX) + 'px';
        clone.style.top = (y - dragData.offsetY) + 'px';
    }

    function getDropTarget(x, y) {
        const elements = document.elementsFromPoint(x, y);
        for (let el of elements) {
            const card = el.closest('.app-card');
            if (card && card.dataset.id !== dragData.id && !card.closest('.edit-item')) {
                const appId = card.dataset.id;
                if (appId !== 'edit_shortcuts' && appId !== 'grid_settings') {
                    return card;
                }
            }
        }
        return null;
    }

    function highlightTarget(target) {
        document.querySelectorAll('.app-card.drag-over').forEach(el => el.classList.remove('drag-over'));
        if (target) target.classList.add('drag-over');
    }

    function clearHighlight() {
        document.querySelectorAll('.app-card.drag-over').forEach(el => el.classList.remove('drag-over'));
    }

    function performDrop(target, draggedId) {
        clearHighlight();
        // Find indices
        const allCards = Array.from(document.querySelectorAll('.app-card:not([data-id="edit_shortcuts"]):not([data-id="grid_settings"])'));
        const draggedIndex = allCards.findIndex(c => c.dataset.id === draggedId);
        const targetIndex = allCards.findIndex(c => c === target);
        if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return;

        // Reorder appsData
        const draggedApp = appsData.find(a => a.id === draggedId);
        const targetApp = appsData.find(a => a.id === target.dataset.id);
        if (!draggedApp || !targetApp) return;

        // Remove dragged and insert at target position
        const newApps = appsData.filter(a => a.id !== draggedId);
        const insertAt = newApps.findIndex(a => a.id === target.dataset.id);
        newApps.splice(insertAt, 0, draggedApp);
        appsData = newApps;

        // Save order and re-render
        saveOrder(appsData).then(() => {
            renderPages(appsData);
            // Restore page
            const container = document.getElementById('appContainer');
            const pages = container.querySelectorAll('.page');
            const newPage = Math.min(currentPage, pages.length - 1);
            currentPage = newPage;
            container.scrollTo({ left: newPage * container.clientWidth, behavior: 'auto' });
            updateActiveDot();
        });
    }

    function cleanupDrag() {
        if (clone) {
            clone.remove();
            clone = null;
        }
        if (dragData && dragData.card) {
            dragData.card.style.opacity = '1';
        }
        clearHighlight();
        isDragging = false;
    }
}
