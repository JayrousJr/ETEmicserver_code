const socket = io("http://145.223.98.156:3000");
let bytesReceived = 0;
let chunksReceived = 0;
let activeSpeakers = 0;

socket.on("connect", () => {
	console.log("Admin socket connected");
	document.getElementById("status").textContent =
		"Connection Status: Connected";
	socket.emit("register_admin");
});

socket.on("connect_error", (error) => {
	console.error("Admin socket connect error:", error);
	document.getElementById("status").textContent =
		"Connection Status: Disconnected";
});

socket.on("update_requests", (requests) => {
	console.log("Received update_requests:", requests);
	const requestsDiv = document.getElementById("requests");
	requestsDiv.innerHTML = "<h2>Talk Requests</h2>";
	activeSpeakers = requests.filter((req) => req.isTalking).length;
	document.getElementById("speakers").textContent = activeSpeakers;

	requests.forEach((req) => {
		const div = document.createElement("div");
		div.className = "request";
		div.innerHTML = `
            ${req.senderName} (${req.socketId})
            <button onclick="acceptRequest('${req.socketId}')">${
			req.isTalking ? "Stop" : "Accept"
		}</button>
            ${
							req.isTalking
								? `<button onclick="pauseRequest('${req.socketId}')">${
										req.isPaused ? "Resume" : "Pause"
								  }</button>`
								: ""
						}
            <button onclick="rejectRequest('${req.socketId}')">Reject</button>
        `;
		requestsDiv.appendChild(div);
	});
});

socket.on("audio_stream", (data) => {
	console.log(
		"Received audio_stream from:",
		data.senderName,
		"size:",
		data.size
	);
	document.getElementById(
		"audio-status"
	).textContent = `Audio Status: Receiving from ${data.senderName}`;
	bytesReceived += data.size / 1024;
	chunksReceived++;
	document.getElementById("bytes").textContent = Math.round(bytesReceived);
	document.getElementById("chunks").textContent = chunksReceived;

	const audio = new Audio(`data:audio/mp4;base64,${data.audio}`);
	audio.play().catch((e) => console.error("Audio playback error:", e));
});

socket.on("audio_done", () => {
	console.log("Received audio_done");
	document.getElementById("audio-status").textContent =
		"Audio Status: No active audio";
});

function acceptRequest(socketId) {
	console.log("Accepting request for:", socketId);
	socket.emit("accept_request", { socketId });
}

function rejectRequest(socketId) {
	console.log("Rejecting request for:", socketId);
	socket.emit("reject_request", { socketId });
}

function pauseRequest(socketId) {
	console.log("Pausing/resuming request for:", socketId);
	socket.emit("pause_request", { socketId });
}
