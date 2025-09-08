FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN pkg add bash
RUN npm ci --only=production

COPY . .

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "start"]
