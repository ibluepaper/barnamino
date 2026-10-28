# Barnamino (برنامینو)

Coordinate your team’s weekly schedule — on-site and remote.

Plain HTML, CSS, and JavaScript. Open `index.html` in a browser.

## Features

- Define **multiple teams** and switch between them (a person can belong to several teams)
- Define team members and assign each a color
- Weekly schedule (Saturday–Friday) with multiple time ranges per day
- Mark each range as **on-site** (`office`) or **remote**
- Find **shared time ranges** across selected people (with presence-type filters)
- **Max daily overlap**: see the densest windows per day (e.g. 5 people for 30 minutes, or everyone together)
- **Lookup by time**: pick a clock time and one or more days to see who’s scheduled then
- **Team board**: a single timeline view of everyone on the active team
- **Who’s working now?**: people currently on the clock (active team), and until when
- **Daily meetings**: per-team schedule with meeting time, oral/written assignees, and notes for each day
- Persist to `data.json`, plus JSON import / export

## Run

1. Open the project folder and double-click `index.html`,  
   or open the file in Chrome / Edge.
2. To write to disk, click **Allow file save** once and select **this project folder** (where `index.html` lives).  
   The app will use `data.json` inside that folder automatically.

> Recommended: Chrome or Edge — required for direct file access.

Without file permission, data is still kept in the browser’s `localStorage`. After permission is granted, changes are written to `data.json`.

## Data format (`data.json`)

```json
{
  "version": 2,
  "app": "barnamino",
  "exportedAt": "2026-10-28T07:34:50.305Z",
  "teams": [
    {
      "id": "…",
      "name": "تیم محصول",
      "dailyMeetings": {
        "sat": {
          "time": "10:00",
          "note": "اسپرینت",
          "verbalIds": ["…"],
          "writtenIds": ["…"]
        },
        "sun": { "time": "", "note": "", "verbalIds": [], "writtenIds": [] }
      }
    },
    { "id": "…", "name": "تیم پشتیبانی" }
  ],
  "activeTeamId": "…",
  "people": [
    {
      "id": "…",
      "name": "Sara",
      "color": "#0f766e",
      "teamIds": ["…", "…"],
      "schedule": {
        "sat": [{ "start": "09:00", "end": "17:00", "type": "office" }],
        "sun": [{ "start": "10:00", "end": "14:00", "type": "remote" }],
        "mon": [],
        "tue": [],
        "wed": [],
        "thu": [],
        "fri": []
      }
    }
  ]
}
```

| Field | Meaning |
|-------|---------|
| `teams` | List of teams (`id`, `name`, optional `dailyMeetings`) |
| `dailyMeetings` | Per-day meeting plan for that team (`time`, `note`, `verbalIds`, `writtenIds`) |
| `time` | Daily meeting clock time (`HH:MM`); empty = no meeting |
| `verbalIds` | People assigned to oral daily for that day |
| `writtenIds` | People assigned to written daily for that day |
| `note` | Free-text notes for that day’s meeting |
| `activeTeamId` | Currently selected team |
| `teamIds` | Teams this person belongs to (one or more) |
| `start` / `end` | Start and end time (`HH:MM`) |
| `type` | `office` = on-site · `remote` = remote |
| Day keys | `sat` … `fri` (Saturday–Friday) |

Older `version: 1` files (no `teams`) are migrated automatically into a default team.

### Import / export

- **Export**: download a JSON snapshot of the current state
- **Import**: replace data with a JSON file; if file access isn’t granted yet, you’ll be prompted so it can be saved to `data.json`

## UI sections

| Section | Purpose |
|---------|---------|
| Team switcher | Pick the active team; open **Manage teams** to create / rename / delete |
| People & schedule | Members of the active team; edit schedule and multi-team membership |
| Team board | Timeline overview for the active team |
| Shared ranges | Select people and compute full intersection, or max concurrency per day |
| Lookup by time | Pick a time + days; list who’s available then (active team) |
| Who’s working now? | People currently working right now (active team) |
| Daily meetings | Per-team daily standup (Sat–Thu): time, oral/written people, and notes (export as image) |

## Project files

```
barnamino/
├── index.html    # App shell
├── styles.css    # Persian RTL styles (+ local fonts)
├── app.js        # App logic
├── fonts/        # Vazirmatn (offline, no CDN)
├── data.json     # Team data
└── README.md
```

## Notes

- The current weekday is based on your system clock.
- The team board timeline shows roughly 06:00–22:00; ranges outside that window remain fully editable per person.
- A person’s schedule is shared across all their teams; switching teams only changes who is in view.
- If file access is lost, click **Allow file save** again.
