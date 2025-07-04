const socket = io("http://145.223.98.156:3000");
let bytesReceived = 0;
let chunksReceived = 0;
let activeSpeakers = 0;

socket.on("connect", () => {
	document.getElementById("status").textContent =
		"Connection Status: Connected";
	socket.emit("register_admin");
});

socket.on("connect_error", () => {
	document.getElementById("status").textContent =
		"Connection Status: Disconnected";
});

socket.on("update_requests", (requests) => {
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
	document.getElementById("audio-status").textContent =
		"Audio Status: No active audio";
});

function acceptRequest(socketId) {
	socket.emit("accept_request", { socketId });
}

function rejectRequest(socketId) {
	socket.emit("reject_request", { socketId });
}

function pauseRequest(socketId) {
	socket.emit("pause_request", { socketId });
}
