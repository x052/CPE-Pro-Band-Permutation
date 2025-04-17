// Simplified monitoring script for router band checking
export const monitoringScript = `
// Basic functions
function extractXML(tag, data) {
  try {
    if (!data) return "";
    if (typeof data === 'object') {
      const element = data.getElementsByTagName(tag)[0];
      return element ? element.innerHTML : "";
    }
    if (typeof data === 'string') {
      const parts = data.split("<" + tag + ">");
      if (parts.length < 2) return "";
      return parts[1].split("</" + tag + ">")[0];
    }
    return "";
  } catch (e) {
    console.error("Error extracting XML:", e);
    return "";
  }
}

function getBandType(data) {
  if (!data) return "Unknown";
  if (data === '7E2880800D5' || data === '20800800C5' || data === '20000800C5') {
    return "AUTO";
  }
  
  let result = "";
  try {
    const bands = {
      0: "B1", 2: "B3", 6: "B7", 7: "B8", 19: "B20", 
      27: "B28", 31: "B32", 33: "B34", 37: "B38", 
      38: "B39", 39: "B40", 40: "B41", 41: "B42", 42: "B43"
    };
    
    const num = parseInt(data, 16);
    if (isNaN(num)) return "Invalid";
    
    Object.keys(bands).forEach(bit => {
      if ((num & (1 << parseInt(bit))) !== 0) {
        result += bands[bit] + " ";
      }
    });
    
    return result.trim() || "None";
  } catch (e) {
    console.error("Error parsing band data:", e);
    return "Error";
  }
}

function updateBandInfo() {
  let token = "";
  
  // Get token
  $.ajax({
    type: "GET",
    async: true,
    url: "/html/home.html",
    dataType: "html",
    success: function(data) {
      const tokenData = data.split('name="csrf_token" content="');
      if (tokenData.length > 1) {
        token = tokenData[1].split('"')[0];
        fetchSignalData(token);
        fetchBandData(token);
      } else {
        console.error("Could not find token");
      }
    },
    error: function(xhr, status, error) {
      console.error("Token error:", error);
    }
  });
  
  // Get provider data
  $.ajax({
    type: "GET",
    async: true,
    url: "/api/net/current-plmn",
    dataType: "xml",
    success: function(data) {
      const provider = extractXML("FullName", data);
      const plmn = extractXML("Numeric", data);
      $("#provider").text(provider);
      $("#plmn").text(plmn);
    },
    error: function(xhr, status, error) {
      console.error("Provider error:", error);
    }
  });
}

function fetchSignalData(token) {
  $.ajax({
    type: "GET",
    async: true,
    url: "/api/device/signal",
    dataType: "xml",
    headers: {"__RequestVerificationToken": token},
    success: function(data) {
      const fields = {
        "rsrp": "rsrp", "rsrq": "rsrq", "sinr": "sinr",
        "band": "band", "cell_id": "cell_id"
      };
      
      // Update fields
      Object.keys(fields).forEach(id => {
        const value = extractXML(fields[id], data);
        $("#" + id).text(value);
      });
      
      // Calculate ENB ID
      try {
        const cellId = extractXML("cell_id", data);
        if (cellId) {
          const hex = Number(cellId).toString(16);
          const hex2 = hex.substring(0, hex.length - 2);
          const enbId = parseInt(hex2, 16).toString();
          $("#enbid").text(enbId);
        }
      } catch (e) {
        console.error("Error calculating ENB ID:", e);
      }
    },
    error: function(xhr, status, error) {
      console.error("Signal error:", error);
    }
  });
}

function fetchBandData(token) {
  $.ajax({
    type: "GET",
    async: true,
    url: "/api/net/net-mode",
    dataType: "xml",
    headers: {"__RequestVerificationToken": token},
    success: function(data) {
      const lteband = extractXML("LTEBand", data);
      $("#allowed").text(getBandType(lteband));
    },
    error: function(xhr, status, error) {
      console.error("Band error:", error);
    }
  });
}

function setBand(band) {
  if (!band) {
    band = prompt("Please enter band (e.g., 1+3+20) or 'AUTO':", "AUTO");
    if (!band) return;
  }
  
  let lteValue;
  if (band.toUpperCase() === "AUTO") {
    lteValue = "7FFFFFFFFFFFFFFF";
  } else {
    try {
      let value = 0;
      band.split("+").forEach(b => {
        const bandNum = parseInt(b);
        if (!isNaN(bandNum)) {
          value += Math.pow(2, bandNum - 1);
        }
      });
      lteValue = value.toString(16);
    } catch (e) {
      console.error("Error calculating band value:", e);
      return;
    }
  }
  
  $.ajax({
    type: "GET",
    async: true,
    url: "/html/home.html",
    dataType: "html",
    success: function(data) {
      const tokenParts = data.split('name="csrf_token" content="');
      if (tokenParts.length < 2) {
        console.error("Could not find token");
        return;
      }
      
      const token = tokenParts[1].split('"')[0];
      
      setTimeout(function() {
        $.ajax({
          type: "POST",
          async: true,
          url: "/api/net/net-mode",
          headers: {"__RequestVerificationToken": token},
          contentType: "application/xml",
          data: '<request><NetworkMode>00</NetworkMode><NetworkBand>3FFFFFFF</NetworkBand><LTEBand>' + lteValue + '</LTEBand></request>',
          success: function() {
            $("#band").html('<span style="color:green">OK</span>');
            console.log("Band set to:", band);
          },
          error: function(xhr, status, error) {
            console.error("Error setting band:", error);
          }
        });
      }, 1000);
    },
    error: function(xhr, status, error) {
      console.error("Token error:", error);
    }
  });
}

// UI Setup
function createMonitoringUI() {
  const style = document.createElement("style");
  style.textContent = \`
    .monitor-container { margin: 15px; font-family: Arial, sans-serif; }
    .monitor-header { background: #f0f0f0; padding: 10px; border-radius: 5px; margin-bottom: 10px; }
    .monitor-section { background: white; border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; border-radius: 5px; }
    .monitor-title { font-weight: bold; margin-bottom: 5px; }
    .monitor-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .monitor-item { padding: 5px; }
    .monitor-label { font-weight: bold; display: block; }
    .monitor-value { color: #e74c3c; }
    .monitor-button { background: #3498db; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; margin-right: 5px; }
    .monitor-button:hover { background: #2980b9; }
  \`;
  document.head.appendChild(style);
  
  const container = document.createElement("div");
  container.className = "monitor-container";
  container.innerHTML = \`
    <div class="monitor-header">
      <div class="monitor-title">Router Band Monitor</div>
      <button class="monitor-button" id="bandButton">Change Band</button>
    </div>
    
    <div class="monitor-section">
      <div class="monitor-title">Signal Information</div>
      <div class="monitor-grid">
        <div class="monitor-item">
          <span class="monitor-label">RSRP:</span>
          <span class="monitor-value" id="rsrp">-</span>
        </div>
        <div class="monitor-item">
          <span class="monitor-label">RSRQ:</span>
          <span class="monitor-value" id="rsrq">-</span>
        </div>
        <div class="monitor-item">
          <span class="monitor-label">SINR:</span>
          <span class="monitor-value" id="sinr">-</span>
        </div>
      </div>
    </div>
    
    <div class="monitor-section">
      <div class="monitor-title">Cell Information</div>
      <div class="monitor-grid">
        <div class="monitor-item">
          <span class="monitor-label">Band:</span>
          <span class="monitor-value" id="band">-</span>
        </div>
        <div class="monitor-item">
          <span class="monitor-label">Allowed Bands:</span>
          <span class="monitor-value" id="allowed">-</span>
        </div>
        <div class="monitor-item">
          <span class="monitor-label">ENB ID:</span>
          <span class="monitor-value" id="enbid">-</span>
        </div>
        <div class="monitor-item">
          <span class="monitor-label">Cell ID:</span>
          <span class="monitor-value" id="cell_id">-</span>
        </div>
        <div class="monitor-item">
          <span class="monitor-label">Provider:</span>
          <span class="monitor-value" id="provider">-</span>
        </div>
        <div class="monitor-item">
          <span class="monitor-label">PLMN:</span>
          <span class="monitor-value" id="plmn">-</span>
        </div>
      </div>
    </div>
  \`;
  
  document.body.prepend(container);
  
  // Set up button click handler
  document.getElementById("bandButton").addEventListener("click", function() {
    setBand();
  });
  
  console.log("Monitoring UI created");
}

// Initialize monitoring
function initializeMonitoring() {
  try {
    console.log("Setting up monitoring...");
    createMonitoringUI();
    
    // Start regular updates
    updateBandInfo();
    setInterval(updateBandInfo, 3000);
    
    console.log("Monitoring started successfully");
  } catch (e) {
    console.error("Error initializing monitoring:", e);
  }
}

// Export functions for external access
window.setBand = setBand;
window.addButtons = initializeMonitoring;
window.ltebandselection = setBand;

// Run initialization
console.log("Monitoring script loaded successfully");
`;
