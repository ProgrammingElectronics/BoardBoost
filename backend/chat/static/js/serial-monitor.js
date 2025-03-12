// Modifications to serial-monitor.js

// Update these global variables for the new implementation
let serialWriter = null;
let serialReader = null;
let readingActive = false;
let monitorVisible = false;
let serialMonitorOutput = null;
let serialMonitorInput = null;
let serialMonitorStatus = null;
let serialMonitorClearBtn = null;
let serialMonitorSendBtn = null;
let serialMonitorCloseBtn = null;
let serialMonitorAutoScroll = null;
let serialMonitorLineEnding = null;
let serialMonitorContainer = null;
let serialMonitorToggleBtn = null;

// Initialize the serial monitor when the document is loaded
document.addEventListener("DOMContentLoaded", () => {
  // Get DOM elements
  serialMonitorContainer = document.getElementById("serial-monitor-container");
  serialMonitorOutput = document.getElementById("serial-monitor-output");
  serialMonitorInput = document.getElementById("serial-monitor-input");
  serialMonitorStatus = document.getElementById("serial-monitor-status-text");
  serialMonitorClearBtn = document.getElementById("serial-monitor-clear");
  serialMonitorSendBtn = document.getElementById("serial-monitor-send");
  serialMonitorCloseBtn = document.getElementById("serial-monitor-close");
  serialMonitorAutoScroll = document.getElementById(
    "serial-monitor-autoscroll"
  );
  serialMonitorLineEnding = document.getElementById(
    "serial-monitor-line-ending"
  );
  serialMonitorToggleBtn = document.getElementById("serial-monitor-toggle");

  // Set up event listeners
  setupSerialMonitorEvents();
});

// Set up event listeners for the serial monitor
function setupSerialMonitorEvents() {
  // Button click handlers
  if (serialMonitorClearBtn) {
    serialMonitorClearBtn.addEventListener("click", clearSerialOutput);
  }

  if (serialMonitorSendBtn) {
    serialMonitorSendBtn.addEventListener("click", sendSerialData);
  }

  if (serialMonitorCloseBtn) {
    serialMonitorCloseBtn.addEventListener("click", closeSerialMonitor);
  }

  if (serialMonitorToggleBtn) {
    serialMonitorToggleBtn.addEventListener("click", toggleSerialMonitor);
  }

  // Input enter key handler
  if (serialMonitorInput) {
    serialMonitorInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendSerialData();
      }
    });
  }
}

// Toggle the visibility of the serial monitor
function toggleSerialMonitor() {
  if (!monitorVisible) {
    showSerialMonitor();
    console.log("Serial monitor opened");
  } else {
    closeSerialMonitor();
  }
}

// Show the serial monitor
function showSerialMonitor() {
  monitorVisible = true;

  // Add the visible class to the container
  if (serialMonitorContainer) {
    serialMonitorContainer.classList.add("visible");
  }

  // Update toggle button appearance
  if (serialMonitorToggleBtn) {
    serialMonitorToggleBtn.classList.add("active");
  }

  // Update status
  updateSerialMonitorStatus();

  // Start reading data if connected
  startReading();

  // Focus the input field
  if (serialMonitorInput) {
    serialMonitorInput.focus();
  }

  // Add a system message
  addSerialOutput("Serial monitor opened", "system");
}

// Close the serial monitor
function closeSerialMonitor() {
  monitorVisible = false;

  // Remove the visible class from the container
  if (serialMonitorContainer) {
    serialMonitorContainer.classList.remove("visible");
  }

  // Update toggle button appearance
  if (serialMonitorToggleBtn) {
    serialMonitorToggleBtn.classList.remove("active");
  }

  // Stop reading data
  stopReading();
}

// Clear the serial output
function clearSerialOutput() {
  if (serialMonitorOutput) {
    serialMonitorOutput.innerHTML = "";
    addSerialOutput("Output cleared", "system");
  }
}

// Add text to the serial output
function addSerialOutput(text, type = "receive") {
  const output = serialMonitorOutput;
  if (!output) return;

  const entry = document.createElement("div");
  entry.classList.add(`serial-output-${type}`);
  entry.textContent = text;
  output.appendChild(entry);

  // Auto-scroll if enabled
  if (serialMonitorAutoScroll && serialMonitorAutoScroll.checked) {
    output.scrollTop = output.scrollHeight;
  }
}

