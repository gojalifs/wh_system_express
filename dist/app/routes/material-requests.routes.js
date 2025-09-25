"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// app/routes/material-requests.routes.ts
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const material_requests_controller_1 = require("../controllers/material-requests.controller");
const r = (0, express_1.Router)();
r.post('/material-requests/invalidate', auth_1.auth, material_requests_controller_1.postMRInvalidate);
r.post('/material-requests/delta', auth_1.auth, material_requests_controller_1.postMRDelta);
exports.default = r;
