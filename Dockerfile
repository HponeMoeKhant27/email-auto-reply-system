FROM node:22-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm install --only=production || npm install --only=production

COPY src ./src

CMD ["npm", "start"]

