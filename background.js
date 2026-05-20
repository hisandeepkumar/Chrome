chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "saveSettings") {
    chrome.storage.local.set({
      customLat: request.lat,
      customLng: request.lng,
      customAddress: request.address,
      customTime: request.time,
      enabled: request.enabled
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.type === "getSettings") {
    chrome.storage.local.get([
      'customLat', 'customLng', 'customAddress', 'customTime', 'enabled'
    ], (result) => {
      sendResponse(result);
    });
    return true;
  }
});
