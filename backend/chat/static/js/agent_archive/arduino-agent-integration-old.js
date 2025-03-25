// Global variables
let daemon = null;
let agentAvailable = false;
let detectedSerialPorts = [];

// Initialize Arduino Create Agent when the page loads
document.addEventListener("DOMContentLoaded", function () {
  // Check if the Daemon class exists
  if (typeof Daemon === "undefined") {
    console.error("Arduino Create Agent client library not loaded");
    // Add a CDN script dynamically
    const script = document.createElement("script");
    script.src =
      "https://unpkg.com/arduino-create-agent-js-client@latest/dist/arduino-create-agent-js-client.min.js";
    script.onload = initializeAgent;
    script.onerror = () =>
      console.error("Failed to load Arduino Create Agent client library");
    document.head.appendChild(script);
  } else {
    // Library already loaded, initialize
    initializeAgent();
  }
});

// Initialize the agent
function initializeAgent() {
  try {
    console.log("Initializing Arduino Create Agent client...");

    // Create a new instance
    daemon = new Daemon("https://builder.arduino.cc/v3/boards");

    // Subscribe to agent found/not found events
    daemon.agentFound.subscribe((status) => {
      console.log("Agent found status:", status);
      agentAvailable = status;
      updateAgentUI(status);
    });

    // Subscribe to device list updates
    daemon.devicesList.subscribe(({ serial, network }) => {
      console.log("Devices list updated:", { serial, network });
      detectedSerialPorts = serial || [];
    });

    // Subscribe to upload status
    daemon.uploading.subscribe((status) => {
      console.log("Upload status:", status);
      updateUploadStatus(status);
    });
  } catch (error) {
    console.error("Error initializing Arduino Create Agent client:", error);
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
    }
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

  if (detectedSerialPorts.length === 0) {
    alert(
      "No Arduino boards detected. Please connect your board and try again."
    );
    return;
  }

  // Choose a port
  let selectedPort = null;

  if (detectedSerialPorts.length === 1) {
    selectedPort =
      detectedSerialPorts[0].Name ||
      detectedSerialPorts[0].path ||
      detectedSerialPorts[0];
  } else {
    const portOptions = detectedSerialPorts
      .map((port) => {
        const name = port.Name || port.path || port;
        return name;
      })
      .join("\n");

    selectedPort = prompt(
      `Select port:\n\n${portOptions}`,
      detectedSerialPorts[0].Name || detectedSerialPorts[0].path
    );
    if (!selectedPort) return;
  }

  // Set flags and update UI
  compileUploadInProgress = true;
  currentCodeBlock = codeBlock;

  // Disable buttons
  const compileButton = codeBlock.querySelector(".arduino-compile-button");
  const uploadButton = codeBlock.querySelector(".arduino-upload-button");
  const downloadButton = codeBlock.querySelector(".arduino-download-button");

  if (compileButton) compileButton.disabled = true;
  if (uploadButton) uploadButton.disabled = true;
  if (downloadButton) downloadButton.disabled = true;

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
      true
    );
  } catch (error) {
    updateCompileStatus("error", `Upload failed: ${error.message}`, codeBlock);
    enableCodeBlockButtons(codeBlock);
    compileUploadInProgress = false;
  }
}
