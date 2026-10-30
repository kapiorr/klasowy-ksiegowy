FROM node:22.23.4-alpine3.24
RUN apk add --no-cache python3 make g++ ttf-dejavu fontconfig
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3001
CMD ["node", "src/index.js"]
