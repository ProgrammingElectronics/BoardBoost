// board-loader.js - Dynamically load Arduino board list

document.addEventListener("DOMContentLoaded", function () {
  loadArduinoBoards();
});

/**
 * Load Arduino boards from the server
 */
function loadArduinoBoards() {
  const boardFqbnSelect = document.getElementById("board-fqbn");
  if (!boardFqbnSelect) return;

  // Keep default options
  const defaultOptions = Array.from(boardFqbnSelect.options).filter(
    (option) => !option.value || option.value.startsWith("default:")
  );

  // Show loading
  boardFqbnSelect.innerHTML = '<option value="">Loading boards...</option>';

  // Fetch boards from API
  fetch("/api/arduino-boards/")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to load board list");
      }
      return response.json();
    })
    .then((data) => {
      // Clear loading option
      boardFqbnSelect.innerHTML = "";

      // Restore default options
      defaultOptions.forEach((option) => {
        boardFqbnSelect.appendChild(option);
      });

      // Process board data
      if (data && data.boards) {
        // Group boards by platform
        const boardsByPlatform = {};

        data.boards.forEach((board) => {
          const platformName = board.platform ? board.platform.name : "Other";
          if (!boardsByPlatform[platformName]) {
            boardsByPlatform[platformName] = [];
          }
          boardsByPlatform[platformName].push(board);
        });

        // Create option groups for each platform
        Object.keys(boardsByPlatform)
          .sort()
          .forEach((platform) => {
            const optgroup = document.createElement("optgroup");
            optgroup.label = platform;

            // Add boards for this platform
            boardsByPlatform[platform]
              .sort((a, b) => a.name.localeCompare(b.name))
              .forEach((board) => {
                // Skip boards without an FQBN
                if (!board.fqbn) return;

                const option = document.createElement("option");
                option.value = board.fqbn;
                option.textContent = board.name;

                // Add board details as data attributes
                if (board.platform) {
                  option.dataset.platform = board.platform.name;
                  option.dataset.architecture = board.platform.architecture;
                }

                optgroup.appendChild(option);
              });

            // Only add the optgroup if it has children
            if (optgroup.children.length > 0) {
              boardFqbnSelect.appendChild(optgroup);
            }
          });

        // If no boards were loaded from the API, add default options
        if (boardFqbnSelect.options.length === defaultOptions.length) {
          addDefaultBoardOptions(boardFqbnSelect);
        }
      } else {
        // Fallback to default options if no data
        addDefaultBoardOptions(boardFqbnSelect);
      }
    })
    .catch((error) => {
      console.error("Error loading Arduino boards:", error);

      // Fallback to default options
      boardFqbnSelect.innerHTML = "";

      // Restore default options
      defaultOptions.forEach((option) => {
        boardFqbnSelect.appendChild(option);
      });

      // Add default board options
      addDefaultBoardOptions(boardFqbnSelect);
    });
}

/**
 * Add default board options when API fails or returns no results
 */
function addDefaultBoardOptions(selectElement) {
  // Create an "Arduino Boards" group
  const arduinoGroup = document.createElement("optgroup");
  arduinoGroup.label = "Arduino Boards";

  // Add common Arduino boards
  const arduinoBoards = [
    { fqbn: "arduino:avr:uno", name: "Arduino Uno" },
    { fqbn: "arduino:avr:nano", name: "Arduino Nano" },
    { fqbn: "arduino:avr:mega", name: "Arduino Mega" },
    { fqbn: "arduino:avr:leonardo", name: "Arduino Leonardo" },
    { fqbn: "arduino:avr:micro", name: "Arduino Micro" },
    { fqbn: "arduino:avr:pro", name: "Arduino Pro Mini" },
  ];

  arduinoBoards.forEach((board) => {
    const option = document.createElement("option");
    option.value = board.fqbn;
    option.textContent = board.name;
    arduinoGroup.appendChild(option);
  });

  selectElement.appendChild(arduinoGroup);

  // Create an "ESP Boards" group
  const espGroup = document.createElement("optgroup");
  espGroup.label = "ESP Boards";

  // Add common ESP boards
  const espBoards = [
    { fqbn: "esp32:esp32:esp32", name: "ESP32 Dev Module" },
    { fqbn: "esp32:esp32:esp32s2", name: "ESP32-S2" },
    { fqbn: "esp32:esp32:esp32c3", name: "ESP32-C3" },
    { fqbn: "esp8266:esp8266:generic", name: "ESP8266 Generic" },
  ];

  espBoards.forEach((board) => {
    const option = document.createElement("option");
    option.value = board.fqbn;
    option.textContent = board.name;
    espGroup.appendChild(option);
  });

  selectElement.appendChild(espGroup);

  // Create an "Other Boards" group
  const otherGroup = document.createElement("optgroup");
  otherGroup.label = "Other Boards";

  // Add other common boards
  const otherBoards = [
    { fqbn: "arduino:samd:nano_33_iot", name: "Arduino Nano 33 IoT" },
    { fqbn: "arduino:mbed_portenta:portenta_h7", name: "Arduino Portenta H7" },
    { fqbn: "arduino:megaavr:uno2018", name: "Arduino Uno WiFi Rev2" },
  ];

  otherBoards.forEach((board) => {
    const option = document.createElement("option");
    option.value = board.fqbn;
    option.textContent = board.name;
    otherGroup.appendChild(option);
  });

  selectElement.appendChild(otherGroup);
}
