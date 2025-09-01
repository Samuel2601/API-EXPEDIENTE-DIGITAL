// =============================================================================
// app.js - Aplicación Principal
// Sistema de Expediente Digital - GADM Cantón Esmeraldas
// =============================================================================

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Configuraciones
config();

// Configuraciones del sistema
import "./src/config/database.mongo.js";
import "./src/config/rsync.client.js";
import autoBanSystem from "./src/security/auto-ban.system.js";

// Rutas principales
import expDigitalRoutes from "./src/module/exp-digital/routes/index.routes.js";

// Middlewares de autenticación y permisos
import { auth, verifyModuleAccess } from "./src/middlewares/auth.js";

// Utilidades
import { setupRouteMapper } from "./utils/routeMapper.js";

// =============================================================================
// CONFIGURACIÓN INICIAL
// =============================================================================

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

// Obtener ruta del directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// MIDDLEWARES DE SEGURIDAD
// =============================================================================

// Helmet para headers de seguridad
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Compresión gzip
app.use(compression());

// Rate Limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // límite de requests por ventana
  message: {
    error: "Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", limiter);

// Sistema de auto-ban
app.use(autoBanSystem);

// =============================================================================
// CONFIGURACIÓN DE CORS
// =============================================================================

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir todas las solicitudes ya que usamos autenticación basada en token
    callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Cache-Control",
    "Pragma",
    "Expires",
    "X-API-Key",
    "X-Client-ID",
    "X-Request-ID",
    "X-Forwarded-For",
    "X-Real-IP",
    "User-Agent",
  ],
  exposedHeaders: [
    "X-Total-Count",
    "X-Total-Pages",
    "X-Current-Page",
    "X-Rate-Limit-Limit",
    "X-Rate-Limit-Remaining",
    "X-Rate-Limit-Reset",
  ],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// =============================================================================
// MIDDLEWARES BÁSICOS
// =============================================================================

// Parseo de JSON y URL encoded
app.use(
  express.json({
    limit: process.env.MAX_FILE_SIZE || "50mb",
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf);
      } catch (e) {
        res.status(400).json({
          success: false,
          error: "JSON inválido en el cuerpo de la solicitud",
          code: "INVALID_JSON",
        });
        return;
      }
    },
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: process.env.MAX_FILE_SIZE || "50mb",
  })
);

// Archivos estáticos
app.use("/uploads", express.static(join(__dirname, "uploads")));
app.use("/public", express.static(join(__dirname, "public")));

// =============================================================================
// MIDDLEWARE DE LOGS Y MONITORING
// =============================================================================

// Logger personalizado para desarrollo
if (NODE_ENV === "development") {
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.url;
    const ip = req.ip || req.connection.remoteAddress;

    console.log(`[${timestamp}] ${method} ${url} - ${ip}`);

    // Capturar tiempo de respuesta
    const startTime = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - startTime;
      const status = res.statusCode;
      const statusColor =
        status >= 400 ? "\x1b[31m" : status >= 300 ? "\x1b[33m" : "\x1b[32m";

      console.log(
        `[${timestamp}] ${method} ${url} - ${statusColor}${status}\x1b[0m - ${duration}ms`
      );
    });

    next();
  });
}

// =============================================================================
// RUTAS PRINCIPALES
// =============================================================================

// Ruta de health check
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Sistema de Expediente Digital - GADM Cantón Esmeraldas",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

// Ruta de health check para monitoreo
app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
  });
});

// API Status endpoint
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    api: "Expediente Digital API",
    version: "1.0.0",
    status: "operational",
    endpoints: {
      expedienteDigital: "/api/exp-digital",
      departments: "/api/exp-digital/departments",
      contracts: "/api/exp-digital/contracts",
      files: "/api/exp-digital/files",
      permissions: "/api/exp-digital/permissions",
    },
    documentation: "/api/docs",
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// RUTAS DEL MÓDULO DE EXPEDIENTE DIGITAL
// =============================================================================

// Aplicar rutas del módulo con prefijo
app.use("/api/exp-digital", expDigitalRoutes);

// =============================================================================
// MANEJO DE ERRORES
// =============================================================================

// Middleware para rutas no encontradas
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint no encontrado",
    message: `La ruta ${req.method} ${req.originalUrl} no existe`,
    code: "ROUTE_NOT_FOUND",
    timestamp: new Date().toISOString(),
  });
});

// Middleware global de manejo de errores
app.use((error, req, res, next) => {
  console.error("Error no capturado:", error);

  // Error de validación de Mongoose
  if (error.name === "ValidationError") {
    const errors = Object.values(error.errors).map((err) => ({
      field: err.path,
      message: err.message,
    }));

    return res.status(400).json({
      success: false,
      error: "Error de validación",
      details: errors,
      code: "VALIDATION_ERROR",
    });
  }

  // Error de casting de MongoDB
  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,
      error: "ID inválido",
      message: `El ID ${error.value} no es válido`,
      code: "INVALID_ID",
    });
  }

  // Error de duplicado de MongoDB
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(400).json({
      success: false,
      error: "Dato duplicado",
      message: `El valor para el campo '${field}' ya existe`,
      code: "DUPLICATE_KEY",
    });
  }

  // Error de JWT
  if (error.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      error: "Token inválido",
      code: "INVALID_TOKEN",
    });
  }

  // Error de token expirado
  if (error.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      error: "Token expirado",
      code: "TOKEN_EXPIRED",
    });
  }

  // Error de sintaxis JSON
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({
      success: false,
      error: "JSON mal formado",
      message: "El cuerpo de la solicitud contiene JSON inválido",
      code: "MALFORMED_JSON",
    });
  }

  // Error genérico del servidor
  res.status(error.status || 500).json({
    success: false,
    error:
      NODE_ENV === "production" ? "Error interno del servidor" : error.message,
    code: error.code || "INTERNAL_SERVER_ERROR",
    ...(NODE_ENV === "development" && { stack: error.stack }),
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// INICIALIZACIÓN DEL SERVIDOR
// =============================================================================

// Manejo de shutdown graceful
const gracefulShutdown = (signal) => {
  console.log(`\n🔄 Recibida señal ${signal}, cerrando servidor...`);

  server.close((err) => {
    if (err) {
      console.error("❌ Error al cerrar el servidor:", err);
      process.exit(1);
    }

    console.log("✅ Servidor cerrado correctamente");
    process.exit(0);
  });

  // Forzar cierre si no se cierra en 10 segundos
  setTimeout(() => {
    console.log("⏰ Forzando cierre del servidor");
    process.exit(1);
  }, 10000);
};

// Manejo de señales del sistema
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Manejo de excepciones no capturadas
process.on("uncaughtException", (error) => {
  console.error("💥 Excepción no capturada:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "💥 Promise rechazada no manejada en:",
    promise,
    "razón:",
    reason
  );
  process.exit(1);
});

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log("\n🚀 ===============================================");
  console.log(`📱 Sistema de Expediente Digital - GADM Esmeraldas`);
  console.log(`🌐 Servidor ejecutándose en puerto: ${PORT}`);
  console.log(`📋 Entorno: ${NODE_ENV}`);
  console.log(`⏰ Iniciado: ${new Date().toISOString()}`);
  console.log("🚀 ===============================================\n");

  // Mapear rutas en desarrollo
  if (NODE_ENV === "development") {
    setupRouteMapper(app);
  }
});

export default app;
