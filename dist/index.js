"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.start = start;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const http_1 = __importDefault(require("http"));
const health_routes_1 = __importDefault(require("./app/routes/health.routes"));
const notify_routes_1 = __importDefault(require("./app/routes/notify.routes"));
const material_requests_routes_1 = __importDefault(require("./app/routes/material-requests.routes"));
const material_requests_query_routes_1 = __importDefault(require("./app/routes/material-requests.query.routes"));
const wsHub_1 = require("./app/ws/wsHub");
const env_1 = require("./core/env");
const simpleTablePoller_1 = require("./infra/pollers/simpleTablePoller");
async function start() {
    const app = (0, express_1.default)();
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    app.use(health_routes_1.default);
    app.use(notify_routes_1.default);
    app.use(material_requests_routes_1.default);
    app.use(material_requests_query_routes_1.default);
    const server = http_1.default.createServer(app);
    (0, wsHub_1.createWsServer)(server);
    // <-- Start poller tiap 1 menit (bisa override via env POLL_INTERVAL_MS)
    (0, simpleTablePoller_1.startExistingQueryPoller)(env_1.ENV.POLL_INTERVAL_MS);
    server.listen(env_1.ENV.PORT, env_1.ENV.HOST, () => {
        console.log(`HTTP on http://${env_1.ENV.HOST}:${env_1.ENV.PORT}`);
        console.log(`WSS  on ws://${env_1.ENV.HOST}:${env_1.ENV.PORT}/wh_sys/ws/doc`);
    });
}
