// Session selector functionality

// Global variables for session management
let currentSessionId = null;
let selectedSessionType = "chat"; // Default mode
let sessionTypes = [
  {
    type: "chat",
    name: "Chat Mode",
    symbol: "💬",
    description:
      "Standard chat interface for getting help with Arduino programming.",
  },
  {
    type: "widget",
    name: "Widget Mode",
    symbol: "🔧",
    description:
      "Focused session for creating a complete project with guidance.",
  },
  {
    type: "library",
    name: "Learn a Library Mode",
    symbol: "📚",
    description:
      "Interactive session focused on mastering a specific Arduino library.",
  },
  {
    type: "topic",
    name: "Learn a Topic Mode",
    symbol: "🎓",
    description:
      "Educational session to learn about a specific Arduino programming concept.",
  },
];

// Initialize the session selector
document.addEventListener("DOMContentLoaded", function () {
  // Set up event listeners
  setupSessionSelectorEvents();
});

// Set up event listeners for session selector
function setupSessionSelectorEvents() {
  // New session button - replace the New Project button
  const newSessionButton = document.getElementById("new-session-button");
  if (newSessionButton) {
    newSessionButton.addEventListener("click", openSessionSelector);
  }

  // Session type switcher (if present in the sidebar)
  const sessionTypeSelect = document.getElementById("session-type");
  if (sessionTypeSelect) {
    sessionTypeSelect.addEventListener("change", function () {
      switchSessionType(this.value);
    });
  }
}

// Create and open the session selector modal
function openSessionSelector() {
  // Create modal backdrop
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.addEventListener("click", closeSessionSelector);

  // Create modal container
  const modal = document.createElement("div");
  modal.className = "session-selector-modal";
  modal.addEventListener("click", (e) => e.stopPropagation());

  // Create modal content
  modal.innerHTML = `
        <div class="session-selector-header">
            <h2>Create New Session</h2>
            <button type="button" class="close-modal-button">&times;</button>
        </div>
        <div class="session-selector-body">
            <p class="session-selector-intro">Select a session type to get started:</p>
            <div class="session-type-options">
                ${sessionTypes
                  .map(
                    (type) => `
                    <div class="session-type-option" data-type="${type.type}">
                        <div class="session-type-icon">${type.symbol}</div>
                        <div class="session-type-info">
                            <h3>${type.name}</h3>
                            <p>${type.description}</p>
                        </div>
                    </div>
                `
                  )
                  .join("")}
            </div>
        </div>
    `;

  // Add modal to the document
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // Add event listener to close button
  const closeButton = modal.querySelector(".close-modal-button");
  if (closeButton) {
    closeButton.addEventListener("click", closeSessionSelector);
  }

  // Add click event listeners to options
  const options = modal.querySelectorAll(".session-type-option");
  options.forEach((option) => {
    option.addEventListener("click", function () {
      const sessionType = this.getAttribute("data-type");
      selectSessionType(sessionType);
    });
  });
}

// Close the session selector modal
function closeSessionSelector() {
  const backdrop = document.querySelector(".modal-backdrop");
  if (backdrop) {
    backdrop.remove();
  }
}

// Handle session type selection
function selectSessionType(sessionType) {
  // Find the selected session type details
  const selectedType = sessionTypes.find((type) => type.type === sessionType);
  if (!selectedType) return;

  // Close the modal
  closeSessionSelector();

  // Create a new session with the selected type
  createNewSession(sessionType);
}

// Create a new session with the selected type
function createNewSession(sessionType) {
  // Set the selected session type
  selectedSessionType = sessionType;

  // Update the session type selector in the sidebar if it exists
  const sessionTypeSelect = document.getElementById("session-type");
  if (sessionTypeSelect) {
    sessionTypeSelect.value = sessionType;
  }

  // Clear form fields
  document.getElementById("session-name").value = "";
  document.getElementById("board-type").value = "";
  document.getElementById("components-text").value = "";
  document.getElementById("libraries-text").value = "";

  // Reset session ID
  currentSessionId = null;
  currentConversationId = null;

  // Clear chat messages
  const chatMessages = document.getElementById("chat-messages");
  chatMessages.innerHTML = "";

  // Add welcome message based on session type
  let welcomeMessage = getWelcomeMessageForType(sessionType);
  addMessage(welcomeMessage, "assistant");

  // Update active session in the list
  document.querySelectorAll(".session-item").forEach((item) => {
    item.classList.remove("active");
  });

  // Show the appropriate fields based on session type
  showFieldsForSessionType(sessionType);
}

