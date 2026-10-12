// The wire for online play: one WebRTC data channel between two browsers, found
// through PeerJS's free public broker by a short room code. Loaded only when
// someone picks "Play online"; couch play never touches the network.
const PEERJS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'sweety-love-';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O: easy to read out loud

let peer = null, conn = null;
let handlers = {};

export function newCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return c;
}
export const CODE_LETTERS = LETTERS;

function loadPeerJs() {
  if (window.Peer) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PEERJS; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('could not load the online library (are you offline?)'));
    document.head.appendChild(s);
  });
}

function wire(c) {
  conn = c;
  c.on('open', () => handlers.onOpen && handlers.onOpen());
  c.on('data', (d) => handlers.onData && handlers.onData(d));
  c.on('close', () => handlers.onClose && handlers.onClose('Your partner left.'));
  c.on('error', (e) => handlers.onError && handlers.onError(String(e && e.message || e)));
}

// Host: register the room code and wait for the partner.
export async function host(code, h) {
  handlers = h;
  await loadPeerJs();
  leave(true);
  peer = new window.Peer(PREFIX + code, { debug: 0 });
  peer.on('open', () => handlers.onWaiting && handlers.onWaiting());
  peer.on('connection', (c) => {
    if (conn && conn.open) { c.close(); return; }   // a third visitor is turned away
    wire(c);
  });
  peer.on('error', (e) => handlers.onError && handlers.onError(e.type === 'unavailable-id' ? 'That room code is taken. Try again.' : String(e.message || e.type)));
  peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* closing */ } });
}

// Guest: connect to the host's room code.
export async function join(code, h) {
  handlers = h;
  await loadPeerJs();
  leave(true);
  peer = new window.Peer({ debug: 0 });
  peer.on('open', () => wire(peer.connect(PREFIX + code, { reliable: true, serialization: 'json' })));
  peer.on('error', (e) => handlers.onError && handlers.onError(e.type === 'peer-unavailable' ? `No game found with code ${code}.` : String(e.message || e.type)));
}

export function send(msg) {
  try { if (conn && conn.open) conn.send(msg); } catch { /* a closed channel is reported by onClose */ }
}

export const connected = () => !!(conn && conn.open);

export function leave(quiet = false) {
  const h = handlers;
  if (quiet) handlers = { ...h, onClose: null };
  try { if (conn) conn.close(); } catch { /* already closed */ }
  try { if (peer) peer.destroy(); } catch { /* already gone */ }
  conn = null; peer = null;
  if (quiet) handlers = h;
}
