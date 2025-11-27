// Simple ESP32 simulator for Aeroduel
// Requires Node.js 18+ (for built-in fetch)

const BASE_URL = 'http://aeroduel.local:45045';

function logSection(title) {
  console.log('\n========================================');
  console.log(title);
  console.log('========================================');
}

async function postJson(path, body) {
  const url = `${BASE_URL}${path}`;
  logSection(`POST ${url}`);
  console.log('Request body:');
  console.dir(body, { depth: null });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  console.log(`\nResponse status: ${res.status}`);
  console.log('Response body:');
  console.dir(json, { depth: null });

  return { res, json };
}

async function getJson(path) {
  const url = `${BASE_URL}${path}`;
  logSection(`GET ${url}`);

  const res = await fetch(url);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  console.log(`\nResponse status: ${res.status}`);
  console.log('Response body:');
  console.dir(json, { depth: null });

  return { res, json };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  // Fallback simple ID
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

async function main() {
  console.log('Starting Aeroduel ESP32 simulation...\n');

  // Simulated plane + (optionally) user
  const planeId = generateId('plane');
  const userId = null; // ESP32 usually won't know this
  const esp32Ip = '192.168.1.101'; // whatever IP your ESP32 would have

  // 1) POST /api/register – simulate ESP32 coming online
  const registerBody = {
    planeId,
    esp32Ip,
    userId,
  };

  const { json: registerJson } = await postJson('/api/register', registerBody);

  const authToken = registerJson && registerJson.authToken;
  const matchId = registerJson && registerJson.matchId;

  if (!authToken) {
    console.warn(
      '\nNo authToken returned from /api/register. ' +
        'Subsequent ESP32-only endpoints may fail.'
    );
  } else {
    console.log(`\nReceived authToken: ${authToken}`);
    console.log(`Match ID (if any): ${matchId}`);
  }

  // 2) GET /api/planes – see what planes are online and whether we have a match
  await sleep(500);
  const { json: planesJson } = await getJson('/api/planes');

  // Try to find a target plane (any plane that is not this one)
  let targetId = null;

  // NEW: handle { planes: [...] } shape
  const planesList = Array.isArray(planesJson)
    ? planesJson
    : Array.isArray(planesJson?.planes)
    ? planesJson.planes
    : null;

  if (planesList) {
    const otherPlane = planesList.find((p) => p.planeId && p.planeId !== planeId);
    if (otherPlane) {
      targetId = otherPlane.planeId;
      console.log(`\nSelected targetId from /api/planes: ${targetId}`);
    } else {
      console.log(
        '\nNo other planes found; will attempt a self-hit to exercise /api/hit handling.'
      );
      targetId = planeId; // may be rejected by server; that’s fine for simulation
    }
  } else {
    console.log(
      '\n/api/planes response not in expected format; ' +
        'will attempt a self-hit using our own planeId.'
    );
    targetId = planeId;
  }

  // 3) POST /api/hit – simulate a hit during the match (ESP32-only endpoint)
  // This will only succeed if:
  //   - authToken is valid
  //   - planeId + targetId are in the same active match, etc.
  if (authToken && targetId) {
    await sleep(500);

    const timestamp = new Date().toISOString();
    const hitBody = {
      authToken,
      planeId,
      targetId,
      timestamp,
    };

    await postJson('/api/hit', hitBody);
  } else {
    console.log(
      '\nSkipping /api/hit because we do not have both authToken and targetId.'
    );
  }

  console.log('\nSimulation finished.\n');
}

main().catch((err) => {
  console.error('\nSimulation failed with error:');
  console.error(err);
  process.exit(1);
});
