document.addEventListener('DOMContentLoaded', () => {
    fetchApps();
    document.getElementById('addAppBtn').onclick = openModal;
    document.getElementById('closeModal').onclick = closeModal;
    document.getElementById('saveAppBtn').onclick = saveApp;
    window.onclick = (e) => { if (e.target === document.getElementById('addModal')) closeModal(); };
    
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/static/sw.js')
        .then(() => console.log('✅ SW Registered'))
        .catch(err => console.log('SW Reg failed:', err));
    }
});

async function fetchApps() {
    try {
        const res = await fetch('/api/apps');
        const apps = await res.json();
        renderApps(apps);
    } catch (e) {
        alert('Cannot connect to server. Make sure PC is on and reachable.');
    }
}

function renderApps(apps) {
    const grid = document.getElementById('appGrid');
    grid.innerHTML = '';
    apps.forEach(app => {
        const card = document.createElement('div');
        card.className = 'app-card';
        card.innerHTML = `
            <span class="icon">${app.icon || '📦'}</span>
            <span class="name">${app.name}</span>
            <button class="delete-btn" data-id="${app.id}">✕</button>
        `;
        // Launch on click (except delete button)
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-btn')) return;
            launchApp(app.id);
        });
        // Delete
        card.querySelector('.delete-btn').onclick = (e) => {
            e.stopPropagation();
            deleteApp(app.id);
        };
        grid.appendChild(card);
    });
}

async function launchApp(id) {
    try {
        const res = await fetch(`/api/launch/${id}`);
        const data = await res.json();
        if (data.status === 'launched') {
            // Haptic feedback or subtle visual
            alert(`✅ ${data.name} launched on PC!`);
        } else {
            alert('❌ Failed to launch. Check path.');
        }
    } catch (e) {
        alert('Network error. Is PC connected?');
    }
}

async function deleteApp(id) {
    if (!confirm('Remove this shortcut?')) return;
    await fetch(`/api/apps/${id}`, { method: 'DELETE' });
    fetchApps();
}

// Modal logic
function openModal() {
    document.getElementById('addModal').style.display = 'flex';
    document.getElementById('modalMsg').innerText = '';
}
function closeModal() {
    document.getElementById('addModal').style.display = 'none';
}

async function saveApp() {
    const name = document.getElementById('appName').value.trim();
    const path = document.getElementById('appPath').value.trim();
    const icon = document.getElementById('appIcon').value.trim() || '📦';
    if (!name || !path) {
        document.getElementById('modalMsg').innerText = '⚠️ Name and Path are required!';
        return;
    }
    try {
        const res = await fetch('/api/apps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, path, icon })
        });
        if (res.ok) {
            closeModal();
            fetchApps();
            // Clear fields
            document.getElementById('appName').value = '';
            document.getElementById('appPath').value = '';
        } else {
            document.getElementById('modalMsg').innerText = '❌ Server error!';
        }
    } catch (e) {
        document.getElementById('modalMsg').innerText = '❌ Connection error!';
    }
}
