# Adrenalin Deal Desk Calculator

The app runs the pricing workflow end to end: catalogue, packs, rate cards, the proposal configurator, pricing and discounts, and the proposal summary with DOCX/PDF export.

- **Backend:** FastAPI, SQLAlchemy and Alembic on PostgreSQL.
- **Frontend:** React and Vite.

## What you need

| Tool | Version |
|---|---|
| Python | 3.11 or newer |
| Node.js | 20 or newer (tested on 24) |
| PostgreSQL | 15 or newer, local or a cloud database such as Neon |
| Git | any recent version |

The Python packages are listed in [`backend/requirements.txt`](backend/requirements.txt). The JavaScript packages are in [`frontend/package.json`](frontend/package.json).

## 1. Fork and clone

1. On GitHub, open this repository and click **Fork** (top right), then **Create fork**.
2. Clone your fork. Replace `<your-username>` with your GitHub username:

```bash
git clone https://github.com/<your-username>/Dealdeskcalculatorproject.git
cd Dealdeskcalculatorproject
```

## 2. Create a database

Create an empty PostgreSQL database, for example `dealdesk`:

```bash
createdb -U postgres dealdesk
```

## 3. Backend

```bash
cd backend
python -m venv env
# Windows:      env\Scripts\activate
# macOS/Linux:  source env/bin/activate
pip install -r requirements.txt
```

1. Copy `backend/.env.example` to `backend/.env`.
2. In `backend/.env`, set your connection string:

```
DATABASE_URL=postgresql+psycopg://postgres:<password>@localhost:5432/dealdesk
```

3. Create the tables and load the demo data (customer tiers, a pack, rates, countries and FX):

```bash
alembic upgrade head
python -m scripts.seed_dev_data
```

4. Start the API:

```bash
uvicorn app.main:app --reload --port 8000
```

The API documentation is at http://localhost:8000/docs.

## 4. Frontend

Open a second terminal:

```bash
cd frontend
npm install
```

Copy `frontend/.env.example` to `frontend/.env.local`. The default `VITE_DEALDESK_USER_ID=1` matches the seeded user. Then start the frontend:

```bash
npm run dev
```

Open http://localhost:5173. The frontend sends `/api` calls to the backend on port 8000.

## 5. Try the workflow

1. Open **Proposal Configurator** (Page 4). Pick a customer, a country, a pack and a contract duration in **years**, then click **Calculate Pricing**. This shows base pricing with no discounts.
2. Open **Pricing & Discounts** (Page 5). Set line discounts and the per-country subscription and services discounts, then click **Save Discounts & Recalculate**.
3. Open **Proposal Summary** (Page 6). Check the net totals, then export to DOCX or PDF.

## Tests (optional)

```bash
# backend unit tests
cd backend && pytest
# frontend unit tests, lint and build
cd frontend && npm test && npm run lint && npm run build
# browser tests (backend and frontend must be running)
cd frontend && npx playwright install chrome && npm run test:e2e
```

The PostgreSQL integration tests run only when `TEST_DATABASE_URL` points to a **local** database whose name contains `test`. See `backend/.env.example`.

## Documentation

The audit and test reports are in [`docs/`](docs/). Start with [`docs/FINAL_E2E_TEST_REPORT.md`](docs/FINAL_E2E_TEST_REPORT.md).

## Notes

- Never commit `backend/.env` or `frontend/.env.local`. Both are ignored by Git.
- There is no login yet. `VITE_DEALDESK_USER_ID` records who created a proposal.
