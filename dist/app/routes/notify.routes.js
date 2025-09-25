"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// app/routes/notify.routes.ts
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const notify_controller_1 = require("../controllers/notify.controller");
const r = (0, express_1.Router)();
r.post('/notify', auth_1.auth, notify_controller_1.postNotify);
exports.default = r;
