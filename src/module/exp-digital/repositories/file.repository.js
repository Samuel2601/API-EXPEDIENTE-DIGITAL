// =============================================================================
// src/module/exp-digital/repositories/file.repository.js
// Repositorio especializado para gestión de archivos con integración RSync
// =============================================================================

import { Types } from "mongoose";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { BaseRepository } from "../../core/base/repositories/base.repository.js";
import { File } from "../models/file.scheme.js";
import rsyncClient from "../../../config/rsync.client.js";

export class FileRepository extends BaseRepository {
  constructor() {
    super(File);
    this.setupFileLookups();
    this.initializeRsyncMonitoring();
  }

  /**
   * Configurar lookups específicos para archivos
   */
  setupFileLookups() {
    this.fileLookups = {
      // Lookup para información del contrato
      contract: {
        from: "contracts",
        localField: "contract",
        foreignField: "_id",
        as: "contractInfo",
        pipeline: [
          {
            $project: {
              contractNumber: 1,
              contractualObject: 1,
              generalStatus: 1,
              requestingDepartment: 1,
            },
          },
        ],
      },

      // Lookup para información de la fase
      phase: {
        from: "contractphases",
        localField: "phase",
        foreignField: "_id",
        as: "phaseInfo",
        pipeline: [
          {
            $project: {
              code: 1,
              name: 1,
              shortName: 1,
              category: 1,
              order: 1,
            },
          },
        ],
      },

      // Lookup para información del usuario que subió
      uploader: {
        from: "users",
        localField: "audit.uploadedBy",
        foreignField: "_id",
        as: "uploaderInfo",
        pipeline: [
          {
            $project: {
              name: 1,
              email: 1,
              department: 1,
            },
          },
        ],
      },
    };
  }

  /**
   * Inicializar monitoreo de sincronización rsync
   */
  initializeRsyncMonitoring() {
    // Procesar cola de sincronización cada 2 minutos
    this.syncInterval = setInterval(
      async () => {
        try {
          await this.processRsyncQueue();
        } catch (error) {
          console.error(
            "❌ Error en procesamiento automático de cola rsync:",
            error.message
          );
        }
      },
      2 * 60 * 1000
    ); // 2 minutos

    // Verificar archivos fallidos cada 10 minutos
    this.retryInterval = setInterval(
      async () => {
        try {
          await this.retryFailedSyncs();
        } catch (error) {
          console.error("❌ Error en reintentos automáticos:", error.message);
        }
      },
      10 * 60 * 1000
    ); // 10 minutos
  }

  // ===== MÉTODOS USANDO QUERY HELPERS DEL ESQUEMA =====

