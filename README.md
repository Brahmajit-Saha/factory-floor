# Factory Floor — OPSPHERE

Digital floor-design game for OPSPHERE, the Operations Club of IBS Bengaluru.
Game built & designed by Brahmajit Saha.

- `index.html` – the whole game (players, Admin, Game Master). Static page: deploy on Vercel with framework preset "Other".
- `config.js` – Supabase URL + public key (empty = demo mode, works between tabs of one browser).
- `database/factory-floor-setup.sql` – one-time Supabase setup (table, access rule, server clock, realtime).
- `SETUP.md` – step-by-step go-live guide.
- `source/` – editable source. Rebuild with `python3 build.py` inside `source/` (writes `dist/index.html`).
- `DESIGN_GUIDE.md` – OPSPHERE game design conventions.

Version: v11 (Supabase data layer; Firebase still supported via `databaseURL` in config.js).
