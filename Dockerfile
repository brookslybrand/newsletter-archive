FROM node:24-alpine AS dependencies-env
COPY ./package.json pnpm-lock.yaml /app/
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

FROM node:24-alpine
COPY ./package.json pnpm-lock.yaml /app/
WORKDIR /app

ENV PORT="8080"
ENV NODE_ENV="production"

# Copy dependencies from build stage
COPY --from=dependencies-env /app/node_modules /app/node_modules

# Copy application code
COPY ./app /app/app
COPY ./public /app/public
COPY ./server.ts /app/server.ts
COPY ./tsconfig.json /app/tsconfig.json

# Expose port
EXPOSE 8080

# Start the server
CMD ["node", "server.ts"]

