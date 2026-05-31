// Content script – injects inject.js and creates UI panel with Google Maps picker

// Inject the external script file
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(script);

// Helper: parse coordinate string
function parseCoordinates(coordStr) {
    let trimmed = coordStr.trim();
    let parts = trimmed.split(/[\s,]+/);
    if (parts.length >= 2) {
        let lat = parseFloat(parts[0]);
        let lon = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
    }
    return null;
}

// Create UI Panel
function createUI() {
    if (document.getElementById('smart-att-panel')) return;

    // Panel HTML
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'smart-att-toggle';
    toggleBtn.innerText = '⚙️ Custom Data';
    document.body.appendChild(toggleBtn);

    const panel = document.createElement('div');
    panel.id = 'smart-att-panel';
    panel.innerHTML = `
        <h4>✏️ Override Settings</h4>
        <label>Google Maps API Key:</label>
        <input type="text" id="smart-gmaps-key" placeholder="Paste your Google Maps API key" style="background:#fff; color:#000;">
        <label>Coordinates (lat, lon):</label>
        <input type="text" id="smart-coord" placeholder="e.g., 26.896586768921352, 75.71579255958834">
        <label>Address:</label>
        <input type="text" id="smart-addr" placeholder="Auto-filled from coordinates">
        <label>Remark:</label>
        <textarea id="smart-remark" placeholder="Remark..."></textarea>
        <label>Custom Image (JPEG/PNG):</label>
        <input type="file" id="smart-image" accept="image/jpeg,image/png">
        <button id="smart-pick-map" style="background:#3498db; margin-top:5px;">🗺️ Pick from Google Map</button>
        <button id="smart-save">💾 Apply Settings</button>
    `;
    document.body.appendChild(panel);
    panel.style.display = 'none';

    toggleBtn.onclick = () => {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };

    // Load saved values
    const savedKey = localStorage.getItem('smart_gmaps_key') || '';
    document.getElementById('smart-gmaps-key').value = savedKey;
    document.getElementById('smart-coord').value = localStorage.getItem('smart_coord') || '19.0760, 72.8777';
    document.getElementById('smart-addr').value = localStorage.getItem('smart_addr') || 'Mumbai, India';
    document.getElementById('smart-remark').value = localStorage.getItem('smart_remark') || '';

    // Save button
    document.getElementById('smart-save').addEventListener('click', function() {
        const key = document.getElementById('smart-gmaps-key').value;
        localStorage.setItem('smart_gmaps_key', key);
        const coordStr = document.getElementById('smart-coord').value;
        const parsed = parseCoordinates(coordStr);
        if (parsed) {
            localStorage.setItem('smart_lat', parsed.lat);
            localStorage.setItem('smart_lon', parsed.lon);
            localStorage.setItem('smart_coord', coordStr);
        }
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
            alert('✅ Settings saved.');
        }
    });

    // ---------- Google Maps Modal ----------
    const modal = document.createElement('div');
    modal.id = 'smart-map-modal';
    modal.style.cssText = `
        display: none; position: fixed; top:0; left:0; width:100%; height:100%;
        background: rgba(0,0,0,0.8); z-index: 10000000; justify-content: center; align-items: center;
    `;
    modal.innerHTML = `
        <div style="background: white; width: 90%; max-width: 800px; height: 80%; border-radius: 12px; display: flex; flex-direction: column;">
            <div style="padding: 10px; background: #2c3e50; color: white; border-radius: 12px 12px 0 0; display: flex; justify-content: space-between;">
                <span>Select location on Google Map</span>
                <button id="smart-modal-close" style="background:none; border:none; color:white; font-size:20px; cursor:pointer;">&times;</button>
            </div>
            <div id="smart-map-container" style="flex:1; position:relative;"></div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('smart-modal-close').onclick = () => modal.style.display = 'none';
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

    // Google Maps load function
    function loadGoogleMap(apiKey) {
        if (window.google && window.google.maps) {
            initMap();
            return;
        }
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initGoogleMap`;
        script.async = true;
        script.defer = true;
        window.initGoogleMap = initMap;
        document.head.appendChild(script);
    }

    function initMap() {
        const container = document.getElementById('smart-map-container');
        if (!container) return;
        let lat = parseFloat(localStorage.getItem('smart_lat')) || 19.0760;
        let lng = parseFloat(localStorage.getItem('smart_lon')) || 72.8777;
        const map = new google.maps.Map(container, {
            center: { lat, lng },
            zoom: 14,
            streetViewControl: false,
            mapTypeControl: false
        });
        const marker = new google.maps.Marker({ position: { lat, lng }, map: map, draggable: true });
        
        // Click on map
        map.addListener('click', (e) => {
            const latLng = e.latLng;
            const latVal = latLng.lat();
            const lngVal = latLng.lng();
            document.getElementById('smart-coord').value = `${latVal.toFixed(8)}, ${lngVal.toFixed(8)}`;
            marker.setPosition(latLng);
            // Reverse geocode
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ location: latLng }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    document.getElementById('smart-addr').value = results[0].formatted_address;
                } else {
                    document.getElementById('smart-addr').value = `${latVal}, ${lngVal}`;
                }
            });
        });
        // Drag marker
        marker.addListener('dragend', (e) => {
            const latVal = e.latLng.lat();
            const lngVal = e.latLng.lng();
            document.getElementById('smart-coord').value = `${latVal.toFixed(8)}, ${lngVal.toFixed(8)}`;
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ location: { lat: latVal, lng: lngVal } }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    document.getElementById('smart-addr').value = results[0].formatted_address;
                } else {
                    document.getElementById('smart-addr').value = `${latVal}, ${lngVal}`;
                }
            });
        });
        window._currentMap = map;
    }

    // Pick from map button
    document.getElementById('smart-pick-map').addEventListener('click', () => {
        const apiKey = document.getElementById('smart-gmaps-key').value;
        if (!apiKey) {
            alert('Please enter your Google Maps API key in the panel first.\n\nGet one from Google Cloud Console (enable Maps JavaScript API).');
            return;
        }
        modal.style.display = 'flex';
        loadGoogleMap(apiKey);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUI);
} else {
    createUI();
}
