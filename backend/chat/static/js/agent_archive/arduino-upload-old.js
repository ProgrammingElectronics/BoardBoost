// Main initialization function
async function initializeArduinoIntegration() {
  try {
    console.log("Initializing Arduino integration...");

    // First make sure socket.io is loaded
    await loadSocketIO();

    // Then initialize the agent
    const agentInitialized = await initializeArduinoAgent();
    console.log(`Agent initialized: ${agentInitialized}`);

    // Add compile and upload buttons to code blocks
    addArduinoButtons();

    // Setup board FQBN synchronization with project settings
    setupBoardFQBNSync();

    // Add observer to detect new code blocks added by AI
    setupCodeBlockObserver();

    // Add refresh ports button with a slight delay
    setTimeout(addRefreshPortsButton, 1000);

    // Add port selector button to header
    addPortSelectorButton();

    console.log("Arduino integration setup complete");
  } catch (error) {
    console.error("Error initializing Arduino integration:", error);
  }
}

// Initialize immediately if the document is already loaded
if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  console.log(
    "Document already loaded, initializing Arduino integration immediately"
  );
  initializeArduinoIntegration();
} else {
  // Initialize everything when the document is loaded
  document.addEventListener("DOMContentLoaded", function () {
    console.log("Document loaded, initializing Arduino integration");
    initializeArduinoIntegration();
  });
} // arduino-upload.js - Arduino compilation and upload functionality using Arduino Create Agent

// Global variables
let currentCompiledBinary = null;
let currentBinaryInfo = null;
let compileUploadInProgress = false;
let currentCodeBlock = null;

// Arduino Create Agent variables
let agentAvailable = false;
let detectedSerialPorts = [];
let agentInfo = null;
let agentSocket = null;
let agentPort = null;
let socketMessageHandlers = new Map(); // For handling specific message responses

/**
 * Load Socket.IO library dynamically
 */
