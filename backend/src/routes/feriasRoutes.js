const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const feriasController = require("../controllers/feriasController");

router.get("/", authMiddleware, feriasController.listarFerias);
router.post("/", authMiddleware, feriasController.solicitarFerias);
router.patch("/:id/status", authMiddleware, feriasController.atualizarStatusFerias);
router.delete("/:id", authMiddleware, feriasController.deletarFerias);

module.exports = router;
