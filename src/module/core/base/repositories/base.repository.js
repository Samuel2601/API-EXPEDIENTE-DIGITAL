// =============================================================================
// src/modules/core/repositories/base.repository.js - VERSIÓN MEJORADA
// Con capacidades avanzadas de agregación y búsquedas complejas
// =============================================================================
import { Types } from "mongoose";
import { AuditRepository } from "../../../security/audit/repositories/audit.repository.js";

export class BaseRepository {
  constructor(model) {
    this.model = model;
    this.modelName = model.modelName;

    // Configuración por defecto para agregaciones
    this.defaultLookups = new Map();
    this.defaultProjections = new Map();

    this.initializeDefaultConfig();
  }

  /**
   * Inicializar configuración por defecto para el modelo
   */
  initializeDefaultConfig() {
    // Configurar lookups comunes basados en refs del schema
    const schemaObj = this.model.schema.obj;
    this.autoDetectLookups(schemaObj);
  }

  /**
   * Auto-detectar relaciones para lookups automáticos
   */
  autoDetectLookups(schemaObj, prefix = "") {
    for (const [field, definition] of Object.entries(schemaObj)) {
      if (definition.ref) {
        this.defaultLookups.set(prefix + field, {
          from: this.getCollectionName(definition.ref),
          localField: prefix + field,
          foreignField: "_id",
          as: prefix + field,
          model: definition.ref,
        });
      } else if (Array.isArray(definition) && definition[0]?.ref) {
        this.defaultLookups.set(prefix + field, {
          from: this.getCollectionName(definition[0].ref),
          localField: prefix + field,
          foreignField: "_id",
          as: prefix + field,
          model: definition[0].ref,
        });
      } else if (definition.type && typeof definition.type === "object") {
        this.autoDetectLookups(definition.type, prefix + field + ".");
      }
    }
  }

  /**
   * Obtener nombre de colección desde nombre de modelo
   */
  getCollectionName(modelName) {
    // Convertir nombre de modelo a nombre de colección (pluralizado y en minúsculas)
    const collectionNames = {
      User: "users",
      Role: "roles",
      Business: "businesses",
      UserSession: "usersessions",
      Address: "addresses",
      Review: "reviews",
      Category: "categories",
    };

    return collectionNames[modelName] || modelName.toLowerCase() + "s";
  }

  // ===== MÉTODOS CRUD BÁSICOS =====

  /**
   * Crear nuevo documento
   */
  async create(data, userData, options = {}) {
    try {
      const document = new this.model({
        ...data,
        createdBy: userData.userId,
        updatedBy: userData.userId,
      });

      return await document.save(options);
    } catch (error) {
      console.log(error);
      throw new Error(`Error creando ${this.modelName}: ${error.message}`);
    }
  }

  async createMany(data, options = {}) {
    return await this.model.insertMany(data, options);
  }

  async deleteMany(query, options = {}) {
    return await this.model.deleteMany(query, options);
  }

  /**
   * Obtener documentos con paginación
   */
  async findAll(query = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      sort = "-createdAt",
      populate = "",
      select = "",
      includeDeleted = false,
    } = options;

