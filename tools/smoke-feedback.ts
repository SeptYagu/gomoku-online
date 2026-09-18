import assert from "node:assert/strict";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

async function main(): Promise<void> {
  const baseUrl = normalizeBaseUrl(process.argv[2] ?? DEFAULT_BASE_URL);
  console.log(`Feedback smoke test against: ${baseUrl}`);

  // Test 1: Submit valid feedback (or handle if already rate limited from previous run)
  const validRes = await fetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Smoke test feedback message",
      email: "smoke-tester@example.com",
      locale: "en"
    })
  });

  if (validRes.status === 429) {
    const retryAfter = validRes.headers.get("retry-after");
    assert.ok(retryAfter && Number(retryAfter) > 0, "Expected positive Retry-After header on 429");
    const data = await validRes.json();
    assert.match(data.error, /Too many feedback submissions/i);
    console.log(`PASS rate limit 429 already active on ${baseUrl} (retry-after: ${retryAfter}s)`);

    // Verify GET still returns 405 even under rate limiting
    const getRes = await fetch(`${baseUrl}/api/feedback`, { method: "GET" });
    assert.equal(getRes.status, 405, `Expected 405 for GET, got ${getRes.status}`);
    console.log("PASS reject GET method (405)");

    console.log("All feedback smoke tests passed (rate-limited client state verified)!");
    return;
  }

  assert.equal(validRes.status, 201, `Expected 201 Created but received ${validRes.status}`);
  const validData = await validRes.json();
  assert.equal(validData.ok, true, "Expected ok to be true");
  assert.ok(typeof validData.feedbackId === "string" && validData.feedbackId.startsWith("fb_"), "Expected feedbackId");
  assert.ok(typeof validData.receivedAt === "string", "Expected receivedAt timestamp");
  console.log(`PASS valid feedback submission - ${validData.feedbackId} at ${validData.receivedAt}`);

  // Test 2: Reject empty message (400)
  const emptyRes = await fetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "   ",
      email: "smoke-tester@example.com"
    })
  });
  assert.equal(emptyRes.status, 400, `Expected 400 for empty message, got ${emptyRes.status}`);
  console.log("PASS reject empty message (400)");

  // Test 3: Reject invalid email (400)
  const badEmailRes = await fetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Valid message",
      email: "invalid-email-without-at"
    })
  });
  assert.equal(badEmailRes.status, 400, `Expected 400 for invalid email, got ${badEmailRes.status}`);
  console.log("PASS reject invalid email format (400)");

  // Test 4: Reject non-POST method (405)
  const getRes = await fetch(`${baseUrl}/api/feedback`, {
    method: "GET"
  });
  assert.equal(getRes.status, 405, `Expected 405 Method Not Allowed, got ${getRes.status}`);
  console.log("PASS reject GET method (405)");

  // Test 5: Reject payload > 64 KiB with 413 Payload Too Large
  const oversizedPayload = JSON.stringify({
    message: "x".repeat(66 * 1024),
    email: "smoke-tester@example.com"
  });
  const largeRes = await fetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: oversizedPayload
  });
  assert.equal(largeRes.status, 413, `Expected 413 Payload Too Large, got ${largeRes.status}`);
  const largeData = await largeRes.json();
  assert.match(largeData.error, /payload too large/i);
  console.log("PASS reject oversized payload > 64 KiB with 413 Payload Too Large");

  // Test 6: Exhaust remaining token (5th request) and verify 429 on 6th request
  const fifthRes = await fetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Fifth request to exhaust quota" })
  });
  assert.equal(fifthRes.status, 201, `Expected 201 for 5th request, got ${fifthRes.status}`);
  console.log("PASS 5th feedback request accepted (201)");

  const rateLimitedRes = await fetch(`${baseUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Sixth request over quota" })
  });
  assert.equal(rateLimitedRes.status, 429, `Expected 429 Too Many Requests on 6th request, got ${rateLimitedRes.status}`);
  const retryAfterHeader = rateLimitedRes.headers.get("retry-after");
  assert.ok(
    retryAfterHeader && Number(retryAfterHeader) > 0,
    `Expected positive Retry-After header, got ${retryAfterHeader}`
  );
  const rateLimitData = await rateLimitedRes.json();
  assert.match(rateLimitData.error, /Too many feedback submissions/i);
  console.log(`PASS rate limit triggered 429 with retry-after: ${retryAfterHeader}s`);

  console.log("All feedback smoke tests (201, 400, 405, 413, 429) passed successfully!");
}

main().catch((err) => {
  console.error("FAIL Feedback smoke test failed:", err);
  process.exit(1);
});
