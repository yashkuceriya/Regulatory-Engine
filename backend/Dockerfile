FROM python:3.12-slim

WORKDIR /app

# Install system deps for pyproj/shapely
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgeos-dev libproj-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source into backend/ to preserve "from backend.x" import structure
COPY . backend/

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

ENV PYTHONPATH=/app
ENV PORT=8000

CMD ["/app/start.sh"]
