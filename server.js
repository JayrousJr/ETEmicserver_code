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
	maxHttpBufferSize: 1e8,
});

const requests = [];

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// Serve Admin Panel
app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Socket.IO logic
io.on("connection", (socket) => {
	console.log("✅ Client connected:", socket.id);
	socket.emit("update_requests", requests);

	socket.on("talk_request", (data) => {
		const request = {
			...data,
			socketId: socket.id,
			isTalking: false,
			connectedAt: new Date().toISOString(),
		};
		requests.push(request);
		io.emit("update_requests", requests);
		console.log(`🟢 Talk request from ${data.senderName} (${socket.id})`);
	});

	socket.on("accept_request", ({ socketId }) => {
		const request = requests.find((req) => req.socketId === socketId);
		if (request) {
			io.to(socketId).emit("request_accepted");
			request.isTalking = true;
			request.acceptedAt = new Date().toISOString();
			io.emit("update_requests", requests);
			console.log(
				`🟢 Request accepted for ${request.senderName} (${socketId})`
			);
		}
	});

	socket.on("reject_request", ({ socketId }) => {
		const requestIndex = requests.findIndex((req) => req.socketId === socketId);
		if (requestIndex !== -1) {
			const request = requests[requestIndex];
			io.to(socketId).emit("request_rejected");
			requests.splice(requestIndex, 1);
			io.emit("update_requests", requests);
			console.log(
				`🔴 Request rejected for ${request.senderName} (${socketId})`
			);
		}
	});

	socket.on("stop_request", ({ socketId }) => {
		const request = requests.find((req) => req.socketId === socketId);
		if (request) {
			io.to(socketId).emit("stop_talking");
			request.isTalking = false;
			request.stoppedAt = new Date().toISOString();
			io.emit("update_requests", requests);
			console.log(`🟡 Stopped talking: ${request.senderName} (${socketId})`);
		}
	});

	socket.on("audio_chunk", (data) => {
		try {
			if (!data || !data.audio || !data.senderName) {
				console.error("❌ Invalid audio data received");
				return;
			}

			const sender = requests.find(
				(req) => req.senderName === data.senderName && req.isTalking
			);
			if (!sender) {
				console.warn(`⚠️ Audio from unauthorized sender: ${data.senderName}`);
				return;
			}

			console.log(`🎵 Audio chunk received from ${data.senderName}`);

			io.emit("audio_stream", {
				audio: data.audio,
				senderName: data.senderName,
				segmentIndex: data.segmentIndex,
			});
		} catch (error) {
			console.error("❌ Error processing audio chunk:", error);
		}
	});

	socket.on("audio_done", () => {
		const request = requests.find((req) => req.socketId === socket.id);
		if (request) {
			console.log(`🎵 Audio stream ended for ${request.senderName}`);
			io.emit("audio_done", { senderName: request.senderName });
		}
	});

	socket.on("disconnect", (reason) => {
		console.log(`❌ Client disconnected: ${socket.id}, reason: ${reason}`);

		const requestIndex = requests.findIndex(
			(req) => req.socketId === socket.id
		);
		if (requestIndex !== -1) {
			const request = requests[requestIndex];
			requests.splice(requestIndex, 1);
			io.emit("update_requests", requests);

			if (request.isTalking) {
				io.emit("audio_done", { senderName: request.senderName });
			}
		}
	});
});

// Server status endpoint
app.get("/status", (req, res) => {
	res.json({
		status: "running",
		connectedClients: io.engine.clientsCount,
		activeRequests: requests.length,
		talkingUsers: requests.filter((req) => req.isTalking).length,
	});
});

// Server listen
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

server.listen(PORT, HOST, () => {
	console.log(`🚀 Server running at http://${HOST}:${PORT}`);
});