// Update the status display in the serial monitor
function updateSerialMonitorStatus() {
  if (!serialMonitorStatus) return;

  if (serialPort && (serialPort.readable || serialPort.writable)) {
    serialMonitorStatus.textContent = `Connected (${baudRate} baud)`;
    serialMonitorStatus.classList.add("connected");
    serialMonitorStatus.classList.remove("error");
  } else {
    serialMonitorStatus.textContent = "Disconnected";
    serialMonitorStatus.classList.remove("connected");
  }
}

// Send data over the serial connection
async function sendSerialData() {
  if (!serialMonitorInput) return;

  const text = serialMonitorInput.value.trim();
  if (!text || !serialPort || !serialPort.writable) return;

  try {
    // Get the line ending
    let lineEnding = "";
    if (serialMonitorLineEnding) {
      switch (serialMonitorLineEnding.value) {
        case "newline":
          lineEnding = "\n";
          break;
        case "carriage":
          lineEnding = "\r";
          break;
        case "both":
          lineEnding = "\r\n";
          break;
      }
    }

    // Create the text encoder if it doesn't exist
    if (!serialWriter) {
      const outputStream = serialPort.writable;
      const writer = outputStream.getWriter();
      serialWriter = writer;
    }

    // Convert the text to a Uint8Array and send it
    const encoder = new TextEncoder();
    const data = encoder.encode(text + lineEnding);
    await serialWriter.write(data);

    // Add the sent text to the output
    addSerialOutput(`> ${text}`, "send");

    // Clear the input field
    serialMonitorInput.value = "";
    serialMonitorInput.focus();
  } catch (error) {
    console.error("Error sending data:", error);
    addSerialOutput(`Error sending data: ${error.message}`, "system");
    if (serialMonitorStatus) {
      serialMonitorStatus.textContent = "Error sending data";
      serialMonitorStatus.classList.add("error");
      serialMonitorStatus.classList.remove("connected");
    }
  }
}

// Function to call when a serial port is connected
function onSerialConnected() {
  updateSerialMonitorStatus();

  // If the monitor is already visible, start reading
  if (monitorVisible) {
    startReading();
  }

  // Show a system message if the monitor is visible
  if (monitorVisible) {
    addSerialOutput(`Connected to serial port at ${baudRate} baud`, "system");
  }
}

// Function to call when a serial port is disconnected
function onSerialDisconnected() {
  updateSerialMonitorStatus();

  // Stop reading
  stopReading();

  // Show a system message if the monitor is visible
  if (monitorVisible) {
    addSerialOutput("Disconnected from serial port", "system");
  }
}

// Start reading data from the serial port - improved implementation
// Start reading data from the serial port
async function startReading() {
  // If we're already reading or don't have a connected port, return
  if (readingActive || !serialPort || !serialPort.readable) return;

  readingActive = true;

  try {
    const decoder = new TextDecoder();
    let buffer = "";

    while (serialPort.readable && readingActive) {
      try {
        const reader = serialPort.readable.getReader();
        serialReader = reader;

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              reader.releaseLock();
              break;
            }

            // Add the new data to the buffer
            buffer += decoder.decode(value, { stream: true });

            // Process complete lines
            const lines = buffer.split("\n");
            // Keep the last incomplete line in the buffer
            buffer = lines.pop() || "";

            // Add complete lines to the output
            for (const line of lines) {
              // Remove carriage returns
              const cleanLine = line.replace(/\r/g, "");
              if (cleanLine.trim()) {
                addSerialOutput(cleanLine);
              }
            }
          }
        } catch (error) {
          console.error("Error reading data:", error);
          addSerialOutput(`Error reading data: ${error.message}`, "system");
        } finally {
          // Make sure to release the lock
          if (reader.locked) {
            reader.releaseLock();
          }
        }
      } catch (error) {
        console.error("Error opening reader:", error);
        addSerialOutput(`Error opening reader: ${error.message}`, "system");
        break;
      }
    }
  } catch (error) {
    console.error("Error in read loop:", error);
    addSerialOutput(`Error in read loop: ${error.message}`, "system");
  } finally {
    readingActive = false;
  }
}

// Stop reading from the serial port
async function stopReading() {
  readingActive = false;

  try {
    if (serialReader) {
      await serialReader.cancel();
      serialReader = null;
    }
  } catch (error) {
    console.error("Error stopping reader:", error);
  }
}
