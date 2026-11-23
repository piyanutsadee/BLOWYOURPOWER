FROM python:3.12-slim

WORKDIR /app

# PortAudio is required by sounddevice when using a real microphone
RUN apt-get update && apt-get install -y --no-install-recommends \
    libportaudio2 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

EXPOSE 8080

ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["python3", "server.py"]
CMD ["--host", "0.0.0.0", "--port", "8080", "--demo"]
