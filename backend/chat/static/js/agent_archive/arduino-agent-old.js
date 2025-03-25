// Global variables
let daemon = null;
let agentAvailable = false;
let detectedSerialPorts = [];
let currentCompiledBinary = null;
let currentBinaryInfo = null;
let compileUploadInProgress = false;
let currentCodeBlock = null;
let webSerialUploader = null;

// Block duplicate script loading (only if needed)
(function () {
  // Track if our script has already been loaded
  window._arduinoAgentLoaded = true;

  // Check if script is being loaded again
  const originalCreateElement = document.createElement;
  document.createElement = function (tagName) {
    const element = originalCreateElement.call(document, tagName);
    if (tagName.toLowerCase() === "script") {
      const originalSetAttribute = element.setAttribute;
      element.setAttribute = function (name, value) {
        if (
          name === "src" &&
          (value.includes("arduino-agent-integration.js") ||
            value.includes("arduino-upload.js"))
        ) {
          console.log(`Prevented loading of ${value}`);
          return element;
        }
        return originalSetAttribute.call(this, name, value);
      };
    }
    return element;
  };
})();

// Initialize Arduino Create Agent when the page loads
document.addEventListener("DOMContentLoaded", function () {
  console.log("Initializing in browser-compatible mode...");

  // Skip trying to load the problematic library and go directly to simplified browser mode
  initializeWithoutLibrary();

  // Initialize the rest of the UI
  addArduinoButtons();
  setupBoardFQBNSync();
  webSerialUploader = new WebSerialUploader();
  setupCodeBlockObserver();

  // Add refresh ports button with a delay
  setTimeout(addRefreshPortsButton, 1000);
});

// Initialize without the external library (browser-compatible mode)
function initializeWithoutLibrary() {
  console.log(
    "Initializing in browser-compatible mode without Arduino Create Agent library"
  );

  // Poll for agent availability via direct API check
  checkForArduinoAgent();

  function checkForArduinoAgent() {
    // Try to detect agent by checking if its server is responding
    // Use a tiny timeout to avoid long hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    fetch("http://localhost:8991/", {
      signal: controller.signal,
      mode: "cors",
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    })
      .then((response) => {
        clearTimeout(timeoutId);
        if (response.ok) {
          console.log("Detected Arduino Create Agent via local server check");
          setupBrowserAgentInterface();
          return;
        }
        throw new Error("Agent not available");
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        console.log("Arduino Create Agent not detected:", error.message);

        // Also try alternative port
        fetch("http://localhost:8990/")
          .then((response) => {
            if (response.ok) {
              console.log("Detected Arduino Create Agent on alternative port");
              setupBrowserAgentInterface(8990);
              return;
            }
            throw new Error("Agent not available on alternative port");
          })
          .catch((altError) => {
            agentAvailable = false;
            updateAgentUI(false);

            // Continue checking every 30 seconds
            setTimeout(checkForArduinoAgent, 30000);
          });
      });
  }

  // Create a browser-compatible agent interface
  function setupBrowserAgentInterface(port = 8991) {
    console.log(`Setting up browser agent interface on port ${port}`);

    // Create a browser-compatible interface for the Arduino Create Agent
    window.arduinoCreateAgent = {
      // Function to handle communication with the Arduino Create Agent
      _sendCommand: async function (endpoint, data = {}) {
        try {
          const response = await fetch(`http://localhost:${port}${endpoint}`, {
            method: data ? "POST" : "GET",
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: data ? JSON.stringify(data) : undefined,
          });

          if (!response.ok) {
            throw new Error(
              `Server responded with ${response.status}: ${response.statusText}`
            );
          }

          return await response.json();
        } catch (error) {
          console.error(`Error in _sendCommand to ${endpoint}:`, error);
          throw error;
        }
      },

      // Upload a sketch to the board
      uploadSketch: async function (options) {
        try {
          const uploadData = {
            board: options.board,
            port: options.port,
            filename: options.filename,
            data: options.hex,
          };

          if (options.onProgress) options.onProgress("Starting upload...");

          const result = await this._sendCommand("/upload", uploadData);

          if (result.success) {
            if (options.onSuccess)
              options.onSuccess("Upload completed successfully");
            return result;
          } else {
            const errorMsg = result.error || "Unknown upload error";
            if (options.onError) options.onError(errorMsg);
            throw new Error(errorMsg);
          }
        } catch (error) {
          if (options.onError) options.onError(error.message);
          throw error;
        }
      },

      // List available boards
      listBoards: async function () {
        try {
          const result = await this._sendCommand("/list");
          detectedSerialPorts = result["Serial Ports"] || result.serial || [];
          return result;
        } catch (error) {
          console.error("Error listing boards:", error);
          return { "Serial Ports": [] };
        }
      },

      // Notify about agent detection
      onAgentFound: function (callback) {
        // Call the callback immediately with true since we're already connected
        callback(true);

        // Set up a periodic check to ensure the agent is still available
        setInterval(() => {
          this._sendCommand("/")
            .then(() => {
              if (!agentAvailable) {
                agentAvailable = true;
                callback(true);
              }
            })
            .catch(() => {
              if (agentAvailable) {
                agentAvailable = false;
                callback(false);
              }
            });
        }, 10000); // Check every 10 seconds
      },
    };

    // Set agent as available
    agentAvailable = true;
    updateAgentUI(true);

    // Get initial list of ports
    refreshSerialPorts();
  }
}

