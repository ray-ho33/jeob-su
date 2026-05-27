FROM node:22-alpine

WORKDIR /app

COPY . .

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "scripts/acr-mcp-http-server.mjs"]
