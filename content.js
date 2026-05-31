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

// Helper: parse coordinate string "lat, lon" or "lat lon" or "lat,lon"
function parseCoordinates(coordStr) {
    let trimmed = coordStr.trim();
    // Remove any extra spaces and split by comma or space
    let parts = trimmed.split(/[\s,]+/);
    if (parts.length >= 2) {
        let lat = parseFloat(parts[0]);
        let lon = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lon)) {
            return { lat, lon };
        }
    }
    return null;
}

// Reverse geocode using LocationIQ (async)
async function reverseGeocode(lat, lon, apiKey) {
    try {
        const url = `https://us1.locationiq.com/v1/reverse?key=${apiKey}&lat=${lat}&lon=${lon}&format=json`;
        const response = await fetch(url);
        const data = await response.json();
        return data.display_name || `${lat}, ${lon}`;
    } catch (err) {
        console.error('[Extension] Reverse geocode error:', err);
        return `${lat}, ${lon}`;
    }
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
        <label>Coordinates (lat, lon):</label>
        <input type="text" id="smart-coord" placeholder="e.g., 26.896586768921352, 75.71579255958834">
        <label>Address:</label>
        <input type="text" id="smart-addr" placeholder="Auto-filled from coordinates">
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

    // Helper to update localStorage lat/lon from coordinate input
    function updateLatLonFromCoord(coordStr) {
        const parsed = parseCoordinates(coordStr);
        if (parsed) {
            localStorage.setItem('smart_lat', parsed.lat.toString());
            localStorage.setItem('smart_lon', parsed.lon.toString());
            return parsed;
        }
        return null;
    }

    // Helper to update coordinate input from lat/lon values (used by map picker)
    function updateCoordInputFromLatLon(lat, lon) {
        const coordInput = document.getElementById('smart-coord');
        if (coordInput) {
            coordInput.value = `${lat}, ${lon}`;
        }
    }

    // Load saved values from localStorage (initialize UI)
    let currentLat = localStorage.getItem('smart_lat') || '19.0760';
    let currentLon = localStorage.getItem('smart_lon') || '72.8777';
    let currentAddr = localStorage.getItem('smart_addr') || 'Mumbai, India';
    let currentRemark = localStorage.getItem('smart_remark') || '';

    document.getElementById('smart-coord').value = `${currentLat}, ${currentLon}`;
    document.getElementById('smart-addr').value = currentAddr;
    document.getElementById('smart-remark').value = currentRemark;

    // When coordinate field loses focus, parse and auto-fetch address
    const coordInput = document.getElementById('smart-coord');
    coordInput.addEventListener('blur', async () => {
        const coordStr = coordInput.value;
        const parsed = updateLatLonFromCoord(coordStr);
        if (parsed) {
            // Auto-fetch address using LocationIQ
            const apiKey = document.getElementById('ctl00_BodyContentPlaceHolder_hdnKey')?.value || 'pk.c08d1307c75136fa2709e2374acd8cce';
            const fetchedAddr = await reverseGeocode(parsed.lat, parsed.lon, apiKey);
            const addrInput = document.getElementById('smart-addr');
            // Only auto-fill if user hasn't manually changed address since last save? We'll just set it.
            addrInput.value = fetchedAddr;
            // Also store in localStorage temporarily? No, only on save.
        }
    });

    // Save button
    document.getElementById('smart-save').addEventListener('click', function() {
        // First, parse current coordinate input to ensure lat/lon are updated
        const coordStr = document.getElementById('smart-coord').value;
        const parsed = parseCoordinates(coordStr);
        let finalLat, finalLon;
        if (parsed) {
            finalLat = parsed.lat;
            finalLon = parsed.lon;
        } else {
            // If invalid, keep existing values
            finalLat = parseFloat(localStorage.getItem('smart_lat')) || 19.0760;
            finalLon = parseFloat(localStorage.getItem('smart_lon')) || 72.8777;
            // Show warning but don't break
            alert('Invalid coordinate format. Using previous values.');
            document.getElementById('smart-coord').value = `${finalLat}, ${finalLon}`;
        }
        localStorage.setItem('smart_lat', finalLat.toString());
        localStorage.setItem('smart_lon', finalLon.toString());
        
        const finalAddr = document.getElementById('smart-addr').value;
        const finalRemark = document.getElementById('smart-remark').value;
        localStorage.setItem('smart_addr', finalAddr);
        localStorage.setItem('smart_remark', finalRemark);

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
            // Get current coordinates from localStorage or from input
            let lat = parseFloat(localStorage.getItem('smart_lat')) || 19.0760;
            let lon = parseFloat(localStorage.getItem('smart_lon')) || 72.8777;
            const map = L.map('smart-map').setView([lat, lon], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CartoDB'
            }).addTo(map);
            const marker = L.marker([lat, lon]).addTo(map);
            
            map.on('click', async (e) => {
                const { lat, lng } = e.latlng;
                // Update coordinate input field
                document.getElementById('smart-coord').value = `${lat.toFixed(8)}, ${lng.toFixed(8)}`;
                // Update localStorage temporarily? We'll update on blur or save.
                // Auto-fetch address
                const apiKey = document.getElementById('ctl00_BodyContentPlaceHolder_hdnKey')?.value || 'pk.c08d1307c75136fa2709e2374acd8cce';
                let address;
                try {
                    const response = await fetch(`https://us1.locationiq.com/v1/reverse?key=${apiKey}&lat=${lat}&lon=${lng}&format=json`);
                    const data = await response.json();
                    address = data.display_name || `${lat}, ${lng}`;
                } catch (err) {
                    address = `${lat}, ${lng}`;
                }
                document.getElementById('smart-addr').value = address;
                // Also store lat/lon in localStorage temporarily? Let's just keep in input until save.
                marker.setLatLng([lat, lng]);
                // Optionally close modal after click? No, let user close manually.
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
