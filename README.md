# Goodfood — Food Donation & Redistribution System

A working full-stack DBMS lab project built with **MySQL 8 + Node.js/Express + HTML/CSS/JavaScript**. The frontend uses a restrained forest-green/teal palette, orange action accents, neutral backgrounds and glassmorphism panels. It is responsive and uses lightweight scroll-triggered reveals; reduced-motion preferences are respected.

## Project scope and syllabus alignment

The database preserves the eight core entities in the supplied synopsis/report:

1. `Donor`
2. `Food_Category`
3. `Food_Donation`
4. `NGO`
5. `Volunteer`
6. `Recipient`
7. `Pickup_Delivery`
8. `Distribution`

The schema implements PKs, FKs, unique constraints, ENUM domains, CHECK constraints, indexes and InnoDB tables. It includes the four report-aligned triggers (`trg_pickup_before`, `trg_pickup_after`, `trg_dist_before`, `trg_dist_after`) and the `sp_mark_expired()` stored procedure. Two SQL views (`vw_available_donations`, `vw_donation_trace`) support browse/trace reporting. `App_User` is an additional application access table; it does not replace or merge any of the eight academic entities.

### Working features

- Public landing page, live available-food listings, search and status filtering.
- Donor, NGO and volunteer account registration; sign-in with bcrypt-hashed passwords and JWT sessions.
- Donor can create food donation records.
- Donation trace view from donor → pickup → volunteer → recipient/distribution.
- NGO/Admin can add recipients and verify them.
- Volunteer/NGO/Admin can record pickups and delivery times.
- Volunteer/NGO/Admin can record distributions to verified recipients.
- MySQL triggers reject unavailable/expired pickups, unverified recipients, expired distributions and over-distribution; donation status changes automatically.
- Admin can run the expiry housekeeping stored procedure.
- Live dashboard counts and a category aggregate report.

## Local setup

Requirements: Node.js 20+, MySQL 8.0.16+ (CHECK constraints must be enforced), npm.

1. Create a MySQL database/schema by running `database/schema.sql` in MySQL Workbench or:

   ```bash
   mysql -u root -p < database/schema.sql
   ```

   The script creates `food_donation`, the eight project tables, the separate `App_User` table, triggers, procedure, views and the five category reference rows. It does **not** preload fictional donors, NGOs, donations or impact statistics, and it does **not** drop an existing database. For optional classroom test records, run `database/demo-seed.sql` separately on a fresh schema; those records are explicitly labelled Demo.

2. Copy `.env.example` to `.env` and set your MySQL connection values:

   ```bash
   cp .env.example .env
   ```

3. Install and start:

   ```bash
   npm install
   npm start
   ```

4. Open `http://localhost:3000`.

5. Create the first administrator account (use a strong password):

   ```bash
   npm run create-admin -- admin@example.com "Project Admin" "Use-A-Strong-Password"
   ```

   The command writes a bcrypt hash to `App_User`; no plaintext password is stored.

## Deployment on Vercel + GitHub

### MySQL hosting

Vercel does not host a persistent MySQL server. First provision a managed MySQL 8 database with a provider that supports **InnoDB, triggers, stored procedures, CHECK constraints and views** (for example, a managed Aiven MySQL or Railway MySQL instance). Do not use a MySQL-compatible service that omits triggers or stored procedures for this project. Apply `database/schema.sql` to that remote database before deploying.

### Vercel

1. Push this folder to a GitHub repository.
2. Import that repository into Vercel.
3. Add these Environment Variables in Vercel Project Settings → Environment Variables:
   - `DB_HOST`
   - `DB_PORT` (usually `3306`)
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_NAME` (`food_donation`)
   - `DB_SSL` (`true` when required by your provider)
   - `JWT_SECRET` (a long, random secret; never commit it)
   - `NODE_ENV` (`production`)
4. Deploy. `vercel.json` routes `/api/*` to the Node serverless function and serves the static frontend from `public/`.
5. Create the Admin user by running `scripts/create-admin.js` against the same remote database with the production DB environment variables. Do not put the admin password in source control.

### Git commands

```bash
git init
git add .
git commit -m "Build food donation redistribution system"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/food-donation-redistribution-system.git
git push -u origin main
```

## API overview

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Database health check |
| GET | `/api/meta` | Public | Categories/status metadata |
| POST | `/api/auth/register` | Public | Register donor, NGO or volunteer |
| POST | `/api/auth/login` | Public | Login |
| GET | `/api/dashboard` | Public | Live aggregate dashboard |
| GET | `/api/donations` | Public | Browse/filter donations |
| POST | `/api/donations` | Donor/Admin | Create donation |
| GET | `/api/trace/:id` | Public | Trace donation lifecycle |
| GET | `/api/ngos` | Public | NGO selector data |
| GET | `/api/recipients` | Authenticated | Recipient list |
| POST | `/api/recipients` | NGO/Admin | Add unverified recipient |
| PATCH | `/api/recipients/:id/verify` | NGO/Admin | Verify recipient |
| GET | `/api/volunteers` | Authenticated | Volunteer selector data |
| POST | `/api/pickups` | Volunteer/NGO/Admin | Record pickup |
| PATCH | `/api/pickups/:id/delivered` | Volunteer/NGO/Admin | Record delivery time |
| POST | `/api/distributions` | Volunteer/NGO/Admin | Record recipient handover |
| GET | `/api/reports/category` | NGO/Admin | Aggregate report by category |
| POST | `/api/housekeeping/expire` | Admin | Run `sp_mark_expired()` |

## Important project notes

- The report explicitly notes that recorded quantities may use different units (plates, kg, packets, litres). The dashboard therefore displays the stored count/quantity as recorded and does not pretend unlike units are physically additive.
- The report notes that the current academic schema does not enforce that a volunteer, donation pickup and recipient all belong to the same NGO. This implementation retains that limitation rather than silently changing the stated relational model.
- The `sp_mark_expired()` procedure is run by an Admin action. It is not scheduled automatically; scheduling via a MySQL EVENT was listed as future scope in the report.
- Only the current donation status is stored, consistent with the report; there is no separate status-history/audit table.
- This is a DBMS lab deployment starter, not a production food-safety certification or payment system. Validate food safety operationally and protect the database credentials.

## Visual direction

The provided Goodfood Dribbble screenshot is treated as visual inspiration: dark green framing, a strong editorial headline, a clear donation action, real food/volunteer photography, and a prominent live-data panel. The implementation avoids purple gradients, pill-shaped UI, glowing backdrops, fake reviews, fake impact totals and three-column card grids. Photos are loaded from Unsplash; replace them with locally licensed project photos before a public production launch if desired.
