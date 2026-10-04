FROM node:20-bookworm-slim

# Python + LibreOffice
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv libreoffice-writer fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps
COPY python/requirements.txt python/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install -r python/requirements.txt
ENV PATH="/opt/venv/bin:$PATH"

# Node deps + build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && npm run start -- -p ${PORT:-3000}"]
