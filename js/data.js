/*
 * Synthetic data model for the Research Computing Monitor.
 *
 * Everything here is fictional and generated in the browser from a fixed seed,
 * so the dashboard looks the same on every load. `tick()` nudges the "current"
 * readings to simulate a live feed. To connect real telemetry, replace the
 * builders in this file with fetches from a backend that exposes the same shapes.
 */
(function () {
  'use strict';

  // ---- Seeded randomness -------------------------------------------------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20261011);
  const between = (a, b) => a + rand() * (b - a);
  const intBetween = (a, b) => Math.floor(between(a, b + 1));
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function gauss() {
    let u = 0, v = 0;
    while (!u) u = rand();
    while (!v) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const STEP = 30 * MIN;               // one sample every 30 minutes
  const POINTS = 60 * 48;              // 60 days of history
  const now = Math.floor(Date.now() / STEP) * STEP;
  const times = Array.from({ length: POINTS }, (_, i) => now - (POINTS - 1 - i) * STEP);
  const ago = (ms) => now - ms;

  // ---- Time series ---------------------------------------------------------
  // Diurnal cycle + weekend dip + autocorrelated noise + optional incidents.
  function series({ base, amp, weekend = 0, noise, peakHour = 15, min = 0, max = 100, events = [] }) {
    let drift = 0;
    return times.map((t) => {
      const d = new Date(t);
      const hour = d.getHours() + d.getMinutes() / 60;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      drift = drift * 0.93 + gauss() * noise;
      let v = base + amp * Math.cos(((hour - peakHour) / 24) * 2 * Math.PI) - (isWeekend ? weekend : 0) + drift;
      for (const e of events) if (t >= e.start && t < e.end) v = e.apply(v, t);
      return +clamp(v, min, max).toFixed(2);
    });
  }

  const helixMaintenance = { start: ago(3 * DAY + 10 * HOUR), end: ago(3 * DAY + 4 * HOUR), apply: () => 0 };
  const novaDrain = { start: ago(9 * HOUR), end: now + HOUR, apply: (v) => v - 3 };
  const lustreFailover = { start: ago(12 * DAY + 5 * HOUR), end: ago(12 * DAY + 4 * HOUR), apply: (v) => v * 0.15 };

  const ts = {
    orion: series({ base: 86, amp: 4, weekend: 3, noise: 0.9, min: 40, max: 99.5 }),
    nova: series({ base: 80, amp: 7, weekend: 5, noise: 1.6, min: 20, max: 99, events: [novaDrain] }),
    helix: series({ base: 46, amp: 20, weekend: 22, noise: 2.2, peakHour: 13, min: 3, max: 96, events: [helixMaintenance] }),
    pending: series({ base: 1850, amp: 420, weekend: 380, noise: 55, peakHour: 17, min: 200, max: 6000 }).map(Math.round),
    ioRead: series({ base: 128, amp: 34, weekend: 22, noise: 9, peakHour: 14, min: 4, max: 480, events: [lustreFailover] }),
    ioWrite: series({ base: 74, amp: 21, weekend: 14, noise: 7, peakHour: 16, min: 2, max: 480, events: [lustreFailover] }),
  };

  // ---- People & projects --------------------------------------------------
  const users = ['akumar', 'jlee42', 'mrodriguez', 'tnguyen', 'oadeyemi', 'schen7', 'hmuller', 'pwalsh',
    'rgupta', 'emartin', 'kyamamoto', 'lrossi', 'dokafor', 'sibrahim', 'fsilva', 'bthompson', 'yzhang3', 'cnovak'];
  const accounts = {
    'Computer Science': ['cs-nlp', 'cs-vision', 'cs-systems'],
    'Bioengineering': ['bioe-imaging', 'bioe-protein'],
    'Physics & Astronomy': ['phys-astro', 'phys-lattice'],
    'Neuroscience': ['neuro-connectome'],
    'Chemistry': ['chem-comp', 'chem-md'],
    'Earth & Climate': ['climate-esm', 'geo-seismic'],
    'Mechanical Eng.': ['mech-cfd'],
    'Economics': ['econ-macro'],
    'Genomics Core': ['genomics-core'],
  };
  const deptOf = {};
  Object.entries(accounts).forEach(([dept, list]) => list.forEach((a) => (deptOf[a] = dept)));

  const gpuWork = [
    ['llama-ft-lora', 'cs-nlp'], ['bert-pretrain', 'cs-nlp'], ['diffusion-sample', 'cs-vision'],
    ['vit-segment', 'cs-vision'], ['alphafold-batch', 'bioe-protein'], ['cryoem-relion', 'bioe-imaging'],
    ['gromacs-gpu', 'chem-md'], ['connectome-unet', 'neuro-connectome'], ['lattice-qcd', 'phys-lattice'],
    ['graphcast-ft', 'climate-esm'], ['nemo-asr', 'cs-nlp'], ['parabricks-wgs', 'genomics-core'],
  ];
  const cpuWork = [
    ['wrf-conus-4km', 'climate-esm', 'orion'], ['cesm-b1850', 'climate-esm', 'orion'], ['vasp-relax', 'chem-comp', 'orion'],
    ['openfoam-les', 'mech-cfd', 'orion'], ['lammps-polymer', 'chem-md', 'orion'], ['gatk-wgs', 'genomics-core', 'orion'],
    ['qe-phonon', 'chem-comp', 'orion'], ['gadget4-nbody', 'phys-astro', 'orion'], ['specfem3d', 'geo-seismic', 'orion'],
    ['stata-panel', 'econ-macro', 'helix'], ['r-bootstrap', 'econ-macro', 'helix'], ['cs4510-hw3', 'cs-systems', 'helix'],
    ['fsl-preproc', 'neuro-connectome', 'helix'], ['mpi-lab-02', 'cs-systems', 'helix'],
  ];

  // ---- GPU fleet (Nova) ---------------------------------------------------
  const gpuModels = [
    { model: 'H100', label: 'H100 SXM5 80 GB', prefix: 'nova-h', nodes: 16, perNode: 8, mem: 80, tdp: 700, partition: 'gpu-h100' },
    { model: 'A100', label: 'A100 SXM4 80 GB', prefix: 'nova-a', nodes: 24, perNode: 4, mem: 80, tdp: 400, partition: 'gpu-a100' },
    { model: 'L40S', label: 'L40S 48 GB', prefix: 'nova-l', nodes: 8, perNode: 4, mem: 48, tdp: 350, partition: 'gpu-l40s' },
  ];
  const DOWN_NODE = 'nova-a17';

  let nextJobId = 4829117;
  const jobs = [];

  function newGpuJob(spec, gpus, nodeName) {
    const [name, account] = pick(gpuWork);
    const limit = pick([240, 720, 1440, 2880]);
    const job = {
      id: nextJobId++, name, user: pick(users), account, cluster: 'nova', partition: spec.partition,
      state: 'RUNNING', nodes: 1, cpus: gpus * 16, gpus, nodeList: nodeName,
      elapsed: intBetween(5, limit - 10), limit, eff: intBetween(62, 97),
    };
    jobs.push(job);
    return job;
  }

  function utilFor(job) { return job ? clamp(88 + gauss() * 9, 35, 100) : between(0, 2); }

  function makeGpu(spec, node, index, job) {
    const g = { node, index, model: spec.model, mem: spec.mem, tdp: spec.tdp, state: job ? 'busy' : 'idle', job, util: 0 };
    g.util = utilFor(job);
    derive(g);
    return g;
  }
  function derive(g) {
    if (g.state === 'down') { g.util = 0; g.memUsed = 0; g.power = 0; g.temp = 0; return; }
    const u = g.util / 100;
    g.memUsed = g.job ? +clamp(g.mem * (0.45 + u * 0.5 + gauss() * 0.04), 2, g.mem).toFixed(1) : 0.4;
    g.power = Math.round(g.tdp * (0.12 + u * 0.82));
    g.temp = Math.round(32 + u * 42 + gauss() * 2);
  }

  const gpuNodes = [];
  gpuModels.forEach((spec) => {
    for (let n = 1; n <= spec.nodes; n++) {
      const name = spec.prefix + String(n).padStart(2, '0');
      const node = { name, model: spec.model, label: spec.label, partition: spec.partition, gpus: [] };
      if (name === DOWN_NODE) {
        for (let i = 0; i < spec.perNode; i++) {
          const g = makeGpu(spec, name, i, null);
          g.state = 'down'; g.reason = i === 2 ? 'Uncorrectable ECC errors' : 'Node drained';
          derive(g);
          node.gpus.push(g);
        }
      } else {
        // Most nodes are fully allocated; some are split across two jobs; a few sit idle.
        const roll = rand();
        let layout;
        if (roll < 0.7) layout = [spec.perNode];
        else if (roll < 0.88) layout = [spec.perNode / 2, spec.perNode / 2];
        else if (roll < 0.96) layout = [spec.perNode / 2, 0];
        else layout = [0];
        let i = 0;
        layout.forEach((count) => {
          const size = count || spec.perNode / (layout.length === 1 ? 1 : 2);
          const job = count ? newGpuJob(spec, count, name) : null;
          for (let k = 0; k < size; k++) node.gpus.push(makeGpu(spec, name, i++, job));
        });
      }
      gpuNodes.push(node);
    }
  });
  const allGpus = () => gpuNodes.flatMap((n) => n.gpus);

  // ---- Other jobs ----------------------------------------------------------
  for (let i = 0; i < 46; i++) {
    const [name, account, cluster] = pick(cpuWork);
    const partition = cluster === 'helix' ? pick(['teaching', 'teaching', 'interactive']) : pick(['standard', 'standard', 'standard', 'long', 'highmem']);
    const nodes = cluster === 'helix' ? 1 : pick([1, 1, 2, 4, 8, 16, 32]);
    const limit = partition === 'long' ? 10080 : partition === 'interactive' ? 240 : pick([720, 1440, 2880]);
    jobs.push({
      id: nextJobId++, name, user: pick(users), account, cluster, partition, state: 'RUNNING',
      nodes, cpus: nodes * (cluster === 'helix' ? pick([4, 8, 40]) : 192), gpus: 0,
      nodeList: `${cluster === 'helix' ? 'helix-c' : 'orion-c'}${String(intBetween(1, cluster === 'helix' ? 96 : 412)).padStart(3, '0')}${nodes > 1 ? '+' + (nodes - 1) : ''}`,
      elapsed: intBetween(3, limit - 5), limit, eff: intBetween(48, 99),
    });
  }
  const pendingReasons = ['Priority', 'Resources', 'QOSMaxGRESPerUser', 'Priority', 'Resources', 'Dependency'];
  for (let i = 0; i < 16; i++) {
    const isGpu = rand() < 0.5;
    const spec = pick(gpuModels.slice(0, 2));
    const [name, account] = isGpu ? pick(gpuWork) : pick(cpuWork);
    const gpus = isGpu ? pick([1, 2, 4, 8]) : 0;
    jobs.push({
      id: nextJobId++, name, user: pick(users), account, cluster: isGpu ? 'nova' : 'orion',
      partition: isGpu ? spec.partition : pick(['standard', 'long', 'highmem']), state: 'PENDING',
      reason: pick(pendingReasons), nodes: isGpu ? 1 : pick([1, 4, 16, 64]), cpus: isGpu ? gpus * 16 : pick([192, 768, 3072]),
      gpus, nodeList: '—', elapsed: 0, limit: pick([720, 1440, 2880]), waited: intBetween(4, isGpu ? 560 : 180), eff: null,
    });
  }
  for (let i = 0; i < 10; i++) {
    const [name, account, cluster] = pick(cpuWork);
    const failed = i % 4 === 0;
    const limit = 1440;
    jobs.push({
      // Finished jobs were submitted earlier, so they carry lower IDs.
      id: 4828940 + i * 7, name, user: pick(users), account, cluster, partition: cluster === 'helix' ? 'teaching' : 'standard',
      state: failed ? 'FAILED' : 'COMPLETED', reason: failed ? pick(['OUT_OF_MEMORY', 'NODE_FAIL', 'Exit code 1']) : null,
      nodes: 1, cpus: 192, gpus: 0, nodeList: '—', elapsed: intBetween(12, 900), limit, eff: failed ? null : intBetween(55, 98),
    });
  }
  jobs.sort((a, b) => b.id - a.id);

  // ---- Clusters -----------------------------------------------------------
  const clusters = [
    {
      id: 'orion', name: 'Orion', role: 'CPU HPC', series: 1,
      description: 'Tightly coupled MPI and high-throughput science',
      hardware: '412 nodes · 2× AMD EPYC 9654 · 768 GB · NDR 400 Gb/s',
      nodes: 412, cores: 412 * 192, running: 5912, waitMin: 22, partitions: ['standard', 'long', 'highmem', 'interactive'],
    },
    {
      id: 'nova', name: 'Nova', role: 'GPU / AI', series: 2,
      description: 'Deep learning, molecular modeling and accelerated simulation',
      hardware: '48 nodes · 128× H100 · 96× A100 · 32× L40S',
      nodes: 48, cores: 48 * 64, gpus: 256, running: 0, waitMin: 96, partitions: ['gpu-h100', 'gpu-a100', 'gpu-l40s'],
    },
    {
      id: 'helix', name: 'Helix', role: 'Teaching & long-tail', series: 3,
      description: 'Coursework, workshops, Open OnDemand and small jobs',
      hardware: '96 nodes · 2× Xeon Gold 6248 · 192 GB · HDR 100',
      nodes: 96, cores: 96 * 40, running: 604, waitMin: 2, partitions: ['teaching', 'interactive'],
    },
  ];

  // ---- Department GPU-hours (last 30 days) -------------------------------
  const deptGpuHours = [
    ['Computer Science', 52840], ['Bioengineering', 24310], ['Physics & Astronomy', 19760], ['Neuroscience', 15920],
    ['Chemistry', 12480], ['Earth & Climate', 9650], ['Genomics Core', 6870], ['Mechanical Eng.', 4120], ['Economics', 1380],
  ].map(([dept, hours]) => ({ dept, hours }));

  // ---- Storage (values in TB) ---------------------------------------------
  const storage = [
    { name: 'Scratch', mount: '/scratch', fs: 'Lustre · DDN ES400NVX2', cap: 4200, used: 3612, weekly: 38, inodes: 71, policy: '60-day purge', perf: 'Parallel, high-throughput' },
    { name: 'Projects', mount: '/projects', fs: 'IBM Storage Scale', cap: 6000, used: 4518, weekly: 21, inodes: 58, policy: 'Daily snapshots · group quotas', perf: 'Persistent research data' },
    { name: 'Work', mount: '/work', fs: 'VAST all-flash NVMe', cap: 520, used: 309, weekly: 6, inodes: 33, policy: 'Expanded +120 TB this week', perf: 'Low-latency AI datasets' },
    { name: 'Home', mount: '/home', fs: 'NetApp AFF · NFS', cap: 180, used: 113, weekly: 0.6, inodes: 44, policy: '50 GB per-user quota', perf: 'Code, configs, small files' },
    { name: 'Archive', mount: '/archive', fs: 'HPSS · LTO-9 tape', cap: 18000, used: 11940, weekly: 52, inodes: 12, policy: 'Two-copy, offsite replica', perf: 'Long-term retention' },
  ];

  // ---- Services & availability ------------------------------------------
  // `history` holds 30 daily records of downtime minutes and the worst status that day.
  function history(incidents) {
    return Array.from({ length: 30 }, (_, i) => {
      const daysAgo = 29 - i;
      const hit = incidents.find((x) => x.daysAgo === daysAgo);
      return { date: now - daysAgo * DAY, status: hit ? hit.status : 'good', down: hit ? hit.down : 0, note: hit ? hit.note : null };
    });
  }
  const services = [
    { name: 'Slurm controllers', detail: 'slurmctld · 3 clusters', status: 'good', metric: 'RPC p95 4 ms',
      history: history([{ daysAgo: 1, status: 'warning', down: 0, note: 'Rolling upgrade to 24.11.4' }]) },
    { name: 'Lustre /scratch', detail: 'MDS + 24 OSS', status: 'good', metric: '182k metadata ops/s',
      history: history([{ daysAgo: 12, status: 'serious', down: 47, note: 'MDS failover after controller fault' }]) },
    { name: 'Storage Scale /projects', detail: 'GPFS · 8 NSD servers', status: 'good', metric: 'Latency 1.8 ms', history: history([]) },
    { name: 'InfiniBand fabric', detail: 'NDR 400 · 2 spines', status: 'warning', label: 'Degraded', metric: 'Link errors on ib-leaf-07',
      history: history([{ daysAgo: 0, status: 'warning', down: 0, note: 'Rising symbol errors on one leaf' }]) },
    { name: 'Open OnDemand', detail: 'ondemand.rc.example.edu', status: 'good', metric: '312 active sessions',
      history: history([{ daysAgo: 6, status: 'critical', down: 72, note: 'Expired TLS certificate' }]) },
    { name: 'JupyterHub', detail: 'Helix teaching nodes', status: 'good', metric: '148 notebooks', history: history([]) },
    { name: 'Globus data transfer', detail: 'rc#dtn01–04', status: 'warning', label: 'Degraded', metric: '4.2% transfer failures',
      history: history([{ daysAgo: 1, status: 'warning', down: 18, note: 'Elevated checksum failures' }, { daysAgo: 0, status: 'warning', down: 9, note: 'Elevated checksum failures' }]) },
    { name: 'Identity & LDAP', detail: 'Campus SSO + Duo', status: 'good', metric: 'Auth p95 120 ms', history: history([]) },
    { name: 'License server', detail: 'FlexLM · MATLAB, ANSYS', status: 'maintenance', label: 'Maintenance', metric: 'Window 22:00–23:00',
      history: history([{ daysAgo: 19, status: 'warning', down: 30, note: 'Planned vendor update' }]) },
  ];
  services.forEach((s) => {
    const down = s.history.reduce((sum, d) => sum + d.down, 0);
    s.uptime = 100 * (1 - down / (30 * 24 * 60));
  });

  // ---- Alerts & events ----------------------------------------------------
  let nextAlertId = 1;
  const alert = (severity, title, source, minutesAgo) => ({ id: nextAlertId++, severity, title, source, time: Date.now() - minutesAgo * MIN, acked: false });
  const alerts = [
    alert('critical', `${DOWN_NODE}: uncorrectable ECC errors on GPU 2 — node drained`, 'DCGM · Nova', 18),
    alert('serious', '/scratch at 86% capacity; purge cycle due in 3 days', 'Lustre · capacity', 41),
    alert('serious', 'Symbol error rate rising on ib-leaf-07 port 23', 'UFM · fabric', 52),
    alert('warning', 'Globus transfer failure rate 4.2% (threshold 2%)', 'Globus · dtn02', 66),
    alert('warning', 'orion-c214: memory pressure, swap active for 25 min', 'Node health', 118),
    alert('warning', 'gpu-h100 queue: p90 wait 9.4 h exceeds 8 h target', 'Slurm · scheduler', 175),
    alert('info', 'License server maintenance window 22:00–23:00 tonight', 'Change calendar', 240),
    alert('info', 'Fairshare recalculation completed for 217 accounts', 'Slurm · accounting', 362),
  ];
  alerts[6].acked = true;

  const events = [
    { type: 'Maintenance', time: now + 7 * DAY + 3 * HOUR, title: 'Lustre OSS kernel patching', text: 'Rolling, no expected downtime. /scratch may see reduced throughput for 4 h.', upcoming: true },
    { type: 'Incident', time: ago(9 * HOUR), title: `${DOWN_NODE} drained`, text: 'Uncorrectable ECC errors on GPU 2. RMA opened with vendor; 4 A100s out of service.' },
    { type: 'Change', time: ago(26 * HOUR), title: 'Slurm 24.11.4 rolling upgrade', text: 'Completed across Orion, Nova and Helix with no job loss.' },
    { type: 'Capacity', time: ago(2 * DAY + 5 * HOUR), title: '+120 TB NVMe added to /work', text: 'VAST cluster expanded to 520 TB to support AI dataset staging.' },
    { type: 'Maintenance', time: ago(3 * DAY + 10 * HOUR), title: 'Helix firmware & BIOS update', text: 'Six-hour planned window; all 96 nodes returned to service.' },
    { type: 'Allocation', time: ago(5 * DAY), title: 'Q4 allocation cycle approved', text: '38 new projects · 2.1M core-hours · 46k GPU-hours awarded.' },
    { type: 'Incident', time: ago(6 * DAY + 2 * HOUR), title: 'Open OnDemand outage (72 min)', text: 'Expired TLS certificate. Renewal automation added to config management.' },
    { type: 'Change', time: ago(8 * DAY), title: 'CUDA 12.6 is now the default module on Nova', text: 'Previous toolkit versions remain available via `module load`.' },
  ];

  const queueWait = [
    { partition: 'interactive', median: 0.6, p90: 3 },
    { partition: 'teaching', median: 1.2, p90: 6 },
    { partition: 'gpu-l40s', median: 18, p90: 84 },
    { partition: 'standard', median: 22, p90: 126 },
    { partition: 'highmem', median: 96, p90: 384 },
    { partition: 'gpu-a100', median: 114, p90: 312 },
    { partition: 'long', median: 192, p90: 708 },
    { partition: 'gpu-h100', median: 288, p90: 564 },
  ];

  const people = { researchers: 1284, researchersPrev: 1238, groups: 217, completed7d: 148203, completedPrev: 139872 };

  // Align the Nova series' latest reading with the GPU fleet so every view agrees.
  function syncNova() {
    const gpus = allGpus();
    ts.nova[ts.nova.length - 1] = +(gpus.reduce((s, g) => s + g.util, 0) / gpus.length).toFixed(2);
    clusters[1].running = new Set(gpus.filter((g) => g.job).map((g) => g.job.id)).size;
  }
  syncNova();

  // ---- Live simulation ---------------------------------------------------
  const alertTemplates = [
    ['warning', () => `orion-c${String(intBetween(1, 412)).padStart(3, '0')}: CPU temperature above 85 °C`, 'Node health'],
    ['info', () => `Job ${nextJobId - intBetween(1, 40)} exceeded walltime and was cancelled`, 'Slurm · scheduler'],
    ['warning', () => `Project quota at 95% for ${pick(Object.keys(deptOf))}`, 'Storage Scale · quotas'],
    ['info', () => `Globus endpoint rc#dtn0${intBetween(1, 4)} completed 1.2 TB transfer`, 'Globus'],
    ['serious', () => `nova-h${String(intBetween(1, 16)).padStart(2, '0')}: NVLink CRC errors detected`, 'DCGM · Nova'],
  ];

  function nudgeLast(arr, sd, lo, hi, round) {
    const i = arr.length - 1;
    const v = clamp(arr[i] + gauss() * sd, lo, hi);
    arr[i] = round ? Math.round(v) : +v.toFixed(2);
  }

  function tick() {
    nudgeLast(ts.orion, 0.6, 60, 99.5);
    nudgeLast(ts.helix, 1.2, 3, 96);
    nudgeLast(ts.pending, 30, 200, 6000, true);
    nudgeLast(ts.ioRead, 6, 4, 480);
    nudgeLast(ts.ioWrite, 4, 2, 480);

    gpuNodes.forEach((node) => node.gpus.forEach((g) => {
      if (g.state === 'down') return;
      g.util = g.job ? clamp(g.util + gauss() * 5, 30, 100) : between(0, 2);
      derive(g);
    }));
    // Occasionally a job finishes and an idle node picks up queued work.
    if (rand() < 0.25) {
      const busy = gpuNodes.filter((n) => n.gpus.some((g) => g.job));
      const node = pick(busy);
      const job = pick(node.gpus.filter((g) => g.job)).job;
      node.gpus.forEach((g) => { if (g.job === job) { g.job = null; g.state = 'idle'; g.util = 0; derive(g); } });
      job.state = 'COMPLETED';
      job.eff = intBetween(60, 97);
    }
    if (rand() < 0.3) {
      const node = pick(gpuNodes.filter((n) => n.gpus.some((g) => g.state === 'idle')));
      if (node) {
        const idle = node.gpus.filter((g) => g.state === 'idle');
        const spec = gpuModels.find((m) => m.model === node.model);
        const job = newGpuJob(spec, idle.length, node.name);
        job.elapsed = 0;
        jobs.sort((a, b) => b.id - a.id);
        idle.forEach((g) => { g.job = job; g.state = 'busy'; g.util = utilFor(job); derive(g); });
      }
    }
    jobs.forEach((j) => {
      if (j.state === 'RUNNING') j.elapsed = Math.min(j.limit, j.elapsed + 1);
      if (j.state === 'PENDING') j.waited += 1;
    });
    clusters[0].running = Math.round(clamp(clusters[0].running + gauss() * 12, 5000, 7000));
    clusters[2].running = Math.round(clamp(clusters[2].running + gauss() * 6, 300, 900));
    syncNova();

    let newAlert = null;
    if (rand() < 0.08) {
      const [severity, title, source] = pick(alertTemplates);
      newAlert = { id: nextAlertId++, severity, title: title(), source, time: Date.now(), acked: false };
      alerts.unshift(newAlert);
      if (alerts.length > 16) alerts.pop();
    }
    return { newAlert };
  }

  window.RCM = window.RCM || {};
  window.RCM.data = {
    STEP, now, times, ts, clusters, gpuModels, gpuNodes, allGpus, jobs, deptOf, deptGpuHours,
    storage, services, alerts, events, queueWait, people, tick,
  };
})();