  /**
   * Buscar archivos rsync - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findRsyncFiles(options = {}) {
    try {
      const { page = 1, limit = 50, syncStatus, priority } = options;

      // ✅ Usar query helper del esquema
      let query = this.model.find().rsyncFiles();

      if (syncStatus) {
        switch (syncStatus) {
          case "PENDING":
            query = query.pendingSync();
            break;
          case "SYNCED":
            query = query.synced();
            break;
          case "FAILED":
            query = query.syncFailed();
            break;
        }
      }

      if (priority) {
        query = query.where({ "rsyncInfo.priority": priority });
      }

      if (priority === "HIGH" || priority === "URGENT") {
        query = query.highPriority(); // ✅ Usar query helper
      }

      query = query
        .populate([
          {
            path: "contract",
            select: "contractNumber contractualObject",
          },
          {
            path: "phase",
            select: "name code order",
          },
        ])
        .sort({ "rsyncInfo.priority": -1, createdAt: 1 });

      return await this.model.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando archivos rsync: ${error.message}`);
    }
  }

  /**
   * Buscar archivos pendientes de sincronización - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findPendingSync(options = {}) {
    try {
      const { limit = 20, priorityOrder = true } = options;

      // ✅ Usar query helper del esquema
      let query = this.model.find().pendingSync();

      if (priorityOrder) {
        query = query.sort({ "rsyncInfo.priority": -1, createdAt: 1 });
      } else {
        query = query.sort({ createdAt: 1 }); // FIFO
      }

      if (limit) {
        query = query.limit(limit);
      }

      const files = await query.populate([
        {
          path: "contract",
          select: "contractNumber",
        },
        {
          path: "phase",
          select: "name code",
        },
      ]);

      return files;
    } catch (error) {
      throw new Error(`Error buscando archivos pendientes: ${error.message}`);
    }
  }

  /**
   * Buscar archivos con fallo de sincronización - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findFailedSync(options = {}) {
    try {
      const { page = 1, limit = 50, withRetriesAvailable = true } = options;

      // ✅ Usar query helper del esquema
      let query = this.model.find().syncFailed();

      if (withRetriesAvailable) {
        query = query.where({
          $expr: { $lt: ["$rsyncInfo.syncRetries", "$rsyncInfo.maxRetries"] },
        });
      }

      query = query
        .populate([
          {
            path: "contract",
            select: "contractNumber contractualObject",
          },
          {
            path: "phase",
            select: "name code",
          },
        ])
        .sort({ "rsyncInfo.lastSyncAttempt": -1 });

      return await this.model.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando archivos fallidos: ${error.message}`);
    }
  }

  // ===== MÉTODOS USANDO MÉTODOS ESTÁTICOS DEL ESQUEMA =====

  /**
   * Procesar cola de sincronización - USA MÉTODO ESTÁTICO
   * ✅ MEJORA: Utiliza el método estático del esquema
   */
  async processRsyncQueue(batchSize = 10) {
    try {
      console.log(
        `🔄 Procesando cola de sincronización rsync (lote: ${batchSize})`
      );

      // ✅ Usar método estático del esquema
      const results = await this.model.processRsyncQueue(batchSize);

      console.log(
        `✅ Procesamiento completado: ${results.length} archivos procesados`
      );

      // Registrar estadísticas
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      console.log(`📊 Resultados: ${successful} exitosos, ${failed} fallidos`);

      return {
        processed: results.length,
        successful,
        failed,
        results,
      };
    } catch (error) {
      throw new Error(`Error procesando cola rsync: ${error.message}`);
    }
  }

  /**
   * Obtener estadísticas de rsync - USA MÉTODO ESTÁTICO
   * ✅ MEJORA: Utiliza el método estático del esquema
   */
  async getRsyncStatistics() {
    try {
      // ✅ Usar método estático del esquema
      const stats = await this.model.getRsyncStats();

      // Enriquecer estadísticas
      const enrichedStats = {
        byStatus: {},
        totals: {
          count: 0,
          totalSize: 0,
          avgRetries: 0,
        },
        summary: {
          syncRate: 0,
          failureRate: 0,
          avgSizePerFile: 0,
        },
      };

      let totalCount = 0;
      let totalSize = 0;
      let totalRetries = 0;
      let syncedCount = 0;
      let failedCount = 0;

      stats.forEach((stat) => {
        enrichedStats.byStatus[stat._id] = {
          count: stat.count,
          totalSize: stat.totalSize,
          avgRetries: Math.round(stat.avgRetries * 100) / 100,
          avgSizeMB: Math.round((stat.totalSize / (1024 * 1024)) * 100) / 100,
        };

        totalCount += stat.count;
        totalSize += stat.totalSize;
        totalRetries += stat.avgRetries * stat.count;

        if (stat._id === "SYNCED") syncedCount = stat.count;
        if (stat._id === "FAILED") failedCount = stat.count;
      });

      enrichedStats.totals = {
        count: totalCount,
        totalSize,
        avgRetries:
          totalCount > 0
            ? Math.round((totalRetries / totalCount) * 100) / 100
            : 0,
      };

      enrichedStats.summary = {
        syncRate:
          totalCount > 0
            ? Math.round((syncedCount / totalCount) * 100 * 100) / 100
            : 0,
        failureRate:
          totalCount > 0
            ? Math.round((failedCount / totalCount) * 100 * 100) / 100
            : 0,
        avgSizePerFile:
          totalCount > 0
            ? Math.round((totalSize / totalCount / (1024 * 1024)) * 100) / 100
            : 0,
      };

      return enrichedStats;
    } catch (error) {
      throw new Error(`Error obteniendo estadísticas rsync: ${error.message}`);
    }
  }

