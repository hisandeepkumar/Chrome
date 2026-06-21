document.addEventListener('DOMContentLoaded', () => {
    fetchApps();
    fetchSettings();
    initFullscreen();
    initGridSettings();
    initEditView();
    initAddModal();
    setupSwipeDetection();
});

// ---------- Global State ----------
let appsData = [];
let settings = {};
let currentPage = 0;

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
        const res = await fetch('/api/settings');
        settings = await res.json();
        applySettings();
    } catch (e) {
        console.error(e);
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
    card.addEventListener('click', () => launchApp(app.id));
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
            p.style.background = 'transparent';
        });
        // Remove video if any
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
    document.querySelectorAll('.page').forEach(p => {
        p.style.backdropFilter = `blur(${blur}px)`;
    });
}

// ---------- Swipe ----------
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
        await fetch(`/api/launch/${id}`);
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
    const btn = document.getElementById('gridSettingsBtn');
    const modal = document.getElementById('gridSettingsModal');
    const close = document.getElementById('closeSettings');
    const save = document.getElementById('saveSettingsBtn');

    btn.addEventListener('click', () => {
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
        if (g.bg_type === 'image' || g.bg_type === 'video') {
            document.getElementById('bgFileGroup').style.display = 'block';
            document.getElementById('bgColorGroup').style.display = 'none';
        } else {
            document.getElementById('bgFileGroup').style.display = 'none';
            document.getElementById('bgColorGroup').style.display = 'block';
        }
        modal.style.display = 'flex';
    });

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
        if (bgType === 'color') {
            bgValue = document.getElementById('bgColor').value;
        } else {
            const fileInput = document.getElementById('bgFile');
            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const reader = new FileReader();
                reader.onload = function(e) {
                    bgValue = e.target.result;
                    settings.grid.bg_value = bgValue;
                    settings.grid.bg_type = bgType;
                    settings.grid.blur = blur;
                    settings.grid.icon_size = iconSize;
                    settings.grid.glow_size = glowSize;
                    settings.grid.portrait_cols = portraitCols;
                    settings.grid.portrait_rows = portraitRows;
                    settings.grid.landscape_cols = landscapeCols;
                    settings.grid.landscape_rows = landscapeRows;
                    saveSettingsToServer();
                };
                reader.readAsDataURL(file);
                return;
            } else {
                bgValue = settings.grid.bg_value || '';
            }
        }
        settings.grid = {
            portrait_cols: portraitCols,
            portrait_rows: portraitRows,
            landscape_cols: landscapeCols,
            landscape_rows: landscapeRows,
            icon_size: iconSize,
            glow_size: glowSize,
            blur: blur,
            bg_type: bgType,
            bg_value: bgValue
        };
        await saveSettingsToServer();
        modal.style.display = 'none';
    });
}

async function saveSettingsToServer() {
    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings.grid)
        });
        if (res.ok) {
            applySettings();
            renderPages(appsData);
        } else {
            document.getElementById('settingsMsg').textContent = '❌ Failed to save settings';
        }
    } catch (e) {
        document.getElementById('settingsMsg').textContent = '❌ Connection error';
    }
}

// ---------- Edit View ----------
function initEditView() {
    const editBtn = document.getElementById('editBtn');
    const closeEdit = document.getElementById('closeEdit');
    const addMoreBtn = document.getElementById('addMoreBtn');

    editBtn.addEventListener('click', openEditView);
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

        // Drag events
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
