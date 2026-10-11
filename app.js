// All records are fictional. No cluster connection or credentials are needed.
const nodes = [
  {name:'gpu-a01', model:'NVIDIA A100', utilization:86, available:0},
  {name:'gpu-a02', model:'NVIDIA A100', utilization:64, available:1},
  {name:'gpu-h01', model:'NVIDIA H100', utilization:92, available:0},
  {name:'gpu-h02', model:'NVIDIA H100', utilization:28, available:3},
];
const volumes = [
  {name:'Scratch', path:'/scratch', used:148, capacity:200, color:'purple'},
  {name:'Project', path:'/projects', used:82, capacity:150, color:'blue'},
  {name:'Home', path:'/home', used:12, capacity:20, color:'teal'},
];
const jobs = [
  {id:48291,name:'protein-folding',user:'a.chen',status:'Running',partition:'gpu-a100',elapsed:'02:34:18',gpus:4},
  {id:48290,name:'climate-model-v3',user:'m.patel',status:'Running',partition:'gpu-h100',elapsed:'01:12:43',gpus:4},
  {id:48288,name:'genome-analysis',user:'s.park',status:'Running',partition:'gpu-a100',elapsed:'00:48:09',gpus:3},
  {id:48287,name:'llm-fine-tuning',user:'j.rivera',status:'Running',partition:'gpu-h100',elapsed:'00:21:56',gpus:1},
  {id:48295,name:'molecular-dynamics',user:'e.wilson',status:'Pending',partition:'gpu-h100',elapsed:'—',gpus:4},
  {id:48294,name:'image-segmentation',user:'a.chen',status:'Pending',partition:'gpu-a100',elapsed:'—',gpus:2},
];
const $ = selector => document.querySelector(selector);
function renderResources() {
  const average = Math.round(nodes.reduce((s,n)=>s+n.utilization,0)/nodes.length);
  const available = nodes.reduce((s,n)=>s+n.available,0);
  const used = volumes.reduce((s,v)=>s+v.used,0);
  const capacity = volumes.reduce((s,v)=>s+v.capacity,0);
  const metrics = [
    ['GPU UTILIZATION',`${average}<small>%</small>`,'Average across 16 GPUs','▤','purple'],
    ['AVAILABLE GPUS',`${available}<small> / 16</small>`,'Ready for your next workload','◈','teal'],
    ['SLURM JOBS',`${jobs.filter(j=>j.status==='Running').length}<small> running</small>`,`${jobs.filter(j=>j.status==='Pending').length} jobs waiting in queue`,'≡','blue'],
    ['STORAGE USED',`${Math.round(used/capacity*100)}<small>%</small>`,`${used} TB of ${capacity} TB capacity`,'▱','orange'],
  ];
  $('#metrics').innerHTML = metrics.map(([label,value,detail,icon,color])=>`<article class="metric"><div class="metric-top">${label}<span class="icon ${color}">${icon}</span></div><div class="value">${value}</div><p>${detail}</p></article>`).join('');
  $('#nodes').innerHTML = nodes.map(n=>resource(n.name,n.model,n.utilization,`${4-n.available} of 4 GPUs allocated`,n.available?`${n.available} available`:'Fully allocated','purple')).join('');
  $('#volumes').innerHTML = volumes.map(v=>resource(v.name,v.path,Math.round(v.used/v.capacity*100),`${v.used} TB used`,`${v.capacity} TB total`,v.color)).join('');
  $('#events').innerHTML = [
    [nodes[2].utilization>90?'warning':'info','GPU utilization update',`gpu-h01 is at ${nodes[2].utilization}% utilization.`,'Current sample'],
    ['info','Scheduled maintenance','Scratch maintenance planned for Sunday, 02:00–04:00 UTC.','Sample · 25 min ago'],
    ['success','Compute node restored','gpu-a02 returned to service after a health check.','Sample · 1 hour ago'],
  ].map(([type,title,description,time])=>`<article class="alert"><span class="alert-icon ${type}">${type==='warning'?'!':type==='success'?'✓':'i'}</span><div><h3>${title}</h3><p>${description}</p><small>${time}</small></div></article>`).join('');
  $('#updated').textContent = `Sample updated ${new Date().toLocaleTimeString()}`;
}
function resource(name,model,percent,left,right,color) {
  return `<div class="resource"><div class="resource-top"><div><strong>${name}</strong><small>${model}</small></div><strong>${percent}%</strong></div><div class="progress" role="progressbar" aria-label="${name} utilization" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span class="${color}" style="width:${percent}%"></span></div><div class="resource-bottom"><span>${left}</span><span>${right}</span></div></div>`;
}
function renderJobs() {
  const visible=jobs.filter(j=>$('#filter').value==='All'||j.status===$('#filter').value);
  $('#job-rows').innerHTML=visible.map(j=>`<tr><td><strong>${j.name}</strong><small>#${j.id}</small></td><td>${j.user}</td><td><span class="job-status ${j.status.toLowerCase()}">● ${j.status}</span></td><td>${j.partition}</td><td>${j.elapsed}</td><td>${j.gpus}</td></tr>`).join('');
  $('#job-count').textContent=`Showing ${visible.length} of ${jobs.length} sample jobs`;
}
$('#filter').addEventListener('change',renderJobs);
$('#refresh').addEventListener('click',()=>{
  nodes.forEach(n=>{n.utilization=Math.max(5,Math.min(99,n.utilization+Math.floor(Math.random()*15)-7));});
  volumes.forEach(v=>{v.used=Math.max(1,Math.min(v.capacity,v.used+Math.floor(Math.random()*3)-1));});
  renderResources();
});
renderResources();
renderJobs();
