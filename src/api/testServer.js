"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var app = (0, express_1.default)();
var port = 3001;
app.use(express_1.default.json());
function testHandler(req, res) {
    res.status(200).json({ message: 'Test server running' });
}
app.get('/test', testHandler);
app.listen(port, function () {
    console.log("Test server listening on port ".concat(port));
});
