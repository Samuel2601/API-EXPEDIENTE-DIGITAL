import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TempFileService {
  constructor() {
    this.tempDir = path.join(process.cwd(), "temp", "downloads");
    this.cleanupInterval = 30 * 60 * 1000; // 30 minutos
    this.maxFileAge = 60 * 60 * 1000; // 1 hora
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      console.log(`📁 Directorio temporal de descargas: ${this.tempDir}`);

      // Iniciar limpieza periódica
      this.startCleanupInterval();
    } catch (error) {
      console.error(
        "❌ Error inicializando servicio de archivos temporales:",
        error
      );
    }
  }

  /**
   * Generar nombre único para archivo temporal
   */
  generateTempFileName(originalName, prefix = "download") {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString("hex");
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);

    return `${prefix}_${timestamp}_${random}_${baseName}${extension}`;
  }

  /**
   * Crear archivo temporal para descarga
   */
  async createTempFile(fileBuffer, originalName) {
    try {
      const tempFileName = this.generateTempFileName(originalName);
      const tempFilePath = path.join(this.tempDir, tempFileName);

      await fs.writeFile(tempFilePath, fileBuffer);

      console.log(`📄 Archivo temporal creado: ${tempFilePath}`);

      return {
        path: tempFilePath,
        name: tempFileName,
        createdAt: new Date(),
      };
    } catch (error) {
      console.error("❌ Error creando archivo temporal:", error);
      throw error;
    }
  }

  /**
   * Obtener archivo temporal
   */
  async getTempFile(tempFileName) {
    try {
      const tempFilePath = path.join(this.tempDir, tempFileName);
      await fs.access(tempFilePath);

      const buffer = await fs.readFile(tempFilePath);
      const stats = await fs.stat(tempFilePath);

      return {
        buffer,
        path: tempFilePath,
        size: stats.size,
        createdAt: stats.birthtime,
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Eliminar archivo temporal
   */
  async deleteTempFile(tempFileName) {
    try {
      const tempFilePath = path.join(this.tempDir, tempFileName);
      await fs.unlink(tempFilePath);
      console.log(`🗑️ Archivo temporal eliminado: ${tempFilePath}`);
      return true;
    } catch (error) {
      if (error.code === "ENOENT") {
        return false;
      }
      console.error("❌ Error eliminando archivo temporal:", error);
      throw error;
    }
  }

  /**
   * Limpiar archivos temporales antiguos
   */
  async cleanupOldFiles() {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        try {
          const stats = await fs.stat(filePath);
          const fileAge = now - stats.birthtime.getTime();

          if (fileAge > this.maxFileAge) {
            await fs.unlink(filePath);
            deletedCount++;
            console.log(`🧹 Eliminado archivo antiguo: ${file}`);
          }
        } catch (error) {
          console.warn(
            `⚠️ No se pudo procesar archivo ${file}:`,
            error.message
          );
        }
      }

      if (deletedCount > 0) {
        console.log(
          `🧹 Limpieza completada: ${deletedCount} archivos eliminados`
        );
      }

      return deletedCount;
    } catch (error) {
      console.error("❌ Error en limpieza de archivos temporales:", error);
      return 0;
    }
  }

  /**
   * Iniciar limpieza periódica
   */
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupOldFiles().catch(console.error);
    }, this.cleanupInterval);
  }

  /**
   * Obtener estadísticas del directorio temporal
   */
  async getTempDirStats() {
    try {
      const files = await fs.readdir(this.tempDir);
      let totalSize = 0;
      const fileDetails = [];

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        try {
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          fileDetails.push({
            name: file,
            size: stats.size,
            createdAt: stats.birthtime,
            age: Date.now() - stats.birthtime.getTime(),
          });
        } catch (error) {
          console.warn(
            `⚠️ No se pudo obtener stats de ${file}:`,
            error.message
          );
        }
      }

      return {
        totalFiles: files.length,
        totalSize,
        files: fileDetails,
      };
    } catch (error) {
      console.error(
        "❌ Error obteniendo estadísticas del directorio temporal:",
        error
      );
      throw error;
    }
  }
}

// Exportar instancia singleton
export const tempFileService = new TempFileService();
export default TempFileService;
