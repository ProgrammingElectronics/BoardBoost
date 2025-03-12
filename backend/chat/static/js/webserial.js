// serial.js - WebSerial API integration

// Global variables
let serialPort = null;
let portReader = null;
let baudRate = 9600;

// Check if WebSerial API is supported
function isWebSerialSupported() {
  return "serial" in navigator;
}

// Initialize serial functionality when the document is loaded
document.addEventListener("DOMContentLoaded", () => {
  // Get DOM elements
  const serialPortButton = document.getElementById("serial-port-button");
  const baudRateSelector = document.getElementById("baud-rate-selector");

  // Check if WebSerial is supported
  if (!isWebSerialSupported()) {
    serialPortButton.textContent = "WebSerial Not Supported";
    serialPortButton.disabled = true;
    serialPortButton.classList.add("disabled");
    console.error("WebSerial API is not supported in this browser");
    return;
  }

  // Set initial baud rate from the selector
  baudRate = parseInt(baudRateSelector.value, 10);

  // Add event listener to the baud rate selector
  baudRateSelector.addEventListener("change", async (event) => {
    baudRate = parseInt(event.target.value, 10);
    console.log(`Baud rate changed to ${baudRate}`);

    // If we're already connected, update the baud rate
    if (serialPort && (serialPort.readable || serialPort.writable)) {
      // Store the current port
      const currentPort = serialPort;

      try {
        // Close the current connection
        await disconnectFromSerial(false); // Don't reset button text

        // Reconnect to the same port with the new baud rate
        serialPort = currentPort; // Restore the port reference
        await connectToSerial(currentPort);

        console.log(`Reconnected to port with baud rate ${baudRate}`);
      } catch (error) {
        console.error("Error reconnecting with new baud rate:", error);
        const serialPortButton = document.getElementById("serial-port-button");
        serialPortButton.textContent = "Access Serial Port";
        serialPortButton.classList.remove("connected");
        serialPort = null;
      }
    }
  });

  // Add event listener to the serial port button
  serialPortButton.addEventListener("click", async () => {
    if (!serialPort) {
      // Not connected, so try to connect
      await openSerialPort();
    } else {
      // Already connected, so open port selector to change ports
      await openSerialPort();
    }
  });
});

// Open the serial port
async function openSerialPort() {
  try {
    // Store the current port if we have one
    const currentPort = serialPort;

    // Request a port from the user
    const selectedPort = await navigator.serial.requestPort();

    // If this is the same port we already have open, do nothing
    if (currentPort && selectedPort === currentPort) {
      console.log("Same port selected, maintaining existing connection");
      return;
    }

    // Disconnect from the current port if we have one
    if (currentPort) {
      await disconnectFromSerial();
    }

    // Set the new port
    serialPort = selectedPort;

    // Connect to the selected port
    await connectToSerial(serialPort);

    // Get port information
    const portInfo = await getPortInfo(serialPort);

    // Update button text with port info
    const serialPortButton = document.getElementById("serial-port-button");
    updateSerialButtonText(portInfo);
    serialPortButton.classList.add("connected");
    serialPortButton.classList.remove("error");

    console.log(`Connected to serial port: ${portInfo}`);
  } catch (error) {
    // Handle errors (user cancelled, or connection failed)
    console.error("Error opening serial port:", error);

    // Update button text and style for error
    const serialPortButton = document.getElementById("serial-port-button");

    // Only show error if it wasn't a user cancellation
    if (error.name !== "NotFoundError") {
      serialPortButton.textContent = "Connection Error";
      serialPortButton.classList.add("error");
      serialPortButton.classList.remove("connected");

      // Reset error message after 3 seconds
      setTimeout(() => {
        if (!serialPort || (!serialPort.readable && !serialPort.writable)) {
          serialPortButton.textContent = "Access Serial Port";
          serialPortButton.classList.remove("error");
        }
      }, 3000);
    }

    // Reset if connection failed but user did select a port
    if (serialPort && !serialPort.readable && !serialPort.writable) {
      await disconnectFromSerial(true, false); // Don't update button text yet
    }
  }
}

// Connect to the serial port with the current baud rate
async function connectToSerial(port) {
  try {
    // Configure the port with the selected baud rate
    await port.open({
      baudRate: baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      flowControl: "none",
    });

    console.log(`Port opened with baud rate ${baudRate}`);

    // If the serial monitor functionality exists, notify it about the connection
    if (typeof onSerialConnected === "function") {
      onSerialConnected();
    }
  } catch (error) {
    console.error("Error connecting to serial port:", error);
    throw error; // Re-throw to handle in the calling function
  }
}

// Get information about the port to display
async function getPortInfo(port) {
  // Simply return "Connected" as the port name isn't helpful
  return "Connected";
}

// Update the button text with port info
function updateSerialButtonText(portInfo) {
  const serialPortButton = document.getElementById("serial-port-button");
  serialPortButton.textContent = portInfo;
}

// Disconnect from the serial port
async function disconnectFromSerial(
  updateButton = true,
  removeErrorClass = true
) {
  if (serialPort) {
    // Release the writer if it exists (from the serial monitor)
    if (typeof releaseSerialWriter === "function") {
      await releaseSerialWriter();
    }

    // Close the port reader if it's active
    if (portReader) {
      try {
        await portReader.cancel();
        portReader = null;
      } catch (error) {
        console.error("Error closing port reader:", error);
      }
    }

    // Close the port if it's open
    if (serialPort.readable || serialPort.writable) {
      try {
        await serialPort.close();
        console.log("Serial port closed");

        // Notify the serial monitor if it exists
        if (typeof onSerialDisconnected === "function") {
          onSerialDisconnected();
        }
      } catch (error) {
        console.error("Error closing serial port:", error);
      }
    }

    // Reset the port variable only if we're not reconnecting
    if (updateButton) {
      serialPort = null;

      // Update the button
      const serialPortButton = document.getElementById("serial-port-button");
      serialPortButton.textContent = "Access Serial Port";
      serialPortButton.classList.remove("connected");
      if (removeErrorClass) {
        serialPortButton.classList.remove("error");
      }
    }
  }
}
