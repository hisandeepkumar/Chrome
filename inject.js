// This script runs in the page's main world (via extension injection)
// It overrides geolocation, success, capturePhoto, etc.

// Helper to get custom values from localStorage (set by UI panel)
function getCustomLat() { return localStorage.getItem('smart_lat') || '19.0760'; }
function getCustomLon() { return localStorage.getItem('smart_lon') || '72.8777'; }
function getCustomAddr() { return localStorage.getItem('smart_addr') || 'Mumbai Custom'; }
function getCustomRemark() { return localStorage.getItem('smart_remark') || ''; }
function getCustomImage() { return localStorage.getItem('smart_image') || null; }

// 1. Override geolocation
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition = function(success, error, options) {
        const lat = parseFloat(getCustomLat());
        const lon = parseFloat(getCustomLon());
        const fakePos = {
            coords: { latitude: lat, longitude: lon, accuracy: 10 },
            timestamp: Date.now()
        };
        console.log('[Inject] Fake location sent:', lat, lon);
        if (success) success(fakePos);
    };
    navigator.geolocation.watchPosition = function(success, error, options) {
        const lat = parseFloat(getCustomLat());
        const lon = parseFloat(getCustomLon());
        const fakePos = {
            coords: { latitude: lat, longitude: lon, accuracy: 10 },
            timestamp: Date.now()
        };
        if (success) success(fakePos);
        return 0;
    };
}

// 2. Override the page's 'success' function (which processes GPS result)
window.originalSuccess = window.success;
window.success = function(p) {
    console.log('[Inject] Intercepted success function');
    const fakeLat = parseFloat(getCustomLat());
    const fakeLon = parseFloat(getCustomLon());
    const fakeAddr = getCustomAddr();
    // Directly set hidden fields
    const hdnLog = document.getElementById('ctl00_BodyContentPlaceHolder_hdnLog');
    const hdnLat = document.getElementById('ctl00_BodyContentPlaceHolder_hdnLat');
    const hdnCity = document.getElementById('ctl00_BodyContentPlaceHolder_hdnCity');
    if (hdnLog) hdnLog.value = fakeLon;
    if (hdnLat) hdnLat.value = fakeLat;
    if (hdnCity) hdnCity.value = fakeAddr;
    const lblHeader = document.getElementById('ctl00_BodyContentPlaceHolder_lblHeader');
    if (lblHeader) lblHeader.innerText = fakeAddr;
    // Also call locationIQ/Google functions if needed (skip network calls, just set address)
    const keyOwner = document.getElementById('ctl00_BodyContentPlaceHolder_hdnKeyOwner');
    if (keyOwner && keyOwner.value === 'LocationIQ') {
        if (typeof window.getAddressByLocationIQ === 'function') {
            // Replace original with our fake address setter
            window.getAddressByLocationIQ = function(X,Y) {
                document.getElementById('ctl00_BodyContentPlaceHolder_hdnCity').value = fakeAddr;
                document.getElementById('ctl00_BodyContentPlaceHolder_lblHeader').innerHTML = fakeAddr;
            };
            window.getAddressByLocationIQ(fakeLon, fakeLat);
        }
    } else if (keyOwner && keyOwner.value === 'Google') {
        // similar override
    }
};

// 3. Override getAddressByLocationIQ to directly set fake address
window.getAddressByLocationIQ = function(X,Y) {
    const fakeAddr = getCustomAddr();
    const hdnCity = document.getElementById('ctl00_BodyContentPlaceHolder_hdnCity');
    const lblHeader = document.getElementById('ctl00_BodyContentPlaceHolder_lblHeader');
    if (hdnCity) hdnCity.value = fakeAddr;
    if (lblHeader) lblHeader.innerText = fakeAddr;
    console.log('[Inject] Fake address set:', fakeAddr);
};

// 4. Override capturePhoto
window.originalCapturePhoto = window.capturePhoto;
window.capturePhoto = function() {
    const customImg = getCustomImage();
    if (customImg) {
        console.log('[Inject] Using custom image');
        return customImg;
    }
    if (window.originalCapturePhoto) return window.originalCapturePhoto();
    return null;
};

// 5. Override take_snapshot
window.originalTakeSnapshot = window.take_snapshot;
window.take_snapshot = function() {
    const customImg = getCustomImage();
    if (customImg) {
        const hdnImage = document.getElementById('ctl00_BodyContentPlaceHolder_hdnImage');
        const imgEmp = document.getElementById('ctl00_BodyContentPlaceHolder_imgEmp');
        if (hdnImage) hdnImage.value = customImg;
        if (imgEmp) {
            imgEmp.src = customImg;
            imgEmp.style.display = 'block';
        }
        const video = document.getElementById('video');
        if (video) video.style.display = 'none';
        return true;
    }
    if (window.originalTakeSnapshot) return window.originalTakeSnapshot();
    return false;
};

// 6. Intercept form submit to enforce hidden fields
const originalSubmit = HTMLFormElement.prototype.submit;
HTMLFormElement.prototype.submit = function() {
    if (this.id === 'aspnetForm') {
        const hdnLat = document.getElementById('ctl00_BodyContentPlaceHolder_hdnLat');
        const hdnLog = document.getElementById('ctl00_BodyContentPlaceHolder_hdnLog');
        const hdnCity = document.getElementById('ctl00_BodyContentPlaceHolder_hdnCity');
        const hdnImage = document.getElementById('ctl00_BodyContentPlaceHolder_hdnImage');
        const remark = document.getElementById('ctl00_BodyContentPlaceHolder_txtRemark');
        if (hdnLat) hdnLat.value = getCustomLat();
        if (hdnLog) hdnLog.value = getCustomLon();
        if (hdnCity) hdnCity.value = getCustomAddr();
        if (hdnImage && getCustomImage()) hdnImage.value = getCustomImage();
        if (remark && getCustomRemark()) remark.value = getCustomRemark();
        console.log('[Inject] Form submit intercepted, fields set to custom values');
    }
    return originalSubmit.apply(this, arguments);
};
