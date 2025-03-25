// arduino-upload.js - Arduino compilation and upload functionality

// Global variables
let currentCompiledBinary = null;
let currentBinaryInfo = null;
let compileUploadInProgress = false;
let currentCodeBlock = null;

// Global variables for agent integration
let agentAvailable = false;
let detectedSerialPorts = [];
let agentInfo = null;
let agentSocket = null;
let agentPort = null;

/**
 * Discover the Arduino Create Agent port by checking each possible port
 */
async function discoverAgentPort() {
  console.log("Starting Arduino Create Agent discovery...");

  // Try each port from 8990 to 9000
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
 * Connect to the Arduino Create Agent via WebSocket
 */
async function connectToAgentWebSocket() {
  if (!agentInfo || !agentInfo.ws) {
    console.error("Agent info not available, cannot connect to WebSocket");
    return false;
  }

  try {
    console.log(`Connecting to agent WebSocket at ${agentInfo.ws}`);

    // Connect to the WebSocket endpoint using socket.io
    const socket = io.connect(agentInfo.ws, {
      forceNew: true,
      reconnection: true,
      timeout: 5000,
      transports: ["websocket", "polling"], // Try both connection types
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

        // Test command to verify communication
        socket.emit("command", "version");
        console.log("Sent 'version' command to test communication");

        // Set up a general listener for debugging
        socket.on("command", (message) => {
          console.log("Received command response:", message);
        });

        socket.on("message", (message) => {
          console.log("Received general message:", message);
        });

        // Update UI
        updateAgentUI(true);

        // Resolve the promise
        resolve(true);
      });

      // More debugging for connection states
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
        // Run immediate port detection using direct HTTP
        debugPortDetection();
      }
    } else {
      // Agent not found
      agentAvailable = false;
      updateAgentUI(false);
    }
  } catch (error) {
    console.error("Error initializing Arduino Create Agent:", error);
    agentAvailable = false;
    updateAgentUI(false);
  }
}

/**
 * Send a command to the agent and get the response
 */
