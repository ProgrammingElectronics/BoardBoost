// Global variables
let currentConversationId = null;
let currentProjectId = null;

// SVG icons for copy functionality
const COPY_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" 
     viewBox="0 0 24 24" 
     fill="none" 
     stroke="currentColor" 
     stroke-width="2" 
     stroke-linecap="round" 
     stroke-linejoin="round">
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
</svg>
`;

const CHECK_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" 
     viewBox="0 0 24 24" 
     fill="none" 
     stroke="currentColor" 
     stroke-width="2" 
     stroke-linecap="round" 
     stroke-linejoin="round">
  <polyline points="20 6 9 17 4 12"></polyline>
</svg>
`;

const ERROR_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" 
     viewBox="0 0 24 24" 
     fill="none" 
     stroke="currentColor" 
     stroke-width="2" 
     stroke-linecap="round" 
     stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>
`;

// Initialize markdown-it with options
const md = window.markdownit({
    html: false,        // Disable HTML tags in source
    breaks: true,       // Convert '\n' in paragraphs into <br>
    linkify: true,      // Autoconvert URLs to links
    typographer: true,  // Enable smartquotes and other typographic replacements
    highlight: function (str, lang) {
        if (lang && window.hljs && window.hljs.getLanguage(lang)) {
            try {
                return window.hljs.highlight(str, { language: lang }).value;
            } catch (__) { }
        }
        return ''; // Use external default escaping
    }
});
// Add this to the top of your main.js file or as a separate utility

// Enhanced error handling and logging
window.debugMode = true;  // Set to false in production

// Enhanced logging function
function logDebug(message, data) {
    if (window.debugMode) {
        if (data) {
            console.log(`[DEBUG] ${message}`, data);
        } else {
            console.log(`[DEBUG] ${message}`);
        }
    }
}

// Function to parse and display error responses
async function handleFetchError(response) {
    logDebug(`Error response with status ${response.status}`);

    // Try to get response as text
    const text = await response.text();
    logDebug("Error response text:", text);

    // Try to parse as JSON if possible
    let errorMessage = `Server Error (${response.status})`;

    try {
        const errorJson = JSON.parse(text);
        logDebug("Parsed error JSON:", errorJson);

        // Format error messages from the API
        if (typeof errorJson === 'object') {
            const errorParts = [];

            // Handle both array and object formats of errors
            Object.keys(errorJson).forEach(key => {
                const value = errorJson[key];
                if (Array.isArray(value)) {
                    errorParts.push(`${key}: ${value.join(', ')}`);
                } else if (typeof value === 'string') {
                    errorParts.push(`${key}: ${value}`);
                } else if (typeof value === 'object') {
                    errorParts.push(`${key}: ${JSON.stringify(value)}`);
                }
            });

            if (errorParts.length > 0) {
                errorMessage = errorParts.join('\n');
            }
        } else if (typeof errorJson === 'string') {
            errorMessage = errorJson;
        }
    } catch (e) {
        // Not JSON, use text directly if it's not too long
        if (text && text.length < 100) {
            errorMessage = text;
        }
    }

    throw new Error(errorMessage);
}


// Document ready function
document.addEventListener('DOMContentLoaded', function () {
    // Set up event listeners
    setupEventListeners();

    // Load projects
    loadUserProjects();

    // Load model choices
    loadModelChoices();

    // Add copy buttons to code blocks
    addCopyButtons();

    // Set up sidebar toggle
    setupSidebarToggle();

    // Set up auto-resize for textarea
    setupTextareaAutoResize();
});

// Set up event listeners
function setupEventListeners() {
    // Send message button
    const sendButton = document.getElementById("send-button");
    if (sendButton) {
        sendButton.addEventListener("click", function () {
            sendMessage();
        });
    }

    // User input enter key
    const userInput = document.getElementById("user-input");
    if (userInput) {
        userInput.addEventListener("keypress", function (e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // History window slider
    const historyWindow = document.getElementById("history-window");
    if (historyWindow) {
        historyWindow.addEventListener("input", function () {
            const value = this.value;
            document.getElementById("history-window-value").textContent =
                value + " messages";
        });
    }

    // Save project button
    const saveProjectButton = document.getElementById("save-project");
    if (saveProjectButton) {
        saveProjectButton.addEventListener("click", function () {
            saveProject();
        });
    }

    // New project button
    const newProjectButton = document.getElementById("new-project-button");
    if (newProjectButton) {
        newProjectButton.addEventListener("click", createNewProject);
    }
}

// Add copy buttons to code blocks
function addCopyButtons() {
    const codeBlocks = document.querySelectorAll('.message pre');

    codeBlocks.forEach((codeBlock) => {
        if (codeBlock.querySelector('.copy-code-button')) return;

        const copyButton = document.createElement('button');
        copyButton.classList.add('copy-code-button');
        copyButton.innerHTML = COPY_ICON;
        copyButton.title = 'Copy code';

        copyButton.addEventListener('click', () => {
            const code = codeBlock.textContent;

            navigator.clipboard.writeText(code).then(() => {
                copyButton.innerHTML = CHECK_ICON;

                setTimeout(() => {
                    copyButton.innerHTML = COPY_ICON;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy code: ', err);
                copyButton.innerHTML = ERROR_ICON;
            });
        });

        const codeBlockWrapper = document.createElement('div');
        codeBlockWrapper.style.position = 'relative';
        codeBlock.parentNode.insertBefore(codeBlockWrapper, codeBlock);
        codeBlockWrapper.appendChild(codeBlock);
        codeBlockWrapper.appendChild(copyButton);
    });
}

// Helper function to add messages to the chat UI with markdown support
function addMessage(content, sender) {
    const chatMessages = document.getElementById("chat-messages");
    if (!chatMessages) return;

    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message");
    messageDiv.classList.add(sender + "-message");

    // Add fade-in class for assistant messages
    if (sender === 'assistant') {
        messageDiv.classList.add("fade-in");
    }

    // Create a div for the content to enable markdown rendering
    const contentDiv = document.createElement("div");
    contentDiv.classList.add("message-content");

    // If the sender is assistant, render markdown
    if (sender === 'assistant') {
        // Process code blocks (```code```) to ensure proper language detection
        let processedContent = content.replace(/```(\w+)?\n([\s\S]*?)```/g, function (match, language, code) {
            return '```' + (language || 'plaintext') + '\n' + code + '```';
        });

        // Render markdown to HTML
        contentDiv.innerHTML = md.render(processedContent);

        // Initialize syntax highlighting for code blocks
        if (window.hljs) {
            setTimeout(() => {
                messageDiv.querySelectorAll('pre code').forEach((block) => {
                    window.hljs.highlightElement(block);
                });
            }, 0);
        }
    } else {
        // For user messages, just set text content
        contentDiv.textContent = content;
    }

    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    // For assistant messages, scroll to show the top of the message
    if (sender === 'assistant') {
        // Wait for the DOM to update and animations to start
        setTimeout(() => {
            // Calculate the scroll position needed to show the top of the message
            // with additional padding (40px) to ensure it's not cut off
            const scrollPosition = messageDiv.offsetTop - chatMessages.offsetTop - 40;

            // Set the scroll position
            chatMessages.scrollTop = scrollPosition;

            // Add copy buttons to new code blocks
            addCopyButtons();
        }, 10); // Small delay to ensure DOM is updated
    } else {
        // For user messages, scroll to the bottom as usual
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Function to set up auto-resize for textarea
function setupTextareaAutoResize() {
    const textarea = document.getElementById('user-input');
    if (!textarea) return;

    // Function to adjust height
    function adjustHeight() {
        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = 'auto';

        // Set new height based on content
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    // Function to reset height to default
    function resetHeight() {
        textarea.style.height = '18px'; // Match the initial min-height from CSS
    }

    // Adjust on input
    textarea.addEventListener('input', adjustHeight);

    // Also adjust when the textarea gets focus
    textarea.addEventListener('focus', adjustHeight);

    // Initial adjustment
    adjustHeight();

    // Store the original function to reset height after sending
    const originalSendMessage = window.sendMessage;
    window.sendMessage = function () {
        // Call the original sendMessage function if it exists
        if (originalSendMessage) {
            originalSendMessage();
        } else {
            // Otherwise call our implementation
            sendMessage();
        }

        // Reset textarea height after sending
        resetHeight();
    };
}

// Function to set up sidebar toggle
function setupSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    const chatContainer = document.querySelector('.chat-container');
    const sidebarToggle = document.getElementById('sidebar-toggle');

    if (sidebar && chatContainer && sidebarToggle) {
        sidebarToggle.addEventListener('click', function () {
            sidebar.classList.toggle('collapsed');
            chatContainer.classList.toggle('sidebar-collapsed');

            // Save sidebar state to localStorage
            localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
        });

        // Restore sidebar state from localStorage on page load
        const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (sidebarCollapsed) {
            sidebar.classList.add('collapsed');
            chatContainer.classList.add('sidebar-collapsed');
        }
    }
}

// Function to load user's projects
function loadUserProjects() {
    fetch('/api/projects/')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load projects');
            }
            return response.json();
        })
        .then(data => {
            const projectsList = document.getElementById('projects-list');
            if (!projectsList) return;

            // Clear loading message
            projectsList.innerHTML = '';

            // Check if we received an array (expected) and it has projects
            if (Array.isArray(data) && data.length > 0) {
                // Sort projects by last updated (newest first)
                data.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

                // Add each project to the list
                data.forEach(project => {
                    const projectItem = document.createElement('div');
                    projectItem.classList.add('project-item');
                    if (currentProjectId === project.id) {
                        projectItem.classList.add('active');
                    }

                    const projectDate = new Date(project.updated_at);
                    const formattedDate = projectDate.toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });

                    projectItem.innerHTML = `
              <div class="project-name">${project.name}</div>
              <div class="project-date">Last updated: ${formattedDate}</div>
            `;

                    projectItem.addEventListener('click', () => {
                        // Set this as the active project
                        document.querySelectorAll('.project-item').forEach(item => {
                            item.classList.remove('active');
                        });
                        projectItem.classList.add('active');

                        // Load the project and its conversation
                        loadProject(project.id);

                        // Reset conversation
                        currentConversationId = null;

                        // Clear chat messages except for the welcome message
                        const chatMessages = document.getElementById('chat-messages');
                        chatMessages.innerHTML = '';

                        // Add welcome message for the project
                        const welcomeMessage = `I'm ready to help with your "${project.name}" project! ` +
                            `${project.board_type ? 'I see you\'re using ' + project.board_type + '.' : ''} ` +
                            'What would you like to discuss?';

                        addMessage(welcomeMessage, 'assistant');
                    });

                    projectsList.appendChild(projectItem);
                });
            } else {
                // No projects or empty response
                projectsList.innerHTML = '<div class="no-projects">No projects yet. Create one to get started!</div>';
            }
        })
        .catch(error => {
            console.error('Error loading projects:', error);
            const projectsList = document.getElementById('projects-list');
            if (projectsList) {
                projectsList.innerHTML = '<div class="load-error">Error loading projects. Please try again.</div>';
            }
        });
}

