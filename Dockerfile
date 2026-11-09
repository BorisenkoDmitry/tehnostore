FROM node:24-alpine

RUN apk add --no-cache python3 make g++ git libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@10.11.1 --activate

WORKDIR /server
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/backend/package.json apps/backend/package.json
COPY apps/storefront/package.json apps/storefront/package.json
RUN --mount=type=cache,id=texno-pnpm,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile

COPY . .
ENV MEDUSA_DISABLE_TELEMETRY=true
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 9000 5173 8000
CMD ["pnpm", "--filter", "@dtc/backend", "dev"]