  /**
   * Buscar archivos por contrato - USA MÉTODO ESTÁTICO
   * ✅ MEJORA: Utiliza el método estático del esquema con filtros rsync
   */
  async findByContract(contractId, options = {}) {
    try {
      const {
        phase,
        documentType,
        status,
        currentVersionOnly = false,
        syncStatus,
        includeRemoteInfo = false,
      } = options;

      // ✅ Usar método estático del esquema
      let query = this.model.findByContract(contractId, {
        phase,
        documentType,
        status,
        currentVersionOnly,
      });

      // Filtros adicionales para rsync
      if (syncStatus) {
        query = query.where({ "rsyncInfo.syncStatus": syncStatus });
      }

      // Población condicional
      const populateOptions = [
        {
          path: "phase",
          select: "name code order category",
        },
      ];

      if (includeRemoteInfo) {
        // No se puede popular rsyncInfo ya que es embedded, pero se incluye automáticamente
        query = query.select("+rsyncInfo");
      }

      const files = await query.populate(populateOptions);

      // Enriquecer con información de sincronización usando métodos del esquema
      const enrichedFiles = await Promise.all(
        files.map(async (file) => {
          const fileObj = file.toObject ? file.toObject() : file;

          if (file.storage.storageProvider === "RSYNC") {
            // ✅ Usar métodos del esquema
            fileObj.isAvailable = file.isAvailable();
            fileObj.downloadUrl = file.getAccessUrl();
            fileObj.syncStatusDisplay = file.syncStatusDisplay; // Virtual del esquema
            fileObj.isRemoteAvailable = file.isRemoteAvailable; // Virtual del esquema
          }

          return fileObj;
        })
      );

      return enrichedFiles;
    } catch (error) {
      throw new Error(`Error buscando archivos del contrato: ${error.message}`);
    }
  }

  // ===== MÉTODOS ESPECÍFICOS DEL REPOSITORIO CON RSYNC =====

  /**
   * Subir archivo con configuración automática de rsync
   */
  async uploadFile(fileData, userData, options = {}) {
    try {
      const {
        forceRsync = true,
        priority = "NORMAL",
        keepLocal = false,
        autoSync = true,
      } = options;

      // Calcular hash del archivo
      if (fileData.tempPath) {
        const buffer = await fs.readFile(fileData.tempPath);
        fileData.fileInfo.hash = crypto
          .createHash("sha256")
          .update(buffer)
          .digest("hex");
      }

      // Configurar almacenamiento rsync por defecto
      if (forceRsync) {
        fileData.storage = {
          ...fileData.storage,
          storageProvider: "RSYNC",
        };

        fileData.rsyncInfo = {
          priority,
          autoSync,
          keepLocal,
          syncStatus: "PENDING",
          maxRetries: 3,
          remoteHost: process.env.RSYNC_REMOTE_HOST,
          remotePath: `${process.env.RSYNC_REMOTE_PATH}/${fileData.contract}/${fileData.phase}`,
        };
      }

      // Crear registro en base de datos
      const file = await this.create(fileData, userData, options);

      console.log(
        `📤 Archivo creado y programado para sincronización: ${file.systemName}`
      );

      // Si autoSync está habilitado, el middleware post-save se encargará
      // de la sincronización automática

      return file;
    } catch (error) {
      throw new Error(`Error subiendo archivo: ${error.message}`);
    }
  }

  /**
   * Forzar sincronización de un archivo específico
   * ✅ MEJORA: Utiliza el método del esquema
   */
  async forceSyncFile(fileId, options = {}) {
    try {
      const { updatePriority, newPriority = "HIGH" } = options;

      const file = await this.findById(fileId);
      if (!file) {
        throw new Error("Archivo no encontrado");
      }

      if (file.storage.storageProvider !== "RSYNC") {
        throw new Error("El archivo no está configurado para rsync");
      }

      // Actualizar prioridad si se solicita
      if (updatePriority) {
        file.rsyncInfo.priority = newPriority;
      }

      console.log(`🚀 Forzando sincronización de archivo: ${file.systemName}`);

      // ✅ Usar método del esquema
      const result = await file.forceSyncToRsync();

      return {
        success: true,
        file: {
          id: file._id,
          systemName: file.systemName,
          syncStatus: file.rsyncInfo.syncStatus,
        },
        result,
      };
    } catch (error) {
      throw new Error(`Error forzando sincronización: ${error.message}`);
    }
  }

