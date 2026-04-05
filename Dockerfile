FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN mkdir -p /app/data

ENV NODE_ENV=production
CMD ["node", "dist/index.cjs"]
