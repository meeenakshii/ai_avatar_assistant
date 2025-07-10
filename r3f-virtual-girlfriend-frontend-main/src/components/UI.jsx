import { useEffect, useRef } from "react";
import { useChat } from "../hooks/useChat";
import { socket } from "../hooks/useSocket";

export const UI = ({ hidden, ...props }) => {
  const { cameraZoomed, setCameraZoomed } = useChat();
  const audioRef = useRef(null); // Store current audio instance

  useEffect(() => {
    console.log("[DEBUG] Setting up UI socket listeners");

    socket.on("connect", () => {
      console.log("[DEBUG] Socket connected");
    });

    const handleSpeak = ({ msg, audio }) => {
      console.log("[SPEAK EVENT RECEIVED]:", msg);

      // Stop any existing audio or TTS
      if (audioRef.current) {
        console.log("[DEBUG] Pausing existing audio");
        audioRef.current.pause();
        audioRef.current = null;
      }
      speechSynthesis.cancel(); // Cancel any ongoing TTS
      console.log("[DEBUG] Cleared previous audio and TTS");

      if (audio) {
        try {
          const audioUrl = "data:audio/mp3;base64," + audio;
          const audioObj = new Audio(audioUrl);
          audioRef.current = audioObj;

          audioObj.onplay = () => {
            console.log("[DEBUG] Audio started playing");
            socket.emit("avatar_message", {
              audio,
              lipsync: msg.lipsync,
              facialExpression: msg.facialExpression,
              animation: msg.animation || "Idle",
            });
          };

          audioObj.onended = () => {
            console.log("[DEBUG] Audio playback ended");
            audioRef.current = null;
          };

          audioObj.play().then(() => {
            console.log("[INFO] Base64 audio playing successfully");
          }).catch((err) => {
            console.error("[DEBUG] Audio play error, using TTS fallback:", err);
            fallbackTTS(msg);
          });
        } catch (err) {
          console.error("[DEBUG] Base64 audio playback error:", err);
          fallbackTTS(msg);
        }
      } else {
        fallbackTTS(msg);
      }
    };

    const fallbackTTS = (msg) => {
      console.log("[DEBUG] Starting TTS for:", msg);
      speechSynthesis.cancel(); // Ensure no other TTS is playing
      const voices = speechSynthesis.getVoices();
      console.log("[DEBUG] Available voices:", voices.map(v => v.name));
      const voice = voices.find((v) => v.name.includes("Female")) || voices[0];
      const utterance = new SpeechSynthesisUtterance(msg);
      utterance.voice = voice;
      utterance.lang = "en-US";
      utterance.pitch = 1;
      utterance.rate = 0.95;
      utterance.onstart = () => {
        console.log("[DEBUG] TTS started");
      };
      utterance.onend = () => {
        console.log("[DEBUG] TTS ended");
      };
      speechSynthesis.speak(utterance);
    };

    socket.off("speak").on("speak", handleSpeak);
    socket.off("status").on("status", ({ msg }) => {
      console.log("[STATUS]:", msg);
    });

    return () => {
      console.log("[DEBUG] Cleaning up UI socket listeners");
      socket.off("speak", handleSpeak);
      socket.off("status");
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      speechSynthesis.cancel();
    };
  }, []);

  if (hidden) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 z-10 flex justify-between p-4 flex-col pointer-events-none">
      <div className="self-start backdrop-blur-md bg-white bg-opacity-50 p-4 rounded-lg">
        <h1 className="font-black text-xl">Adroitent Assistant</h1>
        <p>Your smart digital transformation guide</p>
      </div>

      <div className="w-full flex flex-col items-end justify-center gap-4">
        <button
          onClick={() => setCameraZoomed(!cameraZoomed)}
          className="pointer-events-auto bg-pink-500 hover:bg-pink-600 text-white p-4 rounded-md"
        >
          {cameraZoomed ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197M13.5 10.5h-6M16.803 16.803A7.5 7.5 0 105.197 5.197a7.5 7.5 0 0011.606 11.606z"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197M10.5 7.5v6m3-3h-6M16.803 16.803A7.5 7.5 0 105.197 5.197a7.5 7.5 0 0011.606 11.606z"
              />
            </svg>
          )}
        </button>

        <button
          onClick={() => {
            document.querySelector("body").classList.toggle("greenScreen");
          }}
          className="pointer-events-auto bg-pink-500 hover:bg-pink-600 text-white p-4 rounded-md"
        >
          🎨
        </button>

        <button
          onClick={() => {
            console.log("[DEBUG] Emitting start-face");
            socket.emit("start-face");
          }}
          className="pointer-events-auto bg-pink-500 hover:bg-pink-600 text-white p-4 rounded-md"
        >
          🎙️ Start Talking
        </button>

        <button
          onClick={() => {
            console.log("[DEBUG] Emitting stop_face");
            socket.emit("stop_face");
          }}
          className="pointer-events-auto bg-gray-600 hover:bg-gray-700 text-white p-4 rounded-md"
        >
          🛑 Stop Talking
        </button>
      </div>
    </div>
  );
};