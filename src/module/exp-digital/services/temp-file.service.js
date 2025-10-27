import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * Servicio de gestión de archivos temporales con caché inteligente
 * Características:
 * - TTL configurable (default: 5 minutos)
 * - Limpieza automática de archivos expirados
 * - Sistema de locks para evitar descargas simultáneas
 * - Verificación de integridad con checksums
 */
class TempFileService {
  constructor() {
    this.TEMP_DIR = path.join(process.cwd(), "temp", "downloads");
    this.DEFAULT_TTL = 5 * 60 * 1000; // 5 minutos en ms
    this.CLEANUP_INTERVAL = 2 * 60 * 1000; // Limpiar cada 2 minutos

    // Mapa de metadatos de archivos en caché
    this.cacheMetadata = new Map();

    // Sistema de locks para descargas en progreso
    this.downloadLocks = new Map();

    this.initialize();
  }

  /**
   * Inicializar servicio
   */
  async initialize() {
    try {
      await fs.mkdir(this.TEMP_DIR, { recursive: true });
      console.log(
        `✅ TempFileService: Directorio temporal inicializado: ${this.TEMP_DIR}`
      );

      // Iniciar limpieza automática
      this.startAutoCleanup();

      // Cargar archivos existentes en memoria
      await this.loadExistingCache();
    } catch (error) {
      console.error("❌ Error inicializando TempFileService:", error);
    }
  }

  /**
   * Cargar archivos existentes en el caché
   */
  async loadExistingCache() {
    try {
      const files = await fs.readdir(this.TEMP_DIR);

      for (const file of files) {
        const filePath = path.join(this.TEMP_DIR, file);
        const stats = await fs.stat(filePath);

        // Extraer fileId del nombre del archivo temporal
        const match = file.match(/cache_([a-f0-9]+)_/);
        if (match) {
          const fileId = match[1];
          const expiresAt = stats.mtimeMs + this.DEFAULT_TTL;

          this.cacheMetadata.set(fileId, {
            path: filePath,
            size: stats.size,
            createdAt: stats.mtimeMs,
            expiresAt: expiresAt,
            lastAccessed: stats.mtimeMs,
            hits: 0,
          });
        }
      }

      console.log(
        `📦 TempFileService: ${this.cacheMetadata.size} archivos cargados en caché`
      );
    } catch (error) {
      console.error("❌ Error cargando caché existente:", error);
    }
  }

  /**
   * Generar clave única para el archivo
   */
  generateCacheKey(fileId, version = undefined) {
    const key = version ? `${fileId}_${version}` : fileId;
    return crypto.createHash("md5").update(key).digest("hex");
  }

  /**
   * Verificar si un archivo está en caché y es válido
   */
  async isCached(fileId, version = undefined) {
    const cacheKey = this.generateCacheKey(fileId, version);
    const metadata = this.cacheMetadata.get(cacheKey);

    if (!metadata) {
      console.log(`📭 Cache MISS: ${fileId}`);
      return { cached: false };
    }

    // Verificar si expiró
    if (Date.now() > metadata.expiresAt) {
      console.log(`⏱️ Cache EXPIRED: ${fileId}`);
      await this.removeFromCache(cacheKey);
      return { cached: false };
    }

    // Verificar si el archivo existe físicamente
    try {
      await fs.access(metadata.path);

      // Actualizar última vez accedido y extender TTL
      metadata.lastAccessed = Date.now();
      metadata.expiresAt = Date.now() + this.DEFAULT_TTL;
      metadata.hits++;

      console.log(`✅ Cache HIT: ${fileId} (hits: ${metadata.hits})`);
      return {
        cached: true,
        path: metadata.path,
        metadata,
      };
    } catch (error) {
      console.log(`❌ Cache INVALID: ${fileId} - archivo no existe`);
      await this.removeFromCache(cacheKey);
      return { cached: false };
    }
  }

  /**
   * Guardar archivo en caché
   */
  async saveToCache(fileId, tempFilePath, version = undefined) {
    try {
      const cacheKey = this.generateCacheKey(fileId, version);

      // Generar nombre único para el archivo en caché
      const timestamp = Date.now();
      const randomId = crypto.randomBytes(4).toString("hex");
      const cacheFileName = `download_${timestamp}_${randomId}_cache_${cacheKey}_${version || "undefined"}`;
      const cachePath = path.join(this.TEMP_DIR, cacheFileName);

      // Copiar archivo temporal a caché
      await fs.copyFile(tempFilePath, cachePath);

      const stats = await fs.stat(cachePath);
      const now = Date.now();

      // ✅ La metadata se guarda AQUÍ directamente en el Map
      this.cacheMetadata.set(cacheKey, {
        path: cachePath,
        size: stats.size,
        createdAt: now,
        expiresAt: now + this.DEFAULT_TTL,
        lastAccessed: now,
        hits: 0,
        fileId,
        version,
      });

      console.log(
        `💾 Archivo guardado en caché: ${fileId} (TTL: ${this.DEFAULT_TTL / 1000}s)`
      );
      return cachePath;
    } catch (error) {
      console.error(`❌ Error guardando en caché: ${fileId}`, error);
      throw error;
    }
  }

