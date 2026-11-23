# Otonari (お隣)

**Borrow from next door, in your own language.**

Otonari (お隣, "next door") is an installable web app (PWA) that lets neighbors in the same building or block in Japan lend and borrow things they rarely use, like a futon dryer, a stepladder or a takoyaki maker. Nobody types a message: every message is a fixed phrase that each neighbor reads in their own language (English, Japanese, Easy Japanese or Bengali).

**The connection we update (TSUNAGU: Update the Way We Connect).** Neighbors live a few meters apart but never ask each other for help, because of language, shyness, and 遠慮 (*enryo*): the Japanese reluctance to impose on others, or to chase an overdue item. Otonari repairs this broken link between foreign residents, who need things but can't ask, and elderly residents, who own useful things but rarely talk to their neighbors. Asking takes a few taps, both sides read polite words in their own language, and the app sends the awkward reminder, so nobody has to.

## Features

- **Neighborhood shelf.** Join with the code on the poster in your building or block: a nickname and a language are enough. Share items by picking them from a fixed catalog.
- **Borrowing in two languages.** Choose the day, time and length with taps, and see the exact sentence your neighbor will read before you send it. They tap Yes or No. Quick replies ("I'm on my way", "Thank you") cover the rest, and "Show original" proves that both sides saw the same meaning.
- **Handover and return.** A condition photo before and after, side by side.
- **Reminders nobody has to send.** 24 hours before an item is due, and again when it is overdue, Otonari politely reminds the borrower. When it is overdue, the lender is told that this has been taken care of.
- **For elderly neighbors.** Large text and buttons, 🔊 read-aloud on every message, and Easy Japanese (やさしい日本語).
- **Trust.** Every request shows how reliable the borrower has been, and an item can be limited to neighbors who have already returned something on time.
- **QR poster.** A printable A4 poster in Japanese, English and Bengali for the notice board.
- **Start a new neighborhood.** A building manager or neighborhood association leader creates a group and prints its poster.
- **Etiquette tips** at the right moment: before asking, at handover and at return.
- **Installable.** Add it to the home screen like an app; it updates itself. Only the app's own files stay on the phone: loans, messages and photos always come from the server.

## Screenshots

<!-- Placeholders: replace the files in docs/screenshots/ with real screenshots, keeping the file names. -->

| 1. Join | 2. Ask | 3. Answer |
|---|---|---|
| <img src="docs/screenshots/1-join.png" width="240" alt="Join page with the code from the poster filled in"> | <img src="docs/screenshots/2-request.png" width="240" alt="Borrow request with a preview in Japanese"> | <img src="docs/screenshots/3-answer.png" width="240" alt="The lender's banner in polite Japanese and large text"> |
| Scan the poster, pick a nickname and a language. | The preview shows what your neighbor will read. | The lender reads polite Japanese in large text. |

| 4. Handover | 5. Return | 6. Poster |
|---|---|---|
| <img src="docs/screenshots/4-handover.png" width="240" alt="Condition photo and the button I received it"> | <img src="docs/screenshots/5-return.png" width="240" alt="Reminder, thank-you messages and both photos"> | <img src="docs/screenshots/6-poster.png" width="240" alt="Printable poster with a QR code in three languages"> |
| A condition photo, then "I received it". | Both photos side by side, and a thank-you. | The way into the neighborhood. |

## How to run

You need [Node.js](https://nodejs.org) 22.12 or newer. There are no API keys and nothing to sign up for.

**1. Install** (once)

```bash
git clone <URL of this repository>
cd otonari
npm install
```

`npm install` also installs the `client` and `server` folders. Then create the settings file:

```bash
cp server/.env.example server/.env
```

(In the Windows command prompt: `copy server\.env.example server\.env`)

**2. Fill the database**

```bash
npm run seed
```

**3. Run it**

While developing, with automatic reload:

```bash
npm run dev
```

Open <http://localhost:5173>.

For a demo, as one server without file watching:

```bash
npm run build
npm start
```

Open <http://localhost:3001>, or `http://<IP address of this computer>:3001` on a phone in the same Wi-Fi.

Join with the code `SAKURA-2611` (Sakura Heights) or `HAMA-3CHOME` (Hamaguchi-machi 3-chome), or tap a name under "Demo: continue as a neighbor". To show two neighbors on one computer, open the second one in a private window. The 5-step demo script is in [CLAUDE.md](CLAUDE.md), section 10.

To install the app, choose "Install app" in the browser's menu ("Add to Home Screen" on an iPhone). Browsers allow this only over HTTPS and on `localhost`: at `http://<IP address of this computer>:3001` the app works, but can't be installed. On an iPhone, install it first and join inside the installed app, because it doesn't share the login with the browser.

| Command | What it does |
|---|---|
| `npm run seed` | Resets the database, deletes all photos, and adds the demo neighbors with their items. |
| `npm run seed:empty` | The same reset, but with only the two groups and nobody in them: for a demo with real people. |
| `npm run dev` | Server (port 3001) and client (port 5173) with automatic reload. |
| `npm run build` | Builds the client. Run it again after every change. |
| `npm start` | Runs the server with the built client on port 3001. |

Settings in `server/.env`: `PORT`, and `DEMO_MODE`. With `DEMO_MODE=true`, the join page offers "continue as a neighbor" and an active loan has fast-forward buttons for the reminders. **Set `DEMO_MODE=false` for a demo with real people**; otherwise anyone can continue as anyone else.

## Tech stack

- **Client:** React 18, Vite, react-router-dom, plain JavaScript and plain CSS, `qrcode` for the poster, `vite-plugin-pwa` to make it installable
- **Server:** Node.js, Express, better-sqlite3, multer for photo uploads, cors, dotenv
- **Database:** one SQLite file (`server/otonari.db`); photos in `server/uploads/`
- **Development:** concurrently, nodemon

No TypeScript, CSS framework or state library: the code is meant to be read and explained by everyone on the team.

## Project structure

```
otonari/
├── client/                   the React app
│   ├── public/               the app icons (drawn by make-icons.ps1)
│   └── src/
│       ├── pages/            one file per screen: Join, Shelf, ItemPage, MyItems, Loans, LoanPage, Settings, Poster
│       ├── components/       Banner, PhraseBubble, SpeakButton, PhotoCapture, TrustLine, TipCard, ...
│       ├── i18n/             en.json, ja.json, ja-easy.json, bn.json, and index.js, which renders the phrases
│       ├── data/catalog.js   the items, handover spots, quick replies and loan lengths to choose from
│       ├── App.jsx           routes, bottom navigation, new-message banner
│       └── api.js, useInbox.js, UserContext.js, serviceWorker.js, styles.css
├── server/                   the Express API
│   ├── index.js              starts the server (and serves the built client)
│   ├── db.js                 database tables and small helpers
│   ├── routes/               groups, items, loans, inbox, demo
│   ├── reminders.js          the polite reminders, checked every 30 seconds
│   ├── photos.js             photo uploads
│   ├── auth.js               token → user
│   ├── allowedKeys.js        the only keys and values the server accepts
│   └── seed.js               the demo data
├── docs/screenshots/
├── CLAUDE.md                 our specification
└── BUILD_PROMPTS.md          our build steps
```

## How translation works

**No AI, no translation service, no API keys.** The database never contains a translated sentence. A message is a phrase key and parameters:

```json
{
  "phrase_key": "request",
  "params": {
    "item": "futon_dryer",
    "spot": "entrance",
    "start": "2026-11-24T00:00:00.000Z",
    "end": "2026-11-27T00:00:00.000Z",
    "name": "Rahim"
  }
}
```

Each person's app renders it from that person's language file (`client/src/i18n/`):

| Language | What the neighbor reads |
|---|---|
| English | May I borrow your futon dryer from Tue, Nov 24, 9:00 AM to Fri, Nov 27, 9:00 AM? |
| 日本語 | 11月24日(火) 9:00から11月27日(金) 9:00まで、布団乾燥機をお借りしてもよろしいでしょうか。 |
| やさしい にほんご | ふとんを かわかす きかい を かりたいです。11月24日(火) 9:00 から 11月27日(金) 9:00 まで です。いいですか。 |
| বাংলা | আমি কি মঙ্গল ২৪ নভে, ৯:০০ AM থেকে শুক্র ২৭ নভে, ৯:০০ AM পর্যন্ত আপনার ফুটন (তোশক) ড্রায়ার ধার নিতে পারি? |

- Everything inside a sentence is a key or a raw value too: items and handover spots come from fixed lists, dates are formatted for each language (always in Japan time), and nicknames stay as they are (with さん in Japanese).
- Switching the language shows the whole conversation again in the new language.
- A text that is missing in one language falls back: Easy Japanese → Japanese → English, and Bengali → English.

## Privacy and safety

- **Nicknames only.** No account, password or email. A random token in the browser is the whole identity.
- **No room numbers.** Items are handed over at a shared spot, such as the building entrance or the bicycle parking.
- **No free text between neighbors.** Nobody can be insulted, pressured or asked for personal data in the app.
- **The join code is on a physical poster.** Only people who can see the notice board get the code, and only members of a group see its shelf. A conversation can be opened only by the two people in it.
- **GPS is removed from photos.** The app redraws every photo in the browser before uploading it, so its position and other hidden data are never sent.
- **Trust info.** The lender sees how long the borrower has been a member, and how many returns were on time or late.
- **Trusted-neighbors-only items.** The owner can limit valuable items to people with at least one on-time return.
- **Safe leaving.** Nobody can leave while a loan is accepted or active. When someone leaves, their items and open requests disappear and their token stops working.
- **Read-aloud** uses the voices of the browser. Voices called "Online" are run by the maker of the browser, which receives the sentence that is read.

## AI usage

We used Claude in VS Code to write the code from our own specification ([CLAUDE.md](CLAUDE.md)), one step at a time ([BUILD_PROMPTS.md](BUILD_PROMPTS.md)). The phrases that neighbors send each other were written by the team and reviewed by a native Japanese speaker. Otonari itself uses no AI while it runs: every message comes from the language files.

## Team

| Name | Role |
|---|---|
| _Name 1_ | _Role (e.g. lead, backend)_ |
| _Name 2_ | _Role (e.g. frontend: join, shelf, my items)_ |
| _Name 3_ | _Role (e.g. frontend: borrowing, messages, notifications)_ |
| _Name 4_ | _Role (e.g. photos, elder mode, language review)_ |
| _Name 5_ | _Role (e.g. poster, proposal, demo video)_ |