// Get welcome message based on session type
function getWelcomeMessageForType(sessionType) {
  switch (sessionType) {
    case "chat":
      return "Welcome to Chat Mode! Ask me anything about Arduino programming and I'll help you out.";
    case "widget":
      return "Welcome to Widget Mode! I'll help you create a complete Arduino project. Let's start by discussing what you want to build.";
    case "library":
      return "Welcome to Library Learning Mode! What Arduino library would you like to master today?";
    case "topic":
      return "Welcome to Topic Learning Mode! What Arduino concept or topic would you like to learn about?";
    default:
      return "Welcome! How can I help with your Arduino project today?";
  }
}

// Show fields based on session type
function showFieldsForSessionType(sessionType) {
  // Hide all specific fields first
  document.querySelectorAll(".session-specific-field").forEach((field) => {
    field.style.display = "none";
  });

  // Show common fields
  document.querySelectorAll(".common-field").forEach((field) => {
    field.style.display = "block";
  });

  // Show fields specific to this session type
  document.querySelectorAll(`.${sessionType}-field`).forEach((field) => {
    field.style.display = "block";
  });
}

// Switch session type for an existing session
function switchSessionType(newType) {
  if (newType === selectedSessionType) return;

  // Update the selected type
  selectedSessionType = newType;

  // Show the appropriate fields based on session type
  showFieldsForSessionType(newType);

  // If we have an existing session, update it
  if (currentSessionId) {
    // Prepare to save with the new type
    saveSession();
  } else {
    // Just add a message about the mode change
    const message = `Switched to ${getSessionTypeName(
      newType
    )}. ${getSessionTypeDescription(newType)}`;
    addMessage(message, "assistant");
  }
}

// Helper to get session type name
function getSessionTypeName(type) {
  const sessionType = sessionTypes.find((t) => t.type === type);
  return sessionType ? sessionType.name : "Unknown Mode";
}

// Helper to get session type description
function getSessionTypeDescription(type) {
  const sessionType = sessionTypes.find((t) => t.type === type);
  return sessionType ? sessionType.description : "";
}

// Function to load user's sessions
function loadUserSessions() {
  fetch("/api/sessions/")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to load sessions");
      }
      return response.json();
    })
    .then((data) => {
      const sessionsList = document.getElementById("sessions-list");
      if (!sessionsList) return;

      // Clear loading message
      sessionsList.innerHTML = "";

      // Check if we received an array (expected) and it has sessions
      if (Array.isArray(data) && data.length > 0) {
        // Sort sessions by last updated (newest first)
        data.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

        // Add each session to the list
        data.forEach((session) => {
          const sessionItem = document.createElement("div");
          sessionItem.classList.add("session-item");
          if (currentSessionId === session.id) {
            sessionItem.classList.add("active");
          }

          // Add session type icon
          const sessionIcon = getSessionTypeIcon(session.session_type);

          const sessionDate = new Date(session.updated_at);
          const formattedDate = sessionDate.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          });

          sessionItem.innerHTML = `
                        <div class="session-icon">${sessionIcon}</div>
                        <div class="session-details">
                            <div class="session-name">${session.name}</div>
                            <div class="session-date">Last updated: ${formattedDate}</div>
                        </div>
                    `;

          sessionItem.addEventListener("click", () => {
            // Set this as the active session
            document.querySelectorAll(".session-item").forEach((item) => {
              item.classList.remove("active");
            });
            sessionItem.classList.add("active");

            // Load the session and its conversation
            loadSession(session.id);
          });

          sessionsList.appendChild(sessionItem);
        });
      } else {
        // No sessions or empty response
        sessionsList.innerHTML =
          '<div class="no-sessions">No sessions yet. Create one to get started!</div>';
      }
    })
    .catch((error) => {
      console.error("Error loading sessions:", error);
      const sessionsList = document.getElementById("sessions-list");
      if (sessionsList) {
        sessionsList.innerHTML =
          '<div class="load-error">Error loading sessions. Please try again.</div>';
      }
    });
}

// Get the icon for a session type
function getSessionTypeIcon(sessionType) {
  const typeData = sessionTypes.find((type) => type.type === sessionType);
  return typeData ? typeData.symbol : "💬"; // Default to chat icon
}

