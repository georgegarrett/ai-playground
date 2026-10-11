# Research Computing Monitor

A simple, modern dashboard for a research computing cluster. **All data is simulated**; it does not connect to real GPUs, Slurm, storage, or system alerts.

## Run it

No installation or external dependencies are needed. Open `index.html` in a web browser.

Alternatively, with Python installed, run this from the project folder:

```sh
python3 -m http.server 8000
```

Visit http://localhost:8000. Press Ctrl+C in your terminal to stop the server.

## What it shows

- Average GPU utilization, available GPUs, and individual compute nodes.
- Running and pending Slurm jobs. Use the status menu to filter the table.
- Used and total capacity for scratch, project, and home storage.
- Recent sample system alerts.

Click **Refresh simulation** to generate new utilization and storage readings. GPU allocations and sample job records remain fixed, so the summary stays consistent with the table. The GPU alert follows the updated reading. Reloading the page resets the demo.

## How it works

- `index.html` is the page structure: headings, sections, and controls.
- `styles.css` gives it its dark theme, colors, and responsive layout for smaller screens.
- `app.js` holds the fictional records and updates the display when you click Refresh or change the job filter.

Everything runs in your browser. There is no backend, database, account setup, build step, or third-party library. To customize it, edit the sample records at the top of `app.js` or colors in `styles.css`.

A real cluster connection would require a separate backend with appropriate access. Never put cluster credentials in browser code.
