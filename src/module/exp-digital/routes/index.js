// src/routes/index.js
import express from "express";
import departmentRoutes from "./department.routes.js";
import modulePermissionRoutes from "./module-permission.routes.js";
const router = express.Router();

// ... otras rutas

// Rutas del módulo de expediente digital - departamentos
router.use("/departments", departmentRoutes);
router.use("/permissions", modulePermissionRoutes);

// ... más rutas

export default router;
