// =============================================================================
// scripts/sercop-initial-load.js
// Script para carga inicial de contratos desde API de SERCOP
// Sincroniza tipos de contrato automáticamente
// =============================================================================

import mongoose from "mongoose";
import dotenv from "dotenv";
import sercopSyncService from "../src/module/exp-digital/services/sercop-sync.service.js";
import { ContractRepository } from "../src/module/exp-digital/repositories/contract.repository.js";
import { DepartmentRepository } from "../src/module/exp-digital/repositories/department.repository.js";

// Cargar variables de entorno
dotenv.config();

// Configuración de carga
const LOAD_CONFIG = {
  buyer: "GOBIERNO AUTONOMO DESCENTRALIZADO DE LA PROVINCIA DE ESMERALDAS",
  year: 2025,
  dryRun: process.argv.includes("--dry-run"),
  syncTypes: !process.argv.includes("--no-sync-types"),
  importContracts: process.argv.includes("--import-contracts"),
  maxContracts:
    parseInt(
      process.argv.find((arg) => arg.startsWith("--max="))?.split("=")[1]
    ) || null,
};

class SercopInitialLoader {
  constructor() {
    this.contractRepo = new ContractRepository();
    this.departmentRepo = new DepartmentRepository();
    this.stats = {
      typesProcessed: 0,
      typesCreated: 0,
      typesExisting: 0,
      contractsProcessed: 0,
      contractsImported: 0,
      contractsSkipped: 0,
      errors: [],
    };
  }

  /**
   * Conectar a MongoDB
   */
  async connect() {
    try {
      const mongoUri =
        process.env.MONGO_URI || "mongodb://localhost:27017/labella";
      console.log(
        `🔌 Conectando a MongoDB: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")}`
      );

      await mongoose.connect(mongoUri);
      console.log("✅ Conectado a MongoDB");
    } catch (error) {
      console.error("❌ Error conectando a MongoDB:", error);
      throw error;
    }
  }

  /**
   * Desconectar de MongoDB
   */
  async disconnect() {
    await mongoose.disconnect();
    console.log("🔌 Desconectado de MongoDB");
  }

  /**
   * Paso 1: Sincronizar tipos de contrato
   */
  async syncContractTypes() {
    console.log("\n" + "=".repeat(80));
    console.log("📋 PASO 1: SINCRONIZACIÓN DE TIPOS DE CONTRATO");
    console.log("=".repeat(80));

    if (!LOAD_CONFIG.syncTypes) {
      console.log(
        "⏭️  Sincronización de tipos deshabilitada (--no-sync-types)"
      );
      return;
    }

    try {
      const result = await sercopSyncService.syncContractTypes({
        year: LOAD_CONFIG.year,
        buyer: LOAD_CONFIG.buyer,
        dryRun: LOAD_CONFIG.dryRun,
        userData: {
          userId: "665f23c4cdda33eaedaa4326",
          ip: "127.0.0.1",
          userAgent: "SercopInitialLoader/1.0",
        },
      });

      this.stats.typesProcessed = result.processed;
      this.stats.typesCreated = result.created;
      this.stats.typesExisting = result.existing;

      console.log("\n📊 Resumen de sincronización de tipos:");
      console.log(`   ✅ Tipos procesados: ${result.processed}`);
      console.log(`   ➕ Tipos creados: ${result.created}`);
      console.log(`   📁 Tipos existentes: ${result.existing}`);
      console.log(`   ⚠️  Tipos sin mapear: ${result.unmapped}`);

      if (result.unmappedTypes.length > 0) {
        console.log(
          "\n⚠️  ATENCIÓN: Los siguientes tipos no tienen mapeo definido:"
        );
        result.unmappedTypes.forEach((type) => {
          console.log(`   - ${type}`);
        });
        console.log(
          "\n   💡 Considera agregar estos tipos al mapeo en sercop-sync.service.js"
        );
      }
    } catch (error) {
      console.error("❌ Error en sincronización de tipos:", error);
      this.stats.errors.push({
        step: "sync_types",
        error: error.message,
      });
    }
  }

