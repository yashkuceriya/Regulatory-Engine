FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ARG VITE_MAPBOX_TOKEN
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN}

RUN npm run build

FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom config (uses envsubst for $PORT)
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy built app
COPY --from=build /app/dist /usr/share/nginx/html

# Railway injects PORT
ENV PORT=8080

EXPOSE ${PORT}

CMD ["nginx", "-g", "daemon off;"]
