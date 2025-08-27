# Módulo de Expediente Digital para Contratación Pública

## GADM Cantón Esmeraldas

### 📋 Descripción

Sistema integral para la gestión digital de expedientes de contratación pública, desarrollado para el Gobierno Autónomo Descentralizado Municipal del Cantón Esmeraldas, cumpliendo con la normativa establecida en la LOSNCP (Ley Orgánica del Sistema Nacional de Contratación Pública).

### 🛠️ Tecnologías

- **Backend**: Node.js con Express.js
- **Base de Datos**: MongoDB
- **Package Manager**: pnpm
- **Almacenamiento**: RSync para sincronización remota
- **Arquitectura**: RESTful API con patrón Repository
- **Seguridad**: JWT + Auto-ban System
- **Documentación**: Swagger/OpenAPI

### ⚖️ Marco Legal

Basado en la **LOSNCP** y sus procedimientos de contratación pública establecidos para entidades del sector público ecuatoriano.

## 🏗️ Arquitectura de Documentos

### Arquitectura Modular

El sistema sigue una **arquitectura modular limpia** con separación clara de responsabilidades:

#### Core Module (`src/module/core/`)

- **Audit**: Sistema de auditoría transversal
- **Base**: Clases base y utilidades reutilizables
- Servicios compartidos entre módulos

#### Expediente Digital Module (`src/module/exp-digital/`)

- **Controllers**: Manejo de peticiones HTTP
- **Models**: Definición de esquemas MongoDB
- **Repositories**: Capa de acceso a datos (patrón Repository)
- **Routes**: Definición de endpoints API
- **Services**: Lógica de negocio específica

#### Security Layer (`src/security/`)

- Sistema de auto-baneo por intentos fallidos
- Protección contra ataques de fuerza bruta
- Monitoreo de actividad sospechosa

#### Middleware Layer (`src/middlewares/`)

- **auth.js**: Autenticación JWT
- **autoBan.js**: Control de accesos y baneos
- **files.middleware.js**: Procesamiento de archivos con integración RSync

### Modelo de Datos MongoDB

```javascript
// Esquema principal del expediente
{
  _id: ObjectId,
  numero_proceso: String,
  codigo_proceso: String,
  tipo_contratacion: {
    categoria: String, // "comun" | "especial"
    procedimiento: String
  },
  objeto_contratacion: String,
  presupuesto_referencial: Number,
  estado_actual: String,
  fecha_creacion: Date,
  usuario_responsable: ObjectId,
  fases: {
    preparatoria: {
      estado: String,
      documentos_requeridos: [String],
      documentos_cargados: [{
        nombre: String,
        archivo_id: ObjectId,
        local_path: String,        // Ruta local
        remote_path: String,       // Ruta en servidor remoto (RSync)
        rsync_status: String,      // "synced" | "pending" | "failed"
        fecha_carga: Date,
        usuario: ObjectId,
        checksum: String           // Hash para verificación de integridad
      }]
    },
    precontractual: { /* similar structure */ },
    contractual: { /* similar structure */ },
    pago: { /* similar structure */ },
    recepcion: { /* similar structure */ }
  },
  cronograma: [{
    fase: String,
    fecha_inicio: Date,
    fecha_fin: Date,
    responsable: ObjectId
  }],
  audit_log: [{
    action: String,
    user: ObjectId,
    timestamp: Date,
    details: Object
  }],
  created_at: Date,
  updated_at: Date
}
```

## 👥 Sistema de Permisos y Roles

### Roles del Sistema

#### 1. **Administrador del Sistema**

- Gestión completa de usuarios y permisos
- Configuración de tipos de contratación
- Acceso a todos los expedientes
- Generación de reportes globales

#### 2. **Director/Jefe de Contratación**

- Supervisión de todos los procesos
- Aprobación de expedientes
- Asignación de responsables
- Reportes departamentales

#### 3. **Especialista en Contratación**

- Creación y gestión de expedientes
- Carga de documentos en todas las fases
- Seguimiento de cronogramas
- Comunicación con proveedores

