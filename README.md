# Research Computing Monitor

An operations dashboard for a university research computing center. It covers HPC clusters, the GPU fleet, storage capacity, service health, alerts and job activity. It is built for IT administrators, who need the detail, and for leadership, who need the headline.

**All data is synthetic.** It is generated in the browser from a fixed seed, so every load looks the same and nothing connects to real systems.

## Preview it

No build step or install is needed, and the page has no third-party dependencies.

**Option 1: open the file.** Double-click `index.html`, or drag it into Chrome, Edge, Firefox or Safari.

**Option 2: serve it locally.** This is recommended, because it behaves like a real deployment. From the project folder, run one of these:

```sh
python3 -m http.server 8000
# or
npx serve .
```

Then visit <http://localhost:8000>. Press Ctrl+C to stop the server.

## What's on the dashboard

| Section | What it shows |
|---|---|
| **Overview** | Status banner, six KPI tiles with trends and deltas versus the prior period, cluster allocation over time, and service status |
| **Clusters** | Orion (CPU HPC), Nova (GPU/AI) and Helix (teaching): node-state breakdown, running and queued jobs, median wait, and hardware |
| **GPU fleet** | A tile for each of the 256 GPUs, colored by utilization, with hover details (memory, power, temperature, job) and a model filter. Also GPU-hours by department |
| **Storage** | Capacity by tier with 80%/90% thresholds, weekly growth, a time-to-90% forecast, inodes, and `/scratch` read/write throughput |
| **Health & alerts** | Daily availability for each service over 30 days with incident notes, plus alerts you can filter by severity and acknowledge |
| **Activity** | A searchable, sortable and filterable jobs table, queue wait by partition (median and p90), and an operations log |

### Interactions

- **Time range** (24h / 7d / 30d) rescopes the trend charts and the KPI deltas.
- **Live / Paused** turns on simulated telemetry, refreshed every 5 s. GPUs fluctuate, jobs start and finish, and new alerts arrive.
- **Theme toggle** switches between light and dark mode. The page follows your OS setting until you choose one.
- **Table view** on each line chart shows the same data as an accessible table.
- Every chart mark has a tooltip on hover and on keyboard focus. Status colors always come with an icon and a text label.
- Your time range, live setting and theme are remembered in `localStorage`.

## Project structure

```
index.html        Page structure and section layout
css/styles.css    Design tokens (light/dark), layout, components, responsive rules
js/data.js        Seeded synthetic data model + live-tick simulation
js/charts.js      Dependency-free SVG line chart, sparkline, shared tooltip
js/app.js         Rendering of every panel, filters, sorting, live updates, theme
```

The scripts are plain (non-module) scripts. That way the page also works when opened straight from `file://`.

## Customizing

- **Clusters, storage tiers, services, departments:** edit the arrays in `js/data.js`.
- **Colors:** all colors are CSS custom properties at the top of `css/styles.css`. The series palette (blue, orange, aqua) was checked for color-vision-deficiency separation in both themes.
- **Real data:** keep the data shapes and replace the generators in `js/data.js` with `fetch()` calls to a backend, for example one that reads Slurm (`sacct`/`slurmrestd`), Prometheus/DCGM exporters and storage APIs. Never put cluster credentials in browser code.
