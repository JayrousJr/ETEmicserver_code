const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
});

const requests = [];
const audioSessions = {};

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "admin.html"));
});

io.on("connection", (socket) => {
	console.log("Client connected:", socket.id);
	socket.emit("update_requests", requests);

	socket.on("talk_request", (data) => {
		const request = {
			...data,
			socketId: socket.id,
			isTalking: false,
		};
		requests.push(request);
		io.emit("update_requests", requests);
		console.log(`Talk request from ${data.senderName}`);
	});

	socket.on("accept_request", ({ socketId }) => {
		const request = requests.find((req) => req.socketId === socketId);
		if (request) {
			io.to(socketId).emit("request_accepted");
			request.isTalking = true;
			io.emit("update_requests", requests);
			console.log(`Request accepted for ${request.senderName}`);
		}
	});

	socket.on("reject_request", ({ socketId }) => {
		const index = requests.findIndex((req) => req.socketId === socketId);
		if (index !== -1) {
			requests.splice(index, 1);
			io.to(socketId).emit("request_rejected");
			io.emit("update_requests", requests);
			console.log(`Request rejected for ${socketId}`);
		}
	});

	socket.on("stop_request", ({ socketId }) => {
		const request = requests.find((req) => req.socketId === socketId);
		if (request) {
			request.isTalking = false;
			io.to(socketId).emit("stop_talking");
			io.emit("update_requests", requests);
			console.log(`Stopped talking: ${socketId}`);
		}
	});

	socket.on("audio_chunk", (data) => {
		// Verify audio data
		if (!data.audio || !data.senderName || !data.token) {
			console.log("Invalid audio chunk received");
			return;
		}

		// Initialize session if new
		if (!audioSessions[data.senderName]) {
			audioSessions[data.senderName] = {
				chunks: [],
				lastTimestamp: Date.now(),
				totalSize: 0,
			};
		}

		const session = audioSessions[data.senderName];

		// Verify token sequence (simplified)
		const tokenTime = parseInt(data.token.substr(0, 8), 36);
		if (tokenTime < session.lastTimestamp) {
			console.log("Out-of-order audio chunk detected");
			return;
		}

		// Update session
		session.chunks.push(data);
		session.totalSize += data.size;
		session.lastTimestamp = data.timestamp;

		console.log(`Audio received from ${data.senderName}: ${data.size} bytes`);

		// Broadcast to all admins
		io.emit("audio_stream", data);
	});

	socket.on("audio_done", () => {
		io.emit("audio_done");
	});

	socket.on("disconnect", () => {
		console.log("Disconnected:", socket.id);
		const index = requests.findIndex((req) => req.socketId === socket.id);
		if (index !== -1) {
			requests.splice(index, 1);
			io.emit("update_requests", requests);
		}
	});
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "145.223.98.156";

server.listen(PORT, HOST, () => {
	console.log(`🚀 Server running at http://${HOST}:${PORT}`);
});
