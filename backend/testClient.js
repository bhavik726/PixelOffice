const SERVER_URL = process.env.SERVER_URL || 'ws://127.0.0.1:4000';
const ROOM_NAME = process.env.ROOM_NAME || 'pixel-office';
const ROOM_ID = process.env.ROOM_ID || '';
const CLIENT_NAME = process.env.CLIENT_NAME || `client-${Math.floor(Math.random() * 1000)}`;
const SEND_INTERVAL_MS = Number(process.env.SEND_INTERVAL_MS || 1000);
const CONNECT_RETRIES = Number(process.env.CONNECT_RETRIES || 10);
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 1200);
const STATE_SUMMARY_INTERVAL_MS = Number(process.env.STATE_SUMMARY_INTERVAL_MS || 5000);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(client) {
  let lastError;

  for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt += 1) {
    try {
      if (ROOM_ID) {
        return await client.joinById(ROOM_ID);
      }
      return await client.joinOrCreate(ROOM_NAME);
    } catch (error) {
      lastError = error;
      console.warn(
        `⚠️ [${CLIENT_NAME}] connect attempt ${attempt}/${CONNECT_RETRIES} failed. Retrying in ${RETRY_DELAY_MS}ms...`,
      );
      await wait(RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

async function run() {
  try {
    const { Client } = await import('colyseus.js');
    const client = new Client(SERVER_URL);
    const room = await connectWithRetry(client);
    const roomId = room.roomId;
    const joinStrategy = ROOM_ID ? 'joinById' : 'joinOrCreate';
    console.log(
      `✅ [${CLIENT_NAME}] joined room (${joinStrategy})`,
      room.name,
      'id=',
      roomId,
      'session=',
      room.sessionId,
    );

    let lastPlayersCount = -1;
    let firstStateLogged = false;

    room.onStateChange((state) => {
      const players = state.players
        ? typeof state.players.size === 'number'
          ? state.players.size
          : Object.keys(state.players).length
        : 0;

      if (!firstStateLogged) {
        firstStateLogged = true;
        console.log(`📡 [${CLIENT_NAME}] initial state | players=${players}`);
      }

      if (players !== lastPlayersCount) {
        lastPlayersCount = players;
        console.log(`📡 [${CLIENT_NAME}] state summary | players=${players}`);
      }
    });

    setInterval(() => {
      if (lastPlayersCount >= 0) {
        console.log(`📊 [${CLIENT_NAME}] heartbeat | players=${lastPlayersCount}`);
      }
    }, STATE_SUMMARY_INTERVAL_MS);

    room.onMessage('*', (type, payload) => {
      console.log(`📩 [${CLIENT_NAME}] message type=${String(type)}`, payload);
    });

    if (ROOM_NAME === 'pixel-office') {
      setInterval(() => {
        room.send('move', {
          x: Math.floor(Math.random() * 500),
          y: Math.floor(Math.random() * 500),
        });
      }, SEND_INTERVAL_MS);
    }

    if (ROOM_NAME === 'lobby') {
      setInterval(() => {
        room.send('chat', { text: `hello from ${CLIENT_NAME}` });
      }, SEND_INTERVAL_MS * 2);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ [${CLIENT_NAME}] connection failed: ${message}`);
    process.exit(1);
  }
}

run();
