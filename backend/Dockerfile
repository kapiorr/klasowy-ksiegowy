FROM node:22-alpine
RUN apk add --no-cache python3 make g++
RUN npm install -g npm@latest
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3001
CMD ["node", "src/index.js"]
