# Stage 1: Build the Expo web app
FROM node:20-alpine AS builder
WORKDIR /app
COPY react-native/package*.json ./
RUN npm install --legacy-peer-deps
COPY react-native/ .
# Export into web/ so server.js picks it up automatically (looks for ./web/index.html)
RUN npx expo export --platform web --output-dir web

# Stage 2: Run the Node.js game server (handles HTTP, REST API, and WebSocket at /)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# Overlay the compiled frontend so server.js serves it as the SPA
COPY --from=builder /app/web ./web
# Listen on port 80 so the container behaves the same as the previous nginx image
ENV PORT=80
EXPOSE 80
CMD ["node", "server.js"]