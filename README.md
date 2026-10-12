# Oscar

A personal AI assistant in the spirit of J.A.R.V.I.S., with an Iron Man style HUD and an Apple-like finish. Oscar's brain is **Claude Opus 5.5** (`claude-opus-5-5`) through the Anthropic API. It runs in the cloud, so you can reach it from your iPhone, iPad, Windows laptop or any browser.

## What works today (phase 1)

- An arc-reactor core that shows what Oscar is doing: standing by, listening, thinking, searching the web (gold), or responding.
- Streaming replies from Claude Opus 5.5, with live web search for news, weather, scores and anything else current.
- Voice: tap the mic (or press Space on a laptop) to talk. Oscar reads its reply aloud sentence by sentence and prefers a British voice when your device has one.
- Sign-in with an access code. Each device stays signed in for 90 days.
- Installs to the home screen as an app on iPhone, iPad, Android and Windows.
- A spinning globe that marks where you are (your device's location, or your home location if you don't share it). Oscar also uses it to answer questions about weather and nearby places.
- Atmospherics: live weather for your location from Open-Meteo (free, no key needed), with a 12-hour temperature trace.
- Missions: a task list you can add to yourself, or by telling Oscar "remind me to…". Oscar also knows what's on it.
- A calls and texts panel, showing sample data until a real phone source is connected.
- Conversation history is kept on each device.

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer and an Anthropic API key from the [Claude Console](https://console.anthropic.com).

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000 and unlock it with your `OSCAR_ACCESS_CODE`.

| Variable | What it is |
| --- | --- |
| `ANTHROPIC_API_KEY` | Your Anthropic API key. It stays on the server and never reaches the browser. |
| `OSCAR_ACCESS_CODE` | The passphrase that unlocks Oscar. Changing it signs out every device. |
| `OSCAR_USER_NAME` | What Oscar calls you. Defaults to Peter. |
| `OSCAR_HOME_NAME`, `OSCAR_HOME_LAT`, `OSCAR_HOME_LON` | Optional. The place the globe marks when a device doesn't share its location. Defaults to Mississippi. |
| `OSCAR_EFFORT` | Optional. How hard Claude thinks: `low` (default, fastest for conversation), `medium`, `high`, `xhigh` or `max`. |

## Put it in the cloud

Oscar is a standard Next.js app, so any Node host works. The quickest route is [Railway](https://railway.com):

1. Create a new project and choose **Deploy from GitHub repo**, then pick `oscar`.
2. Under **Variables**, add `ANTHROPIC_API_KEY`, `OSCAR_ACCESS_CODE` and `OSCAR_USER_NAME`.
3. Under **Settings → Networking**, click **Generate Domain**.

Every push to `main` redeploys automatically. Vercel and Fly.io work the same way.

Set a monthly spend limit in the Claude Console so the API bill never surprises you.

## Add Oscar to your devices

- **iPhone and iPad:** open your Oscar address in Safari, tap Share, then **Add to Home Screen**.
- **Windows:** open it in Edge or Chrome and choose **Install Oscar** from the address bar or menu.
- **Apple Watch, CarPlay and HomePod:** a "Hey Siri, ask Oscar" Shortcut comes in phase 2.

## How it fits together

```
iPhone / iPad / laptop  ──►  Oscar server (Next.js)  ──►  Claude Opus 5.5 (Anthropic API)
   HUD, mic, speech            sign-in, streaming            reasoning + web search
```

- `app/api/chat/route.ts` streams Claude's reply to the browser as newline-delimited JSON.
- `lib/persona.ts` holds Oscar's personality and the model ID.
- `components/Hud.tsx` is the HUD; `components/Core.tsx` is the arc reactor.
- `lib/speech.ts` wraps the browser's speech recognition and text-to-speech.

## Roadmap

1. **Foundation** (this release): cloud chat, HUD, sign-in, installable app.
2. **Voice:** a natural neural voice, hands-free wake, and Siri Shortcuts for Watch, CarPlay and HomePod.
3. **Tools:** calendar, email, reminders and notes, with confirmation before Oscar sends anything.
4. **Proactive Oscar:** morning briefings, push notifications, and long-term memory.
5. **Native apps:** SwiftUI for iPhone, iPad and Watch, plus smart home control.