// Function to save a session
function saveSession() {
  const sessionName = document.getElementById("session-name").value;
  const boardType = document.getElementById("board-type").value || "";
  const componentsText = document.getElementById("components-text").value || "";
  const librariesText = document.getElementById("libraries-text").value || "";

  // Get model selections
  const queryModel = document.getElementById("query-model").value || null;
  const summaryModel = document.getElementById("summary-model").value || null;

  // Make sure history window size is a number
  let historyWindow = 10;
  try {
    historyWindow = parseInt(
      document.getElementById("history-window").value,
      10
    );
    if (isNaN(historyWindow) || historyWindow < 1) {
      historyWindow = 10; // Default fallback
    }
  } catch (e) {
    logDebug("Error parsing history window size:", e);
  }

  if (!sessionName) {
    alert("Please enter a session name");
    return;
  }

  // Create the session data object with common fields
  const sessionData = {
    name: sessionName,
    session_type: selectedSessionType,
    board_type: boardType,
    components_text: componentsText,
    libraries_text: librariesText,
    description: boardType
      ? `Arduino ${selectedSessionType} using ${boardType}`
      : `Arduino ${selectedSessionType}`,
    query_model: queryModel,
    summary_model: summaryModel,
    history_window_size: historyWindow,
  };

  // Add session-type specific fields
  if (selectedSessionType === "widget") {
    sessionData.target_platform =
      document.getElementById("target-platform")?.value || boardType;
    sessionData.complexity_level =
      document.getElementById("complexity-level")?.value || "intermediate";
  } else if (selectedSessionType === "library") {
    sessionData.library_name =
      document.getElementById("library-name")?.value || "";
    sessionData.experience_level =
      document.getElementById("experience-level")?.value || "beginner";
  } else if (selectedSessionType === "topic") {
    sessionData.topic_name = document.getElementById("topic-name")?.value || "";
    sessionData.experience_level =
      document.getElementById("experience-level")?.value || "beginner";
  }

  logDebug("Sending session data:", sessionData);

  // If we already have a session, update it; otherwise create a new one
  const method = currentSessionId ? "PUT" : "POST";
  const url = currentSessionId
    ? `/api/sessions/${currentSessionId}/`
    : "/api/sessions/";

  logDebug(`Making ${method} request to ${url}`);

  fetch(url, {
    method: method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie("csrftoken"),
    },
    body: JSON.stringify(sessionData),
  })
    .then((response) => {
      logDebug("Response status:", response.status);

      if (!response.ok) {
        return handleFetchError(response);
      }
      return response.json();
    })
    .then((data) => {
      logDebug("Success response:", data);
      currentSessionId = data.id;

      alert("Session saved successfully!");

      // Add a system message to the chat
      const systemMessage = `Session "${sessionName}" saved. ${
        boardType ? "Using " + boardType + "." : ""
      } Components: ${componentsText}. Libraries: ${librariesText}.`;
      addMessage(systemMessage, "assistant");

      // Refresh the sessions list
      setTimeout(loadUserSessions, 1000);
    })
    .catch((error) => {
      console.error("Error saving session:", error);
      alert(`Failed to save session: ${error.message}`);
    });
}

// Function to load a session
function loadSession(sessionId) {
  fetch(`/api/sessions/${sessionId}/`)
    .then((response) => response.json())
    .then((data) => {
      // Update form fields
      document.getElementById("session-name").value = data.name;
      document.getElementById("board-type").value = data.board_type || "";
      document.getElementById("components-text").value =
        data.components_text || "";
      document.getElementById("libraries-text").value =
        data.libraries_text || "";

      // Set model selections
      document.getElementById("query-model").value = data.query_model || "";
      document.getElementById("summary-model").value = data.summary_model || "";

      // Update history window slider
      const slider = document.getElementById("history-window");
      slider.value = data.history_window_size || 10;
      document.getElementById("history-window-value").textContent =
        slider.value + " messages";

      // Update current session ID and type
      currentSessionId = data.id;
      selectedSessionType = data.session_type;

      // Update session type selector if it exists
      const sessionTypeSelect = document.getElementById("session-type");
      if (sessionTypeSelect) {
        sessionTypeSelect.value = data.session_type;
      }

      // Update any type-specific fields
      if (data.session_type === "widget") {
        if (document.getElementById("target-platform")) {
          document.getElementById("target-platform").value =
            data.target_platform || data.board_type || "";
        }
        if (document.getElementById("complexity-level")) {
          document.getElementById("complexity-level").value =
            data.complexity_level || "intermediate";
        }
      } else if (data.session_type === "library") {
        if (document.getElementById("library-name")) {
          document.getElementById("library-name").value =
            data.library_name || "";
        }
        if (document.getElementById("experience-level")) {
          document.getElementById("experience-level").value =
            data.experience_level || "beginner";
        }
      } else if (data.session_type === "topic") {
        if (document.getElementById("topic-name")) {
          document.getElementById("topic-name").value = data.topic_name || "";
        }
        if (document.getElementById("experience-level")) {
          document.getElementById("experience-level").value =
            data.experience_level || "beginner";
        }
      }

      // Show the appropriate fields for this session type
      showFieldsForSessionType(data.session_type);

      // Now load the session's conversation messages
      loadSessionMessages(sessionId);
    })
    .catch((error) => console.error("Error loading session:", error));
}

