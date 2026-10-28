# Barnamino (برنامینو)

Coordinate your team’s weekly schedule — on-site and remote.

Plain HTML, CSS, and JavaScript. Open `index.html` in a browser.

## Features

- Define team members and assign each a color
- Weekly schedule (Saturday–Friday) with multiple time ranges per day
- Mark each range as **on-site** (`office`) or **remote**
- Find **shared time ranges** across selected people (with presence-type filters)
- **Lookup by time**: pick a clock time and one or more days to see who’s scheduled then
- **Team board**: a single timeline view of everyone
- **Who’s working now?**: people currently on the clock, and until when
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
  "version": 1,
  "app": "barnamino",
  "exportedAt": "2026-10-28T07:34:50.305Z",
  "people": [
    {
      "id": "…",
      "name": "Sara",
      "color": "#0f766e",
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
| `start` / `end` | Start and end time (`HH:MM`) |
| `type` | `office` = on-site · `remote` = remote |
| Day keys | `sat` … `fri` (Saturday–Friday) |

### Import / export

- **Export**: download a JSON snapshot of the current state
- **Import**: replace data with a JSON file; if file access isn’t granted yet, you’ll be prompted so it can be saved to `data.json`

## UI sections

| Section | Purpose |
|---------|---------|
| People & schedule | Add people and edit weekly ranges |
| Team board | Timeline overview for the whole team |
| Shared ranges | Select people and compute overlapping times |
| Lookup by time | Pick a time + days; list who’s available then |
| Who’s working now? | People currently working right now |

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
- If file access is lost, click **Allow file save** again.
