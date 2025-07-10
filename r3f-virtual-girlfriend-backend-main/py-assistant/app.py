import os
import pickle
import time
import base64
import numpy as np
import face_recognition
import cv2
import requests
import speech_recognition as sr
from gtts import gTTS
from flask import Flask
from flask_socketio import SocketIO
from pydub import AudioSegment
from threading import Event

# === Flask-SocketIO Setup ===
app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# === Groq API Config ===
from dotenv import load_dotenv
import os

load_dotenv()
api_key = os.getenv("GROQ_API_KEY")

GROQ_MODEL = "llama3-70b-8192"
system_prompt = (
    "As an Adroitent assistant, provide concise, accurate, one-line responses about Adroitent, Inc., "
    "a trusted digital transformation partner with 19 years of expertise and over 500 skilled associates worldwide, "
    "offering Software Engineering, AI, SaaS, ERP, Cloud, and Business Intelligence Solutions. "
    "Emphasize our SEI CMMI Level 3 accreditation, ISO 9001 and 27001 certifications, and leadership: "
    "Partha Bommireddy, co-founder and President, drives growth with strategic AI expertise; "
    "Srinath, co-founder and IT advisor to Andhra Pradesh, leverages global experience; "
    "and Sriram, VP of Delivery, leads enterprise-scale programs. "
    "Answer questions solely based on this information, reflecting our commitment to agility, innovation, and quality."
)

# === Face Encodings ===
ENCODINGS_FILE = os.path.join(os.path.dirname(__file__), "encodings.pkl")
if os.path.exists(ENCODINGS_FILE):
    with open(ENCODINGS_FILE, "rb") as f:
        known_face_encodings, known_face_names = pickle.load(f)
else:
    known_face_encodings, known_face_names = [], []

# === Global Flag ===
listening = False
speak_done_event = Event()

# === Speech Recognizer ===
recognizer = sr.Recognizer()
recognizer.energy_threshold = 150
recognizer.dynamic_energy_threshold = True
TOLERANCE = 0.4

@socketio.on("connect")
def handle_connect():
    print("[DEBUG] Client connected to SocketIO")

@socketio.on("speak_done")
def handle_speak_done():
    print("[DEBUG] Received speak_done from client")
    speak_done_event.set()

def recognize_face():
    video_capture = cv2.VideoCapture(0)
    user_name = None
    start_time = time.time()
    while time.time() - start_time < 10:
        ret, frame = video_capture.read()
        if not ret:
            print("[DEBUG] Failed to capture frame from webcam")
            continue
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        face_locations = face_recognition.face_locations(rgb)
        encodings = face_recognition.face_encodings(rgb, face_locations)
        print("[DEBUG] Looking for face... Found", len(face_locations), "faces")
        for encoding in encodings:
            matches = face_recognition.compare_faces(known_face_encodings, encoding, tolerance=TOLERANCE)
            distances = face_recognition.face_distance(known_face_encodings, encoding)
            if True in matches:
                best = np.argmin(distances)
                user_name = known_face_names[best]
                print(f"[INFO] Recognized: {user_name}")
                break
        if user_name:
            break
    video_capture.release()
    return user_name

def listen_to_user(retries=1):
    with sr.Microphone() as source:
        recognizer.adjust_for_ambient_noise(source, duration=1)
        socketio.emit("status", {"msg": "Listening..."})
        print("[DEBUG] Listening for user input...")
        for attempt in range(retries + 1):
            try:
                audio = recognizer.listen(source, timeout=10, phrase_time_limit=15)
                text = recognizer.recognize_google(audio)
                print(f"[DEBUG] Recognized speech: {text}")
                return text
            except sr.UnknownValueError:
                print("[DEBUG] Speech not recognized, attempt", attempt + 1)
                if attempt < retries:
                    emit_speak("I didn't catch that. Please try again.")
                else:
                    return None
            except sr.WaitTimeoutError:
                print("[DEBUG] No speech detected within timeout")
                return None

def ask_groq(user_input):
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input}
        ]
    }
    try:
        res = requests.post(url, headers=headers, json=data)
        res.raise_for_status()
        reply = res.json()["choices"][0]["message"]["content"].strip()
        print(f"[INFO] AI Response: {reply}")
        return reply
    except Exception as e:
        print("[ERROR] Groq API failure:", e)
        return "Sorry, I couldn't get a response from the AI."

def emit_speak(msg):
    speak_done_event.clear()
    print("[DEBUG] Generating TTS for:", msg)

    tts = gTTS(msg)
    tts.save("temp.mp3")

    sound = AudioSegment.from_file("temp.mp3")
    faster_sound = sound.speedup(playback_speed=1.2)
    faster_sound.export("temp.mp3", format="mp3")

    with open("temp.mp3", "rb") as audio_file:
        audio_base64 = base64.b64encode(audio_file.read()).decode("utf-8")

    print("[DEBUG] Emitting mouth_move_start")
    socketio.emit("mouth_move_start")

    print("[DEBUG] Emitting speak with audio length:", len(audio_base64))
    socketio.emit("speak", {
        "msg": msg,
        "audio": audio_base64,
        "animation": "Idle",
        "facialExpression": "smile",
        "lipsync": {
            "mouthCues": [
                {"start": 0.0, "end": 0.2, "value": "A"},
                {"start": 0.2, "end": 0.4, "value": "E"},
                {"start": 0.4, "end": 0.6, "value": "O"}
            ]
        }
    })

    # Estimate audio duration (in seconds) based on file length
    audio_duration = len(sound) / 1000  # pydub duration is in milliseconds
    print(f"[DEBUG] Estimated audio duration: {audio_duration} seconds")
    time.sleep(audio_duration + 0.5)  # Wait for audio to finish plus buffer

    print("[DEBUG] Emitting mouth_move_stop")
    socketio.emit("mouth_move_stop")

    speak_done_event.wait(timeout=10)

@socketio.on("start-face")
def handle_start():
    global listening
    print("[DEBUG] start-face event triggered")
    socketio.emit("status", {"msg": "Recognizing face..."})
    name = recognize_face()

    if not name:
        print("[DEBUG] No face recognized")
        emit_speak("Sorry, I could not recognize your face.")
        return

    greeting = f"Hi {name}! I’m your Adroitent assistant. Would you like to know anything about Adroitent?"
    print(f"[INFO] Greeting emitted: {greeting}")
    emit_speak(greeting)

    listening = True
    while listening:
        user_input = listen_to_user()
        if not user_input:
            print("[DEBUG] No valid user input received")
            emit_speak("Sorry, I couldn't understand that.")
            continue

        print(f"[INFO] You said: {user_input}")
        socketio.emit("status", {"msg": f"You said: {user_input}"})
        reply = ask_groq(user_input)
        emit_speak(reply)

@socketio.on("stop_face")
def handle_stop():
    global listening
    print("[DEBUG] stop_face event triggered")
    listening = False
    emit_speak("Stopped recording. Goodbye!")
    socketio.emit("status", {"msg": "Stopped."})

if __name__ == "__main__":
    print("⚡ Starting Adroitent Assistant backend on http://localhost:8001")
    socketio.run(app, host="0.0.0.0", port=8001)