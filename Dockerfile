FROM node:20-alpine

WORKDIR /app

# Copy root and service configs
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies
RUN npm install
RUN npm --prefix client install
RUN npm --prefix server install

# Copy source code
COPY . .

# Build frontend production bundle
RUN npm --prefix client run build

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "server/server.js"]
