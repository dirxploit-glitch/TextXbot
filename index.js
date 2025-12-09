import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import 'dotenv/config'; // ya import dotenv from 'dotenv'; dotenv.config();
import axios from "axios";
import qrcode from "qrcode-terminal";

const GEMINI_KEY = process.env.GEMINI_KEY;

const systemPrompt = `
Tumhara naam VedaBot hai.
Tum sirf India ke travel aur tourism ke prashno ka jawab doge.
Hamesha short aur friendly style me jawaab doge.
Hindi aur thoda English mix me bolenge.
Illegal ya harmful content ka reply nahi doge.
`;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./veda-session");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    version: [2, 3000, 1027934701],
    browser: ["Veda-Bot", "Chrome", "5.0"],
    syncFullHistory: false
  });

  sock.ev.on("connection.update", ({ qr, connection, lastDisconnect }) => {
    if (qr) {
      console.clear();
      console.log("📌 Scan QR (60 sec valid)");
      qrcode.generate(qr, { small: true });
      console.log(qr);
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log("❗ Session expire — QR dobara milega");
        startBot();
      } else {
        console.log("♻ Reconnecting...");
        startBot();
      }
    }

    if (connection === "open") console.log("✅ BOT CONNECTED SUCCESSFULLY");
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];
    if (!m.message) return;

    const msg = m.message.conversation || m.message?.extendedTextMessage?.text || "";

    if (msg.startsWith("@veda")) {
      const query = msg.replace("@veda", "").trim();

      try {
        const res = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
          {
            contents: [
              { parts: [{ text: systemPrompt }] }, // system prompt
              { parts: [{ text: query }] }         // user message
            ]
          }
        );

        const reply = res.data.candidates?.[0]?.content?.parts?.[0]?.text || "❗ No response";

        await sock.sendMessage(m.key.remoteJid, { text: reply });

      } catch (e) {
        await sock.sendMessage(m.key.remoteJid, {
          text: "⚠ Gemini Request Failed!\n" + e.message
        });
      }
    }
  });
}

startBot();