  /**
   * Eliminar archivo del caché
   */
  async removeFromCache(cacheKey) {
    const metadata = this.cacheMetadata.get(cacheKey);
    if (!metadata) return;

    try {
      await fs.unlink(metadata.path);
      this.cacheMetadata.delete(cacheKey);
      console.log(`🗑️ Archivo eliminado del caché: ${metadata.fileId}`);
    } catch (error) {
      // Si el archivo no existe, solo remover de metadata
      this.cacheMetadata.delete(cacheKey);
    }
  }

  /**
   * Sistema de locks para evitar descargas simultáneas
   */
  async acquireLock(fileId, version = undefined) {
    const lockKey = this.generateCacheKey(fileId, version);

    // Si ya existe un lock, esperar
    if (this.downloadLocks.has(lockKey)) {
      console.log(`🔒 Esperando lock para: ${fileId}`);
      return await this.waitForLock(lockKey);
    }

    // Crear nuevo lock con Promise
    const lockPromise = {};
    lockPromise.promise = new Promise((resolve, reject) => {
      lockPromise.resolve = resolve;
      lockPromise.reject = reject;
    });

    this.downloadLocks.set(lockKey, lockPromise);
    console.log(`🔓 Lock adquirido para: ${fileId}`);

    return { acquired: true, lockKey };
  }

  /**
   * Esperar a que se libere un lock
   */
  async waitForLock(lockKey) {
    const lock = this.downloadLocks.get(lockKey);
    if (!lock) return { acquired: true, lockKey };

    try {
      // Esperar máximo 30 segundos
      await Promise.race([
        lock.promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Lock timeout")), 30000)
        ),
      ]);

      return { acquired: false, fromCache: true };
    } catch (error) {
      console.error(`❌ Error esperando lock: ${lockKey}`, error);
      return { acquired: true, lockKey };
    }
  }

  /**
   * Liberar lock y notificar a otros esperando
   */
  releaseLock(lockKey, cachePath = null) {
    const lock = this.downloadLocks.get(lockKey);
    if (!lock) return;

    if (cachePath) {
      lock.resolve(cachePath);
    } else {
      lock.reject(new Error("Download failed"));
    }

    this.downloadLocks.delete(lockKey);
    console.log(`🔓 Lock liberado: ${lockKey}`);
  }

  /**
   * Limpiar archivos expirados
   */
  async cleanExpiredFiles() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [cacheKey, metadata] of this.cacheMetadata.entries()) {
      if (now > metadata.expiresAt) {
        await this.removeFromCache(cacheKey);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(
        `🧹 Limpieza automática: ${cleanedCount} archivos eliminados`
      );
    }

    return cleanedCount;
  }

  /**
   * Iniciar limpieza automática periódica
   */
  startAutoCleanup() {
    setInterval(async () => {
      try {
        await this.cleanExpiredFiles();
      } catch (error) {
        console.error("❌ Error en limpieza automática:", error);
      }
    }, this.CLEANUP_INTERVAL);

    console.log(
      `🔄 Limpieza automática iniciada (cada ${this.CLEANUP_INTERVAL / 1000}s)`
    );
  }

  /**
   * Obtener estadísticas del caché
   */
  getStats() {
    const stats = {
      totalFiles: this.cacheMetadata.size,
      activeLocks: this.downloadLocks.size,
      totalSize: 0,
      topHits: [],
    };

    const filesArray = Array.from(this.cacheMetadata.values());

    stats.totalSize = filesArray.reduce((sum, meta) => sum + meta.size, 0);

    stats.topHits = filesArray
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5)
      .map((meta) => ({
        fileId: meta.fileId,
        hits: meta.hits,
        size: meta.size,
      }));

    return stats;
  }

  /**
   * Limpiar todo el caché (usar con precaución)
   */
  async clearAll() {
    console.log("🗑️ Limpiando todo el caché...");

    for (const cacheKey of this.cacheMetadata.keys()) {
      await this.removeFromCache(cacheKey);
    }

    console.log("✅ Caché completamente limpiado");
  }
}

// Exportar instancia singleton
export const tempFileService = new TempFileService();
export default TempFileService;
