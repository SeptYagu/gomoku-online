import assert from "node:assert/strict";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

async function main(): Promise<void> {
  const baseUrl = normalizeBaseUrl(process.argv[2] ?? DEFAULT_BASE_URL);
  console.log(`Feedback smoke test against: ${baseUrl}`);

  // Test 1: Submit valid feedback
  const validRes = await fetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Smoke test feedback message",
      email: "smoke-tester@example.com",
      locale: "en"
    })
  });

  assert.equal(validRes.status, 201, `Expected 201 Created but received ${validRes.status}`);
  const validData = await validRes.json();
  assert.equal(validData.ok, true, "Expected ok to be true");
  assert.ok(typeof validData.feedbackId === "string" && validData.feedbackId.startsWith("fb_"), "Expected feedbackId");
  assert.ok(typeof validData.receivedAt === "string", "Expected receivedAt timestamp");
  console.log(`PASS valid feedback submission - ${validData.feedbackId} at ${validData.receivedAt}`);

  // Test 2: Reject empty message
  const emptyRes = await fetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "   ",
      email: "smoke-tester@example.com"
    })
  });
  assert.equal(emptyRes.status, 400, `Expected 400 for empty message, got ${emptyRes.status}`);
  console.log("PASS reject empty message");

  // Test 3: Reject invalid email
  const badEmailRes = await fetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Valid message",
      email: "invalid-email-without-at"
    })
  });
  assert.equal(badEmailRes.status, 400, `Expected 400 for invalid email, got ${badEmailRes.status}`);
  console.log("PASS reject invalid email format");

  // Test 4: Reject non-POST method
  const getRes = await fetch(`${baseUrl}/api/feedback`, {
    method: "GET"
  });
  assert.equal(getRes.status, 405, `Expected 405 Method Not Allowed, got ${getRes.status}`);
  console.log("PASS reject GET method (405)");

  console.log("All feedback smoke tests passed successfully!");
}

main().catch((err) => {
  console.error("FAIL Feedback smoke test failed:", err);
  process.exit(1);
});
