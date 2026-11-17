# Factory Floor — OPSPHERE

Digital floor-design game for OPSPHERE, the Operations Club of IBS Bengaluru.
Game built & designed by Brahmajit Saha.

- `index.html` – the whole game (players, Admin, Game Master). Serve it as a static page (Vercel, framework preset "Other").
- `config.js` – where the live-database address/keys go (empty = demo mode, works between tabs of one browser).
- `source/` – editable source. Rebuild with `python3 build.py` from inside `source/` (writes `dist/index.html`).
- `DESIGN_GUIDE.md` – OPSPHERE game design conventions.

Status: v10 (Firebase-capable data layer). Supabase data layer is next.