#### 4. **Técnico Revisor**

- Revisión y validación de documentos técnicos
- Informes de evaluación
- Control de especificaciones técnicas

#### 5. **Contador/Tesorero**

- Gestión de fase de pagos
- Validación presupuestaria
- Manejo de garantías y retenciones

#### 6. **Solo Lectura/Consulta**

- Visualización de expedientes asignados
- Descarga de documentos públicos
- Consulta de estados y cronogramas

### Matriz de Permisos

| Acción                | Admin | Director | Especialista | Técnico | Contador | Lectura |
| --------------------- | ----- | -------- | ------------ | ------- | -------- | ------- |
| Crear expediente      | ✓     | ✓        | ✓            | ✗       | ✗        | ✗       |
| Editar metadata       | ✓     | ✓        | ✓            | ✗       | ✗        | ✗       |
| Cargar documentos     | ✓     | ✓        | ✓            | ✓       | ✓        | ✗       |
| Aprobar fases         | ✓     | ✓        | ✗            | ✗       | ✗        | ✗       |
| Gestionar pagos       | ✓     | ✓        | ✗            | ✗       | ✓        | ✗       |
| Ver reportes          | ✓     | ✓        | ✓            | ✓       | ✓        | ✗       |
| Consultar expedientes | ✓     | ✓        | ✓            | ✓       | ✓        | ✓       |

## 🔄 Flujo de Uso del Sistema

### 1. Creación de Expediente

1. **Inicio**: Usuario autorizado crea nuevo expediente
2. **Clasificación**: Selecciona tipo de contratación según montos LOSNCP
3. **Configuración**: Define objeto, presupuesto y cronograma inicial
4. **Asignación**: Designa responsables por fase

### 2. Gestión por Fases

#### **FASE PREPARATORIA**

- Carga de certificación presupuestaria
- Subida de estudios de mercado
- Definición de términos de referencia
- Generación de resolución de inicio

#### **FASE PRECONTRACTUAL**

- Publicación de pliegos
- Gestión de preguntas y aclaraciones
- Recepción de ofertas
- Evaluación y adjudicación

#### **FASE CONTRACTUAL**

- Firma de contrato
- Registro de garantías
- Seguimiento de cronograma
- Control de avances

#### **FASE DE PAGO**

- Validación de facturas
- Procesamiento de planillas
- Aplicación de retenciones
- Autorización de pagos

#### **FASE DE RECEPCIÓN**

- Actas de entrega-recepción
- Liquidación de contratos
- Devolución de garantías
- Archivo final

### 3. Seguimiento y Control

- **Dashboard**: Vista general de expedientes activos
- **Alertas**: Notificaciones de vencimientos y pendientes
- **Reportes**: Estadísticas y métricas de gestión
- **Auditoría**: Registro completo de cambios y acciones

## 📁 Tipos de Contratación Soportados

### Procedimientos Comunes

- **Subasta Inversa Electrónica**
- **Licitación** (Bienes/Servicios >$200,000, Obras >$500,000)
- **Cotización** (Bienes/Servicios $5,000-$200,000, Obras $10,000-$500,000)
- **Menor Cuantía** (Bienes/Servicios <$5,000, Obras <$10,000)
- **Consultoría**
- **Lista Corta**

### Procedimientos Especiales

- **Emergencia**
- **Régimen Especial**
- **Compras por Catálogo Electrónico**
- **Convenio Marco**
- **Ínfima Cuantía**

## 🚀 Instalación y Configuración

### Requisitos Previos

```bash
Node.js >= 16.0.0
MongoDB >= 4.4
pnpm >= 8.0.0
RSync (para sincronización de archivos)
SSH access al servidor remoto de almacenamiento
```

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/gadm-esmeraldas/expediente-digital.git
cd expediente-digital

