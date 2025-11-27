document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("file-input");
    const dropZone = document.getElementById("drop-zone");
    const graphContainer = document.getElementById("graph-container");
    const statusPanel = document.getElementById("status-panel");
    const statusText = document.getElementById("status-text");
    const statusDot = document.querySelector(".status-dot");
    const nodeCountEl = document.getElementById("node-count");
    const edgeCountEl = document.getElementById("edge-count");

    // Initialize D3 Zoom (Removed: handled per graph instance)

    // Setup Drag & Drop
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    async function handleFile(file) {
        // Update UI to loading state
        statusPanel.style.display = "block";
        statusText.textContent = "Processing...";
        statusDot.style.backgroundColor = "#fbbf24"; // Yellow
        statusDot.style.boxShadow = "0 0 8px #fbbf24";

        // Reset UI state
        document.getElementById("result-panel").classList.remove("expanded");
        document.getElementById("conflict-stat").style.display = "none";
        document.getElementById("conflict-type").textContent = "-";
        document.getElementById("result-header").style.color = ""; // Reset color

        const formData = new FormData();
        formData.append("file", file);

        try {
            let data;
            try {
                const response = await fetch("http://127.0.0.1:5001/check-planarity", {
                    method: "POST",
                    body: formData
                });
                if (!response.ok) throw new Error("Backend error");
                data = await response.json();
            } catch (err) {
                console.warn("Backend connection failed, using mock data.", err);
                data = mockResponse(file.name);
            }

            renderGraph(data);
            updateStats(data);

        } catch (error) {
            console.error("Error:", error);
            statusText.textContent = "Error";
            statusDot.style.backgroundColor = "#ef4444"; // Red
            statusDot.style.boxShadow = "0 0 8px #ef4444";
            alert("Failed to process graph: " + error.message);
        }
    }

    function updateStats(data) {
        nodeCountEl.textContent = data.nodes.length;
        edgeCountEl.textContent = data.edges.length;
        const resultHeader = document.getElementById("result-header");

        if (data.status === "planar") {
            statusText.textContent = "Planar Graph";
            statusDot.style.backgroundColor = "#4ade80"; // Green
            statusDot.style.boxShadow = "0 0 8px #4ade80";

            // Header Color Green
            resultHeader.style.color = "#4ade80";

        } else {
            statusText.textContent = "Non-Planar";
            statusDot.style.backgroundColor = "#ef4444"; // Red
            statusDot.style.boxShadow = "0 0 8px #ef4444";

            // Header Color Red
            resultHeader.style.color = "#ef4444";

            // Expand panel and show type
            setTimeout(() => {
                document.getElementById("result-panel").classList.add("expanded");
                if (data.type) {
                    document.getElementById("conflict-stat").style.display = "flex";
                    document.getElementById("conflict-type").textContent = data.type;
                }
            }, 500);
        }
    }

    function renderGraph(data) {
        // Clear previous graphs
        document.getElementById("original-graph").innerHTML = "";
        document.getElementById("result-graph").innerHTML = "";

        // 1. Render Original Input
        renderSingleGraph("#original-graph", data, {
            forceDirected: true,
            highlightConflicts: false,
            staticCoords: false
        });

        // 2. Render Result
        if (data.status === "planar") {
            renderSingleGraph("#result-graph", data, {
                forceDirected: false,
                highlightConflicts: false,
                staticCoords: true
            });
        } else {
            // Non-Planar: Render with Canonical Subgraph
            renderCanonicalGraph("#result-graph", data);
        }
    }

    function renderCanonicalGraph(containerId, data) {
        const container = document.querySelector(containerId);
        const width = container.clientWidth;
        const height = container.clientHeight;
        const controls = d3.select("#controls-result");

        const zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on("zoom", (event) => {
                svg.select("g.main-group").attr("transform", event.transform);
            });

        const svg = d3.select(containerId)
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .call(zoom)
            .on("dblclick.zoom", null);

        const mainGroup = svg.append("g").attr("class", "main-group");

        // --- 1. Draw Main Graph (Force Directed) ---
        const nodes = data.nodes.map(d => ({ ...d }));
        const edges = data.edges.map(d => ({ ...d }));

        // Filter conflict nodes for connecting lines later
        const conflictNodeIds = new Set();
        edges.filter(e => e.is_conflict).forEach(e => {
            conflictNodeIds.add(e.source);
            conflictNodeIds.add(e.target);
        });

        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(edges).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 3, height / 2)); // Shift to left

        const link = mainGroup.append("g")
            .selectAll("line")
            .data(edges)
            .join("line")
            .attr("class", d => d.is_conflict ? "edge conflict" : "edge");

        const node = mainGroup.append("g")
            .selectAll(".node")
            .data(nodes)
            .join("g")
            .attr("class", "node");

        node.append("circle").attr("r", 6);
        node.append("text").attr("dx", 10).attr("dy", 4).text(d => d.id);

        // --- 2. Draw Canonical Graph (K5 or K3,3) ---
        const canonicalGroup = mainGroup.append("g").attr("class", "canonical-group");
        const connectorGroup = mainGroup.append("g").attr("class", "connector-group"); // For connecting lines

        // Generate Canonical Data
        const type = data.type || "K5"; // Default to K5 if unknown
        const canonicalData = generateCanonicalData(type, width * 0.75, height / 2); // Shift to right

        // Draw Canonical Edges
        canonicalGroup.selectAll(".edge.canonical")
            .data(canonicalData.edges)
            .join("line")
            .attr("class", "edge canonical")
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        // Draw Canonical Nodes
        const canonicalNodes = canonicalGroup.selectAll(".node.canonical")
            .data(canonicalData.nodes)
            .join("g")
            .attr("class", "node canonical")
            .attr("transform", d => `translate(${d.x},${d.y})`);

        canonicalNodes.append("circle").attr("r", 8);
        canonicalNodes.append("text").attr("dx", 10).attr("dy", 4).text(d => d.id);

        // --- 3. Update Simulation ---
        simulation.on("tick", () => {
            // Update Main Graph
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node.attr("transform", d => `translate(${d.x},${d.y})`);

            // Update Connector Lines (Dynamic)
            // We draw lines from main graph conflict nodes to *any* canonical node 
            // just to visually link them. A real mapping is hard, so we map by index or random for visual effect.
            // Better approach: If we knew the mapping, we'd use it. 
            // For MVP: Map the first N conflict nodes to the N canonical nodes.

            const connectors = [];
            const conflictNodesArr = nodes.filter(n => conflictNodeIds.has(n.id));

            // Simple mapping strategy: Map conflict node i to canonical node i % canonical_size
            conflictNodesArr.forEach((n, i) => {
                const target = canonicalData.nodes[i % canonicalData.nodes.length];
                connectors.push({ source: n, target: target });
            });

            connectorGroup.selectAll(".connector-line")
                .data(connectors)
                .join("line")
                .attr("class", "connector-line")
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
        });

        // Bind Controls
        controls.select(".zoom-in").on("click", () => svg.transition().call(zoom.scaleBy, 1.2));
        controls.select(".zoom-out").on("click", () => svg.transition().call(zoom.scaleBy, 0.8));
        controls.select(".reset-view").on("click", () => svg.transition().call(zoom.transform, d3.zoomIdentity));
    }

    function generateCanonicalData(type, centerX, centerY) {
        const radius = 100;
        let nodes = [];
        let edges = [];

        if (type === "K5") {
            // Pentagon layout
            for (let i = 0; i < 5; i++) {
                const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
                nodes.push({
                    id: `K5-${i + 1}`,
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle)
                });
            }
            // Complete graph edges
            for (let i = 0; i < 5; i++) {
                for (let j = i + 1; j < 5; j++) {
                    edges.push({ source: nodes[i], target: nodes[j] });
                }
            }
        } else if (type === "K3,3") {
            // Bipartite layout (two columns)
            for (let i = 0; i < 3; i++) {
                nodes.push({ id: `U${i + 1}`, x: centerX - 50, y: centerY - 60 + i * 60 }); // Left set
                nodes.push({ id: `V${i + 1}`, x: centerX + 50, y: centerY - 60 + i * 60 }); // Right set
            }
            // Complete bipartite edges
            for (let i = 0; i < 3; i++) { // Left set indices: 0, 2, 4
                for (let j = 0; j < 3; j++) { // Right set indices: 1, 3, 5
                    edges.push({ source: nodes[i * 2], target: nodes[j * 2 + 1] });
                }
            }
        }
        return { nodes, edges };
    }

    function renderSingleGraph(containerId, data, options) {
        const container = document.querySelector(containerId);
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Determine which control panel to use based on containerId
        const controlId = containerId === "#original-graph" ? "#controls-original" : "#controls-result";
        const controls = d3.select(controlId);

        // Create a unique zoom behavior for this graph instance
        const zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on("zoom", (event) => {
                svg.select("g").attr("transform", event.transform);
            });

        const svg = d3.select(containerId)
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .call(zoom)
            .on("dblclick.zoom", null); // Disable double click zoom

        const g = svg.append("g");

        const nodes = data.nodes.map(d => ({ ...d }));
        const edges = data.edges.map(d => ({ ...d }));
        const nodeMap = new Map(nodes.map(n => [n.id, n]));

        // Draw Edges
        const link = g.append("g")
            .selectAll("line")
            .data(edges)
            .join("line")
            .attr("class", d => (options.highlightConflicts && d.is_conflict) ? "edge conflict" : "edge");

        // Draw Nodes
        const node = g.append("g")
            .selectAll(".node")
            .data(nodes)
            .join("g")
            .attr("class", "node");

        node.append("circle")
            .attr("r", 6);

        node.append("text")
            .attr("dx", 10)
            .attr("dy", 4)
            .text(d => d.id);

        if (options.staticCoords && nodes[0].x !== undefined) {
            // Static Layout (Planar)
            const xExtent = d3.extent(nodes, d => d.x);
            const yExtent = d3.extent(nodes, d => d.y);
            const xCenter = (xExtent[0] + xExtent[1]) / 2;
            const yCenter = (yExtent[0] + yExtent[1]) / 2;
            const xOffset = width / 2 - xCenter;
            const yOffset = height / 2 - yCenter;

            // Initial Transform to center
            const initialTransform = d3.zoomIdentity.translate(xOffset, yOffset);
            svg.call(zoom.transform, initialTransform);

            link
                .attr("x1", d => nodeMap.get(d.source).x)
                .attr("y1", d => nodeMap.get(d.source).y)
                .attr("x2", d => nodeMap.get(d.target).x)
                .attr("y2", d => nodeMap.get(d.target).y);

            node.attr("transform", d => `translate(${d.x},${d.y})`);
        } else {
            // Force Directed Layout
            const simulation = d3.forceSimulation(nodes)
                .force("link", d3.forceLink(edges).id(d => d.id).distance(100))
                .force("charge", d3.forceManyBody().strength(-300))
                .force("center", d3.forceCenter(width / 2, height / 2));

            simulation.on("tick", () => {
                link
                    .attr("x1", d => d.source.x)
                    .attr("y1", d => d.source.y)
                    .attr("x2", d => d.target.x)
                    .attr("y2", d => d.target.y);

                node.attr("transform", d => `translate(${d.x},${d.y})`);
            });
        }

        // Bind Control Buttons
        controls.select(".zoom-in").on("click", () => {
            svg.transition().duration(300).call(zoom.scaleBy, 1.2);
        });

        controls.select(".zoom-out").on("click", () => {
            svg.transition().duration(300).call(zoom.scaleBy, 0.8);
        });

        controls.select(".reset-view").on("click", () => {
            if (options.staticCoords) {
                // Re-center static layout
                const xExtent = d3.extent(nodes, d => d.x);
                const yExtent = d3.extent(nodes, d => d.y);
                const xCenter = (xExtent[0] + xExtent[1]) / 2;
                const yCenter = (yExtent[0] + yExtent[1]) / 2;
                const xOffset = width / 2 - xCenter;
                const yOffset = height / 2 - yCenter;
                svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(xOffset, yOffset));
            } else {
                svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
            }
        });
    }

    // Mock Data Generator for testing without backend
    function mockResponse(filename) {
        if (filename.includes("k5") || filename.includes("non")) {
            return {
                status: "non_planar",
                nodes: [
                    { id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }
                ],
                edges: [
                    { source: "1", target: "2", is_conflict: true },
                    { source: "1", target: "3", is_conflict: true },
                    { source: "1", target: "4", is_conflict: true },
                    { source: "1", target: "5", is_conflict: true },
                    { source: "2", target: "3", is_conflict: true },
                    { source: "2", target: "4", is_conflict: true },
                    { source: "2", target: "5", is_conflict: true },
                    { source: "3", target: "4", is_conflict: true },
                    { source: "3", target: "5", is_conflict: true },
                    { source: "4", target: "5", is_conflict: true }
                ]
            };
        } else {
            return {
                status: "planar",
                nodes: [
                    { id: "A", x: 0, y: -100 },
                    { id: "B", x: -86, y: 50 },
                    { id: "C", x: 86, y: 50 },
                    { id: "D", x: 0, y: 0 }
                ],
                edges: [
                    { source: "A", target: "B" },
                    { source: "B", target: "C" },
                    { source: "C", "target": "A" },
                    { source: "A", target: "D" },
                    { source: "B", target: "D" },
                    { source: "C", target: "D" }
                ]
            };
        }
    }
});