  /**
   * Paso 2: Importar contratos (opcional)
   */
  async importContracts() {
    console.log("\n" + "=".repeat(80));
    console.log("📥 PASO 2: IMPORTACIÓN DE CONTRATOS");
    console.log("=".repeat(80));

    if (!LOAD_CONFIG.importContracts) {
      console.log("⏭️  Importación de contratos deshabilitada");
      console.log("   💡 Para habilitar, ejecuta con: --import-contracts");
      return;
    }

    try {
      // Obtener departamento por defecto
      const defaultDepartment = await this._getOrCreateDefaultDepartment();

      let currentPage = 1;
      let hasMorePages = true;
      let totalImported = 0;

      while (
        hasMorePages &&
        (!LOAD_CONFIG.maxContracts || totalImported < LOAD_CONFIG.maxContracts)
      ) {
        console.log(`\n📄 Procesando página ${currentPage}...`);

        const searchResults = await sercopSyncService.searchContracts({
          year: LOAD_CONFIG.year,
          buyer: LOAD_CONFIG.buyer,
          page: currentPage,
          limit: 100,
        });

        if (!searchResults.data || searchResults.data.length === 0) {
          break;
        }

        for (const sercopContract of searchResults.data) {
          if (
            LOAD_CONFIG.maxContracts &&
            totalImported >= LOAD_CONFIG.maxContracts
          ) {
            hasMorePages = false;
            break;
          }

          this.stats.contractsProcessed++;

          try {
            // Verificar si el contrato ya existe (por OCID)
            const existing = await this.contractRepo.findAll({
              sercopCode: sercopContract.ocid,
            });

            if (existing.docs.length > 0) {
              this.stats.contractsSkipped++;
              console.log(`⏭️  Contrato ya existe: ${sercopContract.ocid}`);
              continue;
            }

            if (LOAD_CONFIG.dryRun) {
              console.log(`📋 Se importaría: ${sercopContract.title}`);
              this.stats.contractsImported++;
              continue;
            }

            // Obtener o crear tipo de contrato
            const typeResult = await sercopSyncService.getOrCreateContractType(
              sercopContract.internal_type
            );

            if (!typeResult.contractType) {
              console.warn(
                `⚠️  No se pudo determinar tipo para: ${sercopContract.internal_type}`
              );
              continue;
            }

            // Mapear contrato de SERCOP a nuestro modelo
            const contractData = this._mapSercopToContract(
              sercopContract,
              typeResult.contractType._id,
              defaultDepartment._id
            );

            // Crear contrato
            const contract = await this.contractRepo.create(contractData, {
              userId: "665f23c4cdda33eaedaa4326",
              ip: "127.0.0.1",
              userAgent: "SercopInitialLoader/1.0",
            });

            this.stats.contractsImported++;
            totalImported++;

            console.log(`✅ Importado: ${contract.code} - ${contract.title}`);
          } catch (error) {
            console.error(
              `❌ Error importando contrato ${sercopContract.ocid}:`,
              error.message
            );
            this.stats.errors.push({
              step: "import_contract",
              ocid: sercopContract.ocid,
              error: error.message,
            });
          }
        }

        hasMorePages = currentPage < searchResults.pages;
        currentPage++;

        // Límite de seguridad
        if (currentPage > 100) {
          console.warn("⚠️  Alcanzado límite de 100 páginas");
          break;
        }
      }

      console.log("\n📊 Resumen de importación de contratos:");
      console.log(
        `   📄 Contratos procesados: ${this.stats.contractsProcessed}`
      );
      console.log(
        `   ✅ Contratos importados: ${this.stats.contractsImported}`
      );
      console.log(
        `   ⏭️  Contratos omitidos (ya existen): ${this.stats.contractsSkipped}`
      );
    } catch (error) {
      console.error("❌ Error en importación de contratos:", error);
      this.stats.errors.push({
        step: "import_contracts",
        error: error.message,
      });
    }
  }

  /**
   * Obtener o crear departamento por defecto
   * @private
   */
  async _getOrCreateDefaultDepartment() {
    try {
      let department = await this.departmentRepo.findByLevel(0);
      console.log("department", department);

      if (!department) {
        console.log("📝 Creando departamento por defecto para importación...");
        department = await this.departmentRepo.create(
          {
            code: "GADMCE",
            name: "Gobierno Autónomo Descentralizado Municipal del Cantón Esmeraldas",
            shortName: "GADMCE",
            description:
              "Entidad principal responsable de la administración municipal del cantón Esmeraldas",
            responsible: {
              name: "Alcalde de Esmeraldas",
              position: "Alcalde",
              extension: "101",
            },
            contact: {
              phone: "+593-6-2720000",
              email: "info@esmeraldas.gob.ec",
              floor: "1",
              office: "Principal",
            },
            parentDepartment: null,
            level: 1,
            displayOrder: 0,
            budgetConfig: {
              maxApprovalAmount: 1000000,
              canApproveContracts: true,
              requiresApproval: true,
            },
            tags: ["gobierno", "municipio", "gadmce"],
            isActive: true,
          },
          {
            userId: "665f23c4cdda33eaedaa4326",
            ip: "127.0.0.1",
            userAgent: "SercopInitialLoader/1.0",
          }
        );
      }

      return department.docs[0];
    } catch (error) {
      throw new Error(
        `Error creando departamento por defecto: ${error.message}`
      );
    }
  }

