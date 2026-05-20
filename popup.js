document.addEventListener('DOMContentLoaded', () => {
  const enableToggle = document.getElementById('enableToggle');
  const controls = document.getElementById('controls');
  const latitude = document.getElementById('latitude');
  const longitude = document.getElementById('longitude');
  const address = document.getElementById('address');
  const datetime = document.getElementById('datetime');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');
  
  // Load saved settings
  chrome.runtime.sendMessage({ type: "getSettings" }, (settings) => {
    if (settings) {
      enableToggle.checked = settings.enabled || false;
      updateControlsVisibility();
      
      if (settings.customLat) latitude.value = settings.customLat;
      if (settings.customLng) longitude.value = settings.customLng;
      if (settings.customAddress) address.value = settings.customAddress;
      if (settings.customTime) datetime.value = settings.customTime;
    }
  });
  
  function updateControlsVisibility() {
    if (enableToggle.checked) {
      controls.style.opacity = '1';
      controls.style.pointerEvents = 'auto';
    } else {
      controls.style.opacity = '0.5';
      controls.style.pointerEvents = 'none';
    }
  }
  
  enableToggle.addEventListener('change', updateControlsVisibility);
  
  saveBtn.addEventListener('click', () => {
    const settings = {
      enabled: enableToggle.checked,
      customLat: latitude.value,
      customLng: longitude.value,
      customAddress: address.value || "Custom Location",
      customTime: datetime.value,
    };
    
    chrome.runtime.sendMessage({ type: "saveSettings", ...settings }, (response) => {
      if (response && response.success) {
        statusDiv.textContent = "✓ Settings saved! Refresh the attendance page.";
        statusDiv.style.color = "#28a745";
        setTimeout(() => {
          statusDiv.textContent = "";
        }, 3000);
      } else {
        statusDiv.textContent = "✗ Error saving settings";
        statusDiv.style.color = "#dc3545";
      }
    });
  });
});
