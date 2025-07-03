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
		const request = { ...data, socketId: socket.id };
		requests.push(request);
		io.emit("update_requests", requests);
		console.log(`🟢 Talk request from ${data.senderName}`);
	});

	socket.on("accept_request", ({ socketId }) => {
		io.to(socketId).emit("request_accepted");
		const index = requests.findIndex((req) => req.socketId === socketId);
		if (index !== -1) requests[index].isTalking = true;
		io.emit("update_requests", requests);
		console.log(`🟢 Request accepted for ${socketId}`);
	});

	socket.on("reject_request", ({ socketId }) => {
		io.to(socketId).emit("request_rejected");
		const index = requests.findIndex((req) => req.socketId === socketId);
		if (index !== -1) requests.splice(index, 1);
		io.emit("update_requests", requests);
		console.log(`🔴 Request rejected for ${socketId}`);
	});

	socket.on("stop_request", ({ socketId }) => {
		io.to(socketId).emit("stop_talking");
		const index = requests.findIndex((req) => req.socketId === socketId);
		if (index !== -1) requests[index].isTalking = false;
		io.emit("update_requests", requests);
		console.log(`🟡 Stopped talking: ${socketId}`);
	});

	socket.on("audio_chunk", (data) => {
		io.emit("audio_stream", data);
	});

	socket.on("audio_done", () => {
		io.emit("audio_done");
	});

	socket.on("disconnect", () => {
		console.log("❌ Disconnected:", socket.id);
		const index = requests.findIndex((req) => req.socketId === socket.id);
		if (index !== -1) requests.splice(index, 1);
		io.emit("update_requests", requests);
	});
});

// Server listen
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "145.223.98.156";

server.listen(PORT, HOST, () => {
	console.log(`🚀 Server running at http://${HOST}:${PORT}`);
});
