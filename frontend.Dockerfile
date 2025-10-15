FROM nginx:1.27-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy static assets
COPY index.html /usr/share/nginx/html/index.html
COPY authorize-user.html /usr/share/nginx/html/authorize-user.html
COPY customer-service.html /usr/share/nginx/html/customer-service.html
COPY insert.html /usr/share/nginx/html/insert.html
COPY tokenized.html /usr/share/nginx/html/tokenized.html
COPY styles.css /usr/share/nginx/html/styles.css
COPY app.js /usr/share/nginx/html/app.js
COPY Assets /usr/share/nginx/html/Assets
COPY Kanit /usr/share/nginx/html/Kanit

EXPOSE 80
