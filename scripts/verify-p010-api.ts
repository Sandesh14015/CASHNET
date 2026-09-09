async function verifyP010() {
  console.log("P0.10 API RUNTIME TESTING\n");
  const baseUrl = "http://localhost:5000";

  async function test(name, method, path, headers = {}, body = null, expectedStatus = 200) {
    const start = performance.now();
    try {
      const res = await fetch(baseUrl + path, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: body ? JSON.stringify(body) : null
      });
      const latency = Math.round(performance.now() - start);
      const text = await res.text();
      let isPass = res.status === expectedStatus;
      
      // Specifically for auth test where we expect 401
      if (expectedStatus === 401 && res.status === 401) {
        isPass = true;
      }
      
      console.log(`[${isPass ? "PASS" : "FAIL"}] ${name} | ${method} ${path} | Status: ${res.status} (Expected: ${expectedStatus}) | Latency: ${latency}ms`);
      if (!isPass) console.log(`   Response: ${text.slice(0, 100)}...`);
      return { status: res.status, ok: res.ok, data: text ? JSON.parse(text) : null };
    } catch (e) {
      console.error(`[FAIL/BLOCKED] ${name} | ${method} ${path} | Error: ${e.message}`);
      return { status: 0, ok: false, data: null };
    }
  }

  await test("Readiness", "GET", "/api/readyz", {}, null, 200);
  await test("Health", "GET", "/api/healthz", {}, null, 200);
  await test("Missing Authentication", "POST", "/api/v1/cases", {}, { title: "Test" }, 401);
  
  const headers = { "X-Cashnet-Dev-Actor": "demo.admin" };
  await test("Invalid Request (Validation Error)", "POST", "/api/v1/cases", headers, { title: "" }, 400);

  const createRes = await test("Valid Request (Case Creation)", "POST", "/api/v1/cases", headers, { 
    caseNumber: `P010-${Date.now()}`,
    title: "P0.10 Test", 
    description: "API Testing", 
    fraudType: "SCAM", 
    reportedAmount: "100" 
  }, 200);

  if (createRes.ok && createRes.data && createRes.data.id) {
    const caseId = createRes.data.id;
    await test("Retrieval", "GET", `/api/v1/cases/${caseId}`, headers, null, 200);
  } else {
    console.log("[BLOCKED] Skipping retrieval test because case creation failed.");
  }
}

verifyP010().catch(console.error);