# Instalar dependencias con pnpm
pnpm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con configuraciones específicas
```

### Variables de Entorno

```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/expediente_digital
JWT_SECRET=tu_clave_secreta
UPLOAD_PATH=./archivos_subidos/
MAX_FILE_SIZE=50MB
ALLOWED_FILE_TYPES=pdf,doc,docx,xls,xlsx,jpg,png

# RSync Configuration - Almacenamiento Remoto
RSYNC_REMOTE_HOST=tu.servidor.com
RSYNC_REMOTE_USER=tu_usuario
RSYNC_REMOTE_PASSWORD=tu_contraseña
RSYNC_REMOTE_PORT=22
RSYNC_REMOTE_PATH=/ruta/remota/destino/
RSYNC_LOCAL_PATH=./archivos_subidos/
RSYNC_SSH_KEY_PATH=~/.ssh/id_rsa
RSYNC_OPTIONS=-avz --progress
```

### Inicialización

```bash
# Iniciar servidor de desarrollo
pnpm run dev

# Iniciar servidor de producción
pnpm start
```

## 📚 API Endpoints Principales

### Expedientes

```http
GET    /api/expedientes          # Listar expedientes
POST   /api/expedientes          # Crear expediente
GET    /api/expedientes/:id      # Obtener expediente
PUT    /api/expedientes/:id      # Actualizar expediente
DELETE /api/expedientes/:id      # Eliminar expediente
```

### Documentos

```http
POST   /api/expedientes/:id/documentos     # Subir documento
GET    /api/expedientes/:id/documentos     # Listar documentos
GET    /api/documentos/:id/download        # Descargar documento
DELETE /api/documentos/:id                 # Eliminar documento
```

### Fases

```http
PUT    /api/expedientes/:id/fases/:fase/estado    # Cambiar estado de fase
GET    /api/expedientes/:id/fases/:fase           # Obtener información de fase
```

### Reportes

```http
GET    /api/reportes/expedientes          # Reporte general
GET    /api/reportes/tipos-contratacion   # Reporte por tipos
GET    /api/reportes/cronogramas          # Reporte de cronogramas
```

## 🔧 Estructura del Proyecto

```
API EXPEDIENTE DIGITAL/
├── app.js                        # Punto de entrada principal
├── package.json                  # Dependencias y scripts
├── pnpm-lock.yaml               # Lock file de pnpm
├── .env.example                 # Plantilla de variables de entorno
├── .gitignore                   # Archivos ignorados por git
├── src/
│   ├── config/
│   │   ├── database.mongo.js    # Configuración MongoDB
│   │   └── rsync.client.js      # Cliente RSync para almacenamiento remoto
│   ├── middlewares/
│   │   ├── auth.js              # Middleware de autenticación
│   │   ├── autoBan.js           # Sistema de auto-baneo
│   │   └── files.middleware.js  # Middleware para manejo de archivos
│   ├── module/
│   │   ├── core/
│   │   │   ├── audit/           # Sistema de auditoría
│   │   │   └── base/            # Clases y utilidades base
│   │   └── exp-digital/
│   │       ├── controllers/     # Controladores del módulo
│   │       ├── models/          # Modelos de MongoDB
│   │       ├── repositories/    # Capa de acceso a datos
│   │       ├── routes/          # Definición de rutas
│   │       └── services/        # Lógica de negocio
│   ├── security/
│   │   └── auto-ban.system.js   # Sistema de seguridad y baneos
│   └── shared/                  # Recursos compartidos
└── utils/
    ├── autoguardar_permisos.js  # Utilidad para permisos
    ├── meta-field.js            # Campos de metadata
    └── routeMapper.js           # Mapeo de rutas automático
