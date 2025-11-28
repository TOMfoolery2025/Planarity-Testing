import {
    UI,
    showError,
    setServerStatus,
    setLoadingState,
    updateStats,
    resetGraphUI,
    initModal,
    initDivider
} from './ui.js';
import { checkPlanarity, pingServer } from './api.js';
import { renderGraph } from './visualization.js';
import { GraphEditor } from './editor.js';

document.addEventListener("DOMContentLoaded", () => {
    // Initialize UI components
    initModal();
    initDivider();

    // Initialize Graph Editor
    const editor = new GraphEditor();
    const editorView = document.getElementById('editor-view');
    const mainSplitView = document.getElementById('main-split-view');

    document.getElementById('open-editor-btn').addEventListener('click', () => {
        mainSplitView.style.display = 'none';
        editorView.classList.remove('hidden');
        // Trigger resize to ensure SVG size is correct
        window.dispatchEvent(new Event('resize'));
    });

    document.getElementById('editor-close').addEventListener('click', () => {
        editorView.classList.add('hidden');
        mainSplitView.style.display = 'flex';
    });

    document.getElementById('editor-analyze').addEventListener('click', () => {
        const file = editor.getGraphAsFile();
        if (file) {
            editorView.classList.add('hidden');
            mainSplitView.style.display = 'flex';
            handleFile(file);
        } else {
            showError("Please draw a graph first.");
        }
    });

    // Editor Import
    const editorFileInput = document.getElementById('editor-file-input');
    document.getElementById('editor-import').addEventListener('click', () => {
        editorFileInput.click();
    });

    editorFileInput.addEventListener('change', async (e) => {
        if (e.target.files.length) {
            const file = e.target.files[0];
            // Use checkPlanarity to parse the file via backend
            // We don't need to show loading state on main UI, maybe just a cursor wait?
            document.body.style.cursor = 'wait';

            const result = await checkPlanarity(file, document.getElementById('algorithm-select').value);
            document.body.style.cursor = 'default';

            if (result.success) {
                if (result.data.status === "InvalidInput") {
                    showError(result.data.message || "Invalid file format.");
                } else {
                    editor.loadGraph(result.data);
                }
            } else {
                showError("Failed to import graph: " + (result.error.message || result.error));
            }

            // Reset input
            editorFileInput.value = '';
        }
    });

    // Server Status Check
    async function checkServer() {
        const connected = await pingServer();
        setServerStatus(connected);
    }
    setServerStatus(false);
    checkServer();
    setInterval(checkServer, 10000);

    // File Handling
    async function handleFile(file) {
        setLoadingState();
        resetGraphUI(); // Clear previous graph and reset UI

        const result = await checkPlanarity(file, document.getElementById('algorithm-select').value);

        if (result.success) {
            setServerStatus(result.serverConnected);
            const data = result.data;

            // Check for Invalid Input
            if (data.status === "InvalidInput") {
                showError(data.message || "Invalid file format.");
                return;
            }

            renderGraph(data);
            updateStats(data);
        } else {
            console.error("Error:", result.error);
            showError("Failed to process graph: " + (result.error.message || result.error));
        }
    }

    // Drag & Drop
    UI.dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        UI.dropZone.classList.add("drag-over");
    });

    UI.dropZone.addEventListener("dragleave", () => {
        UI.dropZone.classList.remove("drag-over");
    });

    UI.dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        UI.dropZone.classList.remove("drag-over");
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // File Input
    UI.fileInput.addEventListener("change", (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });
});
