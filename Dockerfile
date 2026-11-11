FROM php:8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev libcurl4-openssl-dev \
    && docker-php-ext-install curl pdo_mysql pdo_pgsql \
    && rm -rf /var/lib/apt/lists/*

COPY docker-entrypoint.sh /usr/local/bin/techpass-entrypoint
RUN chmod +x /usr/local/bin/techpass-entrypoint

WORKDIR /var/www/html
COPY . .

EXPOSE 10000

ENTRYPOINT ["techpass-entrypoint"]
