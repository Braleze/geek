FROM node:22-slim

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy project files and build the Vite frontend bundle
COPY . .
RUN npm run build && rm -rf dist/api dist/.htaccess

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.ts"]
