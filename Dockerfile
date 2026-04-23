# Build Stage
FROM node:20 AS build-step
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Runtime Stage
FROM nginx:alpine
# Copy the build output from the build-step stage to the nginx html directory
# In Angular 17+ with 'application' builder, the output might be in dist/frontend/browser
COPY --from=build-step /app/dist/frontend/browser /usr/share/nginx/html

# Copy custom nginx configuration if needed (optional)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