// Add a function to create a new project
function createNewProject() {
    // Clear form fields
    document.getElementById('project-name').value = '';
    document.getElementById('board-type').value = '';
    document.getElementById('components-text').value = '';
    document.getElementById('libraries-text').value = '';

    // Reset project ID
    currentProjectId = null;
    currentConversationId = null;

    // Clear chat messages except for the welcome message
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';

    // Add welcome message for new project
    addMessage('Let\'s start a new project! If you\'d like you can enter some optional project details in the Project Settings panel (mouse to the right of the screen to expand it). This will give me some context every time I reply to your queries', 'assistant');

    // Update active project in the list
    document.querySelectorAll('.project-item').forEach(item => {
        item.classList.remove('active');
    });
}

function loadProject(projectId) {
    fetch(`/api/projects/${projectId}/`)
        .then((response) => response.json())
        .then((data) => {
            // Update form fields
            document.getElementById("project-name").value = data.name;
            document.getElementById("board-type").value = data.board_type || "";
            document.getElementById("components-text").value = data.components_text || "";
            document.getElementById("libraries-text").value = data.libraries_text || "";

            // Set model selections
            document.getElementById("query-model").value = data.query_model || "";
            document.getElementById("summary-model").value = data.summary_model || "";

            // Update history window slider
            const slider = document.getElementById("history-window");
            slider.value = data.history_window_size || 10;
            document.getElementById("history-window-value").textContent =
                slider.value + " messages";

            // Update current project ID
            currentProjectId = data.id;

            // Now load the project's conversation messages
            loadProjectMessages(projectId);
        })
        .catch((error) => console.error("Error loading project:", error));
}

