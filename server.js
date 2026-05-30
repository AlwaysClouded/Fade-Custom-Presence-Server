require("dotenv").config();
const WebSocket = require("ws");

const TOKEN = process.env.DISCORD_TOKEN;
const USER_ID = process.env.USER_ID;
const PORT = process.env.PORT || 3001;

if (!TOKEN || !USER_ID) {
  console.error("Missing DISCORD_TOKEN or USER_ID in .env");
  process.exit(1);
}

// WebSocket server for your website
const wss = new WebSocket.Server({ port: PORT });
console.log(`Presence relay running on ws://localhost:${PORT}`);

let discordWS;
let heartbeatInterval = null;

function connectDiscord() {
  discordWS = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");

  discordWS.on("open", () => {
    console.log("Connected to Discord Gateway");

    const identifyPayload = {
      op: 2,
      d: {
        token: TOKEN,
        intents: (1 << 0) | (1 << 1) | (1 << 8), // GUILDS + GUILD_PRESENCES
        properties: {
          os: "linux",
          browser: "custom-presence",
          device: "custom-presence"
        }
      }
    };

    discordWS.send(JSON.stringify(identifyPayload));
  });

  discordWS.on("message", (msg) => {
    const packet = JSON.parse(msg);

    // Hello → start heartbeat
    if (packet.op === 10) {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        discordWS.send(JSON.stringify({ op: 1, d: null }));
      }, packet.d.heartbeat_interval);
    }

    // Ready
    if (packet.t === "READY") {
      console.log("Discord READY as", packet.d.user.username);
    }

    // Presence update for target user
    if (packet.t === "PRESENCE_UPDATE" && packet.d.user.id === USER_ID) {
      console.log("Presence update for target user");

      const presence = packet.d;

      // Broadcast to all connected website clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(presence));
        }
      });
    }
  });

  discordWS.on("close", () => {
    console.log("Discord WS closed — reconnecting in 3s");
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    setTimeout(connectDiscord, 3000);
  });

  discordWS.on("error", (err) => {
    console.error("Discord WS error:", err.message);
  });
}

connectDiscord();

// Optional: log website connections
wss.on("connection", () => {
  console.log("Website client connected to presence relay");
});
