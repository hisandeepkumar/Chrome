// Content script (isolated world) – injects inject.js and creates UI panel with map picker

// Inject the external script file into page (bypasses CSP)
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(script);

// Function to load Leaflet CSS/JS dynamically (only when needed)
function loadLeaflet(callback) {
    if (typeof L !== 'undefined') { callback(); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = callback;
    document.head.appendChild(script);
}

// Create UI Panel and Map Modal
function createUI() {
    if (document.getElementById('smart-att-panel')) return;

    // ---------- Panel ----------
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
        <button id="smart-pick-map" style="background:#3498db; margin-top:5px;">🗺️ Pick from map</button>
        <button id="smart-save">💾 Apply Settings</button>
    `;
    document.body.appendChild(panel);
    panel.style.display = 'none';

    toggleBtn.onclick = () => {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };

    // Load saved values from localStorage
    document.getElementById('smart-lat').value = localStorage.getItem('smart_lat') || '19.0760';
    document.getElementById('smart-lon').value = localStorage.getItem('smart_lon') || '72.8777';
    document.getElementById('smart-addr').value = localStorage.getItem('smart_addr') || 'Mumbai, India';
    document.getElementById('smart-remark').value = localStorage.getItem('smart_remark') || '';

    // Save button
    document.getElementById('smart-save').addEventListener('click', function() {
        localStorage.setItem('smart_lat', document.getElementById('smart-lat').value);
        localStorage.setItem('smart_lon', document.getElementById('smart-lon').value);
        localStorage.setItem('smart_addr', document.getElementById('smart-addr').value);
        localStorage.setItem('smart_remark', document.getElementById('smart-remark').value);

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

    // ---------- Map Modal ----------
    const modal = document.createElement('div');
    modal.id = 'smart-map-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <span>Select location on map</span>
                <button id="smart-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div id="smart-map"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Close modal
    document.getElementById('smart-modal-close').onclick = () => {
        modal.style.display = 'none';
    };
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    // Pick from map button
    document.getElementById('smart-pick-map').addEventListener('click', () => {
        modal.style.display = 'flex';
        loadLeaflet(() => {
            // If map already initialized, just resize and center
            if (window._leafletMap) {
                window._leafletMap.invalidateSize();
                return;
            }
            const lat = parseFloat(document.getElementById('smart-lat').value) || 19.0760;
            const lon = parseFloat(document.getElementById('smart-lon').value) || 72.8777;
            const map = L.map('smart-map').setView([lat, lon], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CartoDB'
            }).addTo(map);
            const marker = L.marker([lat, lon]).addTo(map);
            
            map.on('click', async (e) => {
                const { lat, lng } = e.latlng;
                document.getElementById('smart-lat').value = lat.toFixed(6);
                document.getElementById('smart-lon').value = lng.toFixed(6);
                marker.setLatLng([lat, lng]);
                // Reverse geocode using LocationIQ key from page
                const apiKey = document.getElementById('ctl00_BodyContentPlaceHolder_hdnKey')?.value || 'pk.c08d1307c75136fa2709e2374acd8cce';
                try {
                    const response = await fetch(`https://us1.locationiq.com/v1/reverse?key=${apiKey}&lat=${lat}&lon=${lng}&format=json`);
                    const data = await response.json();
                    const address = data.display_name || `${lat}, ${lng}`;
                    document.getElementById('smart-addr').value = address;
                } catch (err) {
                    document.getElementById('smart-addr').value = `${lat}, ${lng}`;
                }
            });
            window._leafletMap = map;
        });
    });
}

// Wait for DOM to be ready to build UI
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUI);
} else {
    createUI();
}
