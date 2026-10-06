# OneMarketplace.io

A marketplace project with a landing page, freelancer, client, agency, and admin dashboards, plus an API backend.

## Helpful links

- [Local setup video](https://youtu.be/2_f-EjCIZ98) — watch this walkthrough to learn how to run the project locally.
- [External platforms and providers](https://www.becodemy.com/marketplace) — find the external services used in this project.

## Requirements

- Node.js and npm
- Docker with Docker Compose for Redis and NATS
- Provider accounts and API keys for the services listed in the environment templates

## Run locally

### 1. Set up the backend

From the repository root:

```bash
cd OneMarketplace.io/services
npm install
cp .env.example .env
```

Fill in `.env` with your database URL and provider credentials. If `.env` already exists, update it instead of overwriting it.

Start the supporting services, initialize your development database, and run the API:

```bash
docker compose up -d
npm run db:push
npm run dev
```

The API runs at `http://localhost:4000` by default. Use a development database for `db:push`, which updates its schema.

### 2. Set up the frontend apps

In each app folder under `OneMarketplace.io/apps`, install dependencies and create a local environment file:

```bash
npm install
cp .env.example .env.local
```

Fill in the required credentials and check that dashboard URLs match the ports below. In the client dashboard environment file, set `NEXT_PUBLIC_CLIENT_DASHBOARD` to `http://localhost:3002` and `NEXT_PUBLIC_FREELANCER_DASHBOARD` to `http://localhost:3001`.

Run each app in a separate terminal from its own folder:

| App folder | Command | Local URL |
| --- | --- | --- |
| `landing-page` | `npm run dev -- --port 3000` | http://localhost:3000 |
| `freelancer-dashboard` | `npm run dev -- --port 3001` | http://localhost:3001 |
| `client-dashboard` | `npm run dev -- --port 3002` | http://localhost:3002 |
| `agency-dashboard` | `npm run dev -- --port 3003` | http://localhost:3003 |
| `admin-dashboard` | `npm run dev -- --port 3004` | http://localhost:3004 |

Refer to the setup video for the complete walkthrough and provider configuration.
