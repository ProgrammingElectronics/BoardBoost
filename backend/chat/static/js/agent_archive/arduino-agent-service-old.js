// arduino-agent-service.js
// Service for detecting and communicating with Arduino Create Agent

class ArduinoCreateAgentService {
  constructor() {
    this.agent = null;
    this.isDetecting = false;
    this.agentUrl = null;
    this.onAgentFoundCallbacks = [];
    this.agentDetectionComplete = false;

    // Initialize detection
    this.detectAgent();
  }

  /**
   * Detect if Arduino Create Agent is installed and running
   * Tries ports from 8990 to 9000 as per Arduino Create Agent spec
   */
  async detectAgent() {
    if (this.isDetecting) return;

    this.isDetecting = true;

    for (let port = 8990; port <= 9000; port++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/info`, {
          method: "GET",
          mode: "cors",
          cache: "no-cache",
          headers: {
            "Content-Type": "application/json",
          },
          referrerPolicy: "no-referrer",
          timeout: 500, // Short timeout for quick detection
        });

        if (response.ok) {
          const agentInfo = await response.json();
          console.log("Arduino Create Agent found:", agentInfo);

          // Store the agent URLs
          this.agentUrl = agentInfo.http;
          this.wsUrl = agentInfo.ws;
          this.version = agentInfo.version;

          // Notify listeners
          this.notifyAgentFound(true);
          this.agentDetectionComplete = true;
          this.isDetecting = false;
          return true;
        }
      } catch (error) {
        console.log(`No agent on port ${port}`);
      }
    }

    // Agent not found
    console.log("Arduino Create Agent not found");
    this.notifyAgentFound(false);
    this.agentDetectionComplete = true;
    this.isDetecting = false;
    return false;
  }

  /**
   * Register a callback for when agent detection status changes
   */
  onAgentFound(callback) {
    this.onAgentFoundCallbacks.push(callback);

    // If detection already complete, call the callback immediately
    if (this.agentDetectionComplete) {
      callback(this.agentUrl !== null);
    }

    return this; // Allow chaining
  }

  /**
   * Notify all registered callbacks about agent detection status
   */
  notifyAgentFound(found) {
    this.onAgentFoundCallbacks.forEach((callback) => {
      try {
        callback(found);
      } catch (e) {
        console.error("Error in agent found callback:", e);
      }
    });
  }

  /**
   * Check if the agent is currently detected
   */
  isAgentAvailable() {
    return this.agentUrl !== null;
  }

  /**
   * Get list of boards connected to the computer via Arduino Create Agent
   * Uses WebSocket instead of HTTP for better compatibility with different agent versions
   */
  async listBoards() {
    if (!this.isAgentAvailable()) {
      throw new Error("Arduino Create Agent not available");
    }

    return new Promise((resolve, reject) => {
      try {
        console.log("Connecting to agent via WebSocket to list boards...");
        const socket = new WebSocket(this.wsUrl);
        let timeout = setTimeout(() => {
          console.error("WebSocket connection timeout");
          socket.close();
          reject(new Error("WebSocket connection timeout"));
        }, 5000);

        socket.onopen = () => {
          console.log("WebSocket connected, sending list command");
          socket.send("list");
        };

        socket.onmessage = (event) => {
          clearTimeout(timeout);
          console.log("Received board list data:", event.data);

          try {
            const data = JSON.parse(event.data);
            socket.close();
            resolve(data);
          } catch (e) {
            console.error("Error parsing board list data:", e);
            reject(new Error(`Error parsing board list: ${e.message}`));
          }
        };

        socket.onerror = (error) => {
          clearTimeout(timeout);
          console.error("WebSocket error:", error);
          reject(new Error("WebSocket error"));
        };

        socket.onclose = () => {
          clearTimeout(timeout);
          console.log("WebSocket closed");
        };
      } catch (error) {
        console.error("Error in listBoards WebSocket:", error);
        reject(error);
      }
    });
  }

  /**
   * Upload a binary sketch to a board through Arduino Create Agent
   *
   * @param {Object} options Upload options
   * @param {string} options.port Serial port to use
   * @param {string} options.board FQBN of the board
   * @param {string} options.filename Filename of the sketch
   * @param {string} options.hex Base64-encoded binary data
   * @param {function} options.onProgress Progress callback
   * @param {function} options.onSuccess Success callback
   * @param {function} options.onError Error callback
   */
  async uploadSketch(options) {
    if (!this.isAgentAvailable()) {
      throw new Error("Arduino Create Agent not available");
    }

    const { port, board, filename, hex, onProgress, onSuccess, onError } =
      options;

    if (!port || !board || !filename || !hex) {
      throw new Error("Missing required upload parameters");
    }

    try {
      // Call onProgress if provided
      if (onProgress) {
        onProgress("Preparing to upload via Arduino Create Agent...");
      }

      // Use WebSocket for the entire upload process
      const socket = new WebSocket(this.wsUrl);
      let uploadStarted = false;
      let uploadCompleted = false;

      // Set a timeout in case the upload gets stuck
      const uploadTimeout = setTimeout(() => {
        if (!uploadCompleted) {
          console.error("Upload timeout");
          socket.close();
          if (onError) {
            onError("Upload timed out after 60 seconds");
          }
        }
      }, 60000); // 60 second timeout

      socket.onopen = () => {
        console.log("WebSocket connection opened to Arduino Create Agent");

        if (onProgress) {
          onProgress("Connected to Arduino Create Agent...");
        }

        // We'll use commands directly over WebSocket
        console.log("First, trying to get ports to verify connection...");
        socket.send("list");
      };

      socket.onmessage = (event) => {
        console.log("Agent message:", event.data);

        try {
          const data = JSON.parse(event.data);

          // If we got a list response, we can start the upload
          if (
            !uploadStarted &&
            (data["Serial Ports"] ||
              data.serial ||
              (Array.isArray(data) && data.length >= 0))
          ) {
            uploadStarted = true;

            if (onProgress) {
              onProgress("Starting upload process...");
            }

            // Check if we need to use 1200bps touch for board reset
            const needsReset =
              board.includes("arduino:avr:leonardo") ||
              board.includes("arduino:avr:micro") ||
              board.includes("arduino:avr:esplora") ||
              board.includes("arduino:samd:");

            if (needsReset) {
              if (onProgress) {
                onProgress("Resetting board for upload...");
              }

              // First open the port at 1200 baud to trigger bootloader mode
              console.log("Opening port at 1200 baud to reset board");
              socket.send(`open ${port} 1200`);

              // Wait a bit for the board to reset and reappear
              setTimeout(() => {
                // After reset, close the port
                socket.send(`close ${port}`);

                // Then wait a bit more for the bootloader to be ready
                setTimeout(() => {
                  // Now initiate the upload
                  startUpload();
                }, 2000);
              }, 500);
            } else {
              // No reset needed, start upload directly
              startUpload();
            }
          }

          // Handle progress messages
          if (data.Msg) {
            if (onProgress) {
              onProgress(data.Msg);
            }
          }

          // Handle upload status messages
          if (data.ProgrammerStatus === "Done") {
            uploadCompleted = true;
            clearTimeout(uploadTimeout);

            // Upload complete
            if (onSuccess) {
              onSuccess("Upload completed successfully!");
            }
            setTimeout(() => socket.close(), 1000);
          } else if (data.Error) {
            uploadCompleted = true;
            clearTimeout(uploadTimeout);

            // Upload error
            if (onError) {
              onError(`Upload error: ${data.Error}`);
            }
            socket.close();
          } else if (data.Flash === "Ok") {
            uploadCompleted = true;
            clearTimeout(uploadTimeout);

            // Another way the agent reports success
            if (onSuccess) {
              onSuccess("Upload completed successfully!");
            }
            setTimeout(() => socket.close(), 1000);
          }
        } catch (error) {
          console.error("Error parsing message:", error, event.data);
        }
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        clearTimeout(uploadTimeout);
        if (onError) {
          onError("Connection error with Arduino Create Agent");
        }
      };

      socket.onclose = () => {
        console.log("WebSocket connection closed");
        clearTimeout(uploadTimeout);

        // If we never completed and never started, report an error
        if (!uploadCompleted && !uploadStarted) {
          if (onError) {
            onError("Failed to start upload process");
          }
        }
      };

      // Function to start the actual upload
      const startUpload = () => {
        // Prepare upload payload
        const uploadData = {
          board: board,
          port: port,
          filename: filename,
          hex: hex,
          extra: {
            auth: {},
            wait_for_upload_port: true,
            use_1200bps_touch: false, // We already handled reset if needed
          },
        };

        // Try to use the upload command directly over WebSocket
        try {
          if (onProgress) {
            onProgress("Uploading sketch...");
          }

          console.log("Sending upload command over WebSocket");
          socket.send(`upload ${JSON.stringify(uploadData)}`);
        } catch (error) {
          console.error("Error sending upload command:", error);
          if (onError) {
            onError(`Failed to send upload command: ${error.message}`);
          }
          socket.close();
        }
      };
    } catch (error) {
      console.error("Error during upload:", error);
      if (onError) {
        onError(`Upload failed: ${error.message}`);
      }
    }
  }
}

// Create and export a singleton instance
const arduinoCreateAgent = new ArduinoCreateAgentService();
window.arduinoCreateAgent = arduinoCreateAgent; // Make it globally available
