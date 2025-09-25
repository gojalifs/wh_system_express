"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// app/routes/health.routes.ts
const express_1 = require("express");
const r = (0, express_1.Router)();
r.get('/health', (_req, res) => res.json({ ok: true }));
exports.default = r;
