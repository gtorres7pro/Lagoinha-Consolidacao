FROM nginx:alpine

# Remove default nginx page
RUN rm -rf /usr/share/nginx/html/*

# Force cache-bust on every deploy
ARG CACHEBUST=20260428v1
RUN echo "Cache bust: $CACHEBUST"

# Copy all frontend files
COPY . /usr/share/nginx/html/

# Use custom nginx config with CSP headers and slug routing
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-rate-limit.conf /etc/nginx/conf.d/00-rate_limit.conf

EXPOSE 80