  /**
   * Mapear contrato de SERCOP a nuestro modelo
   * @private
   */
  _mapSercopToContract(sercopContract, contractTypeId, departmentId) {
    console.log("sercopContract", sercopContract);
    console.log("contractTypeId", contractTypeId);
    console.log("departmentId", departmentId);
    return {
      contractNumber:
        sercopContract.region.toString() +
        "-" +
        sercopContract.year.toString() +
        "-" +
        sercopContract.month.toString() +
        "-" +
        sercopContract.id.toString(),
      code:
        sercopContract.ocid.split("-").pop() || sercopContract.id.toString(),
      title: sercopContract.title || sercopContract.description,
      contractualObject:
        sercopContract.description || "Sin descripción proporcionada",

      contractType: contractTypeId,
      requestingDepartment: departmentId,

      generalStatus: "DRAFT",

      budget: {
        estimatedValue: parseFloat(sercopContract.amount) || 0,
        currency: "USD",
        totalAmount: parseFloat(sercopContract.amount) || 0,
      },

      contractor: {
        name: sercopContract.suppliers || "N/A",
        ruc: null,
      },

      timeline: {
        plannedStartDate: sercopContract.date
          ? new Date(sercopContract.date)
          : null,
      },
      sercopCode: sercopContract.ocid,
      metadata: {
        sercopOcid: sercopContract.ocid,
        sercopInternalType: sercopContract.internal_type,
        sercopMethod: sercopContract.method,
        importedAt: new Date(),
        source: "SERCOP_INITIAL_LOAD",
      },
    };
  }

  /**
   * Ejecutar carga completa
   */
  async run() {
    console.log("\n" + "█".repeat(80));
    console.log("🚀 CARGA INICIAL DE DATOS DESDE SERCOP");
    console.log("█".repeat(80));
    console.log(`\n⚙️  Configuración:`);
    console.log(`   Comprador: ${LOAD_CONFIG.buyer}`);
    console.log(`   Año: ${LOAD_CONFIG.year}`);
    console.log(
      `   Modo: ${LOAD_CONFIG.dryRun ? "🔍 DRY RUN (sin cambios)" : "⚡ PRODUCCIÓN"}`
    );
    console.log(`   Sincronizar tipos: ${LOAD_CONFIG.syncTypes ? "✅" : "❌"}`);
    console.log(
      `   Importar contratos: ${LOAD_CONFIG.importContracts ? "✅" : "❌"}`
    );
    if (LOAD_CONFIG.maxContracts) {
      console.log(`   Límite de contratos: ${LOAD_CONFIG.maxContracts}`);
    }

    try {
      await this.connect();

      // Paso 1: Sincronizar tipos
      await this.syncContractTypes();

      // Paso 2: Importar contratos (opcional)
      await this.importContracts();

      // Resumen final
      this._printFinalSummary();
    } catch (error) {
      console.error("\n❌ ERROR FATAL:", error);
      this.stats.errors.push({
        step: "main",
        error: error.message,
      });
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Imprimir resumen final
   * @private
   */
  _printFinalSummary() {
    console.log("\n" + "=".repeat(80));
    console.log("📊 RESUMEN FINAL");
    console.log("=".repeat(80));

    console.log("\n🏷️  TIPOS DE CONTRATO:");
    console.log(`   Procesados: ${this.stats.typesProcessed}`);
    console.log(`   Creados: ${this.stats.typesCreated}`);
    console.log(`   Existentes: ${this.stats.typesExisting}`);

    if (LOAD_CONFIG.importContracts) {
      console.log("\n📄 CONTRATOS:");
      console.log(`   Procesados: ${this.stats.contractsProcessed}`);
      console.log(`   Importados: ${this.stats.contractsImported}`);
      console.log(`   Omitidos: ${this.stats.contractsSkipped}`);
    }

    if (this.stats.errors.length > 0) {
      console.log(`\n❌ ERRORES (${this.stats.errors.length}):`);
      this.stats.errors.forEach((err, idx) => {
        console.log(`   ${idx + 1}. [${err.step}] ${err.error}`);
        if (err.ocid) console.log(`      OCID: ${err.ocid}`);
      });
    }

    if (LOAD_CONFIG.dryRun) {
      console.log("\n💡 Este fue un DRY RUN. Ningún cambio fue realizado.");
      console.log("   Para ejecutar en producción, remueve el flag --dry-run");
    }

    console.log("\n✅ Proceso completado");
    console.log("=".repeat(80) + "\n");
  }
}

// =============================================================================
// EJECUCIÓN DEL SCRIPT
// =============================================================================

async function main() {
  const loader = new SercopInitialLoader();

  try {
    await loader.run();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error fatal en la ejecución:", error);
    process.exit(1);
  }
}

// Ayuda del script
if (process.argv.includes("--help")) {
  console.log(`
🚀 SCRIPT DE CARGA INICIAL DESDE SERCOP

USO:
  node scripts/sercop-initial-load.js [opciones]

OPCIONES:
  --help                  Mostrar esta ayuda
  --dry-run              Modo de prueba (no realiza cambios en BD)
  --no-sync-types        No sincronizar tipos de contrato
  --import-contracts     Importar contratos además de tipos
  --max=N                Importar máximo N contratos

EJEMPLOS:

  # Dry run - solo ver qué se haría
  node scripts/sercop-initial-load.js --dry-run

  # Sincronizar solo tipos de contrato (recomendado primero)
  node scripts/sercop-initial-load.js

  # Sincronizar tipos e importar primeros 50 contratos
  node scripts/sercop-initial-load.js --import-contracts --max=50

  # Importar contratos sin actualizar tipos
  node scripts/sercop-initial-load.js --no-sync-types --import-contracts
  `);
  process.exit(0);
}

main();
