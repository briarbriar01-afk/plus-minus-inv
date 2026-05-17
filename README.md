# Plus-Minus Inventory Form

## Setup Steps

1. Install dependencies:
   ```bash
   npm install
   ```

2. Verify your Supabase environment values in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL=https://nayussuahaelavtnsayf.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-valid-anon-key>`
   - `NEXT_PUBLIC_SUPABASE_SUPERADMIN_EMAIL=superadmin@example.com`

3. Make sure the anon key matches the project URL.
   - If the key is invalid, Supabase returns `signature verification failed`.
   - Use the key from Supabase project Settings > API > `anon` key.

4. Create the required tables using the SQL editor in Supabase:
   - Open your Supabase project dashboard.
   - Go to `SQL` > `New query`.
   - Paste the contents of `supabase-schema.sql` and run it.

5. Create the storage bucket:
   - Go to `Storage` > `Buckets`.
   - Create a new bucket named `inventory_images`.
   - Set privacy as desired (private is recommended).

6. Run the app locally:
   ```bash
   npm run dev
   ```

## Supabase Resources Needed

- `inventory_forms` table
- `plus_items` table
- `minus_items` table
- `inventory_images` storage bucket

## What I Already Added

- A full multi-row inventory form UI with plus/minus item tables
- Login/signup flow for staff users
- Supervisor Kanban view for all forms
- Print-ready A4 styling
- `supabase-schema.sql` with the required table definitions

## Admin Account

For the supervisor / super-admin view, use this example account in Supabase Auth:

- Email: `superadmin@example.com`
- Password: `Admin@123456`

Then set the following in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_SUPERADMIN_EMAIL=superadmin@example.com
```

> Note: create this account manually in the Supabase Auth dashboard if it does not exist yet.

Also create a Supabase Storage bucket named `inventory_images` so image uploads for plus-item previews can be saved.

## Verify Supabase Setup

1. Open `supabase-schema.sql` and run the SQL in your Supabase SQL editor.
2. Create a storage bucket called `inventory_images` in Supabase Storage.
3. Create the super-admin account manually in Supabase Auth:
   - Email: `superadmin@example.com`
   - Password: `Admin@123456`
4. Fill `.env.local` with the correct Supabase project values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_SUPABASE_SUPERADMIN_EMAIL=superadmin@example.com
```

5. Run the verification script:

```bash
node check-supabase.js
```

6. Confirm the output shows:
   - `inventory_forms: exists`
   - `plus_items: exists`
   - `minus_items: exists`
   - `inventory_images bucket: exists`

If the script reports `Invalid API key` or `signature verification failed`, the URL/key pair is still incorrect.
