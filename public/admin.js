const socket = io("http://145.223.98.156:3000", { transports: ["websocket"] });
const configuration = {
	iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
let peerConnection;

socket.on("connect", () => {
	document.getElementById("connectionStatus").textContent =
		"Connection Status: Connected to server";
	document.getElementById("connectionStatus").className = "connected";
	socket.emit("join", { uid: "admin", senderName: "Admin", role: "admin" });
});

socket.on("connect_error", () => {
	document.getElementById("connectionStatus").textContent =
		"Connection Status: Disconnected";
	document.getElementById("connectionStatus").className = "disconnected";
});

socket.on("update_users", (users) => {
	const userList = document.getElementById("userList");
	userList.innerHTML = "";
	let activeSpeakers = 0;
	users.forEach(({ uid, senderName, status }) => {
		if (status === "allowed") activeSpeakers++;
		const userDiv = document.createElement("div");
		userDiv.className = "user";
		userDiv.innerHTML = `
      <span>${senderName} (${status})</span>
      <div>
        <button class="allow" onclick="adminAction('${uid}', 'allowed')" ${
			status === "allowed" ? "disabled" : ""
		}>Allow</button>
        <button class="pause" onclick="adminAction('${uid}', 'paused')" ${
			status !== "allowed" ? "disabled" : ""
		}>Pause</button>
        <button class="stop" onclick="adminAction('${uid}', 'stopped')" ${
			status === "allowed" || status === "paused" ? "" : "disabled"
		}>Stop</button>
      </div>
    `;
		userList.appendChild(userDiv);
	});
	document.getElementById("activeSpeakers").textContent = activeSpeakers;
});

socket.on("offer", async ({ offer, from }) => {
	if (!peerConnection) {
		peerConnection = new RTCPeerConnection(configuration);
		peerConnection.ontrack = (event) => {
			const audio = document.createElement("audio");
			audio.srcObject = event.streams[0];
			audio.autoplay = true;
			document.getElementById("audioStatus").textContent =
				"Audio Status: Active";
			document.getElementById("audioStatus").className = "active";
			document.body.appendChild(audio);
		};
	}
	await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
	const answer = await peerConnection.createAnswer();
	await peerConnection.setLocalDescription(answer);
	socket.emit("answer", { answer, to: from });
});

socket.on("ice_candidate", async ({ candidate }) => {
	if (peerConnection && candidate) {
		await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
	}
});

socket.on(
	"transport",
	async ({ id, iceParameters, iceCandidates, dtlsParameters }) => {
		if (!peerConnection) {
			peerConnection = new RTCPeerConnection(configuration);
			peerConnection.ontrack = (event) => {
				const audio = document.createElement("audio");
				audio.srcObject = event.streams[0];
				audio.autoplay = true;
				document.getElementById("audioStatus").textContent =
					"Audio Status: Active";
				document.getElementById("audioStatus").className = "active";
				document.body.appendChild(audio);
			};
		}
	}
);

function adminAction(uid, action) {
	socket.emit("admin_action", { uid, action });
}
