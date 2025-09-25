"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const material_requests_query_controller_1 = require("../controllers/material-requests.query.controller");
const r = (0, express_1.Router)();
r.get('/material-requests', material_requests_query_controller_1.getMaterialRequests);
exports.default = r;
