# Relay de e-mail do CRM. Build a partir da RAIZ do repositório:
#   docker build -f relay-email/Dockerfile -t crmbyte-relay-email .
FROM node:22-alpine AS build
WORKDIR /app/relay-email
COPY relay-email/package.json relay-email/package-lock.json ./
RUN npm ci
WORKDIR /app
COPY tsconfig.json ./
COPY src/lib/email src/lib/email
COPY relay-email/servidor.ts relay-email/
RUN cd relay-email && npm run build

FROM node:22-alpine
WORKDIR /app
COPY relay-email/package.json relay-email/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/relay-email/dist dist
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "dist/servidor.cjs"]
