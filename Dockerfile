FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:4100/health || exit 1
CMD ["node", "dist/main/index.js"]
