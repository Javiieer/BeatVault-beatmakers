FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/src/domains ./src/domains
RUN apk add --no-cache ffmpeg && mkdir -p /app/data/server-local /app/data/uploads && chown -R node:node /app/data
USER node
EXPOSE 4174
CMD ["node", "--import", "tsx", "server/index.ts"]

FROM caddy:2-alpine AS web
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