// Update UI based on agent status
function updateAgentUI(status) {
  console.log("Updating agent UI:", status);

  // Create or update status indicator
  let agentStatusIndicator = document.getElementById("agent-status-indicator");
  if (!agentStatusIndicator) {
    agentStatusIndicator = document.createElement("div");
    agentStatusIndicator.id = "agent-status-indicator";
    agentStatusIndicator.className = "agent-status";

    // Add to the header
    const headerNav = document.querySelector(".header-nav");
    if (headerNav) {
      headerNav.prepend(agentStatusIndicator);
    } else {
      // Fallback - add to body if header not found
      document.body.appendChild(agentStatusIndicator);
      // Add positioning styles
      agentStatusIndicator.style.position = "fixed";
      agentStatusIndicator.style.top = "10px";
      agentStatusIndicator.style.right = "10px";
      agentStatusIndicator.style.zIndex = "9999";
    }
  }

  // Add styles if not already added
  if (!document.getElementById("arduino-agent-styles")) {
    const style = document.createElement("style");
    style.id = "arduino-agent-styles";
    style.textContent = `
      .agent-status {
        display: flex;
        align-items: center;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 14px;
        font-family: sans-serif;
      }
      
      .agent-status-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        margin-right: 8px;
      }
      
      .agent-status-dot.connected {
        background-color: #4CAF50;
        box-shadow: 0 0 5px #4CAF50;
      }
      
      .agent-status-dot.disconnected {
        background-color: #F44336;
        box-shadow: 0 0 5px #F44336;
      }
      
      .agent-status.connected {
        background-color: rgba(76, 175, 80, 0.1);
        color: #4CAF50;
      }
      
      .agent-status.disconnected {
        background-color: rgba(244, 67, 54, 0.1);
        color: #F44336;
      }
      
      .arduino-buttons {
        display: flex;
        gap: 8px;
        margin-top: 10px;
        align-items: center;
      }
      
      .arduino-compile-button,
      .arduino-upload-button,
      .arduino-download-button {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 10px;
        border-radius: 4px;
        border: 1px solid #ccc;
        background-color: #f8f9fa;
        cursor: pointer;
        font-size: 12px;
      }
      
      .arduino-compile-button:hover,
      .arduino-upload-button:hover,
      .arduino-download-button:hover {
        background-color: #e9ecef;
      }
      
      .arduino-status {
        margin-left: 10px;
        font-size: 12px;
      }
      
      .arduino-status.compiling {
        color: #007bff;
      }
      
      .arduino-status.compiled {
        color: #28a745;
      }
      
      .arduino-status.error {
        color: #dc3545;
      }
      
      .arduino-status.uploading {
        color: #fd7e14;
      }
      
      .uploading-indicator {
        animation: blink 1s infinite;
      }
      
      @keyframes blink {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
      
      .refresh-ports-button {
        background-color: transparent;
        border: 1px solid #3d3d4d;
        border-radius: 4px;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #b8b8c0;
        transition: all 0.2s ease;
        margin-left: 5px;
      }
      
      .refresh-ports-button:hover {
        background-color: rgba(108, 127, 232, 0.1);
        color: #6c7fe8;
      }
      
      .refresh-ports-button.refreshing {
        animation: spin 1s linear infinite;
      }
      
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Update indicator based on status
  if (status) {
    agentStatusIndicator.innerHTML = `
      <span class="agent-status-dot connected"></span>
      <span class="agent-status-text">Arduino Agent Ready</span>
    `;
    agentStatusIndicator.classList.add("connected");
    agentStatusIndicator.classList.remove("disconnected");
  } else {
    agentStatusIndicator.innerHTML = `
      <span class="agent-status-dot disconnected"></span>
      <span class="agent-status-text">Agent Not Found</span>
    `;
    agentStatusIndicator.classList.add("disconnected");
    agentStatusIndicator.classList.remove("connected");
  }

  // Update upload buttons
  updateAllUploadButtons();
}

// Update all upload buttons based on agent status
function updateAllUploadButtons() {
  const uploadButtons = document.querySelectorAll(".arduino-upload-button");

  uploadButtons.forEach((button) => {
    if (agentAvailable) {
      button.classList.add("agent-available");
      button.classList.remove("agent-unavailable");
      button.title = "Upload sketch to board via Arduino Create Agent";
    } else {
      button.classList.add("agent-unavailable");
      button.classList.remove("agent-available");
      button.title =
        "Arduino Create Agent not detected - download binary instead";
    }
  });
}

// Update status during upload
function updateUploadStatus(status) {
  if (!currentCodeBlock) return;

  if (status && status.inProgress) {
    updateCompileStatus(
      "uploading",
      `Uploading: ${status.progress || "0"}%`,
      currentCodeBlock
    );
  } else if (status && !status.inProgress) {
    if (status.error) {
      updateCompileStatus(
        "error",
        `Upload failed: ${status.error}`,
        currentCodeBlock
      );
    } else {
      updateCompileStatus(
        "success",
        "Upload completed successfully!",
        currentCodeBlock
      );
    }

    // Re-enable buttons
    enableCodeBlockButtons(currentCodeBlock);

    // Reset flag
    compileUploadInProgress = false;
  }
}

// Enable all buttons in a code block
function enableCodeBlockButtons(codeBlock) {
  const compileButton = codeBlock.querySelector(".arduino-compile-button");
  const uploadButton = codeBlock.querySelector(".arduino-upload-button");
  const downloadButton = codeBlock.querySelector(".arduino-download-button");

  if (compileButton) compileButton.disabled = false;
  if (uploadButton) uploadButton.disabled = false;
  if (downloadButton) downloadButton.disabled = false;
}

// Upload via Arduino Create Agent
async function uploadWithAgent(codeBlock) {
  // Check if we have compiled binary
  if (!currentBinaryInfo) {
    alert("Please compile the code first.");
    return;
  }

  // Check if upload is already in progress
  if (compileUploadInProgress) {
    alert("A compilation or upload is already in progress. Please wait.");
    return;
  }

  // For legacy agent
  if (window.arduinoCreateAgent && agentAvailable) {
    uploadWithBrowserAgent(codeBlock);
  }
  // No agent available
  else {
    showAgentRequiredDialog(codeBlock);
  }
}

// Upload using the browser-compatible agent implementation
async function uploadWithBrowserAgent(codeBlock) {
  if (!window.arduinoCreateAgent || !agentAvailable) {
    showAgentRequiredDialog(codeBlock);
    return;
  }

  // Set the upload in progress flag
  compileUploadInProgress = true;
  currentCodeBlock = codeBlock;

  // Update status
  updateCompileStatus(
    "uploading",
    "Preparing to upload via Arduino Create Agent...",
    codeBlock
  );

  // Disable buttons during upload
  const compileButton = codeBlock.querySelector(".arduino-compile-button");
  const uploadButton = codeBlock.querySelector(".arduino-upload-button");
  const downloadButton = codeBlock.querySelector(".arduino-download-button");

  if (compileButton) compileButton.disabled = true;
  if (uploadButton) uploadButton.disabled = true;
  if (downloadButton) downloadButton.disabled = true;

  // Get board FQBN
  const boardFQBN = document.getElementById("board-fqbn");
  const boardValue = boardFQBN ? boardFQBN.value : "";

  if (!boardValue) {
    updateCompileStatus(
      "error",
      "No board selected. Please select a board first.",
      codeBlock
    );
    enableCodeBlockButtons(codeBlock);
    compileUploadInProgress = false;
    return;
  }

  try {
    // Check if we need to refresh ports
    if (detectedSerialPorts.length === 0) {
      await refreshSerialPorts();
    }

    if (detectedSerialPorts.length === 0) {
      throw new Error("No Arduino boards detected");
    }

    // Choose a port
    let selectedPort = null;

    if (detectedSerialPorts.length === 1) {
      selectedPort =
        detectedSerialPorts[0].Name || detectedSerialPorts[0].address;
    } else {
      // Show a dialog to select the port
      const portOptions = detectedSerialPorts
        .map((port) => {
          const name = port.Name || port.address || JSON.stringify(port);
          const details =
            port.VendorID || port.ProductID
              ? ` (${port.VendorID || ""}:${port.ProductID || ""})`
              : "";
          return `${name}${details}`;
        })
        .join("\n");

      const portInput = prompt(
        `Multiple ports detected. Please enter the port name to use:\n\n${portOptions}`,
        detectedSerialPorts[0].Name || detectedSerialPorts[0].address
      );

      if (!portInput) {
        throw new Error("Upload cancelled");
      }

      selectedPort = portInput.trim();

      // Extract port name if full description was copied
      if (selectedPort.includes(" (")) {
        selectedPort = selectedPort.split(" (")[0].trim();
      }
    }

    // Prepare upload options
    const uploadOptions = {
      port: selectedPort,
      board: boardValue,
      filename: `sketch_${new Date().getTime()}.hex`,
      hex: currentBinaryInfo.binary, // This should be base64 encoded binary from compile step
      onProgress: (message) => {
        updateCompileStatus("uploading", message, codeBlock);
      },
      onSuccess: (message) => {
        updateCompileStatus(
          "success",
          message || "Upload completed successfully!",
          codeBlock
        );
        // Reset button states and flags
        enableCodeBlockButtons(codeBlock);
        compileUploadInProgress = false;
      },
      onError: (message) => {
        updateCompileStatus("error", `Upload failed: ${message}`, codeBlock);
        // Reset button states and flags
        enableCodeBlockButtons(codeBlock);
        compileUploadInProgress = false;
      },
    };

    // Upload using the agent
    await window.arduinoCreateAgent.uploadSketch(uploadOptions);
  } catch (error) {
    updateCompileStatus("error", `Upload failed: ${error.message}`, codeBlock);
    // Reset button states and flags
    enableCodeBlockButtons(codeBlock);
    compileUploadInProgress = false;
  }
}

/**
 * Get available serial ports from Arduino Create Agent
 */
async function refreshSerialPorts() {
  // Check if agent is available
  if (!agentAvailable || !window.arduinoCreateAgent) {
    console.log("Cannot refresh ports - agent not available");
    return [];
  }

  try {
    console.log("Refreshing serial ports via arduinoCreateAgent...");
    const boardList = await window.arduinoCreateAgent.listBoards();
    console.log("Board list from agent:", boardList);

    // Clear existing ports
    detectedSerialPorts = [];

    // Handle different response formats from different agent versions
    if (boardList) {
      // Format 1: { "Serial Ports": [{...}, {...}] }
      if (
        boardList["Serial Ports"] &&
        Array.isArray(boardList["Serial Ports"])
      ) {
        detectedSerialPorts = boardList["Serial Ports"];
        console.log(
          `Found ${detectedSerialPorts.length} serial ports (format 1)`
        );
      }
      // Format 2: { "serial": [{...}, {...}] }
      else if (boardList.serial && Array.isArray(boardList.serial)) {
        detectedSerialPorts = boardList.serial;
        console.log(
          `Found ${detectedSerialPorts.length} serial ports (format 2)`
        );
      }
      // Format 3: Direct array
      else if (
        Array.isArray(boardList) &&
        boardList.length > 0 &&
        (boardList[0].Name || boardList[0].address)
      ) {
        detectedSerialPorts = boardList;
        console.log(
          `Found ${detectedSerialPorts.length} serial ports (format 3)`
        );
      }
      // Format 4: Single port object
      else if (
        (boardList.Name || boardList.address) &&
        typeof (boardList.Name || boardList.address) === "string"
      ) {
        detectedSerialPorts = [boardList];
        console.log(`Found 1 serial port (format 4)`);
      }
      // No ports found or unknown format
      else {
        console.log("No serial ports found or unrecognized format:", boardList);
        detectedSerialPorts = [];
      }
    }

    // Update any port selector UI if it exists
    updatePortSelector(detectedSerialPorts);

    return detectedSerialPorts;
  } catch (error) {
    console.error("Error refreshing serial ports:", error);
    return [];
  }
}

/**
 * Add a refresh button that users can click to manually refresh port list
 */
function addRefreshPortsButton() {
  // Only add if it doesn't already exist
  if (document.querySelector(".refresh-ports-button")) {
    return;
  }

  const refreshButton = document.createElement("button");
  refreshButton.className = "refresh-ports-button";
  refreshButton.innerHTML = "↻"; // Refresh icon
  refreshButton.title = "Refresh port list";
  refreshButton.onclick = async () => {
    refreshButton.classList.add("refreshing");
    refreshButton.disabled = true;

    try {
      await refreshSerialPorts();

      // Show the result
      if (detectedSerialPorts.length > 0) {
        const portNames = detectedSerialPorts
          .map((p) => p.Name || p.address || JSON.stringify(p))
          .join("\n");
        alert(`Found ${detectedSerialPorts.length} port(s):\n\n${portNames}`);

        // Update status indicator if it exists
        const statusElem = document.getElementById("agent-status-indicator");
        if (statusElem) {
          statusElem.innerHTML = `
            <span class="agent-status-dot connected"></span>
            <span class="agent-status-text">Agent Ready (${detectedSerialPorts.length} ports)</span>
          `;
        }
      } else {
        alert(
          "No Arduino boards detected. Please make sure your board is connected and drivers are installed."
        );
      }
    } catch (error) {
      console.error("Error in manual refresh:", error);
      alert("Error refreshing ports: " + error.message);
    } finally {
      refreshButton.classList.remove("refreshing");
      refreshButton.disabled = false;
    }
  };

  // Add to header next to agent status
  const agentStatusIndicator = document.getElementById(
    "agent-status-indicator"
  );
  if (agentStatusIndicator && agentStatusIndicator.parentNode) {
    agentStatusIndicator.parentNode.insertBefore(
      refreshButton,
      agentStatusIndicator.nextSibling
    );
  } else {
    // Fallback - add to the header
    const headerNav = document.querySelector(".header-nav");
    if (headerNav) {
      headerNav.appendChild(refreshButton);
    } else {
      // Absolute fallback - add to body
      document.body.appendChild(refreshButton);
      // Add positioning styles
      refreshButton.style.position = "fixed";
      refreshButton.style.top = "10px";
      refreshButton.style.right = "200px";
      refreshButton.style.zIndex = "9999";
    }
  }
}

/**
 * Update the port selector dropdown with available ports
 */
function updatePortSelector(ports) {
  // Only implement if you have a port selector dropdown
  // This would be used to let users select which port to upload to
  const portSelector = document.getElementById("serial-port-selector");
  if (!portSelector) return;

  // Clear existing options
  portSelector.innerHTML = "";

  // Add a default option
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Select Port";
  portSelector.appendChild(defaultOption);

  // Add each port
  ports.forEach((port) => {
    const option = document.createElement("option");
    const portName = port.Name || port.address || JSON.stringify(port);
    option.value = portName;
    option.textContent = `${portName} (${port.ProductID || "Unknown"})`;
    portSelector.appendChild(option);
  });
}

/**
 * Show a dialog explaining the need to install Arduino Create Agent
 */
function showAgentRequiredDialog(codeBlock) {
  // If a dialog already exists, don't create another one
  if (document.getElementById("agent-required-dialog")) {
    return;
  }

  // Create the dialog
  const dialog = document.createElement("div");
  dialog.id = "agent-required-dialog";
  dialog.className = "agent-dialog";

  dialog.innerHTML = `
    <div class="agent-dialog-content">
      <div class="agent-dialog-header">
        <h3>Arduino Create Agent Required</h3>
        <button class="agent-dialog-close">&times;</button>
      </div>
      <div class="agent-dialog-body">
        <p>To upload code directly to your Arduino board, you need to install the Arduino Create Agent on your computer.</p>
        
        <div class="agent-steps">
          <h4>Installation Steps:</h4>
          <ol>
            <li>Download the Arduino Create Agent for your operating system:
              <ul>
                <li><a href="https://github.com/arduino/arduino-create-agent/releases" target="_blank">Download from GitHub Releases</a></li>
              </ul>
            </li>
            <li>Install and run the agent</li>
            <li>Add this website to the allowed origins:
              <ol>
                <li>Find the config.ini file (usually in the installation directory)</li>
                <li>Add this line: <code>origins = ${window.location.origin}</code></li>
                <li>Restart the agent</li>
              </ol>
            </li>
            <li>Refresh this page</li>
          </ol>
        </div>
        
        <p>In the meantime, you can download the compiled binary and upload it manually using the Arduino IDE.</p>
        
        <div class="agent-dialog-buttons">
          <button class="agent-download-button">Download Binary</button>
          <button class="agent-manual-upload">Upload Manually</button>
        </div>
      </div>
    </div>
  `;

  // Add styles for the dialog
  const dialogStyle = document.createElement("style");
  dialogStyle.textContent = `
    .agent-dialog {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }
    
    .agent-dialog-content {
      background-color: #fff;
      border-radius: 8px;
      width: 80%;
      max-width: 600px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }
    
    .agent-dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 15px 20px;
      border-bottom: 1px solid #eee;
    }
    
    .agent-dialog-header h3 {
      margin: 0;
      font-size: 18px;
    }
    
    .agent-dialog-close {
      background: none;
      border: none;
      font-size: 22px;
      cursor: pointer;
      color: #777;
    }
    
    .agent-dialog-body {
      padding: 20px;
    }
    
    .agent-steps {
      margin: 20px 0;
    }
    
    .agent-dialog-buttons {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }
    
    .agent-dialog-buttons button {
      padding: 8px 16px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-weight: 500;
    }
    
    .agent-download-button {
      background-color: #007bff;
      color: white;
    }
    
    .agent-manual-upload {
      background-color: #6c757d;
      color: white;
    }
  `;
  document.head.appendChild(dialogStyle);

  // Add to the document
  document.body.appendChild(dialog);

  // Add event listeners
  dialog.querySelector(".agent-dialog-close").addEventListener("click", () => {
    dialog.remove();
  });

  dialog
    .querySelector(".agent-download-button")
    .addEventListener("click", () => {
      downloadCompiledBinary(codeBlock);
      dialog.remove();
    });

  dialog.querySelector(".agent-manual-upload").addEventListener("click", () => {
    // Show manual upload instructions
    offerDownloadAlternative(codeBlock);
    dialog.remove();
  });

  // Close when clicking outside the dialog
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.remove();
    }
  });
}

/**
 * Offer download alternative when WebSerial upload fails
 */
function offerDownloadAlternative(codeBlock) {
  // Check if instructions already exist
  if (
    codeBlock.nextElementSibling &&
    codeBlock.nextElementSibling.classList.contains(
      "arduino-upload-instructions"
    )
  ) {
    return;
  }

  // Create instructions
  const instructionsDiv = document.createElement("div");
  instructionsDiv.className = "arduino-upload-instructions";

  // Get board name from FQBN
  const boardFQBN = document.getElementById("board-fqbn");
  const boardValue = boardFQBN ? boardFQBN.value : "arduino";
  const boardName = boardValue.split(":").pop();

  instructionsDiv.innerHTML = `
        <h4>Direct WebSerial upload is not yet supported</h4>
        <p>You can download the compiled binary and upload it manually:</p>
        <ol>
            <li>Click the button below to download the compiled binary</li>
            <li>Connect your Arduino board to your computer</li>
            <li>Use the Arduino IDE to upload the binary:
                <ul>
                    <li>Open Arduino IDE</li>
                    <li>Select your board type (${boardName})</li>
                    <li>Select Sketch > Upload Using Programmer</li>
                    <li>Select the downloaded binary file</li>
                </ul>
            </li>
        </ol>
        <button id="download-binary-button" class="arduino-compile-button">Download Binary</button>
    `;

  // Add after code block
  codeBlock.parentNode.insertBefore(instructionsDiv, codeBlock.nextSibling);

  // Add event listener to download button
  document
    .getElementById("download-binary-button")
    .addEventListener("click", function () {
      downloadCompiledBinary(codeBlock);
    });
}

// WebSerial Uploader class to handle Arduino firmware uploads
class WebSerialUploader {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.baudRate = 115200; // Default upload baudrate
    this.protocol = null;
    this.binary = null;
    this.callbacks = null;
  }

  /**
   * Set binary and protocol info for upload
   */
  setBinaryInfo(binaryInfo) {
    this.protocol = binaryInfo.protocol;
    this.binary = binaryInfo.binary;
  }

  /**
   * Upload binary to Arduino using WebSerial
   */
  async upload(callbacks = {}) {
    this.callbacks = callbacks;

    try {
      // Make sure we have all required data
      if (!this.binary || !this.protocol) {
        throw new Error("No binary data or protocol set for upload");
      }

      // Use existing serialPort if available
      if (
        window.serialPort &&
        (window.serialPort.readable || window.serialPort.writable)
      ) {
        this.port = window.serialPort;
        console.log("Using existing serial port connection");
      } else {
        this.port = await navigator.serial.requestPort();
        console.log("New serial port selected");
      }

      // Call progress callback
      if (this.callbacks.onProgress) {
        this.callbacks.onProgress("Connecting to board...");
      }

      // Handle specific protocol uploads
      if (this.protocol === "stk500v1") {
        await this.uploadStk500v1();
      } else if (this.protocol === "avr109") {
        await this.uploadAvr109();
      } else if (this.protocol === "esp32") {
        await this.uploadEsp32();
      } else {
        throw new Error(`Unsupported upload protocol: ${this.protocol}`);
      }

      // Success callback
      if (this.callbacks.onSuccess) {
        this.callbacks.onSuccess("Upload completed successfully!");
      }
    } catch (error) {
      console.error("Upload error:", error);

      // Error callback
      if (this.callbacks.onError) {
        this.callbacks.onError(error.message || "Upload failed");
      }
    }
  }

  /**
   * Upload using STK500v1 protocol (Arduino Uno, Nano, Mega)
   */
  async uploadStk500v1() {
    // This is a simplified implementation
    // In practice, proper AVR/STK500 protocol must be implemented

    if (this.callbacks.onProgress) {
      this.callbacks.onProgress("STK500 upload not yet implemented in browser");
      this.callbacks.onProgress("Please use the download method instead");
    }

    throw new Error("STK500v1 protocol upload not yet implemented in browser");
  }

  /**
   * Upload using AVR109 protocol (Arduino Leonardo, Micro)
   */
  async uploadAvr109() {
    // This is a simplified implementation
    // In practice, proper AVR109/Butterfly bootloader protocol must be implemented

    if (this.callbacks.onProgress) {
      this.callbacks.onProgress("AVR109 upload not yet implemented in browser");
      this.callbacks.onProgress("Please use the download method instead");
    }

    throw new Error("AVR109 protocol upload not yet implemented in browser");
  }

  /**
   * Upload using ESP32 protocol
   */
  async uploadEsp32() {
    // This is a simplified implementation
    // In practice, proper ESP32 ROM bootloader protocol must be implemented

    if (this.callbacks.onProgress) {
      this.callbacks.onProgress("ESP32 upload not yet implemented in browser");
      this.callbacks.onProgress("Please use the download method instead");
    }

    throw new Error("ESP32 protocol upload not yet implemented in browser");
  }
}

/**
 * Add compile and upload buttons to all Arduino code blocks
 */
function addArduinoButtons() {
  // Find all code blocks
  const codeBlocks = document.querySelectorAll(".message pre");

  codeBlocks.forEach((codeBlock) => {
    addArduinoButtonsToBlock(codeBlock);
  });
}

/**
 * Adds Arduino buttons to a specific code block if it contains Arduino code
 * Updated version with download button and Arduino IDE-like styling
 */
function addArduinoButtonsToBlock(codeBlock) {
  // Skip if already processed
  if (codeBlock.querySelector(".arduino-buttons")) {
    return;
  }

  // Check if the code block contains Arduino code
  const codeElement = codeBlock.querySelector("code");
  if (!codeElement) return;

  // Detect Arduino code by class or content
  const isArduinoCode =
    codeElement.classList.contains("language-arduino") ||
    codeElement.classList.contains("language-cpp") ||
    codeElement.classList.contains("language-c") ||
    /^\s*(void\s+setup\s*\(\s*\)|void\s+loop\s*\(\s*\)|#include\s+<Arduino.h>)/.test(
      codeElement.textContent
    );

  if (!isArduinoCode) return;

  // Create button container
  const buttonContainer = document.createElement("div");
  buttonContainer.classList.add("arduino-buttons");

  // Create compile button (verify in Arduino IDE terms)
  const compileButton = document.createElement("button");
  compileButton.classList.add("arduino-compile-button");
  compileButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        Verify
    `;
  compileButton.title = "Verify (compile) sketch";

  // Create upload button
  const uploadButton = document.createElement("button");
  uploadButton.classList.add("arduino-upload-button");
  uploadButton.disabled = true; // Disabled until code is compiled
  uploadButton.innerHTML = `
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="17 8 12 3 7 8"></polyline>
      <line x1="12" y1="3" x2="12" y2="15"></line>
  </svg>
  Upload
`;

  // Set button state based on agent availability
  if (agentAvailable) {
    uploadButton.title = "Upload sketch to board via Arduino Create Agent";
    uploadButton.classList.add("agent-available");
  } else {
    uploadButton.title =
      "Arduino Create Agent not detected - download binary instead";
    uploadButton.classList.add("agent-unavailable");
  }

  // Create download button
  const downloadButton = document.createElement("button");
  downloadButton.classList.add("arduino-download-button");
  downloadButton.disabled = true; // Disabled until code is compiled
  downloadButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Download
    `;
  downloadButton.title = "Download compiled binary for local use";

  // Add status indicator
  const statusIndicator = document.createElement("span");
  statusIndicator.classList.add("arduino-status");

  // Add to container
  buttonContainer.appendChild(compileButton);
  buttonContainer.appendChild(uploadButton);
  buttonContainer.appendChild(downloadButton);
  buttonContainer.appendChild(statusIndicator);

  // Add to code block
  codeBlock.appendChild(buttonContainer);

  // Add event listeners
  compileButton.addEventListener("click", function () {
    compileArduinoCode(codeElement.textContent, codeBlock);
  });

  uploadButton.addEventListener("click", function () {
    uploadWithAgent(codeBlock);
  });

  downloadButton.addEventListener("click", function () {
    downloadCompiledBinary(codeBlock);
  });
}

/**
 * Set up an observer to detect new code blocks added by AI
 */
function setupCodeBlockObserver() {
  // Create a new observer
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        for (let node of mutation.addedNodes) {
          // Check if the added node is an element
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if it's a message
            if (node.classList && node.classList.contains("message")) {
              // Find code blocks within the message
              const codeBlocks = node.querySelectorAll("pre");
              codeBlocks.forEach(function (codeBlock) {
                addArduinoButtonsToBlock(codeBlock);
              });
            }
            // Or check if it contains code blocks
            else {
              const codeBlocks = node.querySelectorAll("pre");
              codeBlocks.forEach(function (codeBlock) {
                addArduinoButtonsToBlock(codeBlock);
              });
            }
          }
        }
      }
    });
  });

  // Start observing
  const chatMessages = document.getElementById("chat-messages");
  if (chatMessages) {
    observer.observe(chatMessages, {
      childList: true,
      subtree: true,
    });
  } else {
    console.warn("Chat messages container not found for code block observer");
    // Try to find alternate container
    const possibleContainers = [
      document.querySelector(".chat-container"),
      document.querySelector(".messages-container"),
      document.querySelector("main"),
    ];

    for (const container of possibleContainers) {
      if (container) {
        console.log("Using alternate container for observer:", container);
        observer.observe(container, {
          childList: true,
          subtree: true,
        });
        break;
      }
    }
  }
}

/**
 * Compile Arduino code
 */
function compileArduinoCode(code, codeBlock) {
  // Check if there is a selected board
  const boardFQBN = document.getElementById("board-fqbn");
  if (!boardFQBN || !boardFQBN.value) {
    alert("Please select a board type in the project settings first!");

    // Highlight the project settings sidebar
    const sidebar = document.getElementById("sidebar");
    if (sidebar) {
      sidebar.classList.add("highlight");
      setTimeout(() => {
        sidebar.classList.remove("highlight");
      }, 3000);
    }
    return;
  }

  // Check if a compilation is already in progress
  if (compileUploadInProgress) {
    alert("A compilation or upload is already in progress. Please wait.");
    return;
  }

  // Set the compile/upload in progress flag
  compileUploadInProgress = true;
  currentCodeBlock = codeBlock;

  // Update status
  updateCompileStatus("compiling", "Compiling code...", codeBlock);

  // Disable the compile button during compilation
  const compileButton = codeBlock.querySelector(".arduino-compile-button");
  if (compileButton) {
    compileButton.disabled = true;
  }

  // Prepare data for the request
  const formData = new FormData();
  formData.append("code", code);
  formData.append("board_fqbn", boardFQBN.value);
  formData.append("upload_method", "webserial"); // Request data for WebSerial upload

  // Get CSRF token
  const csrfToken = getCookie("csrftoken");

  // Send to server for compilation
  fetch("/api/compile-arduino/", {
    method: "POST",
    headers: {
      "X-CSRFToken": csrfToken,
    },
    body: formData,
  })
    .then((response) => {
      // Check for errors
      if (!response.ok) {
        return response.json().then((data) => {
          throw new Error(data.error || "Compilation failed");
        });
      }

      // For WebSerial upload, response is JSON
      return response.json();
    })
    .then((data) => {
      // Store binary data for upload
      currentBinaryInfo = data;

      // Set binary data in uploader
      webSerialUploader.setBinaryInfo(data);

      // Update status
      updateCompileStatus(
        "compiled",
        "Compilation successful! Ready to upload.",
        codeBlock
      );

      // Enable upload button
      const uploadButton = codeBlock.querySelector(".arduino-upload-button");
      if (uploadButton) {
        uploadButton.disabled = false;
      }

      // Enable download button
      const downloadButton = codeBlock.querySelector(
        ".arduino-download-button"
      );
      if (downloadButton) {
        downloadButton.disabled = false;
      }

      // Re-enable compile button
      if (compileButton) {
        compileButton.disabled = false;
      }

      // Reset in-progress flag
      compileUploadInProgress = false;
    })
    .catch((error) => {
      console.error("Compilation error:", error);

      // Update status
      updateCompileStatus(
        "error",
        `Compilation failed: ${error.message}`,
        codeBlock
      );

      // Re-enable compile button
      if (compileButton) {
        compileButton.disabled = false;
      }

      // Reset in-progress flag
      compileUploadInProgress = false;
    });
}

/**
 * Update the status of the compilation/upload process
 */
function updateCompileStatus(status, message, codeBlock) {
  const statusElement = codeBlock.querySelector(".arduino-status");
  if (!statusElement) return;

  // Update text and class
  statusElement.textContent = message;
  statusElement.className = `arduino-status ${status}`;

  // Add animation for uploading
  if (status === "uploading") {
    statusElement.classList.add("uploading-indicator");
  } else {
    statusElement.classList.remove("uploading-indicator");
  }
}

/**
 * Download the compiled binary when WebSerial upload fails
 */
function downloadCompiledBinary(codeBlock) {
  // Get code from the code block
  const codeElement = codeBlock.querySelector("code");
  if (!codeElement) return;

  const code = codeElement.textContent;

  // Get board FQBN
  const boardFQBN = document.getElementById("board-fqbn");
  if (!boardFQBN || !boardFQBN.value) {
    alert("Please select a board type in the project settings first!");
    return;
  }

  // Update status
  updateCompileStatus("compiling", "Compiling for download...", codeBlock);

  // Prepare data for the request
  const formData = new FormData();
  formData.append("code", code);
  formData.append("board_fqbn", boardFQBN.value);
  formData.append("upload_method", "download"); // Request direct download

  // Get CSRF token
  const csrfToken = getCookie("csrftoken");

  // Send to server for compilation
  fetch("/api/compile-arduino/", {
    method: "POST",
    headers: {
      "X-CSRFToken": csrfToken,
    },
    body: formData,
  })
    .then((response) => {
      if (!response.ok) {
        return response.blob().then((blob) => {
          // Try to get error message from blob
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const errorJson = JSON.parse(reader.result);
                reject(new Error(errorJson.error || "Compilation failed"));
              } catch (e) {
                reject(new Error("Compilation failed"));
              }
            };
            reader.onerror = () => reject(new Error("Compilation failed"));
            reader.readAsText(blob);
          });
        });
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "arduino_sketch.hex";

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=([^;]+)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].trim();
        }
      }

      // Convert response to blob and download
      return response.blob().then((blob) => ({
        blob,
        filename,
      }));
    })
    .then(({ blob, filename }) => {
      // Create download link
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = filename;

      // Add to document, click, and remove
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      // Update status
      updateCompileStatus(
        "success",
        `Compiled and downloaded ${filename}`,
        codeBlock
      );
    })
    .catch((error) => {
      console.error("Download error:", error);
      updateCompileStatus(
        "error",
        `Compilation failed: ${error.message}`,
        codeBlock
      );
    });
}

/**
 * Synchronize board FQBN with project settings
 */
function setupBoardFQBNSync() {
  // Hook into project save function if it exists
  if (typeof window.saveProject === "function") {
    const originalSaveProject = window.saveProject;

    window.saveProject = function () {
      // Get FQBN value
      const boardFQBNElement = document.getElementById("board-fqbn");
      const boardFQBN = boardFQBNElement ? boardFQBNElement.value || "" : "";

      // Get existing projectData
      const projectNameElement = document.getElementById("project-name");
      const boardTypeElement = document.getElementById("board-type");
      const componentsTextElement = document.getElementById("components-text");
      const librariesTextElement = document.getElementById("libraries-text");
      const queryModelElement = document.getElementById("query-model");
      const summaryModelElement = document.getElementById("summary-model");
      const historyWindowElement = document.getElementById("history-window");

      if (!projectNameElement) {
        console.warn("Project name element not found, can't save project");
        return;
      }

      const projectData = {
        name: projectNameElement.value,
        board_type: boardTypeElement ? boardTypeElement.value || "" : "",
        board_fqbn: boardFQBN,
        components_text: componentsTextElement
          ? componentsTextElement.value || ""
          : "",
        libraries_text: librariesTextElement
          ? librariesTextElement.value || ""
          : "",
        description:
          boardTypeElement && boardTypeElement.value
            ? `Arduino project using ${boardTypeElement.value}`
            : "Arduino project",
        query_model: queryModelElement ? queryModelElement.value || null : null,
        summary_model: summaryModelElement
          ? summaryModelElement.value || null
          : null,
        history_window_size: historyWindowElement
          ? parseInt(historyWindowElement.value, 10)
          : 10,
      };

      // Continue with original save logic
      const method = window.currentProjectId ? "PUT" : "POST";
      const url = window.currentProjectId
        ? `/api/projects/${window.currentProjectId}/`
        : "/api/projects/";

      fetch(url, {
        method: method,
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify(projectData),
      })
        .then((response) => {
          if (!response.ok) {
            if (typeof window.handleFetchError === "function") {
              return window.handleFetchError(response);
            }
            throw new Error(`Failed to save project: ${response.statusText}`);
          }
          return response.json();
        })
        .then((data) => {
          window.currentProjectId = data.id;
          alert("Project saved successfully!");
          if (typeof window.loadUserProjects === "function") {
            setTimeout(window.loadUserProjects, 1000);
          }
        })
        .catch((error) => {
          console.error("Error saving project:", error);
          alert(`Failed to save project: ${error.message}`);
        });
    };
  }

  // Hook into project load function if it exists
  if (typeof window.loadProject === "function") {
    const originalLoadProject = window.loadProject;

    window.loadProject = function (projectId) {
      fetch(`/api/projects/${projectId}/`)
        .then((response) => response.json())
        .then((data) => {
          // Update FQBN field
          if (data.board_fqbn) {
            const boardFQBNSelect = document.getElementById("board-fqbn");
            if (boardFQBNSelect) {
              boardFQBNSelect.value = data.board_fqbn;
            }
          }

          // Continue with the original load for other fields
          const projectNameElement = document.getElementById("project-name");
          const boardTypeElement = document.getElementById("board-type");
          const componentsTextElement =
            document.getElementById("components-text");
          const librariesTextElement =
            document.getElementById("libraries-text");
          const queryModelElement = document.getElementById("query-model");
          const summaryModelElement = document.getElementById("summary-model");
          const historyWindowElement =
            document.getElementById("history-window");
          const historyWindowValueElement = document.getElementById(
            "history-window-value"
          );

          if (projectNameElement) projectNameElement.value = data.name;
          if (boardTypeElement) boardTypeElement.value = data.board_type || "";
          if (componentsTextElement)
            componentsTextElement.value = data.components_text || "";
          if (librariesTextElement)
            librariesTextElement.value = data.libraries_text || "";
          if (queryModelElement)
            queryModelElement.value = data.query_model || "";
          if (summaryModelElement)
            summaryModelElement.value = data.summary_model || "";

          if (historyWindowElement) {
            historyWindowElement.value = data.history_window_size || 10;
            if (historyWindowValueElement) {
              historyWindowValueElement.textContent =
                (data.history_window_size || 10) + " messages";
            }
          }

          // Update current project ID
          window.currentProjectId = data.id;

          // Load the project's conversation messages if that function exists
          if (typeof window.loadProjectMessages === "function") {
            window.loadProjectMessages(projectId);
          }
        })
        .catch((error) => console.error("Error loading project:", error));
    };
  }
}

/**
 * Helper function to get a cookie value by name
 */
function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== "") {
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === name + "=") {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}
