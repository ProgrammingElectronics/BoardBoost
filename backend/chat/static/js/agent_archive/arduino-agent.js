// Arduino Create Agent Integration
// This consolidated file handles detection, communication, and uploads
// with the Arduino Create Agent

// Global variables
let daemon = null;
let agentAvailable = false;
let detectedSerialPorts = [];
let currentCompiledBinary = null;
let currentBinaryInfo = null;
let compileUploadInProgress = false;
let currentCodeBlock = null;
let agentCheckInterval = null;

// Prevent duplicate script loading
if (window._arduinoAgentLoaded) {
  console.log("Arduino agent already loaded, skipping initialization");
} else {
  window._arduinoAgentLoaded = true;

  // Initialize when document is loaded
  document.addEventListener("DOMContentLoaded", function () {
    console.log("Initializing Arduino Create Agent integration...");

    // Initialize agent detection
    initializeAgent();

    // Add Arduino buttons to code blocks
    addArduinoButtons();

    // Add observer for new code blocks
    setupCodeBlockObserver();

    // Add refresh ports button with a delay
    setTimeout(addRefreshPortsButton, 1000);
  });
}

// Download the compiled binary
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

  // If we already have a compiled binary, download it directly
  if (currentBinaryInfo && currentBinaryInfo.binary) {
    // Convert base64 to blob and download
    const binary = atob(currentBinaryInfo.binary);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arduino_sketch_${Date.now()}.hex`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    updateCompileStatus("success", "Binary downloaded successfully", codeBlock);
    return;
  }

  // Otherwise, compile and download
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

// Set up code block observer
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

// Helper function to get a cookie value by name
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

// Offer download alternative when direct upload is not available
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
    <h4>Direct upload is not available</h4>
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

// Initialize agent detection
function initializeAgent() {
  // Start by checking if the agent is running
  checkForArduinoAgent();

  // Set up a periodic check every 30 seconds
  if (!agentCheckInterval) {
    agentCheckInterval = setInterval(checkForArduinoAgent, 30000);
  }
}

// Check if the Arduino Create Agent is running
async function checkForArduinoAgent() {
  console.log("Checking for Arduino Create Agent...");

  // Try to detect agent by checking if its server is responding
  // Use a tiny timeout to avoid long hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    // First try the primary port (8991)
    const response = await fetch("http://localhost:8991/", {
      signal: controller.signal,
      mode: "cors",
      headers: {
        // "Access-Control-Allow-Origin": "*",
      },
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      console.log("Detected Arduino Create Agent on port 8991");
      setupAgentInterface(8991);
      return;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.log("Arduino Create Agent not found on port 8991");

    // Try the alternative port (8990)
    try {
      const altResponse = await fetch("http://localhost:8990/", {
        mode: "no-cors",
        headers: {
          // "Access-Control-Allow-Origin": "*",
        },
      });

      if (altResponse.ok) {
        console.log("Detected Arduino Create Agent on port 8990");
        setupAgentInterface(8990);
        return;
      }
    } catch (altError) {
      console.log("Arduino Create Agent not found on port 8990 either");
      agentAvailable = false;
      updateAgentUI(false);
    }
  }
}

// Set up the agent interface
function setupAgentInterface(port) {
  console.log(`Setting up Arduino Create Agent interface on port ${port}`);

  // Create a browser-compatible interface
  window.arduinoCreateAgent = {
    // Send a command to the agent
    _sendCommand: async function (endpoint, data = null) {
      try {
        const response = await fetch(`http://localhost:${port}${endpoint}`, {
          method: data ? "POST" : "GET",
          headers: {
            "Content-Type": "application/json",
            // "Access-Control-Allow-Origin": "*",
          },
          body: data ? JSON.stringify(data) : undefined,
        });

        if (!response.ok) {
          throw new Error(
            `Agent responded with ${response.status}: ${response.statusText}`
          );
        }

        return await response.json();
      } catch (error) {
        console.error(`Error sending command to agent: ${error}`);
        throw error;
      }
    },

    // Upload a sketch to the board
    uploadSketch: async function (options) {
      try {
        console.log("Starting upload via Arduino Create Agent...");
        console.log("Options:", options);

        const uploadData = {
          board: options.board,
          port: options.port,
          filename: options.filename || `sketch_${Date.now()}.hex`,
          data: options.hex,
        };

        if (options.onProgress) {
          options.onProgress("Preparing upload...");
        }

        // Send the upload command
        const result = await this._sendCommand("/upload", uploadData);

        if (result.success) {
          if (options.onSuccess) {
            options.onSuccess("Upload completed successfully!");
          }
          return result;
        } else {
          const errorMsg = result.error || "Unknown upload error";
          if (options.onError) {
            options.onError(errorMsg);
          }
          throw new Error(errorMsg);
        }
      } catch (error) {
        console.error("Upload error:", error);
        if (options.onError) {
          options.onError(error.message);
        }
        throw error;
      }
    },

    // List available boards
    listBoards: async function () {
      try {
        const result = await this._sendCommand("/list");

        // Normalize result format
        let ports = [];

        if (result["Serial Ports"] && Array.isArray(result["Serial Ports"])) {
          ports = result["Serial Ports"];
        } else if (result.serial && Array.isArray(result.serial)) {
          ports = result.serial;
        }

        // Store ports globally
        detectedSerialPorts = ports;
        console.log("Detected serial ports:", ports);

        return result;
      } catch (error) {
        console.error("Error listing boards:", error);
        return { "Serial Ports": [] };
      }
    },
  };

  // Update agent status
  agentAvailable = true;
  updateAgentUI(true);

  // Load initial list of ports
  refreshSerialPorts();
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
      // Fallback - add to body
      document.body.appendChild(agentStatusIndicator);
      agentStatusIndicator.style.position = "fixed";
      agentStatusIndicator.style.top = "10px";
      agentStatusIndicator.style.right = "10px";
      agentStatusIndicator.style.zIndex = "9999";
    }
  }

  // Update styles if they don't exist
  ensureStylesExist();

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

  // Update all upload buttons
  updateAllUploadButtons();
}

