import { createContext, useContext, useEffect, useState } from "react";
import { socket } from "./useSocket";

const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [message, setMessage] = useState();
  const [loading, setLoading] = useState(false);
  const [cameraZoomed, setCameraZoomed] = useState(true);

  const chat = async (message) => {
    setLoading(true);
    const data = await fetch(`${backendUrl}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });
    const resp = (await data.json()).messages;
    setMessage(resp[0]); // Set directly if you still use it
    setLoading(false);
  };

  const onMessagePlayed = () => {
    setMessage(null);
  };

  return (
    <ChatContext.Provider
      value={{
        chat,
        message,
        onMessagePlayed,
        loading,
        cameraZoomed,
        setCameraZoomed,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};