```

### 📂 Almacenamiento Distribuido con RSync

El sistema utiliza **RSync** para sincronizar automáticamente los archivos subidos a un servidor remoto, proporcionando:

#### Ventajas del Sistema RSync

- **Respaldo automático**: Los documentos se replican en servidor remoto
- **Distribución de carga**: Descarga de archivos desde servidor dedicado
- **Redundancia**: Protección contra pérdida de datos
- **Escalabilidad**: Fácil expansión del almacenamiento

#### Configuración RSync

```javascript
// src/config/rsync.client.js
const rsyncConfig = {
  remoteHost: process.env.RSYNC_REMOTE_HOST,
  remoteUser: process.env.RSYNC_REMOTE_USER,
  remotePath: process.env.RSYNC_REMOTE_PATH,
  localPath: process.env.RSYNC_LOCAL_PATH,
  sshKeyPath: process.env.RSYNC_SSH_KEY_PATH,
  options: process.env.RSYNC_OPTIONS || "-avz --progress",
};
```

#### Flujo de Sincronización

1. **Subida**: Archivo guardado localmente en `./archivos_subidos/`
2. **Sincronización**: RSync copia automáticamente al servidor remoto
3. **Verificación**: Confirmación de transferencia exitosa
4. **Acceso**: Documentos disponibles desde ambas ubicaciones

## 📊 Características Principales

### ✅ Gestión Integral

- Control completo del ciclo de contratación pública
- Seguimiento en tiempo real de expedientes
- Generación automática de cronogramas

### ✅ Almacenamiento Distribuido

- **Sistema RSync** para sincronización automática
- Respaldo remoto de documentos críticos
- Distribución de carga en servidores dedicados
- Redundancia y protección contra pérdida de datos

### ✅ Arquitectura Modular

- **Clean Architecture** con separación de capas
- **Patrón Repository** para acceso a datos
- Módulos independientes y reutilizables
- Fácil mantenimiento y extensibilidad

### ✅ Seguridad Avanzada

- Sistema robusto de autenticación JWT
- **Auto-ban system** contra ataques de fuerza bruta
- Registro completo de auditoría
- Middleware de seguridad multicapa

### ✅ Cumplimiento Legal

- Adherencia estricta a la LOSNCP
- Plantillas de documentos oficiales
- Validaciones automáticas de requisitos

### ✅ Usabilidad

- API RESTful bien documentada
- Sistema de notificaciones automáticas
- Manejo eficiente de archivos grandes

### 🔧 Utilidades del Sistema (`utils/`)

#### `autoguardar_permisos.js`

- Gestión automática de permisos por rol
- Sincronización de permisos con base de datos
- Validación de accesos en tiempo real

#### `meta-field.js`

- Definición de campos de metadata estándar
- Validaciones de estructura de documentos
- Campos obligatorios por tipo de contratación

#### `routeMapper.js`

- Mapeo automático de rutas del sistema
- Registro dinámico de endpoints
- Documentación automática de API

### 🛡️ Seguridad Avanzada

#### Sistema Auto-Ban

```javascript
// Configuración del sistema de auto-baneo
const autoBanConfig = {
  maxAttempts: 5, // Intentos máximos
  lockoutDuration: 900000, // 15 minutos de bloqueo
  monitorWindow: 300000, // Ventana de monitoreo de 5 minutos
};
```

#### Middleware de Archivos

- Validación de tipos de archivo permitidos
- Control de tamaño máximo de subida
- **Integración automática con RSync**
- Verificación de integridad de archivos

## 📈 Reportes y Métricas

- Expedientes por estado y tipo
- Tiempos promedio por fase
- Eficiencia de procesos
- Cumplimiento de cronogramas
- Análisis de proveedores

## 🤝 Contribución

1. Fork del proyecto
2. Crear rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE.md](LICENSE.md) para detalles.

## 👨‍💻 Equipo de Desarrollo

**GADM Cantón Esmeraldas - Departamento de Sistemas**

Para soporte técnico o consultas, contactar:

- Email: sistemas@esmeraldas.gob.ec
- Teléfono: (+593) 06-XXX-XXXX

---

_Versión: 1.0.0 | Última actualización: Agosto 2025_

Comando Tree

´´´
Get-ChildItem -Recurse -Depth 3 | Where-Object { $_.FullName -notmatch 'node_modules' } | ForEach-Object { $_.FullName }
´´´
