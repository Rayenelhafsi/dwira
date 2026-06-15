import fs from "fs/promises";
import path from "path";

const baseUrl = process.env.CHATBOT_DEBUG_BASE_URL || "http://127.0.0.1:8090";
const scenarioPath = process.env.CHATBOT_SCENARIO_FILE
  ? path.resolve(process.env.CHATBOT_SCENARIO_FILE)
  : path.resolve("Chatbot/backend/scripts/chatbot-scenarios.json");
const reportJsonPath = path.resolve("Chatbot/backend/tmp-chatbot-scenario-report.json");
const reportMdPath = path.resolve("Chatbot/backend/tmp-chatbot-scenario-report.md");
const filterId = String(process.env.CHATBOT_SCENARIO_ID || "").trim();
const filterIds = String(process.env.CHATBOT_SCENARIO_IDS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const tinyImageDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnSUs8AAAAASUVORK5CYII=";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(haystack, needles = []) {
  const text = normalizeText(haystack);
  return (Array.isArray(needles) ? needles : []).some((needle) => text.includes(normalizeText(needle)));
}

function includesNone(haystack, needles = []) {
  const text = normalizeText(haystack);
  return !(Array.isArray(needles) ? needles : []).some((needle) => text.includes(normalizeText(needle)));
}

async function getHealth() {
  try {
    const response = await fetch(`${baseUrl}/hybrid/health`);
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, ...(await response.json()) };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

async function postEvaluate({ platformUserId, message, attachments = [], reset = false }) {
  const response = await fetch(`${baseUrl}/debug/chat/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: "website", platformUserId, message, attachments, reset }),
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return data;
}

async function postDemandAction({ demandId, action, payload = {} }) {
  const response = await fetch(`${baseUrl}/debug/project/reservation-demand/${encodeURIComponent(demandId)}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return data;
}

async function getSession(platformUserId) {
  const response = await fetch(`${baseUrl}/debug/chat/session/website/${encodeURIComponent(platformUserId)}`);
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return data;
}

function evaluateExpectation(stepResult, expect = {}) {
  const issues = [];
  const reply = String(stepResult?.reply || stepResult?.lastBotMessage || "");
  const state = String(stepResult?.state || "");
  const responseMode = String(stepResult?.responseMode || "");
  const context = stepResult?.context || {};
  const demandStatus = String(stepResult?.demandStatus || "");

  if (Array.isArray(expect.replyContainsAny) && expect.replyContainsAny.length && !includesAny(reply, expect.replyContainsAny)) {
    issues.push(`reply missing any of: ${expect.replyContainsAny.join(" | ")}`);
  }
  if (Array.isArray(expect.replyNotContainsAny) && expect.replyNotContainsAny.length && !includesNone(reply, expect.replyNotContainsAny)) {
    issues.push(`reply contains forbidden text: ${expect.replyNotContainsAny.join(" | ")}`);
  }
  if (Array.isArray(expect.lastBotContainsAny) && expect.lastBotContainsAny.length && !includesAny(reply, expect.lastBotContainsAny)) {
    issues.push(`last bot message missing any of: ${expect.lastBotContainsAny.join(" | ")}`);
  }
  if (Array.isArray(expect.stateIn) && expect.stateIn.length && !expect.stateIn.includes(state)) {
    issues.push(`state ${state || "<empty>"} not in ${expect.stateIn.join(", ")}`);
  }
  if (Array.isArray(expect.responseModeIn) && expect.responseModeIn.length && !expect.responseModeIn.includes(responseMode)) {
    issues.push(`responseMode ${responseMode || "<empty>"} not in ${expect.responseModeIn.join(", ")}`);
  }
  if (typeof expect.contextStartDate === "string" && String(context?.startDate || "") !== expect.contextStartDate) {
    issues.push(`context.startDate expected ${expect.contextStartDate} got ${context?.startDate || "<empty>"}`);
  }
  if (typeof expect.contextEndDate === "string" && String(context?.endDate || "") !== expect.contextEndDate) {
    issues.push(`context.endDate expected ${expect.contextEndDate} got ${context?.endDate || "<empty>"}`);
  }
  if (typeof expect.contextSelectedRef === "string" && String(context?.selectedPropertyRef || "") !== expect.contextSelectedRef) {
    issues.push(`context.selectedPropertyRef expected ${expect.contextSelectedRef} got ${context?.selectedPropertyRef || "<empty>"}`);
  }
  if (typeof expect.contextLocationContains === "string" && !includesAny(String(context?.location || ""), [expect.contextLocationContains])) {
    issues.push(`context.location missing ${expect.contextLocationContains}`);
  }
  if (Array.isArray(expect.demandStatusIn) && expect.demandStatusIn.length && !expect.demandStatusIn.includes(demandStatus)) {
    issues.push(`demand status ${demandStatus || "<empty>"} not in ${expect.demandStatusIn.join(", ")}`);
  }
  return issues;
}

function buildStepSummary(stepResult) {
  return {
    reply: stepResult?.reply || stepResult?.lastBotMessage || "",
    state: stepResult?.state || "",
    responseMode: stepResult?.responseMode || "",
    context: stepResult?.context || null,
    demandStatus: stepResult?.demandStatus || "",
  };
}

async function runScenario(scenario) {
  const platformUserId = `scenario_${scenario.id}_${Date.now()}`;
  const executedSteps = [];
  let latest = null;
  let currentDemandId = "";

  for (let index = 0; index < scenario.steps.length; index += 1) {
    const step = scenario.steps[index];
    const stepLabel = `${scenario.id}#${index + 1}`;
    try {
      if (step.type === "user") {
        const attachments = (Array.isArray(step.attachments) ? step.attachments : []).map((attachment) => ({
          ...attachment,
          dataUrl: attachment.dataUrl === "__TEST_IMAGE_DATA_URL__" ? tinyImageDataUrl : attachment.dataUrl,
        }));
        const data = await postEvaluate({
          platformUserId,
          message: step.message,
          attachments,
          reset: index === 0,
        });
        currentDemandId = String(data?.reservationDemand?.id || data?.snapshot?.context?.reservationDemandId || currentDemandId || "").trim();
        latest = {
          reply: data?.result?.reply || "",
          state: data?.snapshot?.conversation?.state || "",
          responseMode: data?.result?.diagnostics?.responseMode || "",
          context: data?.snapshot?.context || null,
          demandStatus: String(data?.reservationDemand?.status || "").trim(),
          raw: data,
        };
      } else if (step.type === "action") {
        if (!currentDemandId) throw new Error("No reservation demand id available for action step");
        const actionData = await postDemandAction({ demandId: currentDemandId, action: step.action, payload: step.payload || {} });
        const session = await getSession(platformUserId);
        const messages = Array.isArray(session?.snapshot?.conversation?.messages) ? session.snapshot.conversation.messages : [];
        const lastBot = [...messages].reverse().find((item) => item?.senderType === "bot");
        currentDemandId = String(actionData?.demand?.id || currentDemandId || "").trim();
        latest = {
          lastBotMessage: String(lastBot?.content || ""),
          state: session?.snapshot?.conversation?.state || "",
          responseMode: "reservation_followup",
          context: session?.snapshot?.context || null,
          demandStatus: String(actionData?.demand?.status || "").trim(),
          raw: { actionData, session },
        };
      } else {
        throw new Error(`Unsupported step type: ${step.type}`);
      }

      const issues = evaluateExpectation(latest, step.expect || {});
      executedSteps.push({
        label: stepLabel,
        type: step.type,
        input: step.type === "user" ? step.message : step.action,
        ok: issues.length === 0,
        issues,
        summary: buildStepSummary(latest),
      });
    } catch (error) {
      executedSteps.push({
        label: stepLabel,
        type: step.type,
        input: step.type === "user" ? step.message : step.action,
        ok: false,
        issues: [String(error?.message || error)],
        summary: buildStepSummary(latest),
      });
      return {
        id: scenario.id,
        title: scenario.title,
        category: scenario.category,
        ok: false,
        hardFailure: true,
        executedSteps,
      };
    }
  }

  return {
    id: scenario.id,
    title: scenario.title,
    category: scenario.category,
    ok: executedSteps.every((step) => step.ok),
    hardFailure: false,
    executedSteps,
  };
}

function renderMarkdownReport(report) {
  const lines = [];
  lines.push(`# Chatbot scenario report`);
  lines.push("");
  lines.push(`- baseUrl: ${report.baseUrl}`);
  lines.push(`- executedAt: ${report.executedAt}`);
  lines.push(`- healthOk: ${report.health?.ok ? "yes" : "no"}`);
  if (report.health && report.health.ok === false) {
    lines.push(`- healthError: ${report.health?.qdrantError || report.health?.error || "n/a"}`);
  }
  lines.push(`- totalScenarios: ${report.summary.total}`);
  lines.push(`- passed: ${report.summary.passed}`);
  lines.push(`- failed: ${report.summary.failed}`);
  lines.push("");
  for (const scenario of report.results) {
    lines.push(`## ${scenario.id} - ${scenario.title}`);
    lines.push(`- category: ${scenario.category}`);
    lines.push(`- status: ${scenario.ok ? "PASS" : "FAIL"}`);
    for (const step of scenario.executedSteps) {
      lines.push(`- ${step.label} [${step.type}] ${step.ok ? "PASS" : "FAIL"}`);
      lines.push(`  - input: ${step.input}`);
      lines.push(`  - state: ${step.summary.state || "n/a"}`);
      lines.push(`  - responseMode: ${step.summary.responseMode || "n/a"}`);
      lines.push(`  - demandStatus: ${step.summary.demandStatus || "n/a"}`);
      if (step.issues.length) lines.push(`  - issues: ${step.issues.join(" ; ")}`);
      if (step.summary.reply) lines.push(`  - reply: ${String(step.summary.reply).replace(/\n/g, " ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function writeReportSnapshot(report) {
  await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(reportMdPath, renderMarkdownReport(report));
}

async function main() {
  const scenarioFile = JSON.parse(await fs.readFile(scenarioPath, "utf8"));
  const scenarios = (Array.isArray(scenarioFile) ? scenarioFile : []).filter((item) => {
    if (filterId) return item.id === filterId;
    if (filterIds.length) return filterIds.includes(item.id);
    return true;
  });
  if (!scenarios.length) {
    throw new Error(`No scenarios found${filterId ? ` for id ${filterId}` : ""}`);
  }

  const health = await getHealth();
  const report = {
    baseUrl,
    executedAt: new Date().toISOString(),
    scenarioPath,
    health,
    summary: {
      total: scenarios.length,
      passed: 0,
      failed: 0,
    },
    results: [],
  };
  await writeReportSnapshot(report);

  for (const scenario of scenarios) {
    const result = await runScenario(scenario);
    report.results.push(result);
    report.summary.passed = report.results.filter((item) => item.ok).length;
    report.summary.failed = report.results.filter((item) => !item.ok).length;
    await writeReportSnapshot(report);
    const status = result.ok ? "PASS" : "FAIL";
    console.log(`${status} ${scenario.id} - ${scenario.title}`);
    for (const step of result.executedSteps) {
      if (!step.ok) {
        console.log(`  -> ${step.label}: ${step.issues.join(" | ")}`);
      }
    }
  }
  console.log(`\nReport JSON: ${reportJsonPath}`);
  console.log(`Report MD:   ${reportMdPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
