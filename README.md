# Koala UI

Koala UI is a React + Flask workspace to manage datasets, inspect tables, run reconciliation jobs, and export enriched CSV files.

## Highlights

- Dataset and table management with PostgreSQL persistence
- Manual and automatic NE/LIT column classification
- Reconciliation with multiple providers:
  - Lion Linker
  - Crocodile
- Reconciliation scopes:
  - Single cell subset
  - Selected rows
  - Current page
  - Whole table
- Shared per-cell result view across reconcilers
- Candidate exploration dialog with type details and Wikidata links
- NE column type ranking (triggered job with sampling)
- Score-based sorting:
  - Selected NE column score
  - Row average score across NE cells
- Enriched CSV export with selectable attributes:
  - `id`, `name`, `description`, `types`, `score`, `match`

## Stack

- Frontend: React + Material UI
- Backend: Flask
- Database: PostgreSQL
- Containerized with Docker Compose

## Quick Start

1. Clone the repository

```bash
git clone https://github.com/enRichMyData/koala_ui
cd koala_ui
```

2. Create your local environment file

```bash
cp .env.template .env
```

3. Start the app

```bash
docker-compose up --build
```

4. Open:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5001`

## Profile Configuration (Important)

Use the **Profile** page to configure credentials and service URLs per user:

- Shared LLM provider/model/endpoint/API key (reused by Moose and Lion Linker)
- Lion Linker:
  - base URL
  - API key
  - Lamapi endpoint/token/KG/candidate count
- Crocodile:
  - base URL
  - API key
- Moose:
  - base URL
  - API key

Sensitive keys are stored server-side and only exposed as "has key" flags in the UI.

Admin users also get a dedicated **User Admin** tab in Profile to create users, update roles/passwords, and delete users.

## Reconciliation Flow

1. Open a table
2. Pick provider, scope, columns, and top-k
3. Run reconciliation
4. Koala polls job status and syncs paginated results from provider endpoints
5. Results are persisted and mapped back to original table coordinates
6. Click linked NE cells to inspect/select candidates

If results already exist, Koala shows a confirmation dialog before re-running.

## Sorting and Filtering

- Sort by score on a selected NE column
- Sort by row average score across NE cells
- NIL / missing score entries are treated as `0` for sorting
- Filter by linked NE semantic types
- Pagination stays enabled for large tables

## Export

`Export CSV` supports:

- Base table export
- Enriched export with selectable reconciliation attributes

Export enrichment uses the latest stored result per NE cell across available reconcilers.

## In-App Docs

Koala includes a `/docs` page in the frontend navigation with:

- profile setup checklist
- reconciliation workflow
- ranking/sorting notes
- export behavior summary

## License

MIT (see `LICENSE`).
