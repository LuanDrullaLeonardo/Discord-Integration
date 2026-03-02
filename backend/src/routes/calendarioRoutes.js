const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const { getCalendarioMes } = require("../controllers/calendarioController");

router.get("/:ano/:mes", authMiddleware, getCalendarioMes);

module.exports = router;
