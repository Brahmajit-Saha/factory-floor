# Factory Floor – go-live guide (Supabase + GitHub + Vercel)

## 1. Supabase (the live data)
1. supabase.com > **New project** (name `factory-floor`, region **Mumbai** or **Singapore**). Wait until it is ready.
   (Free projects pause after 7 days of no use. Open the dashboard the day before the event.)
2. **SQL Editor > New query**. Paste everything from `database/factory-floor-setup.sql`, click **Run**. It should say "Success".
3. **Project Settings > API**: copy the **Project URL** and the **anon public** key (or Publishable key).

## 2. Tell the game where the database is
4. Open `config.js` in the GitHub repo (pencil icon), paste the URL and key between the quotes, **Commit changes**.
   The key is meant to be public; the table only holds game data.

## 3. Vercel (the web address)
5. vercel.com > **Add New > Project** > import `factory-floor`. Framework preset **Other**. No build command. **Deploy**.
6. Every later change pushed to GitHub redeploys automatically.

## 4. Rehearsal (10 minutes, before the event)
7. Laptop: open the site > **Admin** (passcode `19990909`) > Save setup > Start round 1 (2 min timer).
8. Phone: log in with any `name@ibsindia.org`, password `123456789`, enter name and team.
9. Second laptop (class display): **Game Master** (passcode `11223456`).
10. Check: clocks match, GM live build follows the phone, Pause/Resume works, **Export results (Excel)** downloads.
11. Admin > **Reset whole game** before the real event.

## Notes
- Passwords are checked inside the page: they keep casual visitors out but are not strong security.
- Players who lose connection rejoin with the same college id and keep their saved layout.
- Free Supabase allows about 200 simultaneous live connections; each device uses one.
- Shortcut links: `your-site/#admin` and `your-site/#gm`.