// Ensure CSS styles exist
function ensureStylesExist() {
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
        margin-right: 10px;
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
      
      /* Dialog styles */
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
    document.head.appendChild(style);
  }
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

// Refresh serial ports
async function refreshSerialPorts() {
  if (!agentAvailable || !window.arduinoCreateAgent) {
    console.log("Cannot refresh ports - agent not available");
    return [];
  }

  try {
    console.log("Refreshing serial ports via Arduino Create Agent...");
    const boardList = await window.arduinoCreateAgent.listBoards();

    // Update UI to show we found ports
    const statusElem = document.getElementById("agent-status-indicator");
    if (statusElem && detectedSerialPorts.length > 0) {
      statusElem.innerHTML = `
        <span class="agent-status-dot connected"></span>
        <span class="agent-status-text">Agent Ready (${detectedSerialPorts.length} ports)</span>
      `;
    }

    return detectedSerialPorts;
  } catch (error) {
    console.error("Error refreshing serial ports:", error);
    return [];
  }
}

// Add a refresh button that users can click to manually refresh port list
function addRefreshPortsButton() {
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
        const portInfo = detectedSerialPorts
          .map((port) => {
            const name = port.Name || port.address || JSON.stringify(port);
            const details =
              port.VendorID || port.ProductID
                ? ` (${port.VendorID || ""}:${port.ProductID || ""})`
                : "";
            return `${name}${details}`;
          })
          .join("\n");

        alert(`Found ${detectedSerialPorts.length} port(s):\n\n${portInfo}`);
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
      refreshButton.style.position = "fixed";
      refreshButton.style.top = "10px";
      refreshButton.style.right = "200px";
      refreshButton.style.zIndex = "9999";
    }
  }
}

// Add Arduino buttons to code blocks
function addArduinoButtons() {
  // Find all code blocks
  const codeBlocks = document.querySelectorAll(".message pre");

  codeBlocks.forEach((codeBlock) => {
    addArduinoButtonsToBlock(codeBlock);
  });
}

// Add Arduino buttons to a specific code block
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

  // Create compile button
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

// Compile Arduino code
function compileArduinoCode(code, codeBlock) {
  // Check if there is a selected board
  const boardFQBN = document.getElementById("board-fqbn");
  if (!boardFQBN || !boardFQBN.value) {
    alert("Please select a board type in the project settings first!");

    // Highlight the project settings sidebar if it exists
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

// Upload with Arduino Create Agent
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

  // Check if the agent is available
  if (!agentAvailable || !window.arduinoCreateAgent) {
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
        detectedSerialPorts[0].Name ||
        detectedSerialPorts[0].address ||
        detectedSerialPorts[0];
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
      filename: `sketch_${Date.now()}.hex`,
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

// Enable all buttons in a code block
function enableCodeBlockButtons(codeBlock) {
  const compileButton = codeBlock.querySelector(".arduino-compile-button");
  const uploadButton = codeBlock.querySelector(".arduino-upload-button");
  const downloadButton = codeBlock.querySelector(".arduino-download-button");

  if (compileButton) compileButton.disabled = false;
  if (uploadButton) uploadButton.disabled = false;
  if (downloadButton) downloadButton.disabled = false;
}

// Update status during compilation/upload
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

// Show a dialog explaining the need to install Arduino Create Agent
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
