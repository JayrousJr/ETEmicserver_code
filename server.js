const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
	cors: {
		origin: "*", // Allow all origins for now; change this for production!
		methods: ["GET", "POST"],
	},
	// Increase max listeners and payload size for audio streaming
	maxHttpBufferSize: 1e8, // 100MB buffer for large audio files
	pingTimeout: 60000,
	pingInterval: 25000,
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

	// Send current requests to new client
	socket.emit("update_requests", requests);

	// Handle talk requests
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

	// Handle request acceptance
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
		} else {
			console.log(`⚠️ Request not found for socketId: ${socketId}`);
		}
	});

	// Handle request rejection
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

	// Handle stopping a request
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

	// Handle audio chunks with enhanced logging
	socket.on("audio_chunk", (data) => {
		try {
			// Validate audio data
			if (!data || !data.audio || !data.senderName) {
				console.error("❌ Invalid audio data received:", {
					hasData: !!data,
					hasAudio: !!(data && data.audio),
					hasSender: !!(data && data.senderName),
					audioLength: data && data.audio ? data.audio.length : 0,
				});
				return;
			}

			// Find the sender in requests
			const sender = requests.find(
				(req) => req.senderName === data.senderName && req.isTalking
			);
			if (!sender) {
				console.warn(`⚠️ Audio from unauthorized sender: ${data.senderName}`);
				return;
			}

			// Enhanced logging for audio streaming
			console.log(`🎵 Audio chunk received from ${data.senderName}:`, {
				segmentIndex: data.segmentIndex,
				audioLength: data.audio.length,
				fileSize: data.fileSize || "unknown",
				timestamp: new Date(data.timestamp).toISOString(),
			});

			// Broadcast audio to all clients (including admin panel)
			io.emit("audio_stream", {
				audio: data.audio,
				senderName: data.senderName,
				segmentIndex: data.segmentIndex,
				timestamp: data.timestamp,
				fileSize: data.fileSize,
			});

			console.log(`📡 Audio broadcasted to ${io.engine.clientsCount} clients`);
		} catch (error) {
			console.error("❌ Error processing audio chunk:", error);
		}
	});

	// Handle audio stream end
	socket.on("audio_done", () => {
		const request = requests.find((req) => req.socketId === socket.id);
		if (request) {
			console.log(`🎵 Audio stream ended for ${request.senderName}`);
			io.emit("audio_done", { senderName: request.senderName });
		}
	});

	// Handle client disconnection
	socket.on("disconnect", (reason) => {
		console.log(`❌ Client disconnected: ${socket.id}, reason: ${reason}`);

		const requestIndex = requests.findIndex(
			(req) => req.socketId === socket.id
		);
		if (requestIndex !== -1) {
			const request = requests[requestIndex];
			console.log(`🔄 Removing request for ${request.senderName}`);
			requests.splice(requestIndex, 1);
			io.emit("update_requests", requests);

			// Notify other clients that this user stopped talking
			if (request.isTalking) {
				io.emit("audio_done", { senderName: request.senderName });
			}
		}
	});

	// Handle connection errors
	socket.on("error", (error) => {
		console.error(`❌ Socket error for ${socket.id}:`, error);
	});
});

// Enhanced error handling for the server
server.on("error", (error) => {
	console.error("❌ Server error:", error);
});

// Graceful shutdown
process.on("SIGTERM", () => {
	console.log("📴 Server shutting down gracefully...");
	server.close(() => {
		console.log("✅ Server closed");
		process.exit(0);
	});
});

process.on("SIGINT", () => {
	console.log("📴 Server shutting down gracefully...");
	server.close(() => {
		console.log("✅ Server closed");
		process.exit(0);
	});
});

// Server status endpoint
app.get("/status", (req, res) => {
	res.json({
		status: "running",
		connectedClients: io.engine.clientsCount,
		activeRequests: requests.length,
		talkingUsers: requests.filter((req) => req.isTalking).length,
		uptime: process.uptime(),
		timestamp: new Date().toISOString(),
	});
});

// API endpoint to get current requests (for debugging)
app.get("/api/requests", (req, res) => {
	res.json({
		requests: requests.map((req) => ({
			senderName: req.senderName,
			isTalking: req.isTalking,
			connectedAt: req.connectedAt,
			acceptedAt: req.acceptedAt,
			stoppedAt: req.stoppedAt,
		})),
	});
});

// Server listen
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

server.listen(PORT, HOST, () => {
	console.log(`🚀 Server running at http://${HOST}:${PORT}`);
	console.log(`🌐 Admin panel: http://145.223.98.156:${PORT}`);
	console.log(`📊 Status endpoint: http://145.223.98.156:${PORT}/status`);
	console.log(`📱 Ready for Android audio streaming!`);
});
