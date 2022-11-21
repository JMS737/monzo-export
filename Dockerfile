FROM node:16-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 8080
CMD ["node", "src/app.js"]
