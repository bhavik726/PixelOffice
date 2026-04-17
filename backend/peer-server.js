const { PeerServer } = require('peer');

const port = Number(process.env.PORT) || 9000;
const host = process.env.HOST || '0.0.0.0';

PeerServer({
  port,
  host,
  path: '/peerjs',
});

console.log(`PeerJS server running on ${host}:${port}`);
