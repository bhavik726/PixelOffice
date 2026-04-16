export const CONNECT_RADIUS = 120;
export const DISCONNECT_RADIUS = 140;
export const PROXIMITY_RADIUS = CONNECT_RADIUS;
export const PROXIMITY_POLL_INTERVAL = 200;
export const PEER_CONFIG = { host: '0.peerjs.com', port: 443, secure: true };
export const ICE_SERVERS = [
	{ urls: 'stun:stun.l.google.com:19302' },
	{
		urls: 'turn:openrelay.metered.ca:80',
		username: 'openrelayproject',
		credential: 'openrelayproject',
	},
];