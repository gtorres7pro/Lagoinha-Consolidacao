FROM nginx:alpine

# Remove default nginx page
RUN rm -rf /usr/share/nginx/html/*

# Copy all frontend files
COPY . /usr/share/nginx/html/

# Use custom nginx config with CSP headers and slug routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
