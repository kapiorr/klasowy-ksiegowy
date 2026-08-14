FROM node:22-alpine AS builder
RUN npm install -g npm@latest
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM openresty/openresty:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
