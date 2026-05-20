// Function to override geolocation
function overrideGeolocation(customLat, customLng, customAddress) {
  if (!navigator.geolocation) return;
  
  // Override getCurrentPosition
  const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition;
  
  navigator.geolocation.getCurrentPosition = function(success, error, options) {
    const fakePosition = {
      coords: {
        latitude: parseFloat(customLat),
        longitude: parseFloat(customLng),
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        locality: customAddress
      },
      timestamp: Date.now()
    };
    
    console.log("Spine HR Override: Using custom location", fakePosition.coords);
    success(fakePosition);
  };
  
  // Override watchPosition
  navigator.geolocation.watchPosition = function(success, error, options) {
    const fakePosition = {
      coords: {
        latitude: parseFloat(customLat),
        longitude: parseFloat(customLng),
        accuracy: 10,
        locality: customAddress
      },
      timestamp: Date.now()
    };
    success(fakePosition);
    return 1;
  };
}

// Function to override date/time display
function overrideDateTime(customTime) {
  if (!customTime) return;
  
  // Override Date constructor for time display
  const OriginalDate = window.Date;
  
  function OverriddenDate(...args) {
    if (args.length === 0 && customTime) {
      // Parse custom time (format: "2024-01-15T10:30")
      const [datePart, timePart] = customTime.split('T');
      const [year, month, day] = datePart.split('-');
      const [hour, minute] = timePart.split(':');
      return new OriginalDate(year, month - 1, day, hour, minute);
    }
    return new OriginalDate(...args);
  }
  
  OverriddenDate.prototype = OriginalDate.prototype;
  OverriddenDate.now = function() {
    if (customTime) {
      const [datePart, timePart] = customTime.split('T');
      const [year, month, day] = datePart.split('-');
      const [hour, minute] = timePart.split(':');
      return new OriginalDate(year, month - 1, day, hour, minute).getTime();
    }
    return OriginalDate.now();
  };
  
  window.Date = OverriddenDate;
  
  // Override displayTime function
  window.displayTime = function() {
    if (customTime) {
      const [datePart, timePart] = customTime.split('T');
      const [year, month, day] = datePart.split('-');
      let [hour, minute, second] = timePart.split(':');
      second = second || '00';
      
      let displayHour = parseInt(hour) > 12 ? parseInt(hour) - 12 : parseInt(hour);
      displayHour = displayHour === 0 ? 12 : displayHour;
      const timeOfDay = parseInt(hour) >= 12 ? "PM" : "AM";
      
      const formattedTime = `${displayHour}:${minute}:${second} ${timeOfDay}`;
      
      const lblTimeNew = document.getElementById(parntId + 'lblMacDateTime');
      const lblTimeNew1 = document.getElementById(parntId + 'lblMacDateTime1');
      
      if (lblTimeNew) lblTimeNew.innerHTML = formattedTime;
      if (lblTimeNew1) lblTimeNew1.innerHTML = `You are using custom time (${formattedTime})`;
      
      document.getElementById(parntId + 'hdnMacdatetime').value = `${year}-${month}-${day} ${hour}:${minute}:${second} ${timeOfDay}`;
    }
  };
}

// Function to override getAddressByLocationIQ
function overrideLocationIQ(customLat, customLng, customAddress) {
  window.getAddressByLocationIQ = function(X, Y) {
    console.log("Spine HR Override: Using custom address", customAddress);
    document.getElementById(parntId + 'hdnCity').value = customAddress;
    document.getElementById(parntId + 'lblHeader').innerHTML = customAddress;
  };
  
  window.success = function(p) {
    try {
      document.getElementById(parntId + 'hdnLog').value = customLng;
      document.getElementById(parntId + 'hdnLat').value = customLat;
      document.getElementById(parntId + 'hdnCity').value = customAddress;
      document.getElementById(parntId + 'lblHeader').innerHTML = customAddress;
      
      if (document.getElementById(parntId + 'hdnKeyOwner').value === "LocationIQ") {
        initMapForLocationIQ();
        getAddressByLocationIQ(customLng, customLat);
      }
    } catch (ex) {
      console.error(ex);
    }
  };
}

// Main initialization
async function initializeOverride() {
  const settings = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "getSettings" }, resolve);
  });
  
  if (!settings || !settings.enabled) {
    console.log("Spine HR Override: Disabled");
    return;
  }
  
  console.log("Spine HR Override: Enabled with settings", settings);
  
  if (settings.customLat && settings.customLng) {
    overrideGeolocation(settings.customLat, settings.customLng, settings.customAddress || "Custom Location");
    overrideLocationIQ(settings.customLat, settings.customLng, settings.customAddress || "Custom Location");
  }
  
  if (settings.customTime) {
    overrideDateTime(settings.customTime);
  }
  
  // Re-apply after page fully loads
  window.addEventListener('load', () => {
    if (settings.customLat && settings.customLng) {
      if (document.getElementById(parntId + 'hdnLog')) {
        document.getElementById(parntId + 'hdnLog').value = settings.customLng;
        document.getElementById(parntId + 'hdnLat').value = settings.customLat;
        document.getElementById(parntId + 'hdnCity').value = settings.customAddress || "Custom Location";
        document.getElementById(parntId + 'lblHeader').innerHTML = settings.customAddress || "Custom Location";
      }
    }
  });
}

// Wait for parntId to be defined
let checkInterval = setInterval(() => {
  if (typeof parntId !== 'undefined') {
    clearInterval(checkInterval);
    initializeOverride();
  }
}, 100);
