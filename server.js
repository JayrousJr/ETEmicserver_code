const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mediasoup = require("mediasoup");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let worker, router, transport, producer, consumer;

async function setupMediasoup() {
	worker = await mediasoup.createWorker();
	router = await worker.createRouter({
		mediaCodecs: [
			{
				kind: "audio",
				mimeType: "audio/opus",
				clockRate: 48000,
				channels: 1,
			},
		],
	});
}

setupMediasoup();

const clients = new Map();
let adminSocketId = null;

io.on("connection", (socket) => {
	console.log("Client connected:", socket.id);

	socket.on("talk_request", async ({ senderName }) => {
		clients.set(socket.id, { senderName, isTalking: false, isPaused: false });
		console.log(`Talk request from ${senderName}`);
		if (adminSocketId) {
			io.to(adminSocketId).emit(
				"update_requests",
				Array.from(clients.values())
			);
		}
	});

	socket.on("register_admin", () => {
		adminSocketId = socket.id;
		console.log("Admin registered:", adminSocketId);
		socket.emit("update_requests", Array.from(clients.values()));
	});

	socket.on("accept_request", async ({ socketId }) => {
		if (clients.has(socketId)) {
			clients.get(socketId).isTalking = true;
			io.to(socketId).emit("request_accepted");
			console.log(`Request accepted for ${clients.get(socketId).senderName}`);

			transport = await router.createWebRtcTransport({
				listenIps: [{ ip: "145.223.98.156", announcedIp: receiverIP }],
				enableUdp: true,
				enableTcp: true,
				preferUdp: true,
			});
			socket.emit("transport_connect", {
				id: transport.id,
				iceParameters: transport.iceParameters,
				iceCandidates: transport.iceCandidates,
				dtlsParameters: transport.dtlsParameters,
			});
		}
	});

	socket.on("offer", async ({ sdp }, callback) => {
		producer = await transport.produce({
			kind: "audio",
			rtpParameters: sdp.rtpParameters,
		});
		console.log("Producer created:", producer.id);
		callback({ id: producer.id });

		// Forward stream to admin
		if (adminSocketId) {
			const adminTransport = await router.createWebRtcTransport({
				listenIps: [{ ip: "145.223.98.156", announcedIp: receiverIP }],
				enableUdp: true,
				enableTcp: true,
				preferUdp: true,
			});
			io.to(adminSocketId).emit("transport_connect", {
				id: adminTransport.id,
				iceParameters: adminTransport.iceParameters,
				iceCandidates: adminTransport.iceCandidates,
				dtlsParameters: adminTransport.dtlsParameters,
			});

			consumer = await adminTransport.consume({
				producerId: producer.id,
				rtpCapabilities: router.rtpCapabilities,
			});
			io.to(adminSocketId).emit("consume", {
				id: consumer.id,
				producerId: producer.id,
				kind: consumer.kind,
				rtpParameters: consumer.rtpParameters,
			});
		}
	});

	socket.on("answer", async ({ sdp }) => {
		await transport.setRemoteDescription(sdp);
		console.log("Server set remote description");
	});

	socket.on("ice_candidate", async ({ candidate }) => {
		await transport.addIceCandidate(candidate);
		console.log("Server added ICE candidate");
	});

	socket.on("stop_request", ({ socketId }) => {
		if (clients.has(socketId)) {
			clients.get(socketId).isTalking = false;
			io.to(socketId).emit("stop_talking");
			console.log(`Stop request for ${clients.get(socketId).senderName}`);
			if (adminSocketId) {
				io.to(adminSocketId).emit(
					"update_requests",
					Array.from(clients.values())
				);
			}
		}
	});

	socket.on("pause_request", ({ socketId, isPaused }) => {
		if (clients.has(socketId)) {
			clients.get(socketId).isPaused = isPaused;
			io.to(socketId).emit("pause_talking", { isPaused });
			console.log(
				`Pause request for ${clients.get(socketId).senderName}: ${isPaused}`
			);
			if (adminSocketId) {
				io.to(adminSocketId).emit(
					"update_requests",
					Array.from(clients.values())
				);
			}
		}
	});

	socket.on("disconnect", () => {
		if (socket.id === adminSocketId) {
			adminSocketId = null;
			console.log("Admin disconnected");
		} else if (clients.has(socket.id)) {
			console.log(`Client disconnected: ${clients.get(socket.id).senderName}`);
			clients.delete(socket.id);
			if (adminSocketId) {
				io.to(adminSocketId).emit(
					"update_requests",
					Array.from(clients.values())
				);
			}
		}
	});

	app.get("/", (req, res) => {
		res.sendFile(__dirname + "/admin.html");
	});
});
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "145.223.98.156";
server.listen(PORT, HOST, () => {
	console.log(`🚀 Server running at http://${HOST}:${PORT}`);
});
