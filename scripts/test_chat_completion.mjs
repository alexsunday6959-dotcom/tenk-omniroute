async function test() {
  const apiKey = "sk-tenk-pro-c702025e6b3b9b4a6c4508503030b61f";
  console.log("=== Testing OmniRoute Chat Completion ===");
  console.log("Using API Key:", apiKey);

  // 1. Check Turso Balance before
  const tursoUrl = "https://tenkstore-db-alexsunday.turso.io/v2/pipeline";
  const tursoToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTM0MjU5MzQsImlkIjoiMDFhMTkwODMtYWUwMS03YmI5LWI0NTktZTFiNmQyOTgzZTAwIiwia2lkIjoid3VyYnZyTGZrdHNUV3lUS3k0S3N0QlpobUJoZmlIUUlmeXpkWUtJdTBJVSIsInJpZCI6IjRkMDMzMGUxLWYxZDEtNGM1Ny1hYWEwLWE4OWFhN2Q4YzJkNiJ9.E4MqXkPv4nw8Jv2LxuhxrX9LOEhjyLng3kXcORnu7FhP4CeK6XzzOLSB4WFuBH0iAJOthgP3SXOMbNIaEo4mCA";

  async function getBalance() {
    const resp = await fetch(tursoUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${tursoToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql: "SELECT username, balance, pro_balance, total_spent FROM users WHERE pro_api_key = ?", args: [{ type: "text", value: apiKey }] } },
          { type: "close" }
        ]
      })
    });
    const d = await resp.json();
    return d.results[0].response.result.rows[0];
  }

  const before = await getBalance();
  console.log("User before request:", {
    username: before[0].value,
    balance: before[1].value,
    pro_balance: before[2].value,
    total_spent: before[3].value
  });

  // 2. Send Chat Completion to OmniRoute
  console.log("\nSending request to OmniRoute http://127.0.0.1:20128/v1/chat/completions...");
  const t0 = Date.now();
  const res = await fetch("http://127.0.0.1:20128/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openrouter/liquid/lfm-3-1.7b:free",
      messages: [{ role: "user", content: "Reply with exactly: 'TENK-OMNIROUTE-SUCCESS'" }],
      temperature: 0.1
    })
  });

  const latency = Date.now() - t0;
  console.log(`HTTP Status: ${res.status} (latency: ${latency}ms)`);

  const data = await res.json();
  if (data.choices && data.choices[0]) {
    console.log("AI Response:", data.choices[0].message.content);
    console.log("Usage tokens reported:", data.usage);
  } else {
    console.log("Response body:", JSON.stringify(data, null, 2));
  }

  // 3. Wait 2 seconds for async deduction and check balance after
  await new Promise(r => setTimeout(r, 2000));
  const after = await getBalance();
  console.log("\nUser after request in Turso DB:", {
    username: after[0].value,
    balance: after[1].value,
    pro_balance: after[2].value,
    total_spent: after[3].value
  });
}

test().catch(console.error);