// Function to load session conversation messages
function loadSessionMessages(sessionId) {
  fetch(`/api/sessions/${sessionId}/messages/`)
    .then((response) => response.json())
    .then((data) => {
      // Clear existing messages
      const chatMessages = document.getElementById("chat-messages");
      chatMessages.innerHTML = "";

      if (data.messages && data.messages.length > 0) {
        // Set the conversation ID
        currentConversationId = data.conversation_id;

        // Add all messages to the chat
        data.messages.forEach((message) => {
          addMessage(message.content, message.sender);
        });

        // Scroll to the bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
      } else {
        // No messages, add a welcome message
        const welcomeMessage = getWelcomeMessageForType(selectedSessionType);
        addMessage(welcomeMessage, "assistant");
      }
    })
    .catch((error) => console.error("Error loading messages:", error));
}

// Update the sendMessage function for sessions instead of projects
function sendMessage() {
  const userInput = document.getElementById("user-input");
  if (!userInput) return;

  const message = userInput.value.trim();

  if (!message && !currentFile) {
    return;
  }

  // If there's a file, handle it separately
  if (currentFile) {
    handleFileUploadWithMessage(message);
    return;
  }

  // Add user message to chat UI
  addMessage(message, "user");

  // Clear input
  userInput.value = "";

  // Show typing indicator
  const indicator = showTypingIndicator();

  // Prepare message data
  const messageData = {
    content: message,
    session_id: currentSessionId,
  };

  // Send message to API
  fetch("/api/send-message/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie("csrftoken"),
    },
    body: JSON.stringify(messageData),
  })
    .then((response) => {
      if (response.status === 403) {
        // Handle insufficient tokens
        hideTypingIndicator();
        return response.json().then((data) => {
          throw new Error(data.error || "Insufficient tokens");
        });
      }
      return response.json();
    })
    .then((data) => {
      // Hide typing indicator before adding the assistant's message
      hideTypingIndicator();

      // Update current conversation ID
      currentConversationId = data.conversation_id;

      // Update current session ID if it wasn't set
      if (!currentSessionId && data.session_id) {
        currentSessionId = data.session_id;
        selectedSessionType = data.session_type || "chat";

        // Update session type selector if it exists
        const sessionTypeSelect = document.getElementById("session-type");
        if (sessionTypeSelect) {
          sessionTypeSelect.value = selectedSessionType;
        }

        // Show the appropriate fields
        showFieldsForSessionType(selectedSessionType);
      }

      // Update tokens display
      if (data.tokens_remaining !== undefined) {
        const tokensElement = document.getElementById("tokens-remaining");
        if (tokensElement) {
          tokensElement.textContent = `${data.tokens_remaining.toLocaleString()} tokens`;
        }
      }

      // Add assistant message to chat
      addMessage(data.assistant_message.content, "assistant");

      // Optionally show token usage for this interaction
      if (data.tokens_used) {
        const tokenMsg = `(Used ${data.tokens_used} tokens for this response)`;
        const tokenInfoDiv = document.createElement("div");
        tokenInfoDiv.classList.add("token-info");
        tokenInfoDiv.textContent = tokenMsg;
        document.getElementById("chat-messages").appendChild(tokenInfoDiv);
      }
    })
    .catch((error) => {
      // Hide typing indicator on error
      hideTypingIndicator();

      console.error("Error sending message:", error);
      addMessage(
        error.message || "Sorry, there was an error processing your message.",
        "assistant"
      );
    });
}
