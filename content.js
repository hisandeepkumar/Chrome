// Content script (isolated world) – injects inject.js into page main world and creates UI panel

// Inject the external script file into page (bypasses CSP because it's a separate file)
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() {
    this.remove(); // Clean up
};
(document.head || document.documentElement).appendChild(script);

// Create UI Panel (to set custom values in localStorage)
function createUI() {
    if (document.getElementById('smart-att-panel')) return;

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'smart-att-toggle';
    toggleBtn.innerText = '⚙️ Custom Data';
    document.body.appendChild(toggleBtn);

    const panel = document.createElement('div');
    panel.id = 'smart-att-panel';
    panel.innerHTML = `
        <h4>✏️ Override Settings</h4>
        <label>Latitude:</label>
        <input type="text" id="smart-lat" placeholder="19.0760">
        <label>Longitude:</label>
        <input type="text" id="smart-lon" placeholder="72.8777">
        <label>Address:</label>
        <input type="text" id="smart-addr" placeholder="Mumbai, India">
        <label>Remark:</label>
        <textarea id="smart-remark" placeholder="Remark..."></textarea>
        <label>Custom Image (JPEG/PNG):</label>
        <input type="file" id="smart-image" accept="image/jpeg,image/png">
        <button id="smart-save">💾 Apply Settings</button>
    `;
    document.body.appendChild(panel);
    panel.style.display = 'none';

    toggleBtn.onclick = () => {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };

    // Load existing values from localStorage
    document.getElementById('smart-lat').value = localStorage.getItem('smart_lat') || '19.0760';
    document.getElementById('smart-lon').value = localStorage.getItem('smart_lon') || '72.8777';
    document.getElementById('smart-addr').value = localStorage.getItem('smart_addr') || 'Mumbai, India';
    document.getElementById('smart-remark').value = localStorage.getItem('smart_remark') || '';

    document.getElementById('smart-save').addEventListener('click', function() {
        const newLat = document.getElementById('smart-lat').value;
        const newLon = document.getElementById('smart-lon').value;
        const newAddr = document.getElementById('smart-addr').value;
        const newRemark = document.getElementById('smart-remark').value;
        localStorage.setItem('smart_lat', newLat);
        localStorage.setItem('smart_lon', newLon);
        localStorage.setItem('smart_addr', newAddr);
        localStorage.setItem('smart_remark', newRemark);

        const fileInput = document.getElementById('smart-image');
        if (fileInput.files.length > 0) {
            const reader = new FileReader();
            reader.onload = function(e) {
                localStorage.setItem('smart_image', e.target.result);
                alert('✅ Custom image saved. Will replace camera photo.');
            };
            reader.readAsDataURL(fileInput.files[0]);
        } else {
            alert('✅ Settings saved (image unchanged).');
        }
    });
}

// Wait for DOM to be ready to build UI
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUI);
} else {
    createUI();
}
