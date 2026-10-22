import { WebSocketServer, WebSocket } from 'ws';
const clientsByUser = new Map();
const allClients = new Set();
function addClient(userId, ws) {
    if (!clientsByUser.has(userId))
        clientsByUser.set(userId, new Set());
    clientsByUser.get(userId).add(ws);
    ws.__userId = userId;
}
function removeClient(ws) {
    allClients.delete(ws);
    const userId = ws.__userId;
    if (userId && clientsByUser.has(userId)) {
        const set = clientsByUser.get(userId);
        set.delete(ws);
        if (set.size === 0)
            clientsByUser.delete(userId);
    }
}
export function createWsServer(server) {
    const wss = new WebSocketServer({ server, path: '/wh_sys/ws/doc' });
    wss.on('connection', (ws) => {
        ws.isAlive = true;
        ws.on('pong', function heartbeat() {
            this.isAlive = true;
        });
        allClients.add(ws);
        ws.on('message', (buf) => {
            try {
                const msg = JSON.parse(buf.toString());
                if (msg.type === 'subscribe' && msg.userId) {
                    addClient(msg.userId, ws);
                    ws.send(JSON.stringify({
                        type: 'subscribed',
                        userId: msg.userId,
                        ts: Date.now(),
                    }));
                }
                else if (msg.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
                }
            }
            catch {
                /* ignore bad json */
            }
        });
        ws.on('close', () => removeClient(ws));
        ws.on('error', () => removeClient(ws));
    });
    // keepalive
    const interval = setInterval(() => {
        wss.clients.forEach((socket) => {
            const ws = socket;
            if (ws.isAlive === false) {
                ws.terminate();
                return;
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, 30_000);
    wss.on('close', () => clearInterval(interval));
    return wss;
}
export function sendToAudience(aud, payload) {
    let sent = 0;
    if (aud.mode === 'broadcast') {
        for (const ws of allClients) {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify(payload));
                    sent++;
                }
                catch { }
            }
        }
        return sent;
    }
    const setUserIds = new Set(aud.userIds);
    for (const uid of setUserIds) {
        const targets = clientsByUser.get(uid);
        if (!targets)
            continue;
        for (const ws of targets) {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify(payload));
                    sent++;
                }
                catch { }
            }
        }
    }
    return sent;
}
