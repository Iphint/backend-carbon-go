FROM node:20-bookworm-slim

WORKDIR /app/backend

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
