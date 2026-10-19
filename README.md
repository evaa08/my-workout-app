# Pulse Workout Coach

A mobile-first guided workout web app/PWA that uses **real exercise demonstration GIFs** from the official ExerciseDB / AscendAPI free API.

## Why this media source

ExerciseDB / AscendAPI's free V1 API is an official, documented exercise library with roughly 1,500 structured exercises, GIF demonstrations, exercise metadata, and step-by-step instructions. It does **not** require an API key for the free API.

Important license/media notes:
- Free V1 is intended for personal projects, prototypes, educational tools, and non-commercial apps.
- Attribution to AscendAPI is required.
- Free V1 media is limited to 180p GIFs.
- Commercial use requires a paid plan.
- If you later obtain access to AscendAPI's higher-quality/paid media, the app's provider layer can be upgraded without changing the workout engine.

Official docs:
https://oss.exercisedb.dev/docs

## Features included

- Exercise search/autocomplete
- Real ExerciseDB GIF demonstrations (no homemade SVG people)
- Exercise preview before adding
- Multiple exercises in a workout
- Sets and reps
- Work and rest timers
- Automatic work → rest → next set → next exercise progression
- Current set / total sets
- Overall workout progress
- Pause/resume
- Skip
- Previous
- Restart current exercise
- Restart entire workout
- Form cues pulled from ExerciseDB instructions
- Workout completion screen
- Local workout persistence
- iPhone-friendly responsive layout
- PWA manifest and service worker
- Screen wake-lock when supported
- Audio interval cues when supported

## Run locally

Because this app calls a web API, serve the folder through a local web server rather than opening `index.html` directly.

### Python
```bash
cd pulse_workout_app
python3 -m http.server 8080
```

Then open:
http://localhost:8080

### VS Code
Use the Live Server extension and open `index.html`.

## Put it on your iPhone

Deploy the folder to any static host such as GitHub Pages, Netlify, Vercel, or Cloudflare Pages. Open the deployed URL in Safari, tap Share, then **Add to Home Screen**.

## API behavior

The app first tries to load the ExerciseDB catalog and caches it locally for 24 hours. It also includes remote search fallbacks for API variations.

Base API:
`https://oss.exercisedb.dev/api/v1`

The app intentionally does not bundle or redistribute ExerciseDB media files. Demonstration GIF URLs are used at runtime from the provider.

## Production-quality upgrade

If you want the demonstrations to look truly HD on a full phone screen, use an official paid/licensed media tier rather than the free 180p GIF tier. The UI and workout engine in this project are already structured so the exercise provider can be swapped later.