  /**
   * Verificar integridad de archivo remoto
   * ✅ MEJORA: Utiliza el método del esquema
   */
  async verifyRemoteIntegrity(fileId) {
    try {
      const file = await this.findById(fileId);
      if (!file) {
        throw new Error("Archivo no encontrado");
      }

      console.log(`🔍 Verificando integridad remota: ${file.systemName}`);

      // ✅ Usar método del esquema
      const verification = await file.verifyRemoteIntegrity();

      return {
        fileId: file._id,
        systemName: file.systemName,
        verification,
      };
    } catch (error) {
      throw new Error(`Error verificando integridad: ${error.message}`);
    }
  }

  /**
   * Reintentar archivos fallidos con reintentos disponibles
   */
  async retryFailedSyncs(options = {}) {
    try {
      const { limit = 5, priorityFirst = true } = options;

      console.log(`🔄 Reintentando archivos fallidos (límite: ${limit})`);

      const failedFiles = await this.findFailedSync({
        limit,
        withRetriesAvailable: true,
      });

      const results = [];

      for (const fileDoc of failedFiles.docs) {
        try {
          console.log(`🔄 Reintentando: ${fileDoc.systemName}`);

          // ✅ Usar método del esquema
          await fileDoc.syncToRsync();

          results.push({
            fileId: fileDoc._id,
            systemName: fileDoc.systemName,
            success: true,
          });
        } catch (error) {
          console.error(`❌ Fallo en reintento: ${error.message}`);

          results.push({
            fileId: fileDoc._id,
            systemName: fileDoc.systemName,
            success: false,
            error: error.message,
          });
        }
      }

      const successful = results.filter((r) => r.success).length;
      console.log(
        `✅ Reintentos completados: ${successful}/${results.length} exitosos`
      );

      return {
        processed: results.length,
        successful,
        failed: results.length - successful,
        results,
      };
    } catch (error) {
      throw new Error(`Error en reintentos: ${error.message}`);
    }
  }

  // ===== MÉTODOS DE GESTIÓN AVANZADA =====

  /**
   * Buscar archivos por criterios específicos de rsync
   */
  async findAdvancedRsync(criteria, options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        sort = { "rsyncInfo.priority": -1, createdAt: 1 },
        populate = true,
      } = options;

      const {
        contractId,
        phaseId,
        syncStatus,
        priority,
        syncedAfter,
        syncedBefore,
        hasErrors,
        retriesExceeded,
        sizeRange,
        fileTypes,
      } = criteria;

      // Construir query base para archivos rsync
      let query = this.model.find({ "storage.storageProvider": "RSYNC" });

      // Filtros específicos
      if (contractId) {
        query = query.where({ contract: contractId });
      }

      if (phaseId) {
        query = query.where({ phase: phaseId });
      }

      if (syncStatus) {
        if (Array.isArray(syncStatus)) {
          query = query.where({ "rsyncInfo.syncStatus": { $in: syncStatus } });
        } else {
          query = query.where({ "rsyncInfo.syncStatus": syncStatus });
        }
      }

      if (priority) {
        if (Array.isArray(priority)) {
          query = query.where({ "rsyncInfo.priority": { $in: priority } });
        } else {
          query = query.where({ "rsyncInfo.priority": priority });
        }
      }

      // Filtros de fecha de sincronización
      if (syncedAfter || syncedBefore) {
        const syncDateFilter = {};
        if (syncedAfter) syncDateFilter.$gte = new Date(syncedAfter);
        if (syncedBefore) syncDateFilter.$lte = new Date(syncedBefore);
        query = query.where({ "rsyncInfo.lastSyncSuccess": syncDateFilter });
      }

      if (hasErrors) {
        query = query.where({
          "rsyncInfo.syncError": { $exists: true, $ne: null },
        });
      }

      if (retriesExceeded) {
        query = query.where({
          $expr: { $gte: ["$rsyncInfo.syncRetries", "$rsyncInfo.maxRetries"] },
        });
      }

      // Filtros de tamaño
      if (sizeRange) {
        const sizeFilter = {};
        if (sizeRange.min) sizeFilter.$gte = sizeRange.min;
        if (sizeRange.max) sizeFilter.$lte = sizeRange.max;
        query = query.where({ "fileInfo.size": sizeFilter });
      }

      // Filtros de tipo de archivo
      if (fileTypes && fileTypes.length > 0) {
        query = query.where({ "fileInfo.fileType": { $in: fileTypes } });
      }

      // Población condicional
      if (populate) {
        query = query.populate([
          {
            path: "contract",
            select: "contractNumber contractualObject generalStatus",
          },
          {
            path: "phase",
            select: "name code order category",
          },
          {
            path: "audit.uploadedBy",
            select: "name email",
          },
        ]);
      }