    const baseQuery = { ...query };
    const deletedFilter = includeDeleted
      ? {}
      : { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] };

    const finalQuery =
      Object.keys(baseQuery).length > 0
        ? { $and: [baseQuery, deletedFilter] }
        : deletedFilter;

    return await this.model.paginate(finalQuery, {
      page,
      limit,
      sort,
      populate,
      select,
      lean: true,
    });
  }

  /**
   * Obtener documento por ID
   */
  async findById(id, options = {}) {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new Error("ID no válido");
      }

      const { populate = "", includeDeleted = false, lean = true } = options;

      const query = this.model.findById(id);

      if (!includeDeleted) {
        query.where({
          $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
        });
      }

      if (Array.isArray(populate)) {
        for (const p of populate) {
          query.populate(p);
        }
      } else if (typeof populate === "string" || typeof populate === "object") {
        query.populate(populate);
      }

      if (lean) {
        query.lean();
      }

      const document = await query;

      if (!document) {
        throw new Error("Documento no encontrado");
      }

      if (lean && options.returnInstance) {
        return this.model.hydrate(document);
      }

      return document;
    } catch (error) {
      console.error("Error en findById:", error);
      throw new Error(`Error obteniendo documento: ${error.message}`);
    }
  }

  /**
   * Actualizar documento con auditoría
   */
  async update(id, updateData, userData, options = {}) {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("ID no válido");
    }

    try {
      const originalDoc = await this.model.findById(id).lean();
      if (!originalDoc || originalDoc.deletedAt) {
        throw new Error("Documento no encontrado");
      }

      const dataToUpdate = {
        ...updateData,
        updatedBy: userData.userId,
        updatedAt: new Date(),
      };

      const session = options.session;
      const updateOptions = {
        new: true,
        lean: true,
        session,
        ...options,
      };

      const updatedDoc = await this.model.findByIdAndUpdate(
        id,
        dataToUpdate,
        updateOptions
      );

      try {
        await AuditRepository.saveUpdateWithDetection(
          {
            schema: this.modelName,
            documentId: id,
            originalDoc,
            updatedDoc,
            userData,
          },
          options
        );
      } catch (auditError) {
        console.error("Error en auditoría:", auditError);
      }

      return updatedDoc;
    } catch (error) {
      console.error(`Error al actualizar ${this.modelName}:`, error);
      throw error;
    }
  }

  // ===== MÉTODOS DE AGREGACIÓN AVANZADOS =====

  /**
   * Búsqueda usando agregación MongoDB con lookups automáticos
   * @param {Object} config - Configuración de la búsqueda
   */
  async searchWithAggregation(config) {
    try {
      const {
        filters = {},
        options = {},
        lookups = [],
        customPipeline = [],
        enableAutoLookups = true,
      } = config;

      console.log(
        `🔍 Búsqueda con agregación para ${this.modelName}:`,
        filters
      );

      const {
        page = 1,
        limit = 10,
        sort = { createdAt: -1 },
        includeDeleted = false,
      } = options;

      const skip = (page - 1) * limit;

      // Construir pipeline de agregación
      const pipeline = [];

      // 1. Match inicial - filtrar documentos eliminados
      const initialMatch = includeDeleted
        ? {}
        : {
            $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
          };

      if (Object.keys(initialMatch).length > 0) {
        pipeline.push({ $match: initialMatch });
      }

      // 2. Lookups automáticos si están habilitados
      if (enableAutoLookups) {
        for (const [field, lookupConfig] of this.defaultLookups) {
          pipeline.push({
            $lookup: {
              from: lookupConfig.from,
              localField: lookupConfig.localField,
              foreignField: lookupConfig.foreignField,
              as: lookupConfig.as,
              pipeline: this.getDefaultProjectionPipeline(lookupConfig.model),
            },
          });

          // Unwind si no es array
          if (!Array.isArray(this.model.schema.obj[field])) {
            pipeline.push({
              $unwind: {
                path: `$${lookupConfig.as}`,
                preserveNullAndEmptyArrays: true,
              },
            });
          }
        }
      }

      // 3. Lookups personalizados
      for (const lookup of lookups) {
        pipeline.push({ $lookup: lookup });

        // Auto-unwind si se especifica
        if (lookup.unwind) {
          pipeline.push({
            $unwind: {
              path: `$${lookup.as}`,
              preserveNullAndEmptyArrays: lookup.preserveNull !== false,
            },
          });
        }
      }

      // 4. Pipeline personalizado (antes del match de filtros)
      pipeline.push(...customPipeline);

      // 5. Match de filtros de búsqueda
      const searchMatch = this.buildSearchMatch(filters);
      if (Object.keys(searchMatch).length > 0) {
        pipeline.push({ $match: searchMatch });
      }

      // 6. Facet para datos y conteo
      pipeline.push({
        $facet: {
          data: [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      });

      console.log(
        "🔍 Ejecutando pipeline de agregación:",
        JSON.stringify(pipeline, null, 2)
      );
      const result = await this.model.aggregate(pipeline);

      const docs = result[0]?.data || [];
      const totalDocs = result[0]?.totalCount[0]?.count || 0;
      const totalPages = Math.ceil(totalDocs / limit);

      console.log("✅ Agregación completada:", {
        docs: docs.length,
        totalDocs,
        totalPages,
      });

      // Retornar en formato compatible con mongoose-paginate-v2
      return {
        docs,
        totalDocs,
        totalPages,
        page,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null,
        pagingCounter: (page - 1) * limit + 1,
      };
    } catch (error) {
      console.error("❌ Error en agregación:", error);
      throw new Error(`Error en búsqueda con agregación: ${error.message}`);
    }
  }

  /**
   * Construir match de búsqueda desde filtros
   */
  buildSearchMatch(filters) {
    const match = {};
    const {
      search,
      text,
      dateFrom,
      dateTo,
      createdBy,
      updatedBy,
      isActive,
      ...otherFilters
    } = filters;

    // Búsqueda de texto genérica
    if (search || text) {
      const searchText = search || text;
      const textFields = this.getTextSearchFields();

      if (textFields.length > 0) {
        match.$or = textFields.map((field) => ({
          [field]: { $regex: searchText, $options: "i" },
        }));
      }
    }

    // Filtro por rango de fechas
    if (dateFrom || dateTo) {
      match.createdAt = {};
      if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
      if (dateTo) match.createdAt.$lte = new Date(dateTo);
    }

    // Filtros de auditoría
    if (createdBy) match.createdBy = new Types.ObjectId(createdBy);
    if (updatedBy) match.updatedBy = new Types.ObjectId(updatedBy);
    if (isActive !== undefined) match.isActive = isActive;

    // Otros filtros específicos
    Object.assign(match, otherFilters);

    return match;
  }

  /**
   * Obtener campos para búsqueda de texto
   */
  getTextSearchFields() {
    const fields = [];
    const schemaObj = this.model.schema.obj;

    for (const [field, definition] of Object.entries(schemaObj)) {
      if (
        definition.type === String &&
        !field.includes("password") &&
        !field.includes("token")
      ) {
        fields.push(field);
      }
    }

    return fields;
  }

  /**
   * Obtener pipeline de proyección por defecto para un modelo
   */
  getDefaultProjectionPipeline(modelName) {
    const commonExclusions = {
      __v: 0,
      deletedAt: 0,
      deletedBy: 0,
      deletionReason: 0,
    };

    const modelSpecificExclusions = {
      User: {
        passwordHash: 0,
        emailVerificationToken: 0,
        passwordResetToken: 0,
      },
      UserSession: { accessTokenHash: 0, refreshTokenHash: 0, sessionToken: 0 },
    };

    const exclusions = {
      ...commonExclusions,
      ...(modelSpecificExclusions[modelName] || {}),
    };

    return [{ $project: exclusions }];
  }

  /**
   * Búsqueda específica con joins complejos
   * @param {Object} config - Configuración específica del modelo
   */
  async findWithJoins(config) {
    const {
      baseMatch = {},
      joins = [],
      searchFields = [],
      searchText = "",
      sort = { createdAt: -1 },
      page = 1,
      limit = 10,
    } = config;

    const pipeline = [];

    // Match inicial
    pipeline.push({
      $match: {
        ...baseMatch,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      },
    });

    // Joins especificados
    for (const join of joins) {
      pipeline.push({ $lookup: join });

      if (join.unwind) {
        pipeline.push({
          $unwind: {
            path: `$${join.as}`,
            preserveNullAndEmptyArrays: true,
          },
        });
      }
    }

    // Búsqueda en campos relacionados
    if (searchText && searchFields.length > 0) {
      pipeline.push({
        $match: {
          $or: searchFields.map((field) => ({
            [field]: { $regex: searchText, $options: "i" },
          })),
        },
      });
    }

    // Paginación y resultado
    const skip = (page - 1) * limit;

    pipeline.push({
      $facet: {
        data: [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: "count" }],
      },
    });

    const result = await this.model.aggregate(pipeline);

    const docs = result[0]?.data || [];
    const totalDocs = result[0]?.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalDocs / limit);

    return {
      docs,
      totalDocs,
      totalPages,
      page,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
      pagingCounter: (page - 1) * limit + 1,
    };
  }

  /**
   * Estadísticas usando agregación
   */
  async getStatsWithAggregation(config = {}) {
    const {
      groupBy = null,
      dateField = "createdAt",
      filters = {},
      customPipeline = [],
    } = config;

    const pipeline = [];

    // Match inicial
    const match = {
      ...filters,
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    };
    pipeline.push({ $match: match });

    // Pipeline personalizado
    pipeline.push(...customPipeline);

    // Agrupación
    const groupStage = {
      _id: groupBy,
      count: { $sum: 1 },
      firstDate: { $min: `$${dateField}` },
      lastDate: { $max: `$${dateField}` },
    };

    pipeline.push({ $group: groupStage });
    pipeline.push({ $sort: { count: -1 } });

    return await this.model.aggregate(pipeline);
  }

  // ===== MÉTODOS AUXILIARES EXISTENTES =====

  async softDelete(id, userData) {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("ID no válido");
    }

    const document = await this.model.findById(id);
    if (!document || document.deletedAt) {
      throw new Error("Documento no encontrado");
    }

    document.deletedBy = userData.userId;
    document.deletedAt = new Date();

    return await document.save();
  }

  async forceDelete(id, userData) {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("ID no válido");
    }

    const documentToDelete = await this.model.findById(id).lean();
    if (!documentToDelete) {
      throw new Error("Documento no encontrado");
    }

    await AuditRepository.saveDeleteBackup({
      schema: this.modelName,
      documentId: id,
      documentToDelete,
      userData,
    });

    await this.model.findByIdAndDelete(id);

    return { message: "Documento eliminado permanentemente" };
  }

  async restore(id, userData) {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("ID no válido");
    }

    const document = await this.model.findById(id);
    if (!document) {
      throw new Error("Documento no encontrado");
    }
    if (!document.deletedAt) {
      throw new Error("Documento no está eliminado");
    }

    document.deletedBy = undefined;
    document.deletedAt = undefined;
    document.updatedBy = userData.userId;
    document.updatedAt = new Date();

    return await document.save();
  }

  async getAuditHistory(id, options = {}) {
    return await AuditRepository.getDocumentHistory(
      id,
      this.modelName,
      options
    );
  }

  async search(searchParams, options = {}) {
    const { text, dateFrom, dateTo, createdBy, ...otherFilters } = searchParams;

    let query = { ...otherFilters };

    if (text) {
      query.$text = { $search: text };
    }

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    if (createdBy) {
      query.createdBy = new Types.ObjectId(createdBy);
    }

    return await this.findAll(query, options);
  }

  async updateMany(filter, updateData, userData) {
    const docsToUpdate = await this.model.find(filter).lean();

    if (docsToUpdate.length === 0) {
      return { modifiedCount: 0 };
    }

    const result = await this.model.updateMany(filter, {
      ...updateData,
      updatedBy: userData.userId,
      updatedAt: new Date(),
    });

    for (const originalDoc of docsToUpdate) {
      try {
        const updatedDoc = await this.model.findById(originalDoc._id).lean();

        await AuditRepository.saveUpdateWithDetection({
          schema: this.modelName,
          documentId: originalDoc._id,
          originalDoc,
          updatedDoc,
          userData: {
            ...userData,
            batchOperation: true,
          },
        });
      } catch (auditError) {
        console.error(
          `Error auditando documento ${originalDoc._id}:`,
          auditError
        );
      }
    }

    return result;
  }
}
