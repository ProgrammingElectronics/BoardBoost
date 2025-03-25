// Arduino Create Agent Integration with Official JS Client

// Global variables
let daemon = null;
let agentAvailable = false;
let detectedSerialPorts = [];
let currentCompiledBinary = null;
let currentBinaryInfo = null;
let compileUploadInProgress = false;
let currentCodeBlock = null;

// Initialize Arduino Create Agent when the page loads
document.addEventListener("DOMContentLoaded", function () {
  loadArduinoCreateAgentClient();
});

// Load the Arduino Create Agent client library
function loadArduinoCreateAgentClient() {
  console.log("Loading Arduino Create Agent client library...");

  // Direct access to the unpkg CDN file
  const script = document.createElement("script");
  script.src =
    "https://unpkg.com/arduino-create-agent-js-client@2.15.1/dist/create-plugin.min.js";

  script.onload = function () {
    console.log("Arduino Create Agent client library loaded successfully");
    initializeAgent();
  };

  script.onerror = function () {
    console.error("Failed to load Arduino Create Agent client library");
    agentAvailable = false;
    updateAgentUI(false);
  };

  document.head.appendChild(script);
}

// Initialize using the official JS client
function initializeAgent() {
  try {
    console.log("Initializing Arduino Create Agent client...");

    // Determine which class to use based on what's available
    let DaemonClass = null;

    if (typeof CreatePlugin !== "undefined" && CreatePlugin.Daemon) {
      DaemonClass = CreatePlugin.Daemon;
    } else if (typeof Daemon !== "undefined") {
      DaemonClass = Daemon;
    } else {
      throw new Error("Daemon class not available");
    }

    // Create a new instance
    daemon = new DaemonClass("https://builder.arduino.cc/v3/boards");

    // Subscribe to agent found/not found events
    daemon.agentFound.subscribe((status) => {
      console.log("Agent found status:", status);
      agentAvailable = status;
      updateAgentUI(status);

      if (status) {
        // Agent is available, get list of ports
        daemon.devicesList.subscribe(({ serial, network }) => {
          console.log("Devices list updated:", { serial, network });
          detectedSerialPorts = serial || [];

          // Log ports for debugging
          if (detectedSerialPorts.length > 0) {
            console.log("Detected serial ports:", detectedSerialPorts);
          }
        });

        // Subscribe to upload status
        daemon.uploading.subscribe((status) => {
          console.log("Upload status:", status);
          updateUploadStatus(status);
        });
      }
    });

    // Subscribe to channel open status
    daemon.channelOpenStatus.subscribe((status) => {
      console.log("Channel open status:", status);
    });

    // Subscribe to errors
    daemon.error.subscribe((error) => {
      console.error("Arduino Create Agent error:", error);
    });

    // Add Arduino buttons to code blocks
    addArduinoButtons();

    // Add observer for new code blocks
    setupCodeBlockObserver();
  } catch (error) {
    console.error("Error initializing Arduino Create Agent client:", error);
    agentAvailable = false;
    updateAgentUI(false);
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
      // Fallback - add to body
      document.body.appendChild(agentStatusIndicator);
      // Add positioning styles
      agentStatusIndicator.style.position = "fixed";
      agentStatusIndicator.style.top = "10px";
      agentStatusIndicator.style.right = "10px";
      agentStatusIndicator.style.zIndex = "9999";
    }
  }

  // Update styles if not already added
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

  // Update upload buttons
  updateAllUploadButtons();
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

// Upload using the official client
function uploadWithAgent(codeBlock) {
  if (!daemon || !agentAvailable) {
    showAgentRequiredDialog(codeBlock);
    return;
  }

  if (!currentBinaryInfo) {
    alert("Please compile the code first.");
    return;
  }

  if (compileUploadInProgress) {
    alert("A compilation or upload is already in progress. Please wait.");
    return;
  }

  // Select a port
  selectPort().then((selectedPort) => {
    if (!selectedPort) {
      alert("No port selected. Upload cancelled.");
      return;
    }

    // Set flags and update UI
    compileUploadInProgress = true;
    currentCodeBlock = codeBlock;

    // Disable buttons
    disableCodeBlockButtons(codeBlock);

    // Update status
    updateCompileStatus("uploading", "Preparing to upload...", codeBlock);

    // Get board FQBN
    const boardFQBN = document.getElementById("board-fqbn").value;

    try {
      // Use the daemon to upload
      daemon.uploadSerial(
        {
          board: boardFQBN,
          port: selectedPort,
        },
        `sketch_${Date.now()}`,
        {
          hex: currentBinaryInfo.binary,
        },
        true // verbose
      );
    } catch (error) {
      updateCompileStatus(
        "error",
        `Upload failed: ${error.message}`,
        codeBlock
      );
      enableCodeBlockButtons(codeBlock);
      compileUploadInProgress = false;
    }
  });
}

// Helper function to select a port
function selectPort() {
  return new Promise((resolve) => {
    if (!detectedSerialPorts || detectedSerialPorts.length === 0) {
      alert(
        "No Arduino boards detected. Please connect your board and try again."
      );
      resolve(null);
      return;
    }

    if (detectedSerialPorts.length === 1) {
      // Just one port, use it directly
      const port = detectedSerialPorts[0];
      const portName = port.Name || port.address || port.port || port;
      resolve(portName);
      return;
    }

    // Multiple ports, prompt user to select
    const portOptions = detectedSerialPorts
      .map((port) => {
        const name = port.Name || port.address || port.port || port;
        const details =
          port.VendorID || port.ProductID
            ? ` (${port.VendorID || ""}:${port.ProductID || ""})`
            : "";
        return `${name}${details}`;
      })
      .join("\n");

    const selectedPort = prompt(
      `Select port:\n\n${portOptions}`,
      detectedSerialPorts[0].Name || detectedSerialPorts[0].address
    );

    if (!selectedPort) {
      resolve(null);
      return;
    }

    // Extract port name if full description was selected
    let portName = selectedPort.trim();
    if (portName.includes(" (")) {
      portName = portName.split(" (")[0].trim();
    }

    resolve(portName);
  });
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

// Disable buttons during operations
function disableCodeBlockButtons(codeBlock) {
  const compileButton = codeBlock.querySelector(".arduino-compile-button");
  const uploadButton = codeBlock.querySelector(".arduino-upload-button");
  const downloadButton = codeBlock.querySelector(".arduino-download-button");

  if (compileButton) compileButton.disabled = true;
  if (uploadButton) uploadButton.disabled = true;
  if (downloadButton) downloadButton.disabled = true;
}

// Enable buttons after operations
function enableCodeBlockButtons(codeBlock) {
  const compileButton = codeBlock.querySelector(".arduino-compile-button");
  const uploadButton = codeBlock.querySelector(".arduino-upload-button");
  const downloadButton = codeBlock.querySelector(".arduino-download-button");

  if (compileButton) compileButton.disabled = false;
  if (uploadButton) uploadButton.disabled = false;
  if (downloadButton) downloadButton.disabled = false;
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

  // Close when clicking outside the dialog
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.remove();
    }
  });
}

// Update upload status from official client
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

// Ensure CSS styles exist for the UI elements
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
    `;
    document.head.appendChild(style);
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
