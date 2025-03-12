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

// Add this to serial-monitor.js

// Improved stop reading function with proper lock handling
async function stopReading() {
  console.log("Stopping serial reading");

  // Set reading flag to false first to stop the read loop
  readingActive = false;

  // Cancel the reader if it exists
  if (serialReader) {
    try {
      console.log("Cancelling serial reader");
      await serialReader.cancel();
      console.log("Serial reader cancelled");

      // Make sure to release the lock
      try {
        if (serialReader.locked) {
          console.log("Releasing reader lock");
          serialReader.releaseLock();
        }
      } catch (e) {
        console.error("Error releasing reader lock:", e);
      }
    } catch (error) {
      console.error("Error cancelling reader:", error);
    } finally {
      serialReader = null;
    }
  }

  // Add a system message
  addSerialOutput("Serial port reading stopped", "system");
}

// Improved release writer function
async function releaseSerialWriter() {
  if (serialWriter) {
    try {
      console.log("Closing serial writer");
      await serialWriter.close();
      console.log("Serial writer closed");
      serialWriter = null;
    } catch (error) {
      console.error("Error closing writer:", error);

      // Try to release the lock if close fails
      try {
        if (serialWriter.releaseLock) {
          serialWriter.releaseLock();
        }
      } catch (e) {
        console.error("Error releasing writer lock:", e);
      }

      serialWriter = null;
    }
  }
}

async function startReading() {
  // If we're already reading or don't have a connected port, return
  if (readingActive || !serialPort || !serialPort.readable) {
    console.log("Cannot start reading: already reading or no readable port");
    return;
  }

  readingActive = true;
  console.log("Starting to read from serial port");
  addSerialOutput("Starting to read from serial port", "system");

  // Set up decoder for the incoming data stream
  const decoder = new TextDecoder();
  let buffer = ""; // Define buffer here, at the function level

  // Helper function to process the buffer and extract lines
  function processBuffer() {
    // Look for any line terminators in the buffer
    if (buffer.length === 0) return;

    // Process for different line ending types
    // This handles \r, \n, and \r\n line endings
    const lines = buffer.split(/\r?\n|\r/);

    // Keep the last part that doesn't end with a line terminator
    buffer = lines.pop() || "";

    // Add each line to the output if it's not empty
    for (const line of lines) {
      if (line.trim()) {
        console.log("Processed line:", line);
        addSerialOutput(line);
      }
    }

    // If the buffer gets too long without a terminator, treat it as a line anyway
    if (buffer.length > 100) {
      console.log("Buffer too long, flushing:", buffer);
      addSerialOutput(buffer);
      buffer = "";
    }
  }

  try {
    while (serialPort.readable && readingActive) {
      let reader;

      try {
        // Get a reader from the serial port
        reader = serialPort.readable.getReader();
        serialReader = reader;
        console.log("Serial reader acquired");

        try {
          while (true) {
            // Check if reading is still active
            if (!readingActive) {
              console.log("Reading deactivated, breaking loop");
              break;
            }

            // Read data from the port
            const { value, done } = await reader.read();

            // If we're done, break the loop
            if (done) {
              console.log("Reader signaled 'done'");
              break;
            }

            // Skip if no value was received
            if (!value || value.length === 0) {
              continue;
            }

            // Log raw data for debugging
            console.log(
              "Received bytes:",
              Array.from(value)
                .map((b) => b.toString(16))
                .join(" ")
            );

            // Decode the bytes to text
            const newText = decoder.decode(value, { stream: true });
            console.log("Decoded text:", JSON.stringify(newText));

            // Add the new text to our buffer
            buffer += newText;

            // Process any complete lines in the buffer
            processBuffer();
          }
        } catch (error) {
          console.error("Error reading data:", error);
          addSerialOutput(`Error reading data: ${error.message}`, "system");
        } finally {
          // Always release the reader lock when we're done with it
          if (reader) {
            try {
              reader.releaseLock();
              console.log("Reader lock released");
            } catch (e) {
              console.error("Error releasing reader lock:", e);
            }
          }
        }
      } catch (error) {
        console.error("Error opening reader:", error);
        addSerialOutput(`Error opening reader: ${error.message}`, "system");
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay before retry
      }
    }
  } catch (error) {
    console.error("Error in read loop:", error);
    addSerialOutput(`Error in read loop: ${error.message}`, "system");
  } finally {
    readingActive = false;
    console.log("No longer reading from serial port");
    addSerialOutput("Serial port reading stopped", "system");
  }
}
