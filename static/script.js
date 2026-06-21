document.addEventListener('DOMContentLoaded', () => {
    fetchApps();
    document.getElementById('addAppBtn').onclick = () => openModal(null);
    document.getElementById('closeModal').onclick = closeModal;
    document.getElementById('saveAppBtn').onclick = saveApp;
    document.getElementById('editToggle').onclick = toggleEditMode;
    window.onclick = (e) => { if (e.target === document.getElementById('addModal')) closeModal(); };
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/static/sw.js')
        .then(() => console.log('✅ SW Registered'))
        .catch(err => console.log('SW Reg failed:', err));
    }
});

let appsData = [];
let editMode = false;

async function fetchApps() {
    try {
        const res = await fetch('/api/apps');
        appsData = await res.json();
        renderApps(appsData);
    } catch (e) {
        alert('Cannot connect to server. Make sure PC is on.');
    }
}

function renderApps(apps) {
    const grid = document.getElementById('appGrid');
    grid.innerHTML = '';
    apps.forEach((app, index) => {
        const card = document.createElement('div');
        card.className = 'app-card';
        card.draggable = editMode;
        card.dataset.id = app.id;
        card.dataset.index = index;
        
        // Icon (Image if uploaded, else Emoji)
        let iconHtml = `<span class="icon">${app.icon || '📦'}</span>`;
        // Check for custom icon
        fetch(`/static/icons/${app.id}.png`, { method: 'HEAD' })
            .then(res => {
                if (res.ok) {
                    const img = card.querySelector('.icon');
                    if (img) img.outerHTML = `<img class="icon-img" src="/static/icons/${app.id}.png" alt="icon">`;
                }
            }).catch(() => {});

        card.innerHTML = `
            ${iconHtml}
            <span class="name">${app.name}</span>
            <div class="card-actions">
                <button class="edit-btn" data-id="${app.id}">✏️</button>
                <button class="delete-btn" data-id="${app.id}">✕</button>
            </div>
        `;
        
        // Launch
        card.addEventListener('click', (e) => {
            if (e.target.closest('.card-actions')) return;
            launchApp(app.id);
        });

        // Drag Events
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', app.id);
            card.style.opacity = '0.5';
        });
        card.addEventListener('dragend', () => { card.style.opacity = '1'; });
        card.addEventListener('dragover', (e) => { e.preventDefault(); });
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId !== app.id) {
                const draggedIndex = apps.findIndex(a => a.id === draggedId);
                const targetIndex = apps.findIndex(a => a.id === app.id);
                // Reorder array
                const [removed] = apps.splice(draggedIndex, 1);
                apps.splice(targetIndex, 0, removed);
                renderApps(apps);
                saveOrder(apps);
            }
        });

        // Edit button
        card.querySelector('.edit-btn').onclick = (e) => {
            e.stopPropagation();
            openModal(app.id);
        };

        // Delete button
        card.querySelector('.delete-btn').onclick = (e) => {
            e.stopPropagation();
            deleteApp(app.id);
        };

        // Toggle visibility of actions based on edit mode
        const actions = card.querySelector('.card-actions');
        actions.style.display = editMode ? 'flex' : 'none';

        grid.appendChild(card);
    });
}

function toggleEditMode() {
    editMode = !editMode;
    document.getElementById('editToggle').textContent = editMode ? '✅ Done' : '✏️ Edit';
    renderApps(appsData);
}

async function saveOrder(apps) {
    const order = apps.map(a => a.id);
    await fetch('/api/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
    });
}

async function launchApp(id) {
    try {
        const res = await fetch(`/api/launch/${id}`);
        const data = await res.json();
        if (data.status === 'launched') {
            alert(`✅ ${data.name} launched on PC!`);
        } else {
            alert('❌ Failed to launch.');
        }
    } catch (e) {
        alert('Network error.');
    }
}

async function deleteApp(id) {
    if (!confirm('Remove this shortcut?')) return;
    await fetch(`/api/apps/${id}`, { method: 'DELETE' });
    fetchApps();
}

// ---------- Modal Logic ----------
function openModal(appId) {
    const modal = document.getElementById('addModal');
    modal.style.display = 'flex';
    document.getElementById('modalMsg').innerText = '';
    document.getElementById('editId').value = '';
    document.getElementById('appName').value = '';
    document.getElementById('appPath').value = '';
    document.getElementById('appIcon').value = '📦';
    document.getElementById('iconFile').value = '';
    document.getElementById('modalTitle').innerText = 'Add New Shortcut';

    if (appId) {
        const app = appsData.find(a => a.id === appId);
        if (app) {
            document.getElementById('modalTitle').innerText = 'Edit Shortcut';
            document.getElementById('editId').value = app.id;
            document.getElementById('appName').value = app.name;
            document.getElementById('appPath').value = app.path;
            document.getElementById('appIcon').value = app.icon || '📦';
        }
    }
}

function closeModal() {
    document.getElementById('addModal').style.display = 'none';
}

async function saveApp() {
    const editId = document.getElementById('editId').value;
    const name = document.getElementById('appName').value.trim();
    const path = document.getElementById('appPath').value.trim();
    const icon = document.getElementById('appIcon').value.trim() || '📦';
    const fileInput = document.getElementById('iconFile');
    const file = fileInput.files[0];

    if (!name || !path) {
        document.getElementById('modalMsg').innerText = '⚠️ Name and Path are required!';
        return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('path', path);
    formData.append('icon', icon);
    if (editId) formData.append('edit_id', editId);
    if (file) formData.append('icon_file', file);

    try {
        const res = await fetch('/api/apps', {
            method: 'POST',
            body: formData
        });
        if (res.ok) {
            closeModal();
            fetchApps();
        } else {
            const err = await res.json();
            document.getElementById('modalMsg').innerText = '❌ ' + (err.msg || 'Server error!');
        }
    } catch (e) {
        document.getElementById('modalMsg').innerText = '❌ Connection error!';
    }
}
