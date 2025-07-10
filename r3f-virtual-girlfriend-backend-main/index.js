import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
import { createServer } from "http";
import { Server } from "socket.io";
import axios from "axios";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "-",
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "kgG7dCoKCfLehAPWkJOE";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.use(express.json());
app.use(cors());
const port = 3000;

app.get("/", (req, res) => {
  res.send("Adroitent Assistant Backend is running.");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  await execCommand(
    `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
  );
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);
  await execCommand(
    `./bin/rhubarb -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`
  );
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hello! I'm your Adroitent Assistant. How can I help you today?",
          audio: await audioFileToBase64("audios/intro_0.wav"),
          lipsync: await readJsonTranscript("audios/intro_0.json"),
          facialExpression: "smile",
          animation: "Talking_1",
        },
      ],
    });
    return;
  }
  if (!elevenLabsApiKey || openai.apiKey === "-") {
    res.send({
      messages: [
        {
          text: "Please set up your API keys to enable full assistant functionality.",
          audio: await audioFileToBase64("audios/api_0.wav"),
          lipsync: await readJsonTranscript("audios/api_0.json"),
          facialExpression: "default",
          animation: "Idle",
        },
      ],
    });
    return;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-1106",
    max_tokens: 1000,
    temperature: 0.6,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: `
        You are the Adroitent Assistant.
        You always respond as a knowledgeable, friendly, and professional AI.
        Your replies are structured as a JSON array of messages.
        Each message includes: text, facialExpression, and animation.
        Facial expressions: smile, neutral, excited, thoughtful, and default.
        Animations: Talking_0, Talking_1, Talking_2, Idle, Nodding.
        `,
      },
      {
        role: "user",
        content: userMessage || "Hello",
      },
    ],
  });
  let messages = JSON.parse(completion.choices[0].message.content);
  if (messages.messages) {
    messages = messages.messages;
  }
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const fileName = `audios/message_${i}.mp3`;
    const textInput = message.text;
    await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
    await lipSyncMessage(i);
    message.audio = await audioFileToBase64(fileName);
    message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
  }

  res.send({ messages });
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

// === SOCKET.IO EVENTS ===
io.on("connection", (socket) => {
  console.log("Socket connected");

  socket.on("start-face", async () => {
    console.log("[Socket] start-face received");
    try {
      await axios.post("http://127.0.0.1:8001/start");
    } catch (err) {
      console.error("Failed to trigger Python assistant:", err.message);
    }
  });
});

// === RECEIVE AI MESSAGE FROM FLASK ===
app.post("/receive", (req, res) => {
  const message = req.body.message;
  console.log("[Flask AI] Message received:", message);
  io.emit("speak", { message });
  res.sendStatus(200);
});

server.listen(port, () => {
  console.log(`Adroitent Assistant backend running on port ${port}`);
});
