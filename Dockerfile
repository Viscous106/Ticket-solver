# Node is pinned here so the instance never has to provide it - Amazon Linux
# 2023 ships Node 20 and this needs 22.14+.
#
# better-sqlite3 is a native module. The build stage carries python3/make/g++
# as a fallback for when no prebuilt binary matches; the runtime stage does
# not, so no compiler ships to the instance.

FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim
WORKDIR /app

ENV NODE_ENV=production \
    PORT=9123 \
    LEDGER_DB=/data/ledger.sqlite

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server

# The ledger lives on a bind mount from the host. uid 1000 is the `node` user;
# the host directory must be chowned to match (deploy/user-data.sh does this).
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 9123

# Node 22 has global fetch, so no curl needed in the runtime image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||9123)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/mcp-server.mjs"]
