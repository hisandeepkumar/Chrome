// Wait for page to fully load
window.addEventListener('load', () => {
  // Check if we are on the correct page (has camera and location elements)
  if (!document.getElementById('ctl00_BodyContentPlaceHolder_video')) {
    console.log('Not on attendance page');
    return;
  }

  // Create toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.innerText = '⚙️ Custom';
  toggleBtn.className = 'panel-toggle';
  document.body.appendChild(toggleBtn);

  // Create floating panel (hidden initially)
  const panel = document.createElement('div');
  panel.id = 'custom-att-panel';
  panel.innerHTML = `
    <h4>✏️ Custom Attendance Data</h4>
    <label>Latitude:</label>
    <input type="text" id="cust-lat" placeholder="19.0760">
    <label>Longitude:</label>
    <input type="text" id="cust-lon" placeholder="72.8777">
    <label>Address (hdnCity):</label>
    <input type="text" id="cust-addr" placeholder="Mumbai, India">
    <label>Remark (optional):</label>
    <textarea id="cust-remark" placeholder="Remark..."></textarea>
    <label>Custom Image:</label>
    <input type="file" id="cust-image" accept="image/jpeg,image/png">
    <button id="save-att-settings">💾 Apply & Enable Override</button>
  `;
  document.body.appendChild(panel);
  panel.style.display = 'none';

  // Toggle panel visibility
  toggleBtn.onclick = () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  };

  // Store custom values in localStorage
  let customLat = localStorage.getItem('custLat') || '19.0760';
  let customLon = localStorage.getItem('custLon') || '72.8777';
  let customAddr = localStorage.getItem('custAddr') || 'Mumbai Custom';
  let customRemark = localStorage.getItem('custRemark') || '';
  let customImageData = localStorage.getItem('custImageData') || null;

  // Load saved values into UI
  document.getElementById('cust-lat').value = customLat;
  document.getElementById('cust-lon').value = customLon;
  document.getElementById('cust-addr').value = customAddr;
  document.getElementById('cust-remark').value = customRemark;

  // Save button
  document.getElementById('save-att-settings').addEventListener('click', () => {
    customLat = document.getElementById('cust-lat').value;
    customLon = document.getElementById('cust-lon').value;
    customAddr = document.getElementById('cust-addr').value;
    customRemark = document.getElementById('cust-remark').value;

    localStorage.setItem('custLat', customLat);
    localStorage.setItem('custLon', customLon);
    localStorage.setItem('custAddr', customAddr);
    localStorage.setItem('custRemark', customRemark);

    // Handle image file
    const fileInput = document.getElementById('cust-image');
    if (fileInput.files.length > 0) {
      const reader = new FileReader();
      reader.onload = function(e) {
        customImageData = e.target.result; // base64 string
        localStorage.setItem('custImageData', customImageData);
        alert('Image saved! Will replace camera photo.');
      };
      reader.readAsDataURL(fileInput.files[0]);
    } else if (!customImageData) {
      alert('No image selected. Camera will be used (if not overridden).');
    } else {
      alert('Settings saved (image already in memory).');
    }

    // Now override the page functions
    overridePageFunctions();
    alert('Override active. Click Clock In on the page now.');
  });

  // Function to override geolocation, capturePhoto, and set remark
  function overridePageFunctions() {
    // 1. Override geolocation
    if (navigator.geolocation) {
      const originalGetCurrent = navigator.geolocation.getCurrentPosition;
      navigator.geolocation.getCurrentPosition = function(success, error, options) {
        console.log('Geolocation overridden by extension');
        const fakePosition = {
          coords: {
            latitude: parseFloat(customLat),
            longitude: parseFloat(customLon),
            accuracy: 10
          },
          timestamp: Date.now()
        };
        success(fakePosition);
        // Also directly set hidden fields (safety)
        const hdnLat = document.getElementById('ctl00_BodyContentPlaceHolder_hdnLat');
        const hdnLog = document.getElementById('ctl00_BodyContentPlaceHolder_hdnLog');
        const hdnCity = document.getElementById('ctl00_BodyContentPlaceHolder_hdnCity');
        if (hdnLat) hdnLat.value = customLat;
        if (hdnLog) hdnLog.value = customLon;
        if (hdnCity) hdnCity.value = customAddr;
        const lblHeader = document.getElementById('ctl00_BodyContentPlaceHolder_lblHeader');
        if (lblHeader) lblHeader.innerText = customAddr;
      };
    }

    // 2. Override capturePhoto function (defined in page)
    if (typeof window.capturePhoto !== 'undefined') {
      window.capturePhoto = function() {
        console.log('capturePhoto overridden by extension');
        if (customImageData) {
          return customImageData;
        } else {
          // Fallback: try to capture from video if available
          const video = document.getElementById('video');
          if (video && video.videoWidth > 0) {
            const canvas = document.getElementById('canvas');
            if (!canvas) return null;
            const ctx = canvas.getContext('2d');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            return canvas.toDataURL('image/jpeg', 0.7);
          }
          return null;
        }
      };
    } else {
      // If capturePhoto not defined, override the take_snapshot's call to capturePhoto
      // We'll override the entire take_snapshot function safely
      if (typeof window.take_snapshot === 'function') {
        const originalTakeSnapshot = window.take_snapshot;
        window.take_snapshot = function() {
          if (customImageData) {
            // Set hdnImage directly
            const hdnImage = document.getElementById('ctl00_BodyContentPlaceHolder_hdnImage');
            if (hdnImage) hdnImage.value = customImageData;
            const imgElem = document.getElementById('ctl00_BodyContentPlaceHolder_imgEmp');
            if (imgElem) {
              imgElem.src = customImageData;
              imgElem.style.display = 'block';
            }
            const videoElem = document.getElementById('video');
            if (videoElem) videoElem.style.display = 'none';
            // Call original but we will short-circuit? Better to let original run but we have replaced data
          }
          // Let original function run, but it will call capturePhoto which we've already overridden
          return originalTakeSnapshot.apply(this, arguments);
        };
      }
    }

    // 3. Override remark field value before submit
    const remarkField = document.getElementById('ctl00_BodyContentPlaceHolder_txtRemark');
    if (remarkField && customRemark !== '') {
      remarkField.value = customRemark;
    }

    // 4. Optional: Intercept the form submit to ensure hidden fields are set
    const form = document.getElementById('aspnetForm');
    if (form) {
      form.addEventListener('submit', function() {
        // Final check before submit
        const hdnLat = document.getElementById('ctl00_BodyContentPlaceHolder_hdnLat');
        const hdnLog = document.getElementById('ctl00_BodyContentPlaceHolder_hdnLog');
        const hdnCity = document.getElementById('ctl00_BodyContentPlaceHolder_hdnCity');
        const hdnImage = document.getElementById('ctl00_BodyContentPlaceHolder_hdnImage');
        if (hdnLat) hdnLat.value = customLat;
        if (hdnLog) hdnLog.value = customLon;
        if (hdnCity) hdnCity.value = customAddr;
        if (hdnImage && customImageData) hdnImage.value = customImageData;
        if (remarkField && customRemark) remarkField.value = customRemark;
      });
    }
  }

  // Auto-apply saved settings on page load (if any)
  if (localStorage.getItem('custLat')) {
    overridePageFunctions();
    console.log('Custom override applied from saved settings');
  }
});
