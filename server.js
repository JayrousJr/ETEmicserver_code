const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const cors = require("cors");
const mediasoup = require("mediasoup");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
});

const users = new Map(); // Store user states: { uid, socketId, status, senderName, role }
let worker, router;

async function setupMediasoup() {
	worker = await mediasoup.createWorker();
	router = await worker.createRouter({
		mediaCodecs: [
			{
				kind: "audio",
				mimeType: "audio/opus",
				clockRate: 48000,
				channels: 2,
			},
		],
	});
}

setupMediasoup();

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "admin.html"));
});

io.on("connection", (socket) => {
	console.log("Client connected:", socket.id);

	socket.on("join", ({ uid, senderName, role }) => {
		users.set(uid, { socketId: socket.id, status: "idle", senderName, role });
		socket.emit(
			"update_users",
			Array.from(users.entries()).map(([uid, data]) => ({ uid, ...data }))
		);
		io.emit(
			"update_users",
			Array.from(users.entries()).map(([uid, data]) => ({ uid, ...data }))
		);
		console.log(`${senderName} joined as ${role}`);
	});

	socket.on("talk_request", ({ uid, senderName }) => {
		users.set(uid, { ...users.get(uid), status: "pending" });
		io.emit(
			"update_users",
			Array.from(users.entries()).map(([uid, data]) => ({ uid, ...data }))
		);
		console.log(`Talk request from ${senderName}`);
	});

	socket.on("admin_action", async ({ uid, action }) => {
		if (users.get(users.get(uid)?.socketId)?.role !== "admin") return;
		users.set(uid, { ...users.get(uid), status: action });
		io.to(users.get(uid).socketId).emit("status_update", { status: action });
		io.emit(
			"update_users",
			Array.from(users.entries()).map(([uid, data]) => ({ uid, ...data }))
		);

		if (action === "allowed") {
			const transport = await router.createWebRtcTransport({
				listenIps: [{ ip: "0.0.0.0", announcedIp: "145.223.98.156" }],
			});
			socket.emit("transport", {
				id: transport.id,
				iceParameters: transport.iceParameters,
				iceCandidates: transport.iceCandidates,
				dtlsParameters: transport.dtlsParameters,
			});
			io.to(users.get(uid).socketId).emit("start_stream", {
				transportId: transport.id,
			});
		}
		console.log(`Admin action: ${action} for ${uid}`);
	});

	socket.on("offer", ({ offer, from }) => {
		io.to(users.get(from)?.socketId || "admin").emit("offer", { offer, from });
	});

	socket.on("answer", ({ answer, to }) => {
		io.to(users.get(to)?.socketId || to).emit("answer", {
			answer,
			from: socket.id,
		});
	});

	socket.on("ice_candidate", ({ candidate, to }) => {
		io.to(users.get(to)?.socketId || to).emit("ice_candidate", { candidate });
	});

	socket.on("disconnect", () => {
		console.log("Disconnected:", socket.id);
		for (const [uid, data] of users) {
			if (data.socketId === socket.id) {
				users.delete(uid);
				io.emit(
					"update_users",
					Array.from(users.entries()).map(([uid, data]) => ({ uid, ...data }))
				);
				break;
			}
		}
	});
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "145.223.98.156";

server.listen(PORT, HOST, () => {
	console.log(`🚀 Server running at http://${HOST}:${PORT}`);
});

// play
