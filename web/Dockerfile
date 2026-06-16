FROM node:22-slim

WORKDIR /app

# Cài deps (gồm devDeps cho drizzle-kit/tsx khi migrate + seed lúc khởi động).
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

RUN chmod +x entrypoint.sh
EXPOSE 3000
CMD ["./entrypoint.sh"]
