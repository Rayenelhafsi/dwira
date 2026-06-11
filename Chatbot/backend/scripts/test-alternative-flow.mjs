const baseUrl = process.env.CHATBOT_DEBUG_BASE_URL || "http://127.0.0.1:8090";

async function postEvaluate(payload) {
  const response = await fetch(`${baseUrl}/debug/chat/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function printCase(title, data) {
  const reply = String(data?.result?.reply || "").trim();
  const exactCount = Number(data?.result?.diagnostics?.exactCount || 0);
  const alternativeCount = Number(data?.result?.diagnostics?.alternativeCount || 0);
  console.log(`\n=== ${title} ===`);
  console.log(`reply: ${reply}`);
  console.log(`exactCount: ${exactCount}`);
  console.log(`alternativeCount: ${alternativeCount}`);
}

async function main() {
  const sessionId = `alt_flow_${Date.now()}`;

  const first = await postEvaluate({
    platform: "website",
    platformUserId: sessionId,
    reset: true,
    message: "nheb appartement s+2 fi kelibia men 2026-07-03 au 2026-07-05, 4 personnes, piscine privee",
  });
  printCase("Initial Alternative Search", first);

  const second = await postEvaluate({
    platform: "website",
    platformUserId: sessionId,
    message: "chnw e5er",
  });
  printCase("Follow-up More Options", second);

  const third = await postEvaluate({
    platform: "website",
    platformUserId: `alt_flow_beach_${Date.now()}`,
    reset: true,
    message: "nheb appartement s+2 pied dans l eau b piscine privee fi kelibia men 2027-08-17 au 2027-08-24, 4 personnes",
  });
  printCase("Beachfront Alternative Search", third);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