async function sendAgentCommand(command) {
  if (!agentSocket) {
    throw new Error("Agent socket not connected");
  }

  return new Promise((resolve, reject) => {
    // Set a timeout for the entire operation
    const timeout = setTimeout(() => {
      console.error(`Command timed out: ${command}`);
      reject(new Error(`Command timed out: ${command}`));
    }, 5000);

    console.log(`Sending command to agent: ${command}`);

    // For this specific agent, we need to set up a general message handler
    // because the response comes as a general message, not a command response
    const messageHandler = (message) => {
      console.log("Checking message:", message);

      // If this is a command echo, ignore it
      if (message === command) {
        console.log("Ignoring command echo");
        return;
      }

      // If this is a real response with data
      if (
        typeof message === "object" &&
        (message.Ports || message["Serial Ports"])
      ) {
        console.log("Found ports response:", message);
        clearTimeout(timeout);
        agentSocket.off("message", messageHandler); // Remove the handler
        resolve(message);
      }
    };

    // Listen for messages, not command responses
    agentSocket.on("message", messageHandler);

    // Send the command
    agentSocket.emit("command", command);

    // Also set up a fallback for command responses
    agentSocket.once("command", (response) => {
      console.log("Received command response:", response);
      // Only resolve if it's a proper response with ports data
      if (
        typeof response === "object" &&
        (response.Ports || response["Serial Ports"])
      ) {
        clearTimeout(timeout);
        agentSocket.off("message", messageHandler); // Clean up the message handler
        resolve(response);
      }
      // Otherwise this might just be an echo or acknowledgment
    });
  });
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
 * Refresh serial ports from Arduino Create Agent
 */
async function refreshSerialPorts() {
  if (!agentAvailable || !agentSocket) {
    console.log("Cannot refresh ports - agent not available");
    return [];
  }

  try {
    console.log("Requesting serial ports list from agent...");

    return new Promise((resolve) => {
      // Clear existing ports first
      detectedSerialPorts = [];

      // Set up a LONGER timeout (increase from 5000 to 15000ms)
      const timeout = setTimeout(() => {
        console.log("Port listing request timed out");
        resolve([]);
      }, 15000);

      // More robust message handling with debugging
      const messageHandler = (message) => {
        console.log("Received message while listing ports:", message);

        // Deep debugging of message structure
        console.log("Message type:", typeof message);
        if (typeof message === "string") {
          try {
            // Try parsing if it's a JSON string
            message = JSON.parse(message);
            console.log("Parsed message:", message);
          } catch (e) {
            console.log("Not a JSON string");
          }
        } else if (typeof message === "object") {
          console.log("Message keys:", Object.keys(message));

          // Check if Ports exists and log its structure
          if (message.Ports) {
            console.log("Ports type:", typeof message.Ports);
            console.log("Is array:", Array.isArray(message.Ports));
            console.log(
              "Ports length:",
              message.Ports ? message.Ports.length : 0
            );
          }
        }

        // More comprehensive port detection logic
        if (message && typeof message === "object") {
          // Check for various possible formats
          if (
            message.Ports &&
            Array.isArray(message.Ports) &&
            message.Ports.length > 0
          ) {
            console.log(
              "SUCCESS: Found ports in 'Ports' field:",
              message.Ports
            );
            detectedSerialPorts = message.Ports;
            clearTimeout(timeout);
            agentSocket.off("message", messageHandler);

            // Update UI
            updatePortSelector(detectedSerialPorts);
            updateAgentUI(true);

            resolve(detectedSerialPorts);
            return; // Exit handler after successful processing
          } else if (
            message["Serial Ports"] &&
            Array.isArray(message["Serial Ports"]) &&
            message["Serial Ports"].length > 0
          ) {
            console.log(
              "SUCCESS: Found ports in 'Serial Ports' field:",
              message["Serial Ports"]
            );
            detectedSerialPorts = message["Serial Ports"];
            clearTimeout(timeout);
            agentSocket.off("message", messageHandler);

            updatePortSelector(detectedSerialPorts);
            updateAgentUI(true);

            resolve(detectedSerialPorts);
            return; // Exit handler after successful processing
          }
          // Try to find any array that might contain port data
          else {
            for (const key of Object.keys(message)) {
              if (
                Array.isArray(message[key]) &&
                message[key].length > 0 &&
                message[key][0] &&
                message[key][0].Name &&
                (message[key][0].VendorID || message[key][0].ProductID)
              ) {
                console.log(
                  `SUCCESS: Found ports in '${key}' field:`,
                  message[key]
                );
                detectedSerialPorts = message[key];
                clearTimeout(timeout);
                agentSocket.off("message", messageHandler);

                updatePortSelector(detectedSerialPorts);
                updateAgentUI(true);

                resolve(detectedSerialPorts);
                return; // Exit handler after successful processing
              }
            }
          }
        }
      };

      // Important - add the handler BEFORE sending the command
      agentSocket.on("message", messageHandler);

      // Send the list command
      console.log("Emitting 'list' command to agent socket...");
      agentSocket.emit("command", "list");
    });
  } catch (error) {
    console.error("Error refreshing serial ports:", error);
    return [];
  }
}

/**
 * Add a refresh button for users to manually refresh port list
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
 * Manually trigger a port refresh and update the UI
 */
async function manualRefreshPorts() {
  try {
    console.log("Manual port refresh started...");
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
    console.log("Calling refreshSerialPorts()...");
    let ports = [];
    if (agentAvailable) {
      ports = await refreshSerialPorts();
    }
    console.log("refreshSerialPorts() returned:", ports);
    console.log("detectedSerialPorts is now:", detectedSerialPorts);

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

    // Alert user about the result with more details
    if (agentAvailable) {
      if (detectedSerialPorts && detectedSerialPorts.length > 0) {
        alert(
          `Found ${detectedSerialPorts.length} port(s):\n\n${detectedSerialPorts
            .map(
              (p) =>
                `${p.Name || p.name || p.path || "Unknown"} (${
                  p.VendorID || ""
                }:${p.ProductID || ""})`
            )
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
 * Update the port selector dropdown with available ports
 */
function updatePortSelector(ports) {
  // Only implement if you have a port selector dropdown
  const portSelector = document.getElementById("serial-port-selector");
  if (!portSelector) {
    // Create a port selector if it doesn't exist
    createPortSelector(ports);
    return;
  }

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
    const portName = port.Name;
    const portID = port.ProductID || "Unknown";

    option.value = portName;
    option.textContent = `${portName} (${portID})`;
    portSelector.appendChild(option);
  });
}

/**
 * Create a port selector if one doesn't exist
 */
function createPortSelector(ports) {
  // Check if the selector already exists
  if (document.getElementById("serial-port-selector")) return;

  // Create the port selector
  const selectorContainer = document.createElement("div");
  selectorContainer.className = "port-selector-container";
  selectorContainer.innerHTML = `
    <label for="serial-port-selector">Port:</label>
    <select id="serial-port-selector" class="port-selector">
      <option value="">Select Port</option>
    </select>
  `;

  // Add ports to the selector
  const portSelector = selectorContainer.querySelector("#serial-port-selector");
  ports.forEach((port) => {
    const option = document.createElement("option");
    const portName = port.Name;
    const portID = port.ProductID || "Unknown";

    option.value = portName;
    option.textContent = `${portName} (${portID})`;
    portSelector.appendChild(option);
  });

  // Add the selector to the header
  const headerNav = document.querySelector(".header-nav");
  if (headerNav) {
    headerNav.appendChild(selectorContainer);
  }
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
      button.disabled = false; // Enable upload buttons when agent is available
      button.title = "Upload sketch to board via Arduino Create Agent";
    } else {
      button.classList.add("agent-unavailable");
      button.classList.remove("agent-available");
      button.disabled = true; // Disable upload buttons when agent is not available
      button.title =
        "Arduino Create Agent not detected - download source instead";
    }
  });
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

  // Create download source button (using the download binary icon)
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
 * Synchronize board FQBN with project settings
 */
function setupBoardFQBNSync() {
  // Hook into project save function
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
        ? `Arduino project using ${document.getElementById("board-type").value}`
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

  // Hook into project load function to set the FQBN
  const originalLoadProject = window.loadProject;

  if (originalLoadProject) {
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

/**
 * Compile Arduino code
 */
function compileArduinoCode(code, codeBlock) {
  // Check if there is a selected board
  const boardFQBN = document.getElementById("board-fqbn").value;
  if (!boardFQBN) {
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
  formData.append("board_fqbn", boardFQBN);
  // Important! Use "webserial" method to match your backend expectation
  formData.append("upload_method", "webserial");

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

      // Response is JSON
      return response.json();
    })
    .then((data) => {
      // Store binary data for upload
      currentBinaryInfo = data;
      console.log("Compilation successful, binary info:", {
        protocol: data.protocol,
        binarySize: data.binary ? data.binary.length : 0,
      });

      // Update status
      updateCompileStatus(
        "compiled",
        "Compilation successful! Ready to upload.",
        codeBlock
      );

      // Enable upload button
      const uploadButton = codeBlock.querySelector(".arduino-upload-button");
      if (uploadButton && agentAvailable) uploadButton.disabled = false;

      // Re-enable compile button
      if (compileButton) compileButton.disabled = false;

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
      if (compileButton) compileButton.disabled = false;

      // Reset in-progress flag
      compileUploadInProgress = false;
    });
}

/**
 * Upload via Arduino Create Agent using direct HTTP upload
 */

/**
 * Upload via Arduino Create Agent using direct HTTP upload
 */
// async function uploadWithAgent(codeBlock) {
//   // Check if we have compiled binary
//   if (!currentBinaryInfo) {
//     alert("Please compile the code first.");
//     return;
//   }

//   // Check if upload is already in progress
//   if (compileUploadInProgress) {
//     alert("A compilation or upload is already in progress. Please wait.");
//     return;
//   }

//   // Check if the agent is available
//   if (!agentAvailable || !agentInfo || !agentInfo.http) {
//     showAgentRequiredDialog(codeBlock);
//     return;
//   }

//   try {
//     // Force refresh ports using WebSocket
//     const ports = await refreshSerialPorts();
//     console.log("Refreshed ports for upload:", ports);

//     // Update the selector
//     createVisiblePortSelector(ports);
//   } catch (error) {
//     console.error("Error refreshing ports for upload:", error);
//   }

//   // Check if we have any ports now
//   if (!detectedSerialPorts || detectedSerialPorts.length === 0) {
//     alert(
//       "No serial ports detected. Please connect your Arduino board and refresh the port list."
//     );
//     return;
//   }

//   // Get the selected port from our visible selector
//   let selectedPort = null;
//   const portSelector = document.getElementById("agent-port-selector");

//   if (portSelector && portSelector.value) {
//     selectedPort = portSelector.value;
//     console.log(`Using selected port from visible selector: ${selectedPort}`);
//   } else if (detectedSerialPorts.length === 1) {
//     // If only one port, use it
//     selectedPort = detectedSerialPorts[0].Name;
//     console.log(`Auto-selected port: ${selectedPort}`);
//   } else {
//     // Show selection dialog
//     const portOptions = detectedSerialPorts
//       .map(
//         (port) =>
//           `${port.Name} (${port.VendorID || ""}:${port.ProductID || ""})`
//       )
//       .join("\n");

//     const portInput = prompt(
//       `Multiple ports detected. Please select one:\n\n${portOptions}`,
//       detectedSerialPorts[0].Name
//     );

//     if (!portInput) return; // User cancelled

//     // Extract port name if full description was copied
//     selectedPort = portInput.trim();
//     if (selectedPort.includes(" (")) {
//       selectedPort = selectedPort.split(" (")[0].trim();
//     }

//     // Validate port exists
//     const portExists = detectedSerialPorts.some((p) => p.Name === selectedPort);
//     if (!portExists) {
//       alert(`Invalid port: ${selectedPort}`);
//       return;
//     }
//   }

//   // Set the upload in progress flag
//   compileUploadInProgress = true;
//   currentCodeBlock = codeBlock;

//   // Update status
//   updateCompileStatus(
//     "uploading",
//     "Preparing to upload via Arduino Create Agent...",
//     codeBlock
//   );

//   // Disable buttons during upload
//   const compileButton = codeBlock.querySelector(".arduino-compile-button");
//   const uploadButton = codeBlock.querySelector(".arduino-upload-button");
//   const downloadSourceButton = codeBlock.querySelector(
//     ".arduino-download-source-button"
//   );

//   if (compileButton) compileButton.disabled = true;
//   if (uploadButton) uploadButton.disabled = true;
//   if (downloadSourceButton) downloadSourceButton.disabled = true;

//   // Get board FQBN
//   const boardFQBN = document.getElementById("board-fqbn").value;

//   try {
//     // Prepare for upload status messages
//     await setupUploadListener();

//     // Prepare upload payload according to documentation
//     const uploadTimestamp = new Date().getTime();
//     const filename = `sketch_${uploadTimestamp}.hex`;

//     // This is the critical part that needs fixing
//     const uploadData = {
//       board: boardFQBN,
//       port: selectedPort,
//       filename: filename,
//       hex: currentBinaryInfo.binary, // Base64 encoded binary
//       data: currentBinaryInfo.binary, // Include data field as well as mentioned in docs
//       network: false,

//       // Add a generated/calculated signature (this is a simplified approach)
//       signature: generateSignature(
//         boardFQBN,
//         selectedPort,
//         currentBinaryInfo.binary
//       ),

//       // The commandline should come from the server or be constructed properly
//       commandline:
//         currentBinaryInfo.commandline ||
//         generateDefaultCommandline(boardFQBN, selectedPort, filename),

//       extra: {
//         auth: {
//           username: null,
//           password: null,
//           private_key: null,
//           port: null,
//         },
//         use_1200bps_touch: true,
//         wait_for_upload_port: true,
//       },
//       extrafiles: [],
//     };

//     console.log("Uploading sketch to Arduino Create Agent...");
//     updateCompileStatus(
//       "uploading",
//       "Sending sketch to Arduino Create Agent...",
//       codeBlock
//     );

//     // Make the HTTP POST request to the agent for upload
//     const uploadResponse = await fetch(`${agentInfo.http}`, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify(uploadData),
//     });

//     if (!uploadResponse.ok) {
//       const errorText = await uploadResponse.text();
//       throw new Error(`Upload failed: ${errorText}`);
//     }

//     // The upload has started - success messages will come via the WebSocket
//     console.log("Upload started successfully");
//   } catch (error) {
//     console.error("Upload error:", error);
//     updateCompileStatus("error", `Upload failed: ${error.message}`, codeBlock);
//     resetButtons();
//   }

//   // Helper function to setup WebSocket listener for upload messages
//   async function setupUploadListener() {
//     return new Promise((resolve) => {
//       if (!agentSocket) {
//         throw new Error("Agent WebSocket not connected");
//       }

//       // Listen for upload status messages
//       const messageHandler = (message) => {
//         console.log("Upload status:", message);

//         if (message && typeof message === "object") {
//           // Handle different message formats
//           if (message.Msg) {
//             updateCompileStatus("uploading", message.Msg, codeBlock);
//           }

//           // Check for completion
//           if (message.ProgrammerStatus === "Done" || message.Flash === "Ok") {
//             updateCompileStatus(
//               "success",
//               "Upload completed successfully!",
//               codeBlock
//             );
//             resetButtons();

//             // Remove the listener
//             agentSocket.off("message", messageHandler);
//           }

//           // Check for errors
//           if (message.Error || message.ProgrammerStatus === "Error") {
//             updateCompileStatus(
//               "error",
//               `Upload failed: ${
//                 message.Msg || message.Error || "Unknown error"
//               }`,
//               codeBlock
//             );
//             resetButtons();

//             // Remove the listener
//             agentSocket.off("message", messageHandler);
//           }
//         }
//       };

//       // Add the listener
//       agentSocket.on("message", messageHandler);

//       // Also listen for 'command' event which might contain upload messages
//       agentSocket.on("command", (command) => {
//         console.log("Agent command:", command);

//         // Process command message similar to message handler
//         if (command && typeof command === "object") {
//           if (command.Msg) {
//             updateCompileStatus("uploading", command.Msg, codeBlock);
//           }

//           if (command.ProgrammerStatus === "Done" || command.Flash === "Ok") {
//             updateCompileStatus(
//               "success",
//               "Upload completed successfully!",
//               codeBlock
//             );
//             resetButtons();
//           }

//           if (command.Error || command.ProgrammerStatus === "Error") {
//             updateCompileStatus(
//               "error",
//               `Upload failed: ${
//                 command.Msg || command.Error || "Unknown error"
//               }`,
//               codeBlock
//             );
//             resetButtons();
//           }
//         }
//       });

//       // Resolve immediately to continue with upload
//       resolve();
//     });
//   }

//   // Helper function to re-enable buttons
//   function resetButtons() {
//     if (compileButton) compileButton.disabled = false;
//     if (uploadButton) uploadButton.disabled = false;
//     if (downloadSourceButton) downloadSourceButton.disabled = false;
//     compileUploadInProgress = false;
//   }
// }

// Add these helper functions
/**
 * Upload via Arduino Create Agent using direct HTTP upload
 */
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
  if (!agentAvailable || !agentInfo || !agentInfo.http) {
    showAgentRequiredDialog(codeBlock);
    return;
  }

  try {
    // Force refresh ports using WebSocket
    const ports = await refreshSerialPorts();
    console.log("Refreshed ports for upload:", ports);

    // Update the selector
    createVisiblePortSelector(ports);
  } catch (error) {
    console.error("Error refreshing ports for upload:", error);
  }

  // Check if we have any ports now
  if (!detectedSerialPorts || detectedSerialPorts.length === 0) {
    alert(
      "No serial ports detected. Please connect your Arduino board and refresh the port list."
    );
    return;
  }

  // Get the selected port from our visible selector
  let selectedPort = null;
  const portSelector = document.getElementById("agent-port-selector");

  if (portSelector && portSelector.value) {
    selectedPort = portSelector.value;
    console.log(`Using selected port from visible selector: ${selectedPort}`);
  } else if (detectedSerialPorts.length === 1) {
    // If only one port, use it
    selectedPort = detectedSerialPorts[0].Name;
    console.log(`Auto-selected port: ${selectedPort}`);
  } else {
    // Show selection dialog
    const portOptions = detectedSerialPorts
      .map(
        (port) =>
          `${port.Name} (${port.VendorID || ""}:${port.ProductID || ""})`
      )
      .join("\n");

    const portInput = prompt(
      `Multiple ports detected. Please select one:\n\n${portOptions}`,
      detectedSerialPorts[0].Name
    );

    if (!portInput) return; // User cancelled

    // Extract port name if full description was copied
    selectedPort = portInput.trim();
    if (selectedPort.includes(" (")) {
      selectedPort = selectedPort.split(" (")[0].trim();
    }

    // Validate port exists
    const portExists = detectedSerialPorts.some((p) => p.Name === selectedPort);
    if (!portExists) {
      alert(`Invalid port: ${selectedPort}`);
      return;
    }
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
  const downloadSourceButton = codeBlock.querySelector(
    ".arduino-download-source-button"
  );

  if (compileButton) compileButton.disabled = true;
  if (uploadButton) uploadButton.disabled = true;
  if (downloadSourceButton) downloadSourceButton.disabled = true;

  // Get board FQBN
  const boardFQBN = document.getElementById("board-fqbn").value;

  try {
    // Prepare for upload status messages
    await setupUploadListener();

    // Prepare upload payload according to documentation
    const uploadTimestamp = new Date().getTime();
    const filename = `sketch_${uploadTimestamp}.hex`;

    // Generate commandline
    const commandlineStr =
      currentBinaryInfo.commandline ||
      generateDefaultCommandline(boardFQBN, selectedPort, filename);

    console.log("Requesting signature for commandline:", commandlineStr);

    // Get signature from server
    const response = await fetch("/api/sign-arduino-command/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"), // Include Django CSRF token
      },
      body: JSON.stringify({ commandline: commandlineStr }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get signature: ${errorText}`);
    }

    const { signature } = await response.json();
    console.log("Received signature:", signature);

    // Create upload data with the signature
    const uploadData = {
      board: boardFQBN,
      port: selectedPort,
      filename: filename,
      hex: currentBinaryInfo.binary,
      network: false,
      commandline: commandlineStr,
      signature: signature,
      extra: {
        auth: {
          username: null,
          password: null,
          private_key: null,
          port: null,
        },
        use_1200bps_touch: true,
        wait_for_upload_port: true,
      },
      extrafiles: [],
    };

    // Log the upload data (but not the entire binary)
    console.log("Upload payload (truncated):", {
      ...uploadData,
      hex: uploadData.hex.substring(0, 100) + "...", // Truncate for logging
    });

    // Make the HTTP POST request to the agent for upload
    const uploadUrl = `${agentInfo.http}/upload`;
    console.log(`Uploading to: ${uploadUrl}`);

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(uploadData),
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${errorText}`);
    }

    // The upload has started - success messages will come via the WebSocket
    console.log("Upload started successfully");
  } catch (error) {
    console.error("Upload error:", error);
    updateCompileStatus("error", `Upload failed: ${error.message}`, codeBlock);
    resetButtons();
  }

  // Helper function to setup WebSocket listener for upload messages
  async function setupUploadListener() {
    return new Promise((resolve) => {
      if (!agentSocket) {
        throw new Error("Agent WebSocket not connected");
      }

      // Listen for upload status messages
      const messageHandler = (message) => {
        console.log("Upload status:", message);

        if (message && typeof message === "object") {
          // Handle different message formats
          if (message.Msg) {
            updateCompileStatus("uploading", message.Msg, codeBlock);
          }

          // Check for completion
          if (message.ProgrammerStatus === "Done" || message.Flash === "Ok") {
            updateCompileStatus(
              "success",
              "Upload completed successfully!",
              codeBlock
            );
            resetButtons();

            // Remove the listener
            agentSocket.off("message", messageHandler);
          }

          // Check for errors
          if (message.Error || message.ProgrammerStatus === "Error") {
            updateCompileStatus(
              "error",
              `Upload failed: ${
                message.Msg || message.Error || "Unknown error"
              }`,
              codeBlock
            );
            resetButtons();

            // Remove the listener
            agentSocket.off("message", messageHandler);
          }
        }
      };

      // Add the listener
      agentSocket.on("message", messageHandler);

      // Also listen for 'command' event which might contain upload messages
      agentSocket.on("command", (command) => {
        console.log("Agent command:", command);

        // Process command message similar to message handler
        if (command && typeof command === "object") {
          if (command.Msg) {
            updateCompileStatus("uploading", command.Msg, codeBlock);
          }

          if (command.ProgrammerStatus === "Done" || command.Flash === "Ok") {
            updateCompileStatus(
              "success",
              "Upload completed successfully!",
              codeBlock
            );
            resetButtons();
          }

          if (command.Error || command.ProgrammerStatus === "Error") {
            updateCompileStatus(
              "error",
              `Upload failed: ${
                command.Msg || command.Error || "Unknown error"
              }`,
              codeBlock
            );
            resetButtons();
          }
        }
      });

      // Resolve immediately to continue with upload
      resolve();
    });
  }

  // Helper function to re-enable buttons
  function resetButtons() {
    if (compileButton) compileButton.disabled = false;
    if (uploadButton) uploadButton.disabled = false;
    if (downloadSourceButton) downloadSourceButton.disabled = false;
    compileUploadInProgress = false;
  }
}

/**
 * Generate a default commandline for upload
 */
function generateDefaultCommandline(board, port, filename) {
  // This is a simplified approach - in production this should come from the server
  // Different boards need different command lines
  if (board.includes("arduino:avr:uno")) {
    return `"{runtime.tools.avrdude.path}/bin/avrdude" "-C{runtime.tools.avrdude.path}/etc/avrdude.conf" -v -patmega328p -carduino -P${port} -b115200 -D "-Uflash:w:${filename}:i"`;
  } else if (board.includes("arduino:avr:leonardo")) {
    return `"{runtime.tools.avrdude.path}/bin/avrdude" "-C{runtime.tools.avrdude.path}/etc/avrdude.conf" -v -patmega32u4 -cavr109 -P${port} -b57600 -D "-Uflash:w:${filename}:i"`;
  } else {
    // Generic commandline
    return `"{runtime.tools.avrdude.path}/bin/avrdude" "-C{runtime.tools.avrdude.path}/etc/avrdude.conf" -v -P${port} -D "-Uflash:w:${filename}:i"`;
  }
}

// function generateDefaultCommandline(board, port, filename) {
//   if (board.includes("arduino:avr:uno")) {
//     return `\\"{runtime.tools.avrdude.path}/bin/avrdude\\" \\"-C{runtime.tools.avrdude.path}/etc/avrdude.conf\\" -v -patmega328p -carduino -P${port} -b115200 -D \\"-Uflash:w:${filename}:i\\"`;
//   } else if (board.includes("arduino:avr:leonardo")) {
//     return `\\"{runtime.tools.avrdude.path}/bin/avrdude\\" \\"-C{runtime.tools.avrdude.path}/etc/avrdude.conf\\" -v -patmega32u4 -cavr109 -P${port} -b57600 -D \\"-Uflash:w:${filename}:i\\"`;
//   } else {
//     // Generic commandline
//     return `\\"{runtime.tools.avrdude.path}/bin/avrdude\\" \\"-C{runtime.tools.avrdude.path}/etc/avrdude.conf\\" -v -P${port} -D \\"-Uflash:w:${filename}:i\\"`;
//   }
// }

// /**
//  * Generate a signature for the upload
//  * Note: In production, this should use a proper signing algorithm with a private key
//  */
// function generateSignature(board, port, binary) {
//   // This is a simplified approach - in production you'd use a proper signature algorithm
//   // The agent expects a signature created with a private key

//   // For testing purposes, we'll generate a simple hash-like value
//   // This won't work with a properly secured agent but might work with development agents
//   const str = `${board}:${port}:${binary.substring(0, 20)}`;
//   let hash = 0;
//   for (let i = 0; i < str.length; i++) {
//     hash = (hash << 5) - hash + str.charCodeAt(i);
//     hash |= 0; // Convert to 32bit integer
//   }
//   return hash.toString(16) + "temporary";
// }

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
        
        <p>In the meantime, you can download the sketch as a .ino file and compile/upload it manually using the Arduino IDE.</p>
        
        <div class="agent-dialog-buttons">
          <button class="agent-download-source">Download .ino</button>
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
    .querySelector(".agent-download-source")
    .addEventListener("click", () => {
      downloadSourceCode(codeBlock);
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
 * Download the source code as an .ino file
 */
function downloadSourceCode(codeBlock) {
  const codeElement = codeBlock.querySelector("code");
  if (!codeElement) return;

  const code = codeElement.textContent;
  const filename = `arduino_sketch_${new Date().getTime()}.ino`;

  // Create a download link
  const blob = new Blob([code], { type: "text/plain" });
  const downloadLink = document.createElement("a");
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = filename;

  // Add to document, click, and remove
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);

  updateCompileStatus("success", `Downloaded as ${filename}`, codeBlock);
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

function loadSocketIO() {
  return new Promise((resolve, reject) => {
    if (window.io) {
      console.log("Socket.io already loaded");
      resolve();
      return;
    }

    console.log("Loading socket.io library...");
    // Use socket.io 1.x which is more likely to be compatible with older agents
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

function debugPortDetection() {
  console.log("=== DEBUG: PORT DETECTION ===");
  console.log("Agent available:", agentAvailable);
  console.log("Agent socket:", agentSocket ? "Connected" : "Not connected");
  console.log("Current detected ports:", detectedSerialPorts);

  // Use WebSocket for port detection instead of direct HTTP
  if (agentSocket) {
    console.log("Attempting WebSocket port detection...");

    // Set up a one-time listener for the response
    const messageHandler = (message) => {
      console.log("Port detection response:", message);

      // Process ports from the response
      if (
        typeof message === "object" &&
        message.Ports &&
        Array.isArray(message.Ports)
      ) {
        detectedSerialPorts = message.Ports;
        console.log(
          "Successfully found ports via WebSocket:",
          detectedSerialPorts
        );

        // Create a visible port selector
        createVisiblePortSelector(detectedSerialPorts);

        // Update UI
        updateAgentUI(true);

        // Remove this handler after processing
        agentSocket.off("message", messageHandler);
      }
    };

    // Add the message handler
    agentSocket.on("message", messageHandler);

    // Send the list command via WebSocket
    agentSocket.emit("command", "list");
    console.log("Sent 'list' command via WebSocket");
  } else {
    console.log("Cannot detect ports - WebSocket not connected");
  }
}

function createVisiblePortSelector(ports) {
  // Remove any existing port selector
  const existingSelector = document.getElementById(
    "agent-port-selector-container"
  );
  if (existingSelector) {
    existingSelector.remove();
  }

  // Create a container for the port selector
  const container = document.createElement("div");
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

  // Create the selector
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
    </div>
  `;

  container.innerHTML = content;
  document.body.appendChild(container);

  // Add refresh handler
  document
    .getElementById("agent-refresh-ports")
    .addEventListener("click", () => {
      debugPortDetection(); // This will refresh ports and update the UI
    });

  // Store ports in a global variable for upload access
  window.agentPorts = ports;
  console.log("Port selector created with ports:", ports);
}

// Initialize everything when the document is loaded
document.addEventListener("DOMContentLoaded", async function () {
  try {
    // First make sure socket.io is loaded
    await loadSocketIO();

    // Then initialize the agent
    await initializeArduinoAgent();

    // Add compile and upload buttons to code blocks
    addArduinoButtons();

    // Setup board FQBN synchronization with project settings
    setupBoardFQBNSync();

    // Add observer to detect new code blocks added by AI
    setupCodeBlockObserver();

    // Add refresh ports button with a slight delay
    setTimeout(addRefreshPortsButton, 1000);
  } catch (error) {
    console.error("Error initializing Arduino integration:", error);
  }
});
