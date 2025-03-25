// arduino-agent-official.js
// Integration with Arduino Create Agent using the official client library

// Init with your app name, which should match the origins in config.ini
let daemon = null;

// Initialize the agent client
function initializeAgent() {
  try {
    // Create a new instance of the client
    // The URL parameter is not actually used for agent detection
    daemon = new Daemon("https://boardboost.example.com");

    // Subscribe to agent found/not found events
    daemon.agentFound.subscribe((status) => {
      console.log("Agent found status:", status);
      updateAgentUI(status);

      if (status) {
        // Agent was found, try to get devices
        refreshSerialPorts();
      }
    });

    // Subscribe to channel status
    daemon.channelOpenStatus.subscribe((status) => {
      console.log("Channel open status:", status);
    });

    // Subscribe to error messages
    daemon.error.subscribe((err) => {
      console.error("Arduino Create Agent error:", err);
    });

    // Subscribe to device list updates
    daemon.devicesList.subscribe(({ serial, network }) => {
      console.log("Devices list updated:", { serial, network });

      // Update our global list of serial ports
      detectedSerialPorts = serial || [];

      // Update any port selector UI
      updatePortSelector(detectedSerialPorts);
    });

    // Subscribe to upload status
    daemon.uploading.subscribe((status) => {
      console.log("Upload status:", status);

      // Update UI based on upload status
      if (status && status.inProgress) {
        const progress = status.progress || 0;
        if (currentCodeBlock) {
          updateCompileStatus(
            "uploading",
            `Uploading: ${status.message || `${progress}%`}`,
            currentCodeBlock
          );
        }
      }

      if (status && !status.inProgress && status.result) {
        if (currentCodeBlock) {
          if (status.result === "success") {
            updateCompileStatus(
              "success",
              "Upload completed successfully!",
              currentCodeBlock
            );
          } else {
            updateCompileStatus(
              "error",
              `Upload failed: ${status.message || "Unknown error"}`,
              currentCodeBlock
            );
          }

          // Re-enable buttons
          const compileButton = currentCodeBlock.querySelector(
            ".arduino-compile-button"
          );
          const uploadButton = currentCodeBlock.querySelector(
            ".arduino-upload-button"
          );
          const downloadButton = currentCodeBlock.querySelector(
            ".arduino-download-button"
          );

          if (compileButton) compileButton.disabled = false;
          if (uploadButton) uploadButton.disabled = false;
          if (downloadButton) downloadButton.disabled = false;

          // Reset flag
          compileUploadInProgress = false;
        }
      }
    });

    // For API version 2 (daemon v1.6.1+)
    daemon.agentV2Found.subscribe((daemonV2) => {
      console.log("Agent V2 found:", daemonV2);

      // If v2 is available, we can use the better tool management API
      if (daemonV2) {
        // List installed tools
        daemon.v2
          .installedTools()
          .then((tools) => console.log("Installed tools:", tools))
          .catch((err) => console.error("Error getting tools:", err));
      }
    });
  } catch (error) {
    console.error("Error initializing Arduino Create Agent client:", error);
  }
}

// Call this to refresh the list of serial ports
function refreshSerialPorts() {
  if (!daemon) {
    console.error("Arduino Create Agent client not initialized");
    return [];
  }

  // The daemon.devicesList.subscribe will automatically
  // update our serial ports list when it changes
  console.log("Refreshing serial ports...");

  // We don't need to do anything here as the library handles this automatically
  return detectedSerialPorts;
}

