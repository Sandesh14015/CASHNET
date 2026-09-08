import axios from 'axios';

async function run() {
  const t0 = performance.now();
  const latencies = [];
  let success = 0;
  
  for(let i=0; i<50; i++) {
    const t = performance.now();
    try {
      await axios.get('http://localhost:3000/api/readyz');
      success++;
    } catch(e) {}
    latencies.push(performance.now() - t);
  }
  
  latencies.sort((a,b) => a-b);
  console.log(JSON.stringify({
    endpoint: '/api/readyz',
    runs: 50,
    success,
    p50: latencies[25],
    p95: latencies[47],
    p99: latencies[49],
    avg: latencies.reduce((a,b)=>a+b)/50
  }, null, 2));
}
run();