      // Aplicar ordenamiento
      query = query.sort(sort);

      return await this.model.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error en búsqueda avanzada rsync: ${error.message}`);
    }
  }

  /**
   * Obtener dashboard de archivos con métricas rsync
   */
  async getRsyncDashboard(options = {}) {
    try {
      const { contractId, dateFrom, dateTo } = options;

      let matchStage = {
        "storage.storageProvider": "RSYNC",
        isActive: true,
      };

      if (contractId) {
        matchStage.contract = new Types.ObjectId(contractId);
      }

      if (dateFrom || dateTo) {
        matchStage.createdAt = {};
        if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
        if (dateTo) matchStage.createdAt.$lte = new Date(dateTo);
      }

      const pipeline = [
        { $match: matchStage },
        {
          $facet: {
            // Estadísticas por estado de sincronización
            byStatus: [
              {
                $group: {
                  _id: "$rsyncInfo.syncStatus",
                  count: { $sum: 1 },
                  totalSize: { $sum: "$fileInfo.size" },
                  avgRetries: { $avg: "$rsyncInfo.syncRetries" },
                },
              },
            ],

            // Distribución por prioridad
            byPriority: [
              {
                $group: {
                  _id: "$rsyncInfo.priority",
                  count: { $sum: 1 },
                  avgSize: { $avg: "$fileInfo.size" },
                },
              },
              { $sort: { _id: 1 } },
            ],

            // Archivos recientes
            recent: [
              { $sort: { createdAt: -1 } },
              { $limit: 10 },
              {
                $lookup: {
                  from: "contracts",
                  localField: "contract",
                  foreignField: "_id",
                  as: "contract",
                },
              },
              { $unwind: "$contract" },
              {
                $project: {
                  originalName: 1,
                  "fileInfo.size": 1,
                  "rsyncInfo.syncStatus": 1,
                  "rsyncInfo.priority": 1,
                  "contract.contractNumber": 1,
                  createdAt: 1,
                },
              },
            ],

            // Totales
            totals: [
              {
                $group: {
                  _id: null,
                  totalFiles: { $sum: 1 },
                  totalSize: { $sum: "$fileInfo.size" },
                  avgSize: { $avg: "$fileInfo.size" },
                  syncedCount: {
                    $sum: {
                      $cond: [
                        { $eq: ["$rsyncInfo.syncStatus", "SYNCED"] },
                        1,
                        0,
                      ],
                    },
                  },
                  failedCount: {
                    $sum: {
                      $cond: [
                        { $eq: ["$rsyncInfo.syncStatus", "FAILED"] },
                        1,
                        0,
                      ],
                    },
                  },
                  pendingCount: {
                    $sum: {
                      $cond: [
                        { $eq: ["$rsyncInfo.syncStatus", "PENDING"] },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      ];

      const result = await this.model.aggregate(pipeline);
      const dashboard = result[0];

      // Calcular métricas adicionales
      if (dashboard.totals.length > 0) {
        const totals = dashboard.totals[0];
        dashboard.metrics = {
          syncRate:
            totals.totalFiles > 0
              ? Math.round(
                  (totals.syncedCount / totals.totalFiles) * 100 * 100
                ) / 100
              : 0,
          failureRate:
            totals.totalFiles > 0
              ? Math.round(
                  (totals.failedCount / totals.totalFiles) * 100 * 100
                ) / 100
              : 0,
          avgSizeMB: Math.round((totals.avgSize / (1024 * 1024)) * 100) / 100,
          totalSizeGB:
            Math.round((totals.totalSize / (1024 * 1024 * 1024)) * 100) / 100,
        };
      }

      return dashboard;
    } catch (error) {
      throw new Error(`Error obteniendo dashboard rsync: ${error.message}`);
    }
  }

  // ===== MÉTODOS DE LIMPIEZA Y MANTENIMIENTO =====

  /**
   * Limpiar archivos huérfanos (sin referencia en rsync)
   */
  async cleanupOrphanedFiles(options = {}) {
    try {
      const { dryRun = true, olderThanDays = 30 } = options;

      console.log(
        `🧹 Iniciando limpieza de archivos huérfanos (dryRun: ${dryRun})`
      );

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // Buscar archivos rsync fallidos permanentemente y antiguos
      const query = {
        "storage.storageProvider": "RSYNC",
        "rsyncInfo.syncStatus": "FAILED",
        $expr: { $gte: ["$rsyncInfo.syncRetries", "$rsyncInfo.maxRetries"] },
        createdAt: { $lt: cutoffDate },
        isActive: true,
      };

      const orphanedFiles = await this.model
        .find(query)
        .select("_id originalName systemName createdAt rsyncInfo");

      console.log(`📊 Encontrados ${orphanedFiles.length} archivos huérfanos`);

      if (dryRun) {
        return {
          dryRun: true,
          foundCount: orphanedFiles.length,
          files: orphanedFiles.map((f) => ({
            id: f._id,
            name: f.originalName,
            systemName: f.systemName,
            createdAt: f.createdAt,
            lastError: f.rsyncInfo.syncError,
          })),
        };
      }

      // Marcar archivos como inactivos (soft delete)
      const cleanupResults = [];
      for (const file of orphanedFiles) {
        try {
          await this.softDelete(
            file._id,
            null,
            "Limpieza automática - archivo huérfano rsync"
          );
          cleanupResults.push({
            id: file._id,
            name: file.originalName,
            success: true,
          });
        } catch (error) {
          cleanupResults.push({
            id: file._id,
            name: file.originalName,
            success: false,
            error: error.message,
          });
        }
      }

      const successful = cleanupResults.filter((r) => r.success).length;
      console.log(
        `✅ Limpieza completada: ${successful}/${orphanedFiles.length} archivos procesados`
      );

      return {
        dryRun: false,
        processed: orphanedFiles.length,
        successful,
        failed: orphanedFiles.length - successful,
        results: cleanupResults,
      };
    } catch (error) {
      throw new Error(
        `Error en limpieza de archivos huérfanos: ${error.message}`
      );
    }
  }

  /**
   * Generar reporte de salud del sistema rsync
   */
  async generateHealthReport() {
    try {
      console.log("📊 Generando reporte de salud rsync...");

      const [stats, failedFiles, pendingFiles] = await Promise.all([
        this.getRsyncStatistics(),
        this.findFailedSync({ limit: 1000, withRetriesAvailable: false }),
        this.findPendingSync({ limit: 1000 }),
      ]);

      // Verificar conectividad con servidor remoto
      let remoteConnectivity = false;
      try {
        await rsyncClient.listRemoteFiles();
        remoteConnectivity = true;
      } catch (error) {
        console.warn("⚠️ No se pudo conectar al servidor remoto rsync");
      }

      const health = {
        timestamp: new Date(),
        connectivity: {
          remote: remoteConnectivity,
          localStorage: true, // Asumimos que el almacenamiento local funciona
        },
        statistics: stats,
        issues: {
          permanentlyFailed: failedFiles.totalDocs,
          longPending: pendingFiles.filter((f) => {
            const hoursSincePending =
              (Date.now() - f.createdAt.getTime()) / (1000 * 60 * 60);
            return hoursSincePending > 24; // Más de 24 horas pendiente
          }).length,
          largeQueue: pendingFiles.length,
        },
        recommendations: [],
      };

      // Generar recomendaciones
      if (!remoteConnectivity) {
        health.recommendations.push({
          type: "CRITICAL",
          message:
            "Servidor remoto rsync no disponible - verificar conectividad",
        });
      }

      if (health.issues.permanentlyFailed > 10) {
        health.recommendations.push({
          type: "WARNING",
          message: `${health.issues.permanentlyFailed} archivos con fallo permanente - considerar limpieza`,
        });
      }

      if (health.issues.largeQueue > 50) {
        health.recommendations.push({
          type: "INFO",
          message: `Cola de sincronización grande (${health.issues.largeQueue}) - considerar aumentar frecuencia de procesamiento`,
        });
      }

      if (stats.summary.failureRate > 10) {
        health.recommendations.push({
          type: "WARNING",
          message: `Tasa de fallas alta (${stats.summary.failureRate}%) - investigar causas`,
        });
      }

      return health;
    } catch (error) {
      throw new Error(`Error generando reporte de salud: ${error.message}`);
    }
  }

  // ===== CLEANUP DE INTERVALOS =====

  /**
   * Limpiar intervalos al destruir la instancia
   */
  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
    }
  }
}

export default new FileRepository();
