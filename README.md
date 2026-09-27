# Momentum

Pete's personal app for tasks, routines, projects, workouts, meals and health.

- **Live app:** https://bucolic-buttercream-de5eac.netlify.app (real data)
- **Test copy:** GitHub Pages link in this repo's About box. It has its own separate saved data and a yellow TEST COPY banner. Use it to try changes before they go to Netlify.

## How changes flow
1. Changes are made here and tried on the test copy (free, no Netlify credits).
2. When a batch is ready, it gets uploaded to Netlify once.

## Files
- `index.html` — page layout
- `css/app.css`, `css/v53.css` — look and feel
- `js/app.js` — the main app
- `js/v53.js` — tabs, Ask Momentum, workouts comparison and other newer features
- `netlify/functions/` — server pieces (sync, AI, health, watch inbox, reminders). These only run on Netlify.

No keys or passwords are stored in this repo. The Claude key lives in Netlify's environment variables.
