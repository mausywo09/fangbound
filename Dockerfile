# Fangbound: one Node process serves the landing page, the game and its API. No npm
# packages are needed at runtime (three.js is vendored, media is pre-rendered).
# Mount persistent storage at /app/data (the SQLite database lives there).
FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4380 DATA_DIR=/app/data TRUST_PROXY=1
COPY package.json index.html play.html ./
COPY src ./src
COPY server ./server
COPY vendor ./vendor
COPY media ./media
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 4380
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:4380/api/health || exit 1
CMD ["node", "server/index.js"]