// Function to load project conversation messages
function loadProjectMessages(projectId) {
    fetch(`/api/projects/${projectId}/messages/`)
        .then(response => response.json())
        .then(data => {
            // Clear existing messages
            const chatMessages = document.getElementById('chat-messages');
            chatMessages.innerHTML = '';

            if (data.messages && data.messages.length > 0) {
                // Set the conversation ID
                currentConversationId = data.conversation_id;

                // Add all messages to the chat
                data.messages.forEach(message => {
                    addMessage(message.content, message.sender);
                });

                // Scroll to the bottom
                chatMessages.scrollTop = chatMessages.scrollHeight;
            } else {
                // No messages, add a welcome message
                const welcomeMessage = `I'm ready to help with your project! What would you like to discuss?`;
                addMessage(welcomeMessage, 'assistant');
            }
        })
        .catch(error => console.error('Error loading messages:', error));
}

function loadModelChoices() {
    fetch('/api/model-choices/')
        .then(response => response.json())
        .then(data => {
            // Populate query model dropdown
            const queryModelSelect = document.getElementById('query-model');
            if (!queryModelSelect) return;

            // Clear existing options except the "Use Default" option
            while (queryModelSelect.options.length > 1) {
                queryModelSelect.remove(1);
            }

            // Add new options
            data.query_models.forEach(([value, name]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = name;
                queryModelSelect.appendChild(option);
            });

            // Populate summary model dropdown
            const summaryModelSelect = document.getElementById('summary-model');
            if (!summaryModelSelect) return;

            // Clear existing options except the "Use Default" option
            while (summaryModelSelect.options.length > 1) {
                summaryModelSelect.remove(1);
            }

            // Add new options
            data.summary_models.forEach(([value, name]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = name;
                summaryModelSelect.appendChild(option);
            });
        })
        .catch(error => console.error('Error loading model choices:', error));
}

// Function to save a project
function saveProject() {
    const projectName = document.getElementById("project-name").value;
    const boardType = document.getElementById("board-type").value || ""; // Empty string instead of undefined
    const componentsText = document.getElementById("components-text").value || "";
    const librariesText = document.getElementById("libraries-text").value || "";

    // Get model selections
    const queryModel = document.getElementById("query-model").value || null;
    const summaryModel = document.getElementById("summary-model").value || null;

    // Make sure history window size is a number
    let historyWindow = 10;
    try {
        historyWindow = parseInt(document.getElementById("history-window").value, 10);
        if (isNaN(historyWindow) || historyWindow < 1) {
            historyWindow = 10; // Default fallback
        }
    } catch (e) {
        logDebug("Error parsing history window size:", e);
    }

    if (!projectName) {
        alert("Please enter a project name");
        return;
    }

    const projectData = {
        name: projectName,
        board_type: boardType,
        components_text: componentsText,
        libraries_text: librariesText,
        description: boardType ? `Arduino project using ${boardType}` : "Arduino project",
        query_model: queryModel,
        summary_model: summaryModel,
        history_window_size: historyWindow
    };

    logDebug("Sending project data:", projectData);

    // If we already have a project, update it; otherwise create a new one
    const method = currentProjectId ? "PUT" : "POST";
    const url = currentProjectId
        ? `/api/projects/${currentProjectId}/`
        : "/api/projects/";

    logDebug(`Making ${method} request to ${url}`);

    fetch(url, {
        method: method,
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify(projectData),
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
            currentProjectId = data.id;

            alert("Project saved successfully!");

            // Add a system message to the chat
            const systemMessage = `Project "${projectName}" saved. ${boardType ? "Using " + boardType + "." : ""
                } Components: ${componentsText}. Libraries: ${librariesText}.`;
            addMessage(systemMessage, "assistant");

            // Refresh the projects list
            setTimeout(loadUserProjects, 1000);
        })
        .catch((error) => {
            console.error("Error saving project:", error);
            alert(`Failed to save project: ${error.message}`);
        });
}

// Function to send a message to the AI assistant
function sendMessage() {
    const userInput = document.getElementById("user-input");
    if (!userInput) return;

    const message = userInput.value.trim();

    if (!message) {
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
        project_id: currentProjectId,
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
                hideTypingIndicator(); // Hide indicator on error
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
                document
                    .getElementById("chat-messages")
                    .appendChild(tokenInfoDiv);
            }
        })
        .catch((error) => {
            // Hide typing indicator on error
            hideTypingIndicator();

            console.error("Error sending message:", error);
            addMessage(
                error.message ||
                "Sorry, there was an error processing your message.",
                "assistant"
            );
        });
}

// Function to show the typing indicator
function showTypingIndicator() {
    const chatMessages = document.getElementById("chat-messages");
    if (!chatMessages) return null;

    // Check if an indicator already exists
    let indicator = document.querySelector('.typing-indicator');
    if (!indicator) {
        // Create the typing indicator
        indicator = document.createElement("div");
        indicator.classList.add("typing-indicator");
        indicator.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
      `;
        chatMessages.appendChild(indicator);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    return indicator;
}

// Function to remove the typing indicator
function hideTypingIndicator() {
    const indicator = document.querySelector('.typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

// Helper function to get CSRF token from cookies
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== "") {
        const cookies = document.cookie.split(";");
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === name + "=") {
                cookieValue = decodeURIComponent(
                    cookie.substring(name.length + 1)
                );
                break;
            }
        }
    }
    return cookieValue;
}