// src/routes/index.js
import express from "express";
import departmentRoutes from "./department.routes.js";
import modulePermissionRoutes from "./module-permission.routes.js";
import fileRoutes from "./file.routes.js";
import contractRoutes from "./contract.routes.js";
import contractConfigurationRoutes from "./contract-configuration.routes.js";
const router = express.Router();

// Rutas del módulo de expediente digital - departamentos
router.use("/departments", departmentRoutes);
router.use("/permissions", modulePermissionRoutes);
router.use("/files", fileRoutes);
router.use("/contracts", contractRoutes);
router.use("/contracts/configuration", contractConfigurationRoutes);

export default router;
