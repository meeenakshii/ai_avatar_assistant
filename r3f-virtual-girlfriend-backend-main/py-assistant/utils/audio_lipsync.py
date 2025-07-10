import base64
import io
from gtts import gTTS
from pydub import AudioSegment

def generate_audio_and_lipsync(text):
    # Generate speech from text using gTTS
    tts = gTTS(text)
    buf = io.BytesIO()
    tts.write_to_fp(buf)
    buf.seek(0)
    audio = AudioSegment.from_file(buf, format="mp3")

    # Create dummy lipsync data (you can replace with real lipsync later)
    dummy_lipsync = {
        "mouthCues": [
            {"start": 0.1, "end": 0.4, "value": "A"},
            {"start": 0.5, "end": 0.8, "value": "B"},
            {"start": 0.9, "end": 1.3, "value": "C"},
        ]
    }

    # Convert audio to base64
    audio_buffer = io.BytesIO()
    audio.export(audio_buffer, format="mp3")
    audio_base64 = base64.b64encode(audio_buffer.getvalue()).decode("utf-8")

    return audio_base64, dummy_lipsync
