FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 4173
ENV DDL_LEADERBOARD_PATH=/data/leaderboard.json
VOLUME ["/data"]

CMD ["node", "dist-app/run.mjs", "--no-open", "--host", "0.0.0.0", "--port", "4173"]
