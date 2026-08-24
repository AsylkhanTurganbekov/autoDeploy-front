# Node 22 Alpine/npm has shown intermittent extraction failures during npm ci
# under BuildKit. Use the current LTS Debian image for reproducible server builds.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
# Audit/fund requests add no value to a reproducible image build and can make
# npm fail transiently on restricted server networks.
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["npm", "start"]
