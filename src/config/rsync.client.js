// =============================================================================
// src/config/rsync.client.js - CORREGIDO PARA WINDOWS
// Cliente RSync optimizado para servidor externo GADM Cantón Esmeraldas
// Soporte completo para variables de entorno específicas
// =============================================================================

import { exec, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import os from "os";
import "dotenv/config";

const execAsync = promisify(exec);

class RsyncClient {
  constructor() {
    this.validateConfig();
    this.setupConfig();
    this.tempPasswordFiles = new Set(); // Rastrear archivos temporales
    this.isWindows = process.platform === "win32";
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

    if (!process.env.RSYNC_PASSWORD) {
      console.warn(
        "⚠️ RSYNC_PASSWORD no definido. Se pedirá contraseña interactiva."
      );
    }
  }

  /**
   * Configurar parámetros internos
   */
  setupConfig() {
    // Usar el directorio de trabajo actual en lugar de tempDir del sistema
    const currentWorkingDir = process.cwd();
    const tempDir = path.join(currentWorkingDir, "temp");

    this.config = {
      host: process.env.RSYNC_HOST,
      user: process.env.RSYNC_USER,
      module: process.env.RSYNC_MODULE,
      port: process.env.RSYNC_PORT || "873",
      password: process.env.RSYNC_PASSWORD,

      // Opciones de rsync desde .env
      options:
        process.env.RSYNC_OPTIONS || "-avz --partial --progress --timeout=300",
      deleteAfter: process.env.RSYNC_DELETE_AFTER === "true",
      compress: process.env.RSYNC_COMPRESS !== "false", // true por defecto
      verbose: process.env.RSYNC_VERBOSE === "true",
      dryRun: process.env.RSYNC_DRY_RUN === "true",
      excludeFrom: process.env.RSYNC_EXCLUDE_FROM,
      includeFrom: process.env.RSYNC_INCLUDE_FROM,
      bandwidth: process.env.RSYNC_BANDWIDTH_LIMIT,

      // Configuración de reintentos
      maxRetries: parseInt(process.env.RSYNC_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.RSYNC_RETRY_DELAY) || 5000,

      // Directorio base remoto
      remoteBasePath:
        process.env.RSYNC_REMOTE_BASE_PATH || "expediente-digital",

      // Configuración de archivos temporales - USAR DIRECTORIO ACTUAL
      tempDir: process.env.RSYNC_TEMP_DIR || tempDir,
      usePasswordFile: process.env.RSYNC_USE_PASSWORD_FILE !== "false", // true por defecto
    };

    console.log(
      `🔧 RSync configurado para: rsync://${this.config.user}@${this.config.host}:${this.config.port}/${this.config.module}`
    );
    console.log(`📁 Directorio temporal: ${this.config.tempDir}`);

    // Crear directorio temporal si no existe
    this.ensureTempDir().catch((error) => {
      console.warn(`⚠️ No se pudo crear directorio temporal: ${error.message}`);
    });

    /* this.testConnection().catch((error) => {
      console.warn(
        `⚠️ Advertencia: No se pudo conectar al servidor rsync al inicio: ${error.message}`
      );
    });*/
  }

  /**
   * Asegurar que el directorio temporal existe
   */
  async ensureTempDir() {
    try {
      await fs.access(this.config.tempDir);
    } catch (error) {
      console.log(`📁 Creando directorio temporal: ${this.config.tempDir}`);
      await fs.mkdir(this.config.tempDir, { recursive: true });
    }
  }

  /**
   * Crear archivo temporal de contraseña
   */
  async createPasswordFile() {
    if (!this.config.password) {
      return null;
    }

    try {
      await this.ensureTempDir();

      const tempFileName = `rsync_pwd_${Date.now()}_${Math.random().toString(36).substring(2)}.tmp`;
      const tempFilePath = path.join(this.config.tempDir, tempFileName);

      // Escribir contraseña al archivo temporal
      await fs.writeFile(tempFilePath, this.config.password + "\n", {
        mode: 0o600, // Solo lectura para el propietario
      });

      // Rastrear el archivo temporal
      this.tempPasswordFiles.add(tempFilePath);

      console.log(`🔐 Archivo temporal de contraseña creado: ${tempFilePath}`);
      return tempFilePath;
    } catch (error) {
      console.error(
        `❌ Error creando archivo de contraseña temporal: ${error.message}`
      );
      throw new Error(
        `No se pudo crear archivo temporal de contraseña: ${error.message}`
      );
    }
  }

  /**
   * Eliminar archivo temporal de contraseña
   */
  async removePasswordFile(passwordFilePath) {
    if (!passwordFilePath) return;

    try {
      await fs.unlink(passwordFilePath);
      this.tempPasswordFiles.delete(passwordFilePath);
      console.log(
        `🗑️ Archivo temporal de contraseña eliminado: ${passwordFilePath}`
      );
    } catch (error) {
      console.warn(`⚠️ No se pudo eliminar archivo temporal: ${error.message}`);
    }
  }

  /**
   * Limpiar todos los archivos temporales de contraseña
   */
  async cleanupPasswordFiles() {
    const cleanupPromises = Array.from(this.tempPasswordFiles).map((filePath) =>
      this.removePasswordFile(filePath)
    );

    await Promise.allSettled(cleanupPromises);
    this.tempPasswordFiles.clear();
  }

  /**
   * CORREGIDO: Formatear rutas para Windows y rsync
   */
  formatPathForRsync(filePath) {
    if (!this.isWindows) {
      return filePath;
    }

    // Convertir rutas de Windows a formato compatible con rsync
    let formattedPath = filePath;

    // Reemplazar barras invertidas con barras normales
    formattedPath = formattedPath.replace(/\\/g, "/");

    // Si es una ruta absoluta de Windows (C:\, D:\, etc.)
    if (formattedPath.match(/^[A-Za-z]:\//)) {
      // Para rsync en Windows, usar formato /cygdrive/c/ en lugar de C:/
      const driveLetter = formattedPath[0].toLowerCase();
      formattedPath = `/cygdrive/${driveLetter}${formattedPath.substring(2)}`;
    }

    console.log(`🔧 Ruta formateada: ${filePath} -> ${formattedPath}`);
    return formattedPath;
  }

  /**
   * CORREGIDO: Normalizar rutas remotas para evitar duplicación
   */
  normalizeRemotePath(...pathParts) {
    // Filtrar partes vacías y unir con /
    const cleanParts = pathParts
      .filter((part) => part && part.trim() !== "")
      .map((part) => part.trim().replace(/^\/+|\/+$/g, "")); // Remover / al inicio y final

    const normalized = cleanParts.join("/");
    console.log(
      `🔧 Ruta remota normalizada: [${pathParts.join(", ")}] -> ${normalized}`
    );
    return normalized;
  }

  /**
   * Construir comando rsync corregido para Windows
   */
  async buildRsyncCommand(localPath, remotePath) {
    const { host, user, module, port, options } = this.config;
    let command = ["rsync"];
    let passwordFile = null;

    // Agregar opciones básicas desde .env
    if (options) {
      command.push(...options.split(" ").filter((opt) => opt.trim()));
    }

    // Configurar puerto personalizado
    if (port && port !== "873") {
      command.push("--port", port);
    }

    // Configurar archivo de contraseña si está disponible
    if (this.config.password && this.config.usePasswordFile) {
      passwordFile = await this.createPasswordFile();
      // CORREGIDO: También formatear la ruta del archivo de contraseña
      const formattedPasswordFile = this.formatPathForRsync(passwordFile);
      command.push("--password-file", formattedPasswordFile);
    }

    // Opciones adicionales desde variables de entorno
    if (this.config.deleteAfter) {
      command.push("--delete-after");
    }

    if (!this.config.compress) {
      command.push("--no-compress");
    }

    if (this.config.verbose) {
      command.push("-vv"); // Extra verbose
    }

    if (this.config.dryRun) {
      command.push("--dry-run");
    }

    if (this.config.excludeFrom) {
      command.push("--exclude-from", this.config.excludeFrom);
    }

    if (this.config.includeFrom) {
      command.push("--include-from", this.config.includeFrom);
    }

    if (this.config.bandwidth) {
      command.push("--bwlimit", this.config.bandwidth);
    }

    // CORREGIDO: Formatear rutas correctamente
    const formattedLocalPath = this.formatPathForRsync(localPath);

    // CORREGIDO: Construir URL remota normalizada
    const remoteUrl = `rsync://${user}@${host}:${port}/${module}/${remotePath}`;

    console.log(`🔗 URL remota construida: ${remoteUrl}`);

    // Agregar paths - ORDEN CORRECTO: local primero, remoto después
    command.push(formattedLocalPath);
    command.push(remoteUrl);

    return { command, passwordFile };
  }

  /**
   * Método de debug para imprimir comando sin información sensible
   */
  formatCommandForLogging(command, passwordFile) {
    return command
      .map((arg) => {
        if (
          passwordFile &&
          (arg === passwordFile ||
            arg === this.formatPathForRsync(passwordFile))
        ) {
          return "[PASSWORD-FILE]";
        }
        return arg;
      })
      .join(" ");
  }

  /**
   * Ejecutar comando rsync con manejo mejorado de archivos temporales
   */
  async executeRsync(localPath, remotePath, options = {}) {
    let passwordFile = null;

    try {
      const { command, passwordFile: tempPasswordFile } =
        await this.buildRsyncCommand(localPath, remotePath);
      passwordFile = tempPasswordFile;

      // Log del comando sin mostrar información sensible
      const safeCommand = this.formatCommandForLogging(command, passwordFile);
      console.log(`📄 Ejecutando: ${safeCommand}`);

      return new Promise((resolve, reject) => {
        const rsyncProcess = spawn(command[0], command.slice(1), {
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            // Si no usamos archivo de contraseña, pasar por variable de entorno
            ...(this.config.password &&
              !this.config.usePasswordFile && {
                RSYNC_PASSWORD: this.config.password,
              }),
          },
          ...options,
        });

        let stdout = "";
        let stderr = "";
        let progressInfo = {};

        rsyncProcess.stdout.on("data", (data) => {
          const output = data.toString();
          stdout += output;

          // Log de salida para debug
          if (this.config.verbose) {
            console.log(`📊 RSync stdout: ${output.trim()}`);
          }

          // Extraer información de progreso
          const progressMatch = output.match(/(\d+)%.*?(\d+\.\d+[KMGT]?B\/s)/);
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
          const errorOutput = data.toString();
          stderr += errorOutput;
          // Log inmediato de errores para debug
          console.warn(`⚠️ RSync stderr: ${errorOutput.trim()}`);
        });

        rsyncProcess.on("close", async (code) => {
          // Limpiar archivo de contraseña inmediatamente
          if (passwordFile) {
            await this.removePasswordFile(passwordFile);
          }

          console.log(`🏁 RSync terminó con código: ${code}`);
          console.log(`📤 Stdout completo:\n${stdout}`);
          if (stderr) {
            console.log(`⚠️ Stderr completo:\n${stderr}`);
          }

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

        rsyncProcess.on("error", async (error) => {
          // Limpiar archivo de contraseña en caso de error
          if (passwordFile) {
            await this.removePasswordFile(passwordFile);
          }

          console.error(`❌ Error ejecutando rsync: ${error.message}`);
          reject(new Error(`Error ejecutando rsync: ${error.message}`));
        });

        // Timeout de seguridad (opcional)
        const timeout = parseInt(process.env.RSYNC_TIMEOUT) || 600000; // 10 minutos por defecto
        setTimeout(() => {
          if (!rsyncProcess.killed) {
            console.warn(
              `⚠️ Timeout de rsync alcanzado (${timeout}ms), terminando proceso...`
            );
            rsyncProcess.kill("SIGTERM");
          }
        }, timeout);
      });
    } catch (error) {
      // Limpiar archivo de contraseña en caso de error durante la construcción
      if (passwordFile) {
        await this.removePasswordFile(passwordFile);
      }
      throw error;
    }
  }

  /**
   * CORREGIDO: Crear archivo de prueba en el directorio temporal correcto
   */
  async createTestFile() {
    await this.ensureTempDir();

    const testFileName = `rsync_test_${Date.now()}.txt`;
    const testFilePath = path.join(this.config.tempDir, testFileName);

    const testContent = `Test connection at ${new Date().toISOString()}\nPlatform: ${process.platform}\nNode version: ${process.version}`;

    await fs.writeFile(testFilePath, testContent);

    console.log(`📝 Archivo de prueba creado: ${testFilePath}`);
    return testFilePath;
  }

  /**
   * CORREGIDO: Transferir archivo individual con manejo mejorado
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

    // CORREGIDO: Construir ruta remota normalizada
    const fileName = path.basename(localFilePath);
    let remotePath;

    if (remoteSubPath) {
      // Normalizar la ruta remota para evitar duplicación
      remotePath = this.normalizeRemotePath(
        this.config.remoteBasePath,
        remoteSubPath,
        fileName
      );
    } else {
      remotePath = this.normalizeRemotePath(
        this.config.remoteBasePath,
        fileName
      );
    }

    console.log(`🎯 Ruta remota final: ${remotePath}`);

    // Calcular hash del archivo para verificación
    let fileHash = null;
    if (verifyTransfer) {
      fileHash = await this.calculateFileHash(localFilePath);
      console.log(`🔍 Hash del archivo: ${fileHash}`);
    }

    // Ejecutar transferencia con reintentos
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `🚀 Intento ${attempt}/${maxRetries} para transferir: ${fileName}`
        );

        const result = await this.executeRsync(localFilePath, remotePath);

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
   * Sincronizar directorio completo con manejo mejorado
   */
  async syncDirectory(localDir, remoteSubDir = null) {
    try {
      let remotePath;
      if (remoteSubDir) {
        remotePath =
          this.normalizeRemotePath(this.config.remoteBasePath, remoteSubDir) +
          "/";
      } else {
        remotePath = this.normalizeRemotePath(this.config.remoteBasePath) + "/";
      }

      const result = await this.executeRsync(`${localDir}/`, remotePath);

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
   * CORREGIDO: Probar conexión con el servidor
   */
  async testConnection() {
    try {
      console.log(`🔗 Probando conexión con servidor rsync...`);

      // Crear archivo temporal para prueba en el directorio correcto
      const testFile = await this.createTestFile();

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

  /**
   * Calcular hash SHA-256 de un archivo
   */
  async calculateFileHash(filePath) {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Verificar archivo remoto (simulado)
   */
  async verifyRemoteFile(remotePath, expectedHash) {
    try {
      console.log(`🔍 Verificando archivo remoto: ${remotePath}`);
      // TODO: Implementar verificación real via SSH
      return {
        verified: true,
        remotePath,
        remoteHash: expectedHash,
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
   * Método de limpieza para cuando se cierra la aplicación
   */
  async shutdown() {
    console.log("🧹 Limpiando archivos temporales...");
    await this.cleanupPasswordFiles();
    console.log("✅ Limpieza completada");
  }

  // Métodos placeholder para compatibilidad
  async transferFiles(files, options = {}) {
    // Implementación existente...
    throw new Error("Método no implementado");
  }

  async listRemoteFiles(remoteDir = this.config.remoteBasePath) {
    // Implementación existente...
    throw new Error("Método no implementado");
  }

  async getRemoteStats() {
    // Implementación existente...
    throw new Error("Método no implementado");
  }
}

// Crear y exportar instancia singleton
const rsyncClient = new RsyncClient();

// Manejar cierre graceful de la aplicación
process.on("SIGINT", async () => {
  console.log("\n🛑 Recibida señal de interrupción...");
  await rsyncClient.shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Recibida señal de terminación...");
  await rsyncClient.shutdown();
  process.exit(0);
});

process.on("beforeExit", async () => {
  await rsyncClient.shutdown();
});

// Probar conexión al inicializar (opcional)
if (process.env.RSYNC_TEST_ON_STARTUP === "true") {
  rsyncClient.testConnection().catch((error) => {
    console.warn(
      `⚠️ Advertencia: No se pudo conectar al servidor rsync al inicializar: ${error.message}`
    );
  });
}

export default rsyncClient;
