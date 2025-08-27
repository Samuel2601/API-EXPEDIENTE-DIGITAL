// =============================================================================
// src/module/exp-digital/repositories/contract-history.repository.js
// Repositorio especializado para gestión de historial de contratos
// =============================================================================

import { Types } from "mongoose";
import { BaseRepository } from "../../core/base/repositories/base.repository.js";
import { ContractHistory } from "../models/contract-history.scheme.js";

export class ContractHistoryRepository extends BaseRepository {
  constructor() {
    super(ContractHistory);
    this.setupContractHistoryLookups();
  }

  /**
   * Configurar lookups específicos para historial de contratos
   */
  setupContractHistoryLookups() {
    this.contractHistoryLookups = {
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
              "budget.estimatedValue": 1,
            },
          },
        ],
      },

      // Lookup para información del usuario
      user: {
        from: "users",
        localField: "user.userId",
        foreignField: "_id",
        as: "userDetails",
        pipeline: [
          {
            $project: {
              name: 1,
              email: 1,
              role: 1,
              department: 1,
            },
          },
        ],
      },

      // Lookup para detalles de fases
      phases: {
        from: "contractphases",
        localField: ["changeDetails.previousPhase", "changeDetails.newPhase"],
        foreignField: "_id",
        as: "phaseDetails",
        pipeline: [
          {
            $project: {
              code: 1,
              name: 1,
              shortName: 1,
              order: 1,
              category: 1,
            },
          },
        ],
      },

      // Lookup para información de documentos
      documents: {
        from: "files",
        localField: "changeDetails.documentInfo.documentId",
        foreignField: "_id",
        as: "documentDetails",
        pipeline: [
          {
            $project: {
              originalName: 1,
              fileInfo: 1,
              audit: 1,
            },
          },
        ],
      },
    };
  }

  // ===== MÉTODOS USANDO QUERY HELPERS DEL ESQUEMA =====

  /**
   * Buscar historial por tipo de evento - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findByEventType(eventType, options = {}) {
    try {
      const { page = 1, limit = 50, dateFrom, dateTo, contractId } = options;

      // ✅ Usar query helper del esquema
      let query = this.model.find().byEventType(eventType);

      // Filtros adicionales
      if (contractId) {
        query = query.where({ contract: contractId });
      }

      if (dateFrom || dateTo) {
        const dateFilter = {};
        if (dateFrom) dateFilter.$gte = new Date(dateFrom);
        if (dateTo) dateFilter.$lte = new Date(dateTo);
        query = query.where({ eventDate: dateFilter });
      }

      query = query
        .populate([
          {
            path: "contract",
            select: "contractNumber contractualObject generalStatus",
          },
          {
            path: "changeDetails.previousPhase",
            select: "name code order",
          },
          {
            path: "changeDetails.newPhase",
            select: "name code order",
          },
        ])
        .sort({ eventDate: -1 });

      return await this.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando por tipo de evento: ${error.message}`);
    }
  }

  /**
   * Buscar eventos recientes - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findRecent(hours = 24, options = {}) {
    try {
      const { page = 1, limit = 50, contractId, userId, eventType } = options;

      // ✅ Usar query helper del esquema
      let query = this.model.find().recent(hours);

      // Filtros adicionales
      if (contractId) {
        query = query.where({ contract: contractId });
      }

      if (userId) {
        query = query.byUser(userId); // ✅ Combinar query helpers
      }

      if (eventType) {
        query = query.byEventType(eventType); // ✅ Combinar query helpers
      }

      query = query
        .populate([
          {
            path: "contract",
            select: "contractNumber contractualObject",
          },
          {
            path: "changeDetails.documentInfo.documentId",
            select: "originalName fileInfo.size",
          },
        ])
        .sort({ eventDate: -1 });

      return await this.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando eventos recientes: ${error.message}`);
    }
  }

  /**
   * Buscar eventos críticos - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findCritical(options = {}) {
    try {
      const { page = 1, limit = 50, contractId, dateFrom, dateTo } = options;

      // ✅ Usar query helper del esquema
      let query = this.model.find().critical();

      if (contractId) {
        query = query.where({ contract: contractId });
      }

      if (dateFrom || dateTo) {
        const dateFilter = {};
        if (dateFrom) dateFilter.$gte = new Date(dateFrom);
        if (dateTo) dateFilter.$lte = new Date(dateTo);
        query = query.where({ eventDate: dateFilter });
      }

      query = query
        .populate([
          {
            path: "contract",
            select: "contractNumber contractualObject generalStatus",
          },
        ])
        .sort({ eventDate: -1 });

      return await this.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando eventos críticos: ${error.message}`);
    }
  }

  /**
   * Buscar eventos por usuario - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findByUser(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 100,
        contractId,
        eventType,
        dateFrom,
        dateTo,
      } = options;

      // ✅ Usar query helper del esquema
      let query = this.model.find().byUser(userId);

      // Filtros adicionales
      if (contractId) {
        query = query.where({ contract: contractId });
      }

      if (eventType) {
        query = query.byEventType(eventType); // ✅ Combinar query helpers
      }

      if (dateFrom || dateTo) {
        const dateFilter = {};
        if (dateFrom) dateFilter.$gte = new Date(dateFrom);
        if (dateTo) dateFilter.$lte = new Date(dateTo);
        query = query.where({ eventDate: dateFilter });
      }

      query = query
        .populate([
          {
            path: "contract",
            select: "contractNumber contractualObject generalStatus",
          },
        ])
        .sort({ eventDate: -1 });

      return await this.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando eventos por usuario: ${error.message}`);
    }
  }

  /**
   * Buscar eventos generados por el sistema - USA QUERY HELPER
   * ✅ MEJORA: Utiliza el query helper del esquema
   */
  async findSystemGenerated(options = {}) {
    try {
      const { page = 1, limit = 50, contractId, eventType } = options;

      // ✅ Usar query helper del esquema
      let query = this.model.find().systemGenerated();

      if (contractId) {
        query = query.where({ contract: contractId });
      }

      if (eventType) {
        query = query.byEventType(eventType);
      }

      query = query
        .populate([
          {
            path: "contract",
            select: "contractNumber contractualObject",
          },
        ])
        .sort({ eventDate: -1 });

      return await this.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error buscando eventos del sistema: ${error.message}`);
    }
  }

  // ===== MÉTODOS USANDO MÉTODOS ESTÁTICOS DEL ESQUEMA =====

  /**
   * Obtener historial completo de un contrato - USA MÉTODO ESTÁTICO
   * ✅ MEJORA: Utiliza el método estático del esquema con mejoras
   */
  async findByContract(contractId, options = {}) {
    try {
      // ✅ Usar método estático del esquema
      const result = await this.model.findByContract(contractId, options);

      return result;
    } catch (error) {
      throw new Error(
        `Error obteniendo historial del contrato: ${error.message}`
      );
    }
  }

  /**
   * Obtener actividad reciente de un contrato - USA MÉTODO ESTÁTICO
   * ✅ MEJORA: Utiliza el método estático del esquema
   */
  async getRecentActivity(contractId, hours = 24) {
    try {
      // ✅ Usar método estático del esquema
      const recentEvents = await this.model.getRecentActivity(
        contractId,
        hours
      );

      return recentEvents;
    } catch (error) {
      throw new Error(`Error obteniendo actividad reciente: ${error.message}`);
    }
  }

  /**
   * Obtener eventos críticos de un contrato - USA MÉTODO ESTÁTICO
   * ✅ MEJORA: Utiliza el método estático del esquema
   */
  async getCriticalEvents(contractId) {
    try {
      // ✅ Usar método estático del esquema
      const criticalEvents = await this.model.getCriticalEvents(contractId);

      return criticalEvents;
    } catch (error) {
      throw new Error(`Error obteniendo eventos críticos: ${error.message}`);
    }
  }

  /**
   * Obtener estadísticas de eventos de un contrato - USA MÉTODO ESTÁTICO
   * ✅ MEJORA: Utiliza el método estático del esquema con corrección
   */
  async getEventStatistics(contractId) {
    try {
      // ✅ Usar método estático del esquema (corregir la referencia a mongoose)
      const pipeline = [
        { $match: { contract: new Types.ObjectId(contractId) } },
        {
          $group: {
            _id: "$eventType",
            count: { $sum: 1 },
            lastEvent: { $max: "$eventDate" },
            users: { $addToSet: "$user.name" },
          },
        },
        { $sort: { count: -1 } },
      ];

      const stats = await this.model.aggregate(pipeline);
      return stats;
    } catch (error) {
      throw new Error(
        `Error obteniendo estadísticas de eventos: ${error.message}`
      );
    }
  }

  // ===== MÉTODOS USANDO FUNCIONES DEL ESQUEMA =====

  /**
   * Obtener resumen de eventos con métodos del esquema
   * ✅ MEJORA: Utiliza los métodos del esquema para formateo
   */
  async getEventsSummary(contractId, options = {}) {
    try {
      const { limit = 20, eventTypes } = options;

      let query = this.model
        .find({ contract: contractId })
        .sort({ eventDate: -1 })
        .limit(limit)
        .populate([
          {
            path: "contract",
            select: "contractNumber contractualObject",
          },
          {
            path: "changeDetails.previousPhase changeDetails.newPhase",
            select: "name code order",
          },
        ]);

      if (eventTypes && eventTypes.length > 0) {
        query = query.where({ eventType: { $in: eventTypes } });
      }

      const events = await query;

      // ✅ Usar métodos del esquema para enriquecer datos
      const enrichedEvents = events.map((event) => {
        const eventObj = event.toObject();
        return {
          ...eventObj,
          // ✅ Usar métodos del esquema
          formattedDescription: event.getFormattedDescription(),
          isRecent: event.isRecent(),
          isCritical: event.isCritical(),
          eventSummary: event.getEventSummary(),
          // ✅ Usar virtuales del esquema
          timeAgo: event.timeAgo,
          eventTypeDisplay: event.eventTypeDisplay,
        };
      });

      return enrichedEvents;
    } catch (error) {
      throw new Error(`Error obteniendo resumen de eventos: ${error.message}`);
    }
  }

  /**
   * Analizar eventos recientes usando métodos del esquema
   * ✅ MEJORA: Utiliza métodos del esquema para análisis
   */
  async analyzeRecentEvents(contractId, hours = 24) {
    try {
      // ✅ Usar método estático del esquema
      const recentEvents = await this.model.getRecentActivity(
        contractId,
        hours
      );

      const analysis = {
        totalEvents: recentEvents.length,
        criticalCount: 0,
        eventTypes: {},
        users: new Set(),
        timeline: [],
      };

      recentEvents.forEach((event) => {
        // ✅ Usar métodos del esquema para análisis
        if (event.isCritical()) {
          analysis.criticalCount++;
        }

        // Conteo por tipo de evento usando virtual
        const displayType = event.eventTypeDisplay;
        analysis.eventTypes[displayType] =
          (analysis.eventTypes[displayType] || 0) + 1;

        // Usuarios únicos
        analysis.users.add(event.user.name);

        // Timeline con formato
        analysis.timeline.push({
          timestamp: event.eventDate,
          formattedDescription: event.getFormattedDescription(),
          timeAgo: event.timeAgo,
          severity: event.classification.severity,
          eventSummary: event.getEventSummary(),
        });
      });

      analysis.users = Array.from(analysis.users);

      return analysis;
    } catch (error) {
      throw new Error(`Error analizando eventos recientes: ${error.message}`);
    }
  }

  // ===== MÉTODOS ESPECÍFICOS DEL REPOSITORIO =====

  /**
   * Registrar nuevo evento en el historial
   */
  async logEvent(eventData, userData, options = {}) {
    try {
      const { autoClassify = true, validateDetails = true } = options;

      // Auto-clasificación basada en tipo de evento
      if (autoClassify) {
        eventData.classification = this.classifyEvent(
          eventData.eventType,
          eventData.changeDetails
        );
      }

      // Validar detalles específicos según tipo de evento
      if (validateDetails) {
        this.validateEventDetails(eventData.eventType, eventData.changeDetails);
      }

      // Añadir fecha del evento si no existe
      if (!eventData.eventDate) {
        eventData.eventDate = new Date();
      }

      // Información del usuario
      if (userData) {
        eventData.user = {
          userId: userData.userId,
          name: userData.name,
          role: userData.role,
          department: userData.department,
        };
      }

      return await this.create(eventData, userData, options);
    } catch (error) {
      throw new Error(`Error registrando evento: ${error.message}`);
    }
  }

  /**
   * Clasificar evento automáticamente
   */
  classifyEvent(eventType, changeDetails) {
    const classification = {
      category: "OPERATIONAL",
      severity: "NORMAL",
      isSystemGenerated: false,
    };

    // Clasificación por tipo de evento
    switch (eventType) {
      case "CREATION":
      case "AWARD":
      case "CONTRACT_SIGNING":
      case "LIQUIDATION":
      case "CLOSURE":
        classification.category = "MILESTONE";
        classification.severity = "HIGH";
        break;

      case "PROCESS_CANCELLATION":
      case "AMENDMENT":
        classification.category = "CRITICAL_CHANGE";
        classification.severity = "CRITICAL";
        break;

      case "BUDGET_CHANGE":
        classification.category = "FINANCIAL";
        classification.severity = this.getBudgetChangeSeverity(changeDetails);
        break;

      case "PHASE_CHANGE":
      case "STATUS_CHANGE":
        classification.category = "WORKFLOW";
        classification.severity = "NORMAL";
        break;

      case "DOCUMENT_UPLOAD":
      case "DOCUMENT_APPROVAL":
      case "DOCUMENT_REJECTION":
        classification.category = "DOCUMENT";
        classification.severity =
          changeDetails?.documentInfo?.action === "REJECT" ? "HIGH" : "NORMAL";
        break;

      case "PAYMENT_MADE":
        classification.category = "FINANCIAL";
        classification.severity = "HIGH";
        break;

      case "EXTENSION_REQUEST":
        classification.category = "TIMELINE";
        classification.severity = "HIGH";
        break;
    }

    return classification;
  }

  /**
   * Determinar severidad de cambios presupuestarios
   */
  getBudgetChangeSeverity(changeDetails) {
    if (!changeDetails?.previousBudget || !changeDetails?.newBudget) {
      return "NORMAL";
    }

    const oldValue = changeDetails.previousBudget.estimatedValue || 0;
    const newValue = changeDetails.newBudget.estimatedValue || 0;

    if (oldValue === 0) return "NORMAL";

    const changePercentage = Math.abs((newValue - oldValue) / oldValue) * 100;

    if (changePercentage > 20) return "CRITICAL";
    if (changePercentage > 10) return "HIGH";
    return "NORMAL";
  }

  /**
   * Validar detalles específicos del evento
   */
  validateEventDetails(eventType, changeDetails) {
    const requiredFields = {
      PHASE_CHANGE: ["previousPhase", "newPhase"],
      BUDGET_CHANGE: ["previousBudget", "newBudget"],
      PAYMENT_MADE: ["paymentInfo"],
      DOCUMENT_UPLOAD: ["documentInfo"],
      DOCUMENT_APPROVAL: ["documentInfo"],
      DOCUMENT_REJECTION: ["documentInfo"],
      EXTENSION_REQUEST: ["extensionInfo"],
    };

    const required = requiredFields[eventType];
    if (required) {
      for (const field of required) {
        if (!changeDetails || !changeDetails[field]) {
          throw new Error(
            `Campo requerido faltante para ${eventType}: ${field}`
          );
        }
      }
    }
  }

  // ===== MÉTODOS DE BÚSQUEDA AVANZADA =====

  /**
   * Búsqueda avanzada de eventos
   */
  async findAdvanced(criteria, options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        sort = { eventDate: -1 },
        populate = true,
      } = options;

      const {
        contractId,
        eventTypes,
        severity,
        category,
        userId,
        dateFrom,
        dateTo,
        searchText,
        isSystemGenerated,
        isCritical,
        isRecent,
      } = criteria;

      // Construir query base
      let query = this.model.find();

      // Filtros específicos
      if (contractId) {
        query = query.where({ contract: contractId });
      }

      if (eventTypes && eventTypes.length > 0) {
        query = query.where({ eventType: { $in: eventTypes } });
      }

      if (severity) {
        query = query.where({ "classification.severity": severity });
      }

      if (category) {
        query = query.where({ "classification.category": category });
      }

      if (userId) {
        query = query.byUser(userId); // ✅ Usar query helper
      }

      if (isSystemGenerated !== undefined) {
        if (isSystemGenerated) {
          query = query.systemGenerated(); // ✅ Usar query helper
        } else {
          query = query.where({ "classification.isSystemGenerated": false });
        }
      }

      if (isCritical) {
        query = query.critical(); // ✅ Usar query helper
      }

      if (isRecent) {
        query = query.recent(24); // ✅ Usar query helper
      }

      // Filtros de fecha
      if (dateFrom || dateTo) {
        const dateFilter = {};
        if (dateFrom) dateFilter.$gte = new Date(dateFrom);
        if (dateTo) dateFilter.$lte = new Date(dateTo);
        query = query.where({ eventDate: dateFilter });
      }

      // Búsqueda de texto
      if (searchText) {
        query = query.where({
          $text: { $search: searchText },
        });
      }

      // Población condicional
      if (populate) {
        query = query.populate([
          {
            path: "contract",
            select: "contractNumber contractualObject generalStatus",
          },
          {
            path: "changeDetails.previousPhase changeDetails.newPhase",
            select: "name code order",
          },
          {
            path: "changeDetails.documentInfo.documentId",
            select: "originalName fileInfo.size audit.uploadedBy",
          },
        ]);
      }

      // Aplicar ordenamiento
      query = query.sort(sort);

      return await this.paginate(query, { page, limit });
    } catch (error) {
      throw new Error(`Error en búsqueda avanzada: ${error.message}`);
    }
  }

  // ===== MÉTODOS DE REPORTES Y ANÁLISIS =====

  /**
   * Generar reporte de actividad por período
   */
  async getActivityReport(dateFrom, dateTo, options = {}) {
    try {
      const { groupBy = "day", contractId } = options;

      const matchStage = {
        eventDate: {
          $gte: new Date(dateFrom),
          $lte: new Date(dateTo),
        },
      };

      if (contractId) {
        matchStage.contract = new Types.ObjectId(contractId);
      }

      // Configurar agrupación según el período
      let groupId;
      switch (groupBy) {
        case "hour":
          groupId = {
            year: { $year: "$eventDate" },
            month: { $month: "$eventDate" },
            day: { $dayOfMonth: "$eventDate" },
            hour: { $hour: "$eventDate" },
          };
          break;
        case "day":
          groupId = {
            year: { $year: "$eventDate" },
            month: { $month: "$eventDate" },
            day: { $dayOfMonth: "$eventDate" },
          };
          break;
        case "week":
          groupId = {
            year: { $year: "$eventDate" },
            week: { $week: "$eventDate" },
          };
          break;
        case "month":
          groupId = {
            year: { $year: "$eventDate" },
            month: { $month: "$eventDate" },
          };
          break;
      }

      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: groupId,
            totalEvents: { $sum: 1 },
            eventTypes: {
              $push: "$eventType",
            },
            severityDistribution: {
              $push: "$classification.severity",
            },
            uniqueUsers: { $addToSet: "$user.name" },
            uniqueContracts: { $addToSet: "$contract" },
          },
        },
        {
          $project: {
            period: "$_id",
            totalEvents: 1,
            eventTypesCount: {
              $arrayToObject: {
                $map: {
                  input: { $setUnion: ["$eventTypes"] },
                  as: "type",
                  in: {
                    k: "$$type",
                    v: {
                      $size: {
                        $filter: {
                          input: "$eventTypes",
                          cond: { $eq: ["$$this", "$$type"] },
                        },
                      },
                    },
                  },
                },
              },
            },
            severityCount: {
              $arrayToObject: {
                $map: {
                  input: { $setUnion: ["$severityDistribution"] },
                  as: "severity",
                  in: {
                    k: "$$severity",
                    v: {
                      $size: {
                        $filter: {
                          input: "$severityDistribution",
                          cond: { $eq: ["$$this", "$$severity"] },
                        },
                      },
                    },
                  },
                },
              },
            },
            activeUsersCount: { $size: "$uniqueUsers" },
            contractsAffected: { $size: "$uniqueContracts" },
          },
        },
        {
          $sort: {
            "period.year": 1,
            "period.month": 1,
            "period.day": 1,
            "period.hour": 1,
          },
        },
      ];

      return await this.model.aggregate(pipeline);
    } catch (error) {
      throw new Error(`Error generando reporte de actividad: ${error.message}`);
    }
  }

  /**
   * Obtener métricas de rendimiento
   */
  async getPerformanceMetrics(contractId, dateFrom, dateTo) {
    try {
      const pipeline = [
        {
          $match: {
            contract: new Types.ObjectId(contractId),
            eventDate: {
              $gte: new Date(dateFrom),
              $lte: new Date(dateTo),
            },
          },
        },
        {
          $facet: {
            // Métricas generales
            general: [
              {
                $group: {
                  _id: null,
                  totalEvents: { $sum: 1 },
                  criticalEvents: {
                    $sum: {
                      $cond: [
                        { $eq: ["$classification.severity", "CRITICAL"] },
                        1,
                        0,
                      ],
                    },
                  },
                  systemEvents: {
                    $sum: {
                      $cond: ["$classification.isSystemGenerated", 1, 0],
                    },
                  },
                  uniqueUsers: { $addToSet: "$user.name" },
                  avgEventsPerDay: { $avg: 1 }, // Se calculará después
                },
              },
            ],

            // Distribución por tipo
            byType: [
              {
                $group: {
                  _id: "$eventType",
                  count: { $sum: 1 },
                  avgSeverity: {
                    $avg: {
                      $cond: [
                        { $eq: ["$classification.severity", "CRITICAL"] },
                        3,
                        {
                          $cond: [
                            { $eq: ["$classification.severity", "HIGH"] },
                            2,
                            1,
                          ],
                        },
                      ],
                    },
                  },
                },
              },
              { $sort: { count: -1 } },
            ],

            // Timeline de eventos críticos
            criticalTimeline: [
              { $match: { "classification.severity": "CRITICAL" } },
              {
                $project: {
                  eventDate: 1,
                  eventType: 1,
                  description: 1,
                  "user.name": 1,
                },
              },
              { $sort: { eventDate: -1 } },
              { $limit: 10 },
            ],
          },
        },
      ];

      const result = await this.model.aggregate(pipeline);
      return result[0];
    } catch (error) {
      throw new Error(
        `Error obteniendo métricas de rendimiento: ${error.message}`
      );
    }
  }

  // ===== MÉTODOS ESPECÍFICOS PARA TIPOS DE EVENTOS =====

  /**
   * Registrar cambio de fase
   */
  async logPhaseChange(
    contractId,
    previousPhase,
    newPhase,
    description,
    userData
  ) {
    try {
      const eventData = {
        contract: contractId,
        eventType: "PHASE_CHANGE",
        description:
          description ||
          `Cambio de fase: ${previousPhase?.name} → ${newPhase?.name}`,
        changeDetails: {
          previousPhase: previousPhase?._id,
          newPhase: newPhase?._id,
        },
      };

      return await this.logEvent(eventData, userData);
    } catch (error) {
      throw new Error(`Error registrando cambio de fase: ${error.message}`);
    }
  }

  /**
   * Registrar cambio presupuestario
   */
  async logBudgetChange(
    contractId,
    previousBudget,
    newBudget,
    description,
    userData
  ) {
    try {
      const eventData = {
        contract: contractId,
        eventType: "BUDGET_CHANGE",
        description: description || "Modificación presupuestaria",
        changeDetails: {
          previousBudget,
          newBudget,
        },
      };

      return await this.logEvent(eventData, userData);
    } catch (error) {
      throw new Error(
        `Error registrando cambio presupuestario: ${error.message}`
      );
    }
  }

  /**
   * Registrar pago realizado
   */
  async logPayment(contractId, paymentInfo, description, userData) {
    try {
      const eventData = {
        contract: contractId,
        eventType: "PAYMENT_MADE",
        description: description || `Pago realizado: $${paymentInfo.amount}`,
        changeDetails: {
          paymentInfo,
        },
      };

      return await this.logEvent(eventData, userData);
    } catch (error) {
      throw new Error(`Error registrando pago: ${error.message}`);
    }
  }

  /**
   * Registrar carga de documento
   */
  async logDocumentUpload(contractId, documentInfo, description, userData) {
    try {
      const eventData = {
        contract: contractId,
        eventType: "DOCUMENT_UPLOAD",
        description:
          description || `Documento cargado: ${documentInfo.documentName}`,
        changeDetails: {
          documentInfo: {
            ...documentInfo,
            action: "UPLOAD",
          },
        },
      };

      return await this.logEvent(eventData, userData);
    } catch (error) {
      throw new Error(`Error registrando carga de documento: ${error.message}`);
    }
  }
}

export default new ContractHistoryRepository();