async function loadSocketIO() {
  return new Promise((resolve, reject) => {
    if (window.io) {
      console.log("Socket.io already loaded");
      resolve();
      return;
    }

    console.log("Loading socket.io library...");
    // Use socket.io 1.x which is compatible with Arduino Create Agent
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/socket.io/1.7.4/socket.io.min.js";
    script.onload = () => {
      console.log("Socket.io 1.7.4 loaded successfully");
      resolve();
    };
    script.onerror = (error) => {
      console.error("Error loading socket.io:", error);
      reject(new Error("Failed to load socket.io"));
    };
    document.head.appendChild(script);
  });
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

/**
 * Discover the Arduino Create Agent port by checking each possible port
 */
async function discoverAgentPort() {
  console.log("Starting Arduino Create Agent discovery...");

  // Try each port from 8990 to 9000 as per documentation
  for (let port = 8990; port <= 9000; port++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/info`, {
        method: "GET",
        mode: "cors",
        cache: "no-cache",
      });

      if (response.ok) {
        const info = await response.json();
        console.log(`Found Arduino Create Agent on port ${port}:`, info);

        agentInfo = info;
        agentPort = port;
        return info;
      }
    } catch (error) {
      // Silent failure is expected for ports that don't respond
    }
  }

  console.log("No Arduino Create Agent found on any port");
  return null;
}

/**
 * Process messages with registered handlers
 */
function processMessageWithHandlers(message) {
  // Check if we have handlers waiting for this message
  socketMessageHandlers.forEach((handler, key) => {
    // Call the handler with the message
    if (handler(message)) {
      // If handler returns true, it processed the message
      // and we can remove it
      socketMessageHandlers.delete(key);
    }
  });
}

/**
 * Set up socket event listeners for the agent
 */
function setupAgentSocketListeners(socket) {
  // Listen for all messages (including port listings)
  socket.on("message", (message) => {
    console.log("Agent message:", message);

    // Process port listing responses
    if (message && typeof message === "object") {
      // Check for port listing response formats
      if (message.Ports && Array.isArray(message.Ports)) {
        console.log("Received ports list:", message.Ports);
        processPortsList(message.Ports);
      } else if (
        message["Serial Ports"] &&
        Array.isArray(message["Serial Ports"])
      ) {
        console.log("Received serial ports list:", message["Serial Ports"]);
        processPortsList(message["Serial Ports"]);
      }

      // Check for upload status messages
      if (message.ProgrammerStatus || message.Flash) {
        handleUploadStatus(message);
      }
    }

    // Check if we have a specific handler for this message type
    processMessageWithHandlers(message);
  });

  // Also listen for command responses (some agent versions use this instead)
  socket.on("command", (response) => {
    console.log("Agent command response:", response);

    // Process structured responses
    if (typeof response === "object") {
      // Check for port listing in command response
      if (response.Ports && Array.isArray(response.Ports)) {
        processPortsList(response.Ports);
      }

      // Check for upload status in command response
      if (response.ProgrammerStatus || response.Flash) {
        handleUploadStatus(response);
      }
    }

    // Check if we have a specific handler for this response
    processMessageWithHandlers(response);
  });
}

/**
 * Connect to the Arduino Create Agent via WebSocket using socket.io
 */
async function connectToAgentWebSocket() {
  if (!agentInfo || !agentInfo.ws) {
    console.error("Agent info not available, cannot connect to WebSocket");
    return false;
  }

  try {
    console.log(`Connecting to agent WebSocket at ${agentInfo.ws}`);

    // Make sure socket.io is loaded before attempting connection
    if (typeof io === "undefined") {
      console.error("Socket.io not loaded");
      return false;
    }

    // Connect to the WebSocket endpoint using socket.io
    // Note: Arduino Create Agent uses socket.io 1.x
    const socket = io(agentInfo.ws, {
      forceNew: true,
      reconnection: true,
      timeout: 5000,
      transports: ["websocket", "polling"],
    });

    return new Promise((resolve, reject) => {
      // Set a timeout in case the connection never completes
      const timeout = setTimeout(() => {
        reject(new Error("WebSocket connection timeout"));
      }, 10000);

      socket.on("connect", () => {
        console.log("Connected to Arduino Create Agent via WebSocket");
        clearTimeout(timeout);

        // Store the socket for later use
        agentSocket = socket;
        agentAvailable = true;

        // Enable logging on the agent
        socket.emit("command", "log on");
        console.log("Sent 'log on' command to agent");

        // Set up event listeners for agent communication
        setupAgentSocketListeners(socket);

        // Update UI
        updateAgentUI(true);

        // List ports immediately after connection
        refreshSerialPorts();

        // Resolve the promise
        resolve(true);
      });

      socket.on("connecting", () => {
        console.log("Connecting to agent...");
      });

      socket.on("reconnecting", () => {
        console.log("Reconnecting to agent...");
      });

      socket.on("disconnect", () => {
        console.log("Disconnected from Arduino Create Agent");
        agentAvailable = false;
        updateAgentUI(false);
      });

      socket.on("error", (error) => {
        console.error("WebSocket error:", error);
        clearTimeout(timeout);
        reject(error);
      });
    });
  } catch (error) {
    console.error("Error connecting to agent WebSocket:", error);
    return false;
  }
}

/**
 * Process the ports list received from the agent
 */
function processPortsList(ports) {
  // Store ports for later use
  detectedSerialPorts = ports;

  // Update UI with the new ports
  updatePortSelector(ports);
  updateAgentUI(true);
}

/**
 * Register a handler for specific message types
 * Returns a promise that resolves when the handler processes a message
 */
function registerMessageHandler(handlerKey, matchFunction) {
  return new Promise((resolve) => {
    socketMessageHandlers.set(handlerKey, (message) => {
      const result = matchFunction(message);
      if (result) {
        resolve(result);
        return true; // Handler processed the message
      }
      return false; // Handler did not process the message
    });

    // Set a timeout to clean up the handler
    setTimeout(() => {
      if (socketMessageHandlers.has(handlerKey)) {
        socketMessageHandlers.delete(handlerKey);
        resolve(null); // Resolve with null for timeout
      }
    }, 10000);
  });
}

/**
 * Initialize Arduino Create Agent
 */
async function initializeArduinoAgent() {
  try {
    // First, discover the agent port
    const info = await discoverAgentPort();

    if (info) {
      // Then connect to the WebSocket
      const connected = await connectToAgentWebSocket();

      if (connected) {
        console.log("Successfully connected to Arduino Create Agent");
        return true;
      }
    } else {
      // Agent not found
      agentAvailable = false;
      updateAgentUI(false);
    }

    return false;
  } catch (error) {
    console.error("Error initializing Arduino Create Agent:", error);
    agentAvailable = false;
    updateAgentUI(false);
    return false;
  }
}

/**
 * Refresh serial ports from Arduino Create Agent
 */
async function refreshSerialPorts() {
  if (!agentAvailable || !agentSocket) {
    console.log("Cannot refresh ports - agent not available");
    return [];
  }

  try {
    console.log("Requesting serial ports list from agent...");

    // Register a handler for the port listing response
    const portListPromise = registerMessageHandler(
      "port-listing",
      (message) => {
        if (typeof message === "object") {
          if (message.Ports && Array.isArray(message.Ports)) {
            return message.Ports;
          } else if (
            message["Serial Ports"] &&
            Array.isArray(message["Serial Ports"])
          ) {
            return message["Serial Ports"];
          }
        }
        return null;
      }
    );

    // Send list command to the agent
    agentSocket.emit("command", "list");

    // Wait for the port listing response with timeout
    const ports = await portListPromise;

    if (ports) {
      console.log("Successfully received ports list:", ports);
      detectedSerialPorts = ports;
      updatePortSelector(ports);
      updateAgentUI(true);
      return ports;
    } else {
      console.log("Port listing request timed out or failed");
      return [];
    }
  } catch (error) {
    console.error("Error refreshing serial ports:", error);
    return [];
  }
}

/**
 * Update UI elements based on agent availability
 */
function updateAgentUI(agentFound) {
  console.log("Agent status updated:", agentFound);

  // Add a status indicator to the page if it doesn't exist
  let agentStatusIndicator = document.getElementById("agent-status-indicator");

  if (!agentStatusIndicator) {
    agentStatusIndicator = document.createElement("div");
    agentStatusIndicator.id = "agent-status-indicator";
    agentStatusIndicator.className = "agent-status";

    // Add to the header where it's visible
    const headerNav = document.querySelector(".header-nav");
    if (headerNav) {
      headerNav.prepend(agentStatusIndicator);
    }
  }

  // Update the indicator
  if (agentFound) {
    agentStatusIndicator.innerHTML = `
      <span class="agent-status-dot connected"></span>
      <span class="agent-status-text">Arduino Agent Ready${
        detectedSerialPorts.length > 0
          ? ` (${detectedSerialPorts.length} ports)`
          : ""
      }</span>
    `;
    agentStatusIndicator.title = "Arduino Create Agent is connected and ready";
    agentStatusIndicator.classList.add("connected");
    agentStatusIndicator.classList.remove("disconnected");
  } else {
    agentStatusIndicator.innerHTML = `
      <span class="agent-status-dot disconnected"></span>
      <span class="agent-status-text">Agent Not Found</span>
    `;
    agentStatusIndicator.title =
      "Arduino Create Agent not detected - uploads limited to download only";
    agentStatusIndicator.classList.add("disconnected");
    agentStatusIndicator.classList.remove("connected");
  }

  // Update all upload buttons to reflect agent status
  updateAllUploadButtons();
}

/**
 * Create or update a visible port selector
 */
function createVisiblePortSelector(ports) {
  // Check if the selector already exists
  let container = document.getElementById("agent-port-selector-container");

  // Create it if it doesn't exist
  if (!container) {
    container = document.createElement("div");
    container.id = "agent-port-selector-container";
    container.style.cssText = `
      position: fixed;
      top: 70px;
      right: 10px;
      background-color: #282838;
      padding: 10px;
      border: 1px solid #6c7fe8;
      border-radius: 6px;
      z-index: 100;
      box-shadow: 0 4px 10px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(container);
  }

  // Create the selector content
  const content = `
    <div style="margin-bottom: 5px; font-weight: bold; color: #efefef;">Arduino Agent Ports</div>
    <div style="display: flex; gap: 8px; align-items: center;">
      <select id="agent-port-selector" style="padding: 5px; border-radius: 4px; min-width: 150px;">
        <option value="">Select Port</option>
        ${ports
          .map(
            (port) =>
              `<option value="${port.Name}">${port.Name} (${
                port.ProductID || "Unknown"
              })</option>`
          )
          .join("")}
      </select>
      <button id="agent-refresh-ports" style="background: #6c7fe8; color: white; border: none; border-radius: 4px; padding: 5px 8px; cursor: pointer;">⟳</button>
      <button id="agent-close-ports" style="background: #444; color: white; border: none; border-radius: 4px; padding: 5px 8px; cursor: pointer;">×</button>
    </div>
  `;

  container.innerHTML = content;

  // Add refresh handler
  document
    .getElementById("agent-refresh-ports")
    .addEventListener("click", () => {
      refreshSerialPorts();
    });

  // Add close handler
  document.getElementById("agent-close-ports").addEventListener("click", () => {
    container.style.display = "none";
  });

  console.log("Port selector updated with ports:", ports);
}

/**
 * Update the port selector dropdown with available ports
 */
function updatePortSelector(ports) {
  // Create visible port selector if it doesn't exist
  createVisiblePortSelector(ports);
}

/**
 * Update styles of all upload buttons based on agent availability
 */
function updateAllUploadButtons() {
  // Find all upload buttons
  const uploadButtons = document.querySelectorAll(".arduino-upload-button");

  uploadButtons.forEach((button) => {
    if (agentAvailable) {
      button.classList.add("agent-available");
      button.classList.remove("agent-unavailable");
      button.disabled = false;
      button.title = "Upload sketch to board via Arduino Create Agent";
    } else {
      button.classList.add("agent-unavailable");
      button.classList.remove("agent-available");
      button.disabled = true;
      button.title =
        "Arduino Create Agent not detected - download source instead";
    }
  });
}

/**
 * Add a refresh button to manually refresh port list
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
  refreshButton.onclick = manualRefreshPorts;

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
    }
  }
}

/**
 * Add a port selector button to the header
 */
function addPortSelectorButton() {
  // Only add if it doesn't already exist
  if (document.querySelector(".port-selector-button")) {
    return;
  }

  const portButton = document.createElement("button");
  portButton.className = "port-selector-button";
  portButton.innerHTML = "Ports";
  portButton.title = "Show Arduino ports";

  portButton.onclick = () => {
    // Show the port selector if it exists
    const portSelector = document.getElementById(
      "agent-port-selector-container"
    );
    if (portSelector) {
      portSelector.style.display =
        portSelector.style.display === "none" ? "block" : "none";
    } else {
      // If it doesn't exist, try to refresh ports
      refreshSerialPorts();
    }
  };

  // Add to header after refresh button
  const refreshButton = document.querySelector(".refresh-ports-button");
  if (refreshButton && refreshButton.parentNode) {
    refreshButton.parentNode.insertBefore(
      portButton,
      refreshButton.nextSibling
    );
  } else {
    // Fallback - add to the header
    const headerNav = document.querySelector(".header-nav");
    if (headerNav) {
      headerNav.appendChild(portButton);
    }
  }
}

/**
 * Manually trigger a port refresh and update the UI
 */
async function manualRefreshPorts() {
  try {
    const refreshButton = document.querySelector(".refresh-ports-button");
    if (refreshButton) {
      refreshButton.classList.add("refreshing");
      refreshButton.disabled = true;
    }

    // Show a loading status
    const statusElem = document.getElementById("agent-status-indicator");
    if (statusElem) {
      statusElem.innerHTML = `
        <span class="agent-status-dot connected"></span>
        <span class="agent-status-text">Refreshing ports...</span>
      `;
    }

    // If agent is not connected, try to initialize again
    if (!agentAvailable) {
      console.log("Agent not connected, attempting to reinitialize...");
      await initializeArduinoAgent();
    }

    // Call refreshSerialPorts and wait for it to complete
    let ports = [];
    if (agentAvailable) {
      ports = await refreshSerialPorts();
    }

    // Show success message with port count
    if (statusElem) {
      if (agentAvailable) {
        statusElem.innerHTML = `
          <span class="agent-status-dot connected"></span>
          <span class="agent-status-text">Agent Ready (${detectedSerialPorts.length} ports)</span>
        `;
      } else {
        statusElem.innerHTML = `
          <span class="agent-status-dot disconnected"></span>
          <span class="agent-status-text">Agent Not Found</span>
        `;
      }
    }

    // Make port selector visible if it exists
    const portSelector = document.getElementById(
      "agent-port-selector-container"
    );
    if (portSelector) {
      portSelector.style.display = "block";
    }

    // Alert user about the result
    if (agentAvailable) {
      if (detectedSerialPorts.length > 0) {
        alert(
          `Found ${detectedSerialPorts.length} port(s):\n\n${detectedSerialPorts
            .map((p) => p.Name || p.name || p.path || JSON.stringify(p))
            .join("\n")}`
        );
      } else {
        alert(
          "No Arduino boards detected. Please make sure your board is connected and drivers are installed."
        );
      }
    } else {
      alert(
        "Arduino Create Agent not found. Please make sure it's running and refresh the page."
      );
    }
  } catch (error) {
    console.error("Error refreshing ports:", error);
    alert("Error refreshing ports: " + error.message);
  } finally {
    const refreshButton = document.querySelector(".refresh-ports-button");
    if (refreshButton) {
      refreshButton.classList.remove("refreshing");
      refreshButton.disabled = false;
    }
  }
}

/**
 * Adds Arduino buttons to all Arduino code blocks
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
  uploadButton.disabled = !agentAvailable; // Only enabled if agent is available
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
      "Arduino Create Agent not detected - download source instead";
    uploadButton.classList.add("agent-unavailable");
  }

  // Create download source button
  const downloadSourceButton = document.createElement("button");
  downloadSourceButton.classList.add("arduino-download-source-button");
  downloadSourceButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Download
    `;
  downloadSourceButton.title = "Download as Arduino sketch (.ino)";

  // Add status indicator
  const statusIndicator = document.createElement("span");
  statusIndicator.classList.add("arduino-status");

  // Add to container
  buttonContainer.appendChild(compileButton);
  buttonContainer.appendChild(uploadButton);
  buttonContainer.appendChild(downloadSourceButton);
  buttonContainer.appendChild(statusIndicator);

  // Add to code block
  codeBlock.appendChild(buttonContainer);

  // Add event listeners
  compileButton.addEventListener("click", function () {
    compileArduinoCode(codeElement.textContent, codeBlock);
  });

  uploadButton.addEventListener("click", function () {
    if (agentAvailable) {
      uploadWithAgent(codeBlock);
    } else {
      showAgentRequiredDialog(codeBlock);
    }
  });

  downloadSourceButton.addEventListener("click", function () {
    downloadSourceCode(codeBlock);
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
  }
}

/**
 * Handle upload status messages
 */
function handleUploadStatus(message) {
  if (!currentCodeBlock) return;

  if (message.Msg) {
    updateCompileStatus("uploading", message.Msg, currentCodeBlock);
  }

  if (message.ProgrammerStatus === "Done" || message.Flash === "Ok") {
    updateCompileStatus(
      "success",
      "Upload completed successfully!",
      currentCodeBlock
    );

    // Re-enable buttons
    const compileButton = currentCodeBlock.querySelector(
      ".arduino-compile-button"
    );
    const uploadButton = currentCodeBlock.querySelector(
      ".arduino-upload-button"
    );
    const downloadSourceButton = currentCodeBlock.querySelector(
      ".arduino-download-source-button"
    );

    if (compileButton) compileButton.disabled = false;
    if (uploadButton) uploadButton.disabled = false;
    if (downloadSourceButton) downloadSourceButton.disabled = false;

    compileUploadInProgress = false;
  }

  if (message.Error || message.ProgrammerStatus === "Error") {
    updateCompileStatus(
      "error",
      `Upload failed: ${message.Msg || message.Error || "Unknown error"}`,
      currentCodeBlock
    );

    // Re-enable buttons
    const compileButton = currentCodeBlock.querySelector(
      ".arduino-compile-button"
    );
    const uploadButton = currentCodeBlock.querySelector(
      ".arduino-upload-button"
    );
    const downloadSourceButton = currentCodeBlock.querySelector(
      ".arduino-download-source-button"
    );

    if (compileButton) compileButton.disabled = false;
    if (uploadButton) uploadButton.disabled = false;
    if (downloadSourceButton) downloadSourceButton.disabled = false;

    compileUploadInProgress = false;
  }
}

/**
 * Synchronize board FQBN with project settings
 */
function setupBoardFQBNSync() {
  // Hook into project save function
  if (typeof window.saveProject === "function") {
    const originalSaveProject = window.saveProject;

    window.saveProject = function () {
      // Get FQBN value
      const boardFQBN = document.getElementById("board-fqbn").value || "";

      // Get existing projectData - use object destructuring
      const projectData = {
        name: document.getElementById("project-name").value,
        board_type: document.getElementById("board-type").value || "",
        board_fqbn: boardFQBN,
        components_text: document.getElementById("components-text").value || "",
        libraries_text: document.getElementById("libraries-text").value || "",
        description: document.getElementById("board-type").value
          ? `Arduino project using ${
              document.getElementById("board-type").value
            }`
          : "Arduino project",
        query_model: document.getElementById("query-model").value || null,
        summary_model: document.getElementById("summary-model").value || null,
        history_window_size: parseInt(
          document.getElementById("history-window").value,
          10
        ),
      };

      // Continue with original save logic
      const method = currentProjectId ? "PUT" : "POST";
      const url = currentProjectId
        ? `/api/projects/${currentProjectId}/`
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
            return handleFetchError(response);
          }
          return response.json();
        })
        .then((data) => {
          currentProjectId = data.id;
          alert("Project saved successfully!");
          setTimeout(loadUserProjects, 1000);
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

          // Continue with the original load
          document.getElementById("project-name").value = data.name;
          document.getElementById("board-type").value = data.board_type || "";
          document.getElementById("components-text").value =
            data.components_text || "";
          document.getElementById("libraries-text").value =
            data.libraries_text || "";

          // Update other fields as in the original function
          document.getElementById("query-model").value = data.query_model || "";
          document.getElementById("summary-model").value =
            data.summary_model || "";

          const slider = document.getElementById("history-window");
          slider.value = data.history_window_size || 10;
          document.getElementById("history-window-value").textContent =
            slider.value + " messages";

          // Update current project ID
          currentProjectId = data.id;

          // Load the project's conversation messages
          loadProjectMessages(projectId);
        })
        .catch((error) => console.error("Error loading project:", error));
    };
  }
}
