FROM node:22.23.4-alpine3.24 AS builder
RUN npm install -g npm@latest
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM openresty/openresty:1.31.8.1-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