// Upload a sketch using the Arduino Create Agent
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
  if (!daemon || !agentAvailable) {
    showAgentRequiredDialog(codeBlock);
    return;
  }

  // If we have no detected ports, refresh the list
  if (detectedSerialPorts.length === 0) {
    alert(
      "No Arduino boards detected. Please connect your board and try again."
    );
    return;
  }

  // If we have only one port, use it automatically, otherwise prompt the user
  let selectedPort = null;

  if (detectedSerialPorts.length === 1) {
    selectedPort =
      detectedSerialPorts[0].Name ||
      detectedSerialPorts[0].path ||
      detectedSerialPorts[0];
  } else {
    // Show a dialog to select the port (simplified - you might want a proper dialog)
    const portOptions = detectedSerialPorts
      .map((port) => {
        const name = port.Name || port.path || port;
        const info = port.VendorID
          ? ` (${port.VendorID}:${port.ProductID})`
          : "";
        return `${name}${info}`;
      })
      .join("\n");

    const portInput = prompt(
      `Multiple ports detected. Please enter the port name to use:\n\n${portOptions}`,
      detectedSerialPorts[0].Name ||
        detectedSerialPorts[0].path ||
        detectedSerialPorts[0]
    );

    if (!portInput) return; // User cancelled

    selectedPort = portInput.trim();

    // Extract port name if full description was copied
    if (selectedPort.includes(" (")) {
      selectedPort = selectedPort.split(" (")[0].trim();
    }
  }

  // Set the upload in progress flag
  compileUploadInProgress = true;
  currentCodeBlock = codeBlock;

  // Update status
  updateCompileStatus("uploading", "Preparing to upload...", codeBlock);

  // Disable buttons during upload
  const compileButton = codeBlock.querySelector(".arduino-compile-button");
  const uploadButton = codeBlock.querySelector(".arduino-upload-button");
  const downloadButton = codeBlock.querySelector(".arduino-download-button");

  if (compileButton) compileButton.disabled = true;
  if (uploadButton) uploadButton.disabled = true;
  if (downloadButton) downloadButton.disabled = true;

  // Get board FQBN
  const boardFQBN = document.getElementById("board-fqbn").value;

  try {
    // Use the daemon to upload
    daemon.uploadSerial(
      {
        board: boardFQBN, // FQBN of the board
        port: selectedPort, // Serial port name
      },
      `sketch_${new Date().getTime()}`, // Sketch name
      {
        hex: currentBinaryInfo.binary, // This is base64 encoded binary
      },
      true // Verbose mode
    );

    // Note: Upload progress and success/failure will be reported via
    // the daemon.uploading.subscribe handler we set up in initializeAgent()
  } catch (error) {
    console.error("Error starting upload:", error);
    updateCompileStatus("error", `Upload failed: ${error.message}`, codeBlock);

    // Re-enable buttons
    if (compileButton) compileButton.disabled = false;
    if (uploadButton) uploadButton.disabled = false;
    if (downloadButton) downloadButton.disabled = false;

    // Reset flag
    compileUploadInProgress = false;
  }
}

// Add a manual test button for the agent
function addAgentTestButton() {
  const testButton = document.createElement("button");
  testButton.className = "test-agent-button";
  testButton.innerHTML = "Test Agent";
  testButton.title = "Test connection to Arduino Create Agent";
  testButton.onclick = () => {
    if (!daemon) {
      alert(
        "Arduino Create Agent client not initialized. Check console for errors."
      );
      return;
    }

    alert(
      "Testing Arduino Create Agent connection. Check console for results."
    );

    // Try to open serial monitor to test communication
    try {
      // Just list devices to test connection
      daemon.devicesList.subscribe(({ serial, network }) => {
        alert(
          `Connection successful!\nSerial ports: ${serial.length}\nNetwork ports: ${network.length}`
        );
      });
    } catch (e) {
      alert(`Agent test failed: ${e.message}`);
    }
  };

  // Add to header next to agent status
  const agentStatusIndicator = document.getElementById(
    "agent-status-indicator"
  );
  if (agentStatusIndicator && agentStatusIndicator.parentNode) {
    agentStatusIndicator.parentNode.insertBefore(
      testButton,
      agentStatusIndicator.nextSibling
    );
  }
}

// Initialize when the document is ready
document.addEventListener("DOMContentLoaded", function () {
  // Initialize agent with a delay to ensure the DOM is fully loaded
  setTimeout(() => {
    initializeAgent();
    addAgentTestButton();
  }, 500);
});

// Global variables
let agentAvailable = false;
let detectedSerialPorts = [];

// Update UI elements based on agent availability
function updateAgentUI(agentFound) {
  console.log("Agent status updated:", agentFound);
  agentAvailable = agentFound;

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
      <span class="agent-status-text">Arduino Agent Ready</span>
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
