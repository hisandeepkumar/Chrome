document.addEventListener('DOMContentLoaded', () => {
    fetchApps();
    document.getElementById('addMoreBtn').onclick = () => openModal(null);
    document.getElementById('closeEdit').onclick = closeEditView;
    document.getElementById('closeModal').onclick = closeModal;
    document.getElementById('saveAppBtn').onclick = saveApp;
    window.onclick = (e) => {
        if (e.target === document.getElementById('addModal')) closeModal();
        if (e.target === document.getElementById('editView')) closeEditView();
    };

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/static/sw.js')
            .then(() => console.log('✅ SW Registered'))
            .catch(err => console.log('SW Reg failed:', err));
    }
});

let appsData = [];

async function fetchApps() {
    try {
        const res = await fetch('/api/apps');
        appsData = await res.json();
        renderMainGrid(appsData);
    } catch (e) {
        alert('Cannot connect to server.');
    }
}

// ---------- Main Grid ----------
function renderMainGrid(apps) {
    const grid = document.getElementById('appGrid');
    grid.innerHTML = '';
    apps.forEach(app => {
        const card = document.createElement('div');
        card.className = 'app-card';
        card.dataset.id = app.id;

        // Icon (image or emoji)
        let iconHtml = `<span class="icon">${app.icon || '📦'}</span>`;
        // Check custom icon existence via HEAD
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
        grid.appendChild(card);
    });

    // Edit button at the end
    const editBtn = document.createElement('div');
    editBtn.className = 'edit-grid-btn';
    editBtn.innerHTML = `<span class="icon">✏️</span><span class="name">Edit</span>`;
    editBtn.addEventListener('click', openEditView);
    grid.appendChild(editBtn);
}

// ---------- Launch ----------
async function launchApp(id) {
    try {
        const res = await fetch(`/api/launch/${id}`);
        const data = await res.json();
        if (data.status === 'launched') {
            alert(`✅ ${data.name || 'App'} launched on PC!`);
        } else {
            alert('❌ Failed to launch.');
        }
    } catch (e) {
        alert('Network error.');
    }
}

// ---------- Edit View ----------
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
    renderMainGrid(appsData);
}

async function deleteApp(id) {
    if (!confirm('Remove this shortcut?')) return;
    await fetch(`/api/apps/${id}`, { method: 'DELETE' });
    await fetchApps();
    if (document.getElementById('editView').style.display === 'flex') {
        renderEditList(appsData);
    }
}

// ---------- Modal ----------
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

function closeModal() {
    document.getElementById('addModal').style.display = 'none';
}

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
        // retain icon emoji if not uploading file
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
            closeModal();
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
