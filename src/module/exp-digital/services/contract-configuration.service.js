// =============================================================================
// src/module/exp-digital/services/contract-configuration.service.js
// Servicio unificado para configuración de tipos y fases de contratación pública
// GADM Cantón Esmeraldas - Módulo de Expediente Digital
// =============================================================================

import { ContractTypeRepository } from "../repositories/contract-type.repository.js";
import { ContractPhaseRepository } from "../repositories/contract-phase.repository.js";
import {
  createError,
  createValidationError,
  ERROR_CODES,
} from "../../../../utils/error.util.js";
import {
  validateObjectId,
  validateObjectIdArray,
} from "../../../../utils/validation.util.js";

export class ContractConfigurationService {
  constructor() {
    this.contractTypeRepository = new ContractTypeRepository();
    this.contractPhaseRepository = new ContractPhaseRepository();
  }

  // =============================================================================
  // MÉTODOS PARA TIPOS DE CONTRATACIÓN
  // =============================================================================

  /**
   * Obtener todos los tipos de contratación con información completa
   * @param {Object} options - Opciones de consulta
   * @returns {Promise<Object>} Tipos de contratación categorizados
   */
  async getAllContractTypes(options = {}) {
    try {
      const { includeInactive = false, page = 1, limit = 50 } = options;

      // Obtener tipos comunes y especiales por separado
      const [commonTypes, specialTypes] = await Promise.all([
        this.contractTypeRepository.findByCategory("COMMON", {
          includeInactive,
          page: 1,
          limit: 100,
        }),
        this.contractTypeRepository.findByCategory("SPECIAL", {
          includeInactive,
          page: 1,
          limit: 100,
        }),
      ]);

      return {
        common: {
          category: "COMMON",
          description: "Procedimientos Comunes según LOSNCP",
          types: commonTypes.docs || commonTypes,
          count: commonTypes.totalDocs || commonTypes.length,
        },
        special: {
          category: "SPECIAL",
          description: "Procedimientos Especiales según LOSNCP",
          types: specialTypes.docs || specialTypes,
          count: specialTypes.totalDocs || specialTypes.length,
        },
        metadata: {
          totalTypes:
            (commonTypes.totalDocs || commonTypes.length) +
            (specialTypes.totalDocs || specialTypes.length),
          includeInactive,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.FETCH_ERROR,
        `Error al obtener tipos de contratación: ${error.message}`,
        500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Crear configuración inicial de tipos de contratación según LOSNCP
   * @returns {Promise<Object>} Resultado de la inicialización
   */
  async initializeContractTypes() {
    try {
      const contractTypesToCreate = [
        // PROCEDIMIENTOS COMUNES
        {
          code: "SIE",
          name: "Subasta Inversa Electrónica",
          category: "COMMON",
          description:
            "Procedimiento de contratación mediante subasta inversa electrónica",
          displayOrder: 1,
          requiresPublication: true,
          estimatedDuration: 45,
          legalReference: "Art. 44-53 LOSNCP",
          applicableObjects: ["bienes", "servicios"],
          isActive: true,
        },
        {
          code: "LIC",
          name: "Licitación",
          category: "COMMON",
          description:
            "Licitación para bienes/servicios >$200,000, obras >$500,000",
          displayOrder: 2,
          requiresPublication: true,
          estimatedDuration: 60,
          legalReference: "Art. 54-60 LOSNCP",
          applicableObjects: ["bienes", "servicios", "obras"],
          isActive: true,
        },
        {
          code: "COT",
          name: "Cotización",
          category: "COMMON",
          description:
            "Cotización para bienes/servicios $5,000-$200,000, obras $10,000-$500,000",
          displayOrder: 3,
          requiresPublication: true,
          estimatedDuration: 30,
          legalReference: "Art. 61-64 LOSNCP",
          applicableObjects: ["bienes", "servicios", "obras"],
          isActive: true,
        },
        {
          code: "MEN",
          name: "Menor Cuantía",
          category: "COMMON",
          description:
            "Menor cuantía para bienes/servicios <$5,000, obras <$10,000",
          displayOrder: 4,
          requiresPublication: false,
          estimatedDuration: 15,
          legalReference: "Art. 65-68 LOSNCP",
          applicableObjects: ["bienes", "servicios", "obras"],
          isActive: true,
        },
        {
          code: "CON",
          name: "Consultoría",
          category: "COMMON",
          description: "Contratación de servicios de consultoría",
          displayOrder: 5,
          requiresPublication: true,
          estimatedDuration: 45,
          legalReference: "Art. 40-43 LOSNCP",
          applicableObjects: ["consultoria"],
          isActive: true,
        },
        {
          code: "LC",
          name: "Lista Corta",
          category: "COMMON",
          description: "Contratación por lista corta para consultoría",
          displayOrder: 6,
          requiresPublication: true,
          estimatedDuration: 35,
          legalReference: "Art. 40-43 LOSNCP",
          applicableObjects: ["consultoria"],
          isActive: true,
        },

        // PROCEDIMIENTOS ESPECIALES
        {
          code: "EME",
          name: "Emergencia",
          category: "SPECIAL",
          description: "Contratación por emergencia en casos excepcionales",
          displayOrder: 1,
          requiresPublication: false,
          estimatedDuration: 3,
          legalReference: "Art. 69-72 LOSNCP",
          applicableObjects: ["bienes", "servicios", "obras", "consultoria"],
          requiresSpecialAuthorization: true,
          isActive: true,
        },
        {
          code: "RE",
          name: "Régimen Especial",
          category: "SPECIAL",
          description:
            "Contratación bajo régimen especial según normativa específica",
          displayOrder: 2,
          requiresPublication: true,
          estimatedDuration: 30,
          legalReference: "Art. 73-76 LOSNCP",
          applicableObjects: ["bienes", "servicios", "obras", "consultoria"],
          requiresSpecialAuthorization: true,
          isActive: true,
        },
        {
          code: "CCE",
          name: "Compras por Catálogo Electrónico",
          category: "SPECIAL",
          description: "Compras a través del catálogo electrónico del SERCOP",
          displayOrder: 3,
          requiresPublication: false,
          estimatedDuration: 7,
          legalReference: "Art. 77-80 LOSNCP",
          applicableObjects: ["bienes", "servicios"],
          isActive: true,
        },
        {
          code: "CM",
          name: "Convenio Marco",
          category: "SPECIAL",
          description: "Contratación a través de convenios marco establecidos",
          displayOrder: 4,
          requiresPublication: false,
          estimatedDuration: 10,
          legalReference: "Art. 81-84 LOSNCP",
          applicableObjects: ["bienes", "servicios", "obras"],
          isActive: true,
        },
        {
          code: "IC",
          name: "Ínfima Cuantía",
          category: "SPECIAL",
          description:
            "Contratación de ínfima cuantía para montos muy pequeños",
          displayOrder: 5,
          requiresPublication: false,
          estimatedDuration: 5,
          legalReference: "Art. 85-88 LOSNCP",
          applicableObjects: ["bienes", "servicios"],
          isActive: true,
        },
      ];

      const results = {
        created: [],
        skipped: [],
        errors: [],
      };

      for (const typeData of contractTypesToCreate) {
        try {
          // Verificar si ya existe
          const existingType = await this.contractTypeRepository.findByCode(
            typeData.code
          );
          if (existingType) {
            results.skipped.push({
              code: typeData.code,
              reason: "Ya existe en la base de datos",
            });
            continue;
          }

          // Crear nuevo tipo
          const createdType =
            await this.contractTypeRepository.create(typeData);
          results.created.push({
            code: createdType.code,
            name: createdType.name,
            category: createdType.category,
          });
        } catch (error) {
          results.errors.push({
            code: typeData.code,
            error: error.message,
          });
        }
      }

      return {
        summary: {
          total: contractTypesToCreate.length,
          created: results.created.length,
          skipped: results.skipped.length,
          errors: results.errors.length,
        },
        details: results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.INIT_ERROR,
        `Error inicializando tipos de contratación: ${error.message}`,
        500
      );
    }
  }

  // =============================================================================
  // MÉTODOS PARA FASES DE CONTRATACIÓN
  // =============================================================================

  /**
   * Obtener todas las fases de contratación organizadas por categoría
   * @param {Object} options - Opciones de consulta
   * @returns {Promise<Object>} Fases categorizadas
   */
  async getAllContractPhases(options = {}) {
    try {
      const { includeInactive = false, contractTypeCode = null } = options;

      let phases;
      if (contractTypeCode) {
        phases =
          await this.contractPhaseRepository.findForContractType(
            contractTypeCode
          );
      } else {
        phases = await this.contractPhaseRepository.findAll({
          isActive: includeInactive ? undefined : true,
        });
      }

      // Organizar por categorías
      const phasesByCategory = phases.reduce((acc, phase) => {
        const category = phase.category || "OTHER";
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(phase);
        return acc;
      }, {});

      // Ordenar cada categoría por orden
      Object.keys(phasesByCategory).forEach((category) => {
        phasesByCategory[category].sort(
          (a, b) => (a.order || 0) - (b.order || 0)
        );
      });

      return {
        phasesByCategory,
        totalPhases: phases.length,
        categories: Object.keys(phasesByCategory),
        contractTypeCode,
        metadata: {
          includeInactive,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.FETCH_ERROR,
        `Error al obtener fases de contratación: ${error.message}`,
        500
      );
    }
  }

  /**
   * Crear configuración inicial de fases de contratación según LOSNCP
   * @returns {Promise<Object>} Resultado de la inicialización
   */
  async initializeContractPhases() {
    try {
      const phasesToCreate = [
        // FASE PREPARATORIA
        {
          code: "PREP",
          name: "Fase Preparatoria",
          shortName: "Preparatoria",
          category: "PREPARATORY",
          description:
            "Preparación de documentos previos al proceso de contratación",
          order: 1,
          estimatedDuration: 15,
          isRequired: true,
          allowedRoles: ["admin", "legal", "planning"],
          applicableToTypes: [], // Aplica a todos los tipos
          requiredDocuments: [
            {
              code: "CERT_PRES",
              name: "Certificación Presupuestaria (PAC)",
              description: "Certificación de disponibilidad presupuestaria",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 5242880, // 5MB
            },
            {
              code: "EST_MERC",
              name: "Estudios de Mercado",
              description: "Análisis de precios y condiciones del mercado",
              isMandatory: true,
              allowedFileTypes: ["pdf", "xlsx"],
              maxFileSize: 10485760, // 10MB
            },
            {
              code: "TDR_ESPTEC",
              name: "Términos de Referencia/Especificaciones Técnicas",
              description:
                "Términos de referencia o especificaciones técnicas del objeto",
              isMandatory: true,
              allowedFileTypes: ["pdf", "doc", "docx"],
              maxFileSize: 10485760,
            },
            {
              code: "EST_DESAG",
              name: "Estudio de Desagregación Tecnológica",
              description: "Estudio de desagregación tecnológica cuando aplica",
              isMandatory: false,
              allowedFileTypes: ["pdf"],
              maxFileSize: 5242880,
            },
            {
              code: "RES_INICIO",
              name: "Resolución de Inicio de Proceso",
              description: "Resolución administrativa de inicio del proceso",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 2097152, // 2MB
            },
            {
              code: "AUT_CONTRAT",
              name: "Autorización para contratar",
              description: "Autorización de la máxima autoridad para contratar",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 2097152,
            },
            {
              code: "INF_NECESIDAD",
              name: "Informe de Necesidad/Justificación",
              description:
                "Informe que sustenta la necesidad de la contratación",
              isMandatory: true,
              allowedFileTypes: ["pdf", "doc", "docx"],
              maxFileSize: 5242880,
            },
          ],
          dependencies: {
            requiredPhases: [],
            blockedBy: [],
          },
          isActive: true,
        },

        // FASE PRECONTRACTUAL
        {
          code: "PREC",
          name: "Fase Precontractual",
          shortName: "Precontractual",
          category: "PRECONTRACTUAL",
          description: "Proceso de convocatoria, evaluación y adjudicación",
          order: 2,
          estimatedDuration: 30,
          isRequired: true,
          allowedRoles: ["admin", "legal", "evaluation"],
          applicableToTypes: [],
          requiredDocuments: [
            {
              code: "PLIEGOS",
              name: "Pliegos (Documento convocatoria)",
              description:
                "Documento de convocatoria con condiciones del proceso",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 15728640, // 15MB
            },
            {
              code: "PREG_RESP",
              name: "Preguntas y Respuestas/Aclaraciones",
              description:
                "Preguntas de participantes y respuestas de la entidad",
              isMandatory: false,
              allowedFileTypes: ["pdf"],
              maxFileSize: 10485760,
            },
            {
              code: "OFERTAS",
              name: "Ofertas/Propuestas de proveedores",
              description: "Ofertas técnicas y económicas de los participantes",
              isMandatory: true,
              allowedFileTypes: ["pdf", "zip"],
              maxFileSize: 52428800, // 50MB
            },
            {
              code: "INF_EVAL",
              name: "Informe de Evaluación",
              description: "Informe técnico de evaluación de las ofertas",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 10485760,
            },
            {
              code: "INF_CONVAL",
              name: "Informe de Convalidación de Errores",
              description:
                "Informe de convalidación de errores de forma cuando aplica",
              isMandatory: false,
              allowedFileTypes: ["pdf"],
              maxFileSize: 5242880,
            },
            {
              code: "ADJUD",
              name: "Adjudicación/Declaratoria Desierto",
              description:
                "Acto administrativo de adjudicación o declaratoria desierta",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 2097152,
            },
            {
              code: "RES_ADJUD",
              name: "Resolución motivada de adjudicación",
              description: "Resolución motivada que sustenta la adjudicación",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 5242880,
            },
          ],
          dependencies: {
            requiredPhases: [
              {
                phase: null, // Se completará con el ID de PREP
                condition: "COMPLETED",
                isOptional: false,
              },
            ],
            blockedBy: [],
          },
          isActive: true,
        },

        // FASE CONTRACTUAL DE EJECUCIÓN
        {
          code: "EJEC",
          name: "Fase Contractual de Ejecución",
          shortName: "Ejecución",
          category: "EXECUTION",
          description: "Ejecución del contrato y seguimiento",
          order: 3,
          estimatedDuration: 60,
          isRequired: true,
          allowedRoles: ["admin", "supervisor", "technical"],
          applicableToTypes: [],
          requiredDocuments: [
            {
              code: "CONTRATO",
              name: "Contrato firmado",
              description: "Contrato suscrito por las partes",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 10485760,
            },
            {
              code: "GARANTIAS",
              name: "Garantías",
              description: "Garantías de fiel cumplimiento, técnica, etc.",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 5242880,
            },
            {
              code: "CRONOGRAMA",
              name: "Cronograma valorado de trabajos",
              description: "Cronograma valorado de trabajos para obras",
              isMandatory: false,
              allowedFileTypes: ["pdf", "xlsx"],
              maxFileSize: 5242880,
            },
            {
              code: "PLANILLAS",
              name: "Planillas de avance",
              description: "Planillas de avance para obras",
              isMandatory: false,
              allowedFileTypes: ["pdf", "xlsx"],
              maxFileSize: 10485760,
            },
            {
              code: "ACTAS_PARC",
              name: "Actas de entrega recepción parciales",
              description: "Actas de entregas parciales",
              isMandatory: false,
              allowedFileTypes: ["pdf"],
              maxFileSize: 5242880,
            },
            {
              code: "INF_FISCAL",
              name: "Informes de fiscalización/administración",
              description:
                "Informes periódicos de fiscalización o administración",
              isMandatory: true,
              allowedFileTypes: ["pdf", "doc", "docx"],
              maxFileSize: 10485760,
            },
            {
              code: "ORD_CAMBIO",
              name: "Órdenes de cambio",
              description: "Órdenes de cambio cuando aplica",
              isMandatory: false,
              allowedFileTypes: ["pdf"],
              maxFileSize: 5242880,
            },
            {
              code: "MULTAS",
              name: "Multas/Sanciones",
              description: "Documentos de multas o sanciones cuando aplica",
              isMandatory: false,
              allowedFileTypes: ["pdf"],
              maxFileSize: 2097152,
            },
          ],
          dependencies: {
            requiredPhases: [
              {
                phase: null, // Se completará con el ID de PREC
                condition: "COMPLETED",
                isOptional: false,
              },
            ],
            blockedBy: [],
          },
          isActive: true,
        },

        // FASE DE PAGO
        {
          code: "PAGO",
          name: "Fase de Pago",
          shortName: "Pago",
          category: "PAYMENT",
          description: "Proceso de pagos y documentos financieros",
          order: 4,
          estimatedDuration: 10,
          isRequired: true,
          allowedRoles: ["admin", "financial", "accounting"],
          applicableToTypes: [],
          requiredDocuments: [
            {
              code: "FACTURAS",
              name: "Facturas/Comprobantes de venta",
              description: "Facturas y comprobantes de venta del proveedor",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 5242880,
            },
            {
              code: "PLAN_PAGO",
              name: "Planillas de pago",
              description: "Planillas de pago procesadas",
              isMandatory: true,
              allowedFileTypes: ["pdf", "xlsx"],
              maxFileSize: 5242880,
            },
            {
              code: "RETENCIONES",
              name: "Retenciones tributarias",
              description: "Comprobantes de retenciones tributarias",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 2097152,
            },
            {
              code: "COMP_EGRESO",
              name: "Comprobantes de egreso",
              description: "Comprobantes de egreso del sistema financiero",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 2097152,
            },
            {
              code: "AUT_PAGO",
              name: "Autorizaciones de pago",
              description: "Autorizaciones administrativas de pago",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 2097152,
            },
          ],
          dependencies: {
            requiredPhases: [
              {
                phase: null, // Se completará con el ID de EJEC
                condition: "IN_PROGRESS",
                isOptional: false,
              },
            ],
            blockedBy: [],
          },
          isActive: true,
        },

        // FASE DE RECEPCIÓN
        {
          code: "RECEP",
          name: "Fase de Recepción",
          shortName: "Recepción",
          category: "RECEPTION",
          description: "Recepción definitiva y liquidación del contrato",
          order: 5,
          estimatedDuration: 15,
          isRequired: true,
          allowedRoles: ["admin", "technical", "supervisor"],
          applicableToTypes: [],
          requiredDocuments: [
            {
              code: "ACTA_RECEP",
              name: "Acta de entrega recepción definitiva",
              description: "Acta de entrega recepción definitiva del contrato",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 5242880,
            },
            {
              code: "INF_FINAL",
              name: "Informe final de fiscalización",
              description:
                "Informe final del fiscalizador o administrador del contrato",
              isMandatory: true,
              allowedFileTypes: ["pdf", "doc", "docx"],
              maxFileSize: 10485760,
            },
            {
              code: "LIQUIDACION",
              name: "Liquidación del contrato",
              description: "Liquidación técnico-económica del contrato",
              isMandatory: true,
              allowedFileTypes: ["pdf", "xlsx"],
              maxFileSize: 5242880,
            },
            {
              code: "DEV_GARANT",
              name: "Devolución de garantías",
              description: "Documentos de devolución de garantías",
              isMandatory: true,
              allowedFileTypes: ["pdf"],
              maxFileSize: 2097152,
            },
            {
              code: "PLANOS_AB",
              name: "Planos as built",
              description: "Planos as built para obras",
              isMandatory: false,
              allowedFileTypes: ["pdf", "dwg"],
              maxFileSize: 20971520, // 20MB
            },
            {
              code: "MANUALES",
              name: "Manuales/Certificados",
              description: "Manuales y certificados para bienes y servicios",
              isMandatory: false,
              allowedFileTypes: ["pdf"],
              maxFileSize: 10485760,
            },
          ],
          dependencies: {
            requiredPhases: [
              {
                phase: null, // Se completará con el ID de EJEC
                condition: "COMPLETED",
                isOptional: false,
              },
            ],
            blockedBy: [],
          },
          isActive: true,
        },
      ];

      const results = {
        created: [],
        skipped: [],
        errors: [],
      };

      // Crear las fases
      const createdPhases = {};
      for (const phaseData of phasesToCreate) {
        try {
          // Verificar si ya existe
          const existingPhase = await this.contractPhaseRepository.findByCode(
            phaseData.code
          );
          if (existingPhase) {
            results.skipped.push({
              code: phaseData.code,
              reason: "Ya existe en la base de datos",
            });
            createdPhases[phaseData.code] = existingPhase;
            continue;
          }

          // Crear nueva fase
          const createdPhase =
            await this.contractPhaseRepository.create(phaseData);
          results.created.push({
            code: createdPhase.code,
            name: createdPhase.name,
            category: createdPhase.category,
          });
          createdPhases[phaseData.code] = createdPhase;
        } catch (error) {
          results.errors.push({
            code: phaseData.code,
            error: error.message,
          });
        }
      }

      // Actualizar dependencias ahora que tenemos los IDs
      const dependencyUpdates = [
        {
          code: "PREC",
          dependencies: {
            requiredPhases: [
              {
                phase: createdPhases["PREP"]?._id,
                condition: "COMPLETED",
                isOptional: false,
              },
            ],
          },
        },
        {
          code: "EJEC",
          dependencies: {
            requiredPhases: [
              {
                phase: createdPhases["PREC"]?._id,
                condition: "COMPLETED",
                isOptional: false,
              },
            ],
          },
        },
        {
          code: "PAGO",
          dependencies: {
            requiredPhases: [
              {
                phase: createdPhases["EJEC"]?._id,
                condition: "IN_PROGRESS",
                isOptional: false,
              },
            ],
          },
        },
        {
          code: "RECEP",
          dependencies: {
            requiredPhases: [
              {
                phase: createdPhases["EJEC"]?._id,
                condition: "COMPLETED",
                isOptional: false,
              },
            ],
          },
        },
      ];

      for (const update of dependencyUpdates) {
        if (
          createdPhases[update.code] &&
          update.dependencies.requiredPhases[0].phase
        ) {
          try {
            await this.contractPhaseRepository.updateById(
              createdPhases[update.code]._id,
              { dependencies: update.dependencies }
            );
          } catch (error) {
            console.warn(
              `Error actualizando dependencias de ${update.code}:`,
              error.message
            );
          }
        }
      }

      return {
        summary: {
          total: phasesToCreate.length,
          created: results.created.length,
          skipped: results.skipped.length,
          errors: results.errors.length,
        },
        details: results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.INIT_ERROR,
        `Error inicializando fases de contratación: ${error.message}`,
        500
      );
    }
  }

  // =============================================================================
  // MÉTODOS UNIFICADOS DE CONFIGURACIÓN
  // =============================================================================

  /**
   * Inicializar toda la configuración del sistema de contratación
   * @returns {Promise<Object>} Resultado completo de la inicialización
   */
  async initializeCompleteConfiguration() {
    try {
      console.log(
        "🚀 Iniciando configuración completa del sistema de contratación..."
      );

      const results = {
        contractTypes: null,
        contractPhases: null,
        summary: {
          success: false,
          totalOperations: 2,
          completedOperations: 0,
          errors: [],
        },
        timestamp: new Date().toISOString(),
      };

      // Inicializar tipos de contratación
      try {
        console.log("📋 Inicializando tipos de contratación...");
        results.contractTypes = await this.initializeContractTypes();
        results.summary.completedOperations++;
        console.log(
          `✅ Tipos de contratación: ${results.contractTypes.summary.created} creados, ${results.contractTypes.summary.skipped} omitidos`
        );
      } catch (error) {
        console.error(
          "❌ Error inicializando tipos de contratación:",
          error.message
        );
        results.summary.errors.push({
          operation: "initializeContractTypes",
          error: error.message,
        });
      }

      // Inicializar fases de contratación
      try {
        console.log("📝 Inicializando fases de contratación...");
        results.contractPhases = await this.initializeContractPhases();
        results.summary.completedOperations++;
        console.log(
          `✅ Fases de contratación: ${results.contractPhases.summary.created} creadas, ${results.contractPhases.summary.skipped} omitidas`
        );
      } catch (error) {
        console.error(
          "❌ Error inicializando fases de contratación:",
          error.message
        );
        results.summary.errors.push({
          operation: "initializeContractPhases",
          error: error.message,
        });
      }

      results.summary.success =
        results.summary.completedOperations === results.summary.totalOperations;

      if (results.summary.success) {
        console.log(
          "🎉 Configuración completa del sistema finalizada exitosamente"
        );
      } else {
        console.warn("⚠️ Configuración completada con algunos errores");
      }

      return results;
    } catch (error) {
      throw createError(
        ERROR_CODES.CONFIG_ERROR,
        `Error en configuración completa del sistema: ${error.message}`,
        500
      );
    }
  }

  /**
   * Obtener configuración completa del sistema
   * @param {Object} options - Opciones de consulta
   * @returns {Promise<Object>} Configuración completa
   */
  async getCompleteConfiguration(options = {}) {
    try {
      const { includeInactive = false, contractTypeCode = null } = options;

      const [contractTypes, contractPhases] = await Promise.all([
        this.getAllContractTypes({ includeInactive }),
        this.getAllContractPhases({ includeInactive, contractTypeCode }),
      ]);

      return {
        contractTypes,
        contractPhases,
        metadata: {
          includeInactive,
          contractTypeCode,
          generatedAt: new Date().toISOString(),
          source: "GADM Cantón Esmeraldas - Expediente Digital",
          legalFramework:
            "LOSNCP - Ley Orgánica del Sistema Nacional de Contratación Pública",
        },
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.CONFIG_ERROR,
        `Error obteniendo configuración completa: ${error.message}`,
        500
      );
    }
  }

  // =============================================================================
  // MÉTODOS DE VALIDACIÓN Y UTILIDADES
  // =============================================================================

  /**
   * Validar secuencia de fases para un tipo de contrato específico
   * @param {String} contractTypeCode - Código del tipo de contrato
   * @returns {Promise<Object>} Validación de la secuencia
   */
  async validatePhaseSequence(contractTypeCode) {
    try {
      validateObjectId(contractTypeCode, "Código del tipo de contrato");

      const phases =
        await this.contractPhaseRepository.findForContractType(
          contractTypeCode
        );
      const phaseSequence = phases.sort(
        (a, b) => (a.order || 0) - (b.order || 0)
      );

      const validation = {
        isValid: true,
        issues: [],
        sequence: phaseSequence.map((phase) => ({
          code: phase.code,
          name: phase.name,
          order: phase.order,
          dependencies: phase.dependencies,
        })),
      };

      // Validar dependencias
      for (const phase of phaseSequence) {
        if (phase.dependencies?.requiredPhases?.length > 0) {
          for (const dep of phase.dependencies.requiredPhases) {
            const requiredPhase = phases.find((p) => p._id.equals(dep.phase));
            if (!requiredPhase) {
              validation.isValid = false;
              validation.issues.push({
                phase: phase.code,
                issue: "Dependencia no encontrada",
                details: `Fase requerida no existe: ${dep.phase}`,
              });
            } else if (requiredPhase.order >= phase.order) {
              validation.isValid = false;
              validation.issues.push({
                phase: phase.code,
                issue: "Orden de dependencia inválido",
                details: `La fase ${requiredPhase.code} debe ejecutarse antes que ${phase.code}`,
              });
            }
          }
        }
      }

      return validation;
    } catch (error) {
      throw createError(
        ERROR_CODES.VALIDATION_ERROR,
        `Error validando secuencia de fases: ${error.message}`,
        400
      );
    }
  }

  /**
   * Obtener estadísticas de configuración
   * @returns {Promise<Object>} Estadísticas del sistema
   */
  async getConfigurationStatistics() {
    try {
      const [contractTypes, contractPhases] = await Promise.all([
        this.contractTypeRepository.findAll({ isActive: true }),
        this.contractPhaseRepository.findAll({ isActive: true }),
      ]);

      // Estadísticas de tipos
      const typeStats = contractTypes.reduce(
        (stats, type) => {
          stats.total++;
          stats.byCategory[type.category] =
            (stats.byCategory[type.category] || 0) + 1;
          if (type.requiresPublication) stats.requirePublication++;
          return stats;
        },
        { total: 0, byCategory: {}, requirePublication: 0 }
      );

      // Estadísticas de fases
      const phaseStats = contractPhases.reduce(
        (stats, phase) => {
          stats.total++;
          stats.byCategory[phase.category] =
            (stats.byCategory[phase.category] || 0) + 1;
          if (phase.isRequired) stats.required++;
          stats.totalDocuments += phase.requiredDocuments?.length || 0;
          return stats;
        },
        { total: 0, byCategory: {}, required: 0, totalDocuments: 0 }
      );

      return {
        contractTypes: typeStats,
        contractPhases: phaseStats,
        system: {
          configuredAt: new Date().toISOString(),
          framework: "LOSNCP",
          entity: "GADM Cantón Esmeraldas",
        },
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.STATISTICS_ERROR,
        `Error obteniendo estadísticas: ${error.message}`,
        500
      );
    }
  }

  // =============================================================================
  // MÉTODOS CRUD INDIVIDUALES PARA TIPOS DE CONTRATACIÓN
  // =============================================================================

  /**
   * Crear un nuevo tipo de contratación
   * @param {Object} typeData - Datos del tipo de contratación
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Tipo de contratación creado
   */
  async createContractType(typeData, options = {}) {
    try {
      console.log(`📝 Creando nuevo tipo de contratación: ${typeData.code}`);

      // Validar datos requeridos
      const requiredFields = ["code", "name", "category", "description"];
      const missingFields = requiredFields.filter((field) => !typeData[field]);

      if (missingFields.length > 0) {
        throw createValidationError(
          `Campos requeridos faltantes: ${missingFields.join(", ")}`
        );
      }

      // Validar categoría
      const validCategories = ["COMMON", "SPECIAL"];
      if (!validCategories.includes(typeData.category)) {
        throw createValidationError(
          `Categoría inválida. Debe ser: ${validCategories.join(" o ")}`
        );
      }

      // Verificar que el código no exista
      const existingType = await this.contractTypeRepository.findByCode(
        typeData.code
      );
      if (existingType) {
        throw createValidationError(
          `Ya existe un tipo de contratación con el código: ${typeData.code}`
        );
      }

      // Preparar datos con valores por defecto
      const contractTypeToCreate = {
        code: typeData.code.toUpperCase(),
        name: typeData.name,
        category: typeData.category,
        description: typeData.description,
        displayOrder: typeData.displayOrder || 99,
        requiresPublication: typeData.requiresPublication ?? true,
        estimatedDuration: typeData.estimatedDuration || 30,
        legalReference: typeData.legalReference || "",
        applicableObjects: typeData.applicableObjects || [
          "bienes",
          "servicios",
        ],
        monetaryLimits: typeData.monetaryLimits || {},
        isActive: typeData.isActive ?? true,
        audit: {
          createdBy: options.userId || "system",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const createdType =
        await this.contractTypeRepository.create(contractTypeToCreate);

      console.log(
        `✅ Tipo de contratación creado exitosamente: ${createdType.code}`
      );

      return createdType;
    } catch (error) {
      throw createError(
        ERROR_CODES.CREATION_ERROR,
        `Error creando tipo de contratación: ${error.message}`,
        400
      );
    }
  }

  /**
   * Actualizar un tipo de contratación existente
   * @param {String} typeId - ID del tipo de contratación
   * @param {Object} updateData - Datos a actualizar
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Tipo de contratación actualizado
   */
  async updateContractType(typeId, updateData, options = {}) {
    try {
      validateObjectId(typeId, "ID del tipo de contratación");

      console.log(`📝 Actualizando tipo de contratación: ${typeId}`);

      // Verificar que existe
      const existingType = await this.contractTypeRepository.findById(typeId);
      if (!existingType) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Tipo de contratación no encontrado",
          404
        );
      }

      // Si se actualiza el código, verificar que no exista otro con el mismo código
      if (updateData.code && updateData.code !== existingType.code) {
        const duplicateType = await this.contractTypeRepository.findByCode(
          updateData.code
        );
        if (duplicateType) {
          throw createValidationError(
            `Ya existe otro tipo de contratación con el código: ${updateData.code}`
          );
        }
      }

      // Preparar datos de actualización
      const dataToUpdate = {
        ...updateData,
        audit: {
          ...existingType.audit,
          updatedBy: options.userId || "system",
          updatedAt: new Date(),
        },
      };

      const updatedType = await this.contractTypeRepository.updateById(
        typeId,
        dataToUpdate
      );

      console.log(`✅ Tipo de contratación actualizado: ${updatedType.code}`);

      return updatedType;
    } catch (error) {
      throw createError(
        ERROR_CODES.UPDATE_ERROR,
        `Error actualizando tipo de contratación: ${error.message}`,
        400
      );
    }
  }

  /**
   * Eliminar (desactivar) un tipo de contratación
   * @param {String} typeId - ID del tipo de contratación
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Resultado de la operación
   */
  async deleteContractType(typeId, options = {}) {
    try {
      validateObjectId(typeId, "ID del tipo de contratación");

      console.log(`🗑️ Eliminando tipo de contratación: ${typeId}`);

      // Verificar que existe
      const existingType = await this.contractTypeRepository.findById(typeId);
      if (!existingType) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Tipo de contratación no encontrado",
          404
        );
      }

      // Verificar si está siendo usado en contratos activos
      // TODO: Implementar verificación de uso en contratos

      // Soft delete - marcar como inactivo
      const deactivatedType = await this.contractTypeRepository.updateById(
        typeId,
        {
          isActive: false,
          audit: {
            ...existingType.audit,
            deactivatedBy: options.userId || "system",
            deactivatedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      console.log(`✅ Tipo de contratación desactivado: ${existingType.code}`);

      return {
        success: true,
        message: "Tipo de contratación desactivado exitosamente",
        type: deactivatedType,
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.DELETE_ERROR,
        `Error eliminando tipo de contratación: ${error.message}`,
        400
      );
    }
  }

  // =============================================================================
  // MÉTODOS CRUD INDIVIDUALES PARA FASES DE CONTRATACIÓN
  // =============================================================================

  /**
   * Crear una nueva fase de contratación
   * @param {Object} phaseData - Datos de la fase
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Fase de contratación creada
   */
  async createContractPhase(phaseData, options = {}) {
    try {
      console.log(`📝 Creando nueva fase de contratación: ${phaseData.code}`);

      // Validar datos requeridos
      const requiredFields = ["code", "name", "category", "description"];
      const missingFields = requiredFields.filter((field) => !phaseData[field]);

      if (missingFields.length > 0) {
        throw createValidationError(
          `Campos requeridos faltantes: ${missingFields.join(", ")}`
        );
      }

      // Validar categoría
      const validCategories = [
        "PREPARATORIA",
        "PRECONTRACTUAL",
        "CONTRACTUAL",
        "PAGO",
        "RECEPCION",
      ];
      if (!validCategories.includes(phaseData.category)) {
        throw createValidationError(
          `Categoría inválida. Debe ser: ${validCategories.join(", ")}`
        );
      }

      // Verificar que el código no exista
      const existingPhase = await this.contractPhaseRepository.findByCode(
        phaseData.code
      );
      if (existingPhase) {
        throw createValidationError(
          `Ya existe una fase de contratación con el código: ${phaseData.code}`
        );
      }

      // Preparar datos con valores por defecto
      const phaseToCreate = {
        code: phaseData.code.toUpperCase(),
        name: phaseData.name,
        category: phaseData.category,
        description: phaseData.description,
        order: phaseData.order || 1,
        isRequired: phaseData.isRequired ?? true,
        estimatedDuration: phaseData.estimatedDuration || 5,
        allowedStatus: phaseData.allowedStatus || [
          "IN_PROGRESS",
          "COMPLETED",
          "REJECTED",
        ],
        requiredDocuments: phaseData.requiredDocuments || [],
        dependencies: phaseData.dependencies || { requiredPhases: [] },
        notifications: phaseData.notifications || {
          required: [],
          optional: [],
        },
        isActive: phaseData.isActive ?? true,
        audit: {
          createdBy: options.userId || "system",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const createdPhase =
        await this.contractPhaseRepository.create(phaseToCreate);

      console.log(
        `✅ Fase de contratación creada exitosamente: ${createdPhase.code}`
      );

      return createdPhase;
    } catch (error) {
      throw createError(
        ERROR_CODES.CREATION_ERROR,
        `Error creando fase de contratación: ${error.message}`,
        400
      );
    }
  }

  /**
   * Actualizar una fase de contratación existente
   * @param {String} phaseId - ID de la fase
   * @param {Object} updateData - Datos a actualizar
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Fase de contratación actualizada
   */
  async updateContractPhase(phaseId, updateData, options = {}) {
    try {
      validateObjectId(phaseId, "ID de la fase de contratación");

      console.log(`📝 Actualizando fase de contratación: ${phaseId}`);

      // Verificar que existe
      const existingPhase =
        await this.contractPhaseRepository.findById(phaseId);
      if (!existingPhase) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Fase de contratación no encontrada",
          404
        );
      }

      // Si se actualiza el código, verificar que no exista otro con el mismo código
      if (updateData.code && updateData.code !== existingPhase.code) {
        const duplicatePhase = await this.contractPhaseRepository.findByCode(
          updateData.code
        );
        if (duplicatePhase) {
          throw createValidationError(
            `Ya existe otra fase de contratación con el código: ${updateData.code}`
          );
        }
      }

      // Preparar datos de actualización
      const dataToUpdate = {
        ...updateData,
        audit: {
          ...existingPhase.audit,
          updatedBy: options.userId || "system",
          updatedAt: new Date(),
        },
      };

      const updatedPhase = await this.contractPhaseRepository.updateById(
        phaseId,
        dataToUpdate
      );

      console.log(`✅ Fase de contratación actualizada: ${updatedPhase.code}`);

      return updatedPhase;
    } catch (error) {
      throw createError(
        ERROR_CODES.UPDATE_ERROR,
        `Error actualizando fase de contratación: ${error.message}`,
        400
      );
    }
  }

  /**
   * Eliminar (desactivar) una fase de contratación
   * @param {String} phaseId - ID de la fase
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<Object>} Resultado de la operación
   */
  async deleteContractPhase(phaseId, options = {}) {
    try {
      validateObjectId(phaseId, "ID de la fase de contratación");

      console.log(`🗑️ Eliminando fase de contratación: ${phaseId}`);

      // Verificar que existe
      const existingPhase =
        await this.contractPhaseRepository.findById(phaseId);
      if (!existingPhase) {
        throw createError(
          ERROR_CODES.NOT_FOUND,
          "Fase de contratación no encontrada",
          404
        );
      }

      // Verificar si está siendo usado en contratos activos
      // TODO: Implementar verificación de uso en contratos

      // Soft delete - marcar como inactivo
      const deactivatedPhase = await this.contractPhaseRepository.updateById(
        phaseId,
        {
          isActive: false,
          audit: {
            ...existingPhase.audit,
            deactivatedBy: options.userId || "system",
            deactivatedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      console.log(`✅ Fase de contratación desactivada: ${existingPhase.code}`);

      return {
        success: true,
        message: "Fase de contratación desactivada exitosamente",
        phase: deactivatedPhase,
      };
    } catch (error) {
      throw createError(
        ERROR_CODES.DELETE_ERROR,
        `Error eliminando fase de contratación: ${error.message}`,
        400
      );
    }
  }
}
