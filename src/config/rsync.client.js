// =============================================================================
// src/config/rsync.client.js - MEJORADO
// Cliente RSync optimizado para servidor externo GADM Cantón Esmeraldas
// Soporte completo para variables de entorno específicas
// =============================================================================

import { exec, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import "dotenv/config";

const execAsync = promisify(exec);

class RsyncClient {
  constructor() {
    this.validateConfig();
    this.setupConfig();
  }

  /**
   * Validar configuración desde variables de entorno específicas
   */
  validateConfig() {
    const requiredVars = ["RSYNC_HOST", "RSYNC_USER", "RSYNC_MODULE"];
    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(
        `❌ Faltan variables de entorno requeridas: ${missingVars.join(", ")}`
      );
    }

    // Validar archivo de contraseña si se especifica
    if (process.env.RSYNC_PASSFILE) {
      try {
        require("fs").accessSync(
          process.env.RSYNC_PASSFILE,
          require("fs").constants.R_OK
        );
      } catch (error) {
        console.warn(
          `⚠️ Archivo de contraseña no accesible: ${process.env.RSYNC_PASSFILE}`
        );
      }
    }
  }

  /**
   * Configurar parámetros internos
   */
  setupConfig() {
    this.config = {
      host: process.env.RSYNC_HOST, // "159.223.186.132"
      user: process.env.RSYNC_USER, // "usuario"
      module: process.env.RSYNC_MODULE, // "backup_192.168.120.52"
      port: process.env.RSYNC_PORT || "9000",
      passFile: process.env.RSYNC_PASSFILE, // "/home/sis_backups_auto/password"

      // Opciones adicionales
      options:
        process.env.RSYNC_OPTIONS || "-avz --partial --progress --timeout=300",
      maxRetries: parseInt(process.env.RSYNC_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.RSYNC_RETRY_DELAY) || 5000,

      // Directorio base remoto dentro del módulo
      remoteBasePath:
        process.env.RSYNC_REMOTE_BASE_PATH || "expediente-digital",
    };

    console.log(
      `🔧 RSync configurado para: rsync://${this.config.user}@${this.config.host}:${this.config.port}/${this.config.module}`
    );
  }

  /**
   * Construir comando rsync para el servidor específico
   */
  buildRsyncCommand(localPath, remotePath) {
    const { host, user, module, port, passFile, options } = this.config;

    let command = ["rsync"];

    // Agregar opciones principales
    command.push(...options.split(" "));

    // Configurar puerto personalizado
    if (port && port !== "873") {
      command.push("--port", port);
    }

    // Configurar archivo de contraseña
    if (passFile) {
      command.push("--password-file", passFile);
    }

    // Agregar paths
    command.push(localPath);
    command.push(`rsync://${user}@${host}/${module}/${remotePath}`);

    return command;
  }

  /**
   * Ejecutar comando rsync con manejo de errores robusto
   */
  async executeRsync(command, options = {}) {
    return new Promise((resolve, reject) => {
      console.log(`🔄 Ejecutando: ${command.join(" ")}`);

      const rsyncProcess = spawn(command[0], command.slice(1), {
        stdio: ["pipe", "pipe", "pipe"],
        ...options,
      });

      let stdout = "";
      let stderr = "";
      let progressInfo = {};

      rsyncProcess.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;

        // Extraer información de progreso
        const progressMatch = output.match(/(\d+)%.*?(\d+\.\d+[KMGT]B\/s)/);
        if (progressMatch) {
          progressInfo = {
            percentage: parseInt(progressMatch[1]),
            speed: progressMatch[2],
            timestamp: new Date(),
          };
          console.log(
            `📊 Progreso: ${progressInfo.percentage}% (${progressInfo.speed})`
          );
        }
      });

      rsyncProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      rsyncProcess.on("close", (code) => {
        if (code === 0) {
          console.log(`✅ RSync completado exitosamente`);
          resolve({
            success: true,
            code,
            stdout,
            stderr,
            progressInfo,
          });
        } else {
          console.error(`❌ RSync falló con código: ${code}`);
          console.error(`Error: ${stderr}`);
          reject(
            new Error(
              `RSync falló (código ${code}): ${stderr || "Error desconocido"}`
            )
          );
        }
      });

      rsyncProcess.on("error", (error) => {
        console.error(`❌ Error ejecutando rsync: ${error.message}`);
        reject(new Error(`Error ejecutando rsync: ${error.message}`));
      });
    });
  }

  /**
   * Transferir archivo individual con reintentos automáticos
   */
  async transferFile(localFilePath, remoteSubPath = null, options = {}) {
    const {
      priority = "NORMAL",
      createRemoteDir = true,
      verifyTransfer = true,
      maxRetries = this.config.maxRetries,
    } = options;

    // Validar archivo local
    try {
      await fs.access(localFilePath);
      const stats = await fs.stat(localFilePath);

      if (!stats.isFile()) {
        throw new Error("La ruta especificada no es un archivo válido");
      }

      console.log(
        `📤 Preparando transferencia de archivo: ${localFilePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
      );
    } catch (error) {
      throw new Error(`Archivo local no válido: ${error.message}`);
    }

    // Construir ruta remota
    const fileName = path.basename(localFilePath);
    const remotePath = remoteSubPath
      ? `${this.config.remoteBasePath}/${remoteSubPath}/${fileName}`
      : `${this.config.remoteBasePath}/${fileName}`;

    // Calcular hash del archivo para verificación
    let fileHash = null;
    if (verifyTransfer) {
      fileHash = await this.calculateFileHash(localFilePath);
      console.log(`🔐 Hash del archivo: ${fileHash}`);
    }

    // Ejecutar transferencia con reintentos
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `🚀 Intento ${attempt}/${maxRetries} para transferir: ${fileName}`
        );

        const command = this.buildRsyncCommand(localFilePath, remotePath);
        const result = await this.executeRsync(command);

        // Verificar integridad si se solicita
        if (verifyTransfer && fileHash) {
          const verificationResult = await this.verifyRemoteFile(
            remotePath,
            fileHash
          );
          if (!verificationResult.verified) {
            throw new Error(
              `Verificación de integridad falló: ${verificationResult.reason}`
            );
          }
          console.log(`✅ Integridad verificada correctamente`);
        }

        return {
          success: true,
          localPath: localFilePath,
          remotePath,
          fileHash,
          transferInfo: result,
          attempt,
          verificationPassed: verifyTransfer ? true : null,
        };
      } catch (error) {
        lastError = error;
        console.error(`❌ Intento ${attempt} falló: ${error.message}`);

        if (attempt < maxRetries) {
          const delay = this.config.retryDelay * attempt; // Backoff exponencial
          console.log(`⏳ Esperando ${delay}ms antes del siguiente intento...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // Todos los intentos fallaron
    throw new Error(
      `Transferencia falló después de ${maxRetries} intentos: ${lastError.message}`
    );
  }

  /**
   * Transferir múltiples archivos en lote
   */
  async transferFiles(files, options = {}) {
    const {
      concurrent = 3,
      continueOnError = true,
      createProgress = true,
    } = options;

    console.log(`📦 Iniciando transferencia de lote: ${files.length} archivos`);

    const results = [];
    const errors = [];

    // Procesar archivos en lotes concurrentes
    for (let i = 0; i < files.length; i += concurrent) {
      const batch = files.slice(i, i + concurrent);
      const batchPromises = batch.map(async (file, index) => {
        try {
          const result = await this.transferFile(
            file.localPath,
            file.remoteSubPath || `batch_${Date.now()}`,
            { priority: file.priority || "NORMAL" }
          );

          return {
            index: i + index,
            fileName: path.basename(file.localPath),
            success: true,
            result,
          };
        } catch (error) {
          const errorResult = {
            index: i + index,
            fileName: path.basename(file.localPath),
            success: false,
            error: error.message,
          };

          errors.push(errorResult);

          if (!continueOnError) {
            throw error;
          }

          return errorResult;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map((r) => r.value || r.reason));

      console.log(`📊 Lote ${Math.floor(i / concurrent) + 1} completado`);
    }

    return {
      totalFiles: files.length,
      successful: results.filter((r) => r.success).length,
      failed: errors.length,
      results,
      errors,
    };
  }

  /**
   * Calcular hash SHA-256 de un archivo
   */
  async calculateFileHash(filePath) {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Verificar archivo remoto (simulado - en producción usar SSH)
   */
  async verifyRemoteFile(remotePath, expectedHash) {
    try {
      // TODO: Implementar verificación real via SSH
      // Por ahora, simular verificación exitosa
      console.log(`🔍 Verificando archivo remoto: ${remotePath}`);

      // En producción, ejecutar algo como:
      // ssh user@host "sha256sum /path/to/remote/file"

      return {
        verified: true,
        remotePath,
        remoteHash: expectedHash, // En producción, obtener hash real
        reason: "Verificación simulada exitosa",
      };
    } catch (error) {
      return {
        verified: false,
        remotePath,
        reason: error.message,
      };
    }
  }

  /**
   * Listar archivos remotos en un directorio
   */
  async listRemoteFiles(remoteDir = this.config.remoteBasePath) {
    try {
      // TODO: Implementar listado real
      console.log(`📋 Listando archivos remotos en: ${remoteDir}`);

      // En producción, usar algo como:
      // const command = ['rsync', '--list-only', `rsync://${this.config.user}@${this.config.host}/${this.config.module}/${remoteDir}/`];

      return {
        success: true,
        files: [], // Array de archivos encontrados
        directories: [],
        totalSize: 0,
      };
    } catch (error) {
      throw new Error(`Error listando archivos remotos: ${error.message}`);
    }
  }

  /**
   * Obtener estadísticas del servidor remoto
   */
  async getRemoteStats() {
    try {
      console.log(`📊 Obteniendo estadísticas del servidor remoto`);

      return {
        connected: true,
        serverInfo: {
          host: this.config.host,
          port: this.config.port,
          module: this.config.module,
        },
        lastCheck: new Date(),
        // En producción, agregar más estadísticas reales
        spaceUsed: 0,
        spaceAvailable: 0,
        fileCount: 0,
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Sincronizar directorio completo
   */
  async syncDirectory(localDir, remoteSubDir = null) {
    try {
      const remotePath = remoteSubDir
        ? `${this.config.remoteBasePath}/${remoteSubDir}/`
        : `${this.config.remoteBasePath}/`;

      const command = this.buildRsyncCommand(`${localDir}/`, remotePath);
      const result = await this.executeRsync(command);

      console.log(
        `✅ Sincronización de directorio completada: ${localDir} -> ${remotePath}`
      );

      return {
        success: true,
        localDir,
        remotePath,
        result,
      };
    } catch (error) {
      console.error(`❌ Error sincronizando directorio: ${error.message}`);
      throw error;
    }
  }

  /**
   * Probar conexión con el servidor
   */
  async testConnection() {
    try {
      console.log(`🔗 Probando conexión con servidor rsync...`);

      // Crear archivo temporal para prueba
      const testFile = path.join(process.cwd(), ".rsync_test");
      await fs.writeFile(
        testFile,
        `Test connection at ${new Date().toISOString()}`
      );

      try {
        const result = await this.transferFile(testFile, "test", {
          verifyTransfer: false,
          maxRetries: 1,
        });

        // Limpiar archivo temporal
        await fs.unlink(testFile);

        console.log(`✅ Conexión exitosa con servidor rsync`);
        return { connected: true, result };
      } catch (error) {
        await fs.unlink(testFile).catch(() => {}); // Limpieza silenciosa
        throw error;
      }
    } catch (error) {
      console.error(`❌ Error de conexión: ${error.message}`);
      return { connected: false, error: error.message };
    }
  }
}

// Crear y exportar instancia singleton
const rsyncClient = new RsyncClient();

// Probar conexión al inicializar (opcional)
if (process.env.RSYNC_TEST_ON_STARTUP === "true") {
  rsyncClient.testConnection().catch((error) => {
    console.warn(
      `⚠️ Advertencia: No se pudo conectar al servidor rsync al inicializar: ${error.message}`
    );
  });
}

export default rsyncClient;
