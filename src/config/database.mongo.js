    import mongoose from 'mongoose';
import 'dotenv/config';

class Database {
  constructor() {
    this.connect();
  }

  connect() {
    // Determinar la URI según el entorno
    const mongoURI = process.env.NODE_ENV === 'production' 
      ? process.env.MONGODB_URI_PROD 
      : process.env.MONGODB_URI;

    if (!mongoURI) {
      console.error('❌ MongoDB URI no está definida en las variables de entorno');
      process.exit(1);
    }

    // Opciones de conexión
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      poolSize: parseInt(process.env.MONGODB_POOL_SIZE) || 10,
      connectTimeoutMS: parseInt(process.env.MONGODB_CONNECTION_TIMEOUT) || 30000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    // Conexión a MongoDB
    mongoose.connect(mongoURI, options)
      .then(() => {
        console.log('✅ Conexión a MongoDB establecida correctamente');
        console.log(`📊 Base de datos: ${mongoose.connection.name}`);
        console.log(`🌐 Host: ${mongoose.connection.host}`);
      })
      .catch((error) => {
        console.error('❌ Error al conectar con MongoDB:', error.message);
        process.exit(1);
      });

    // Manejadores de eventos
    mongoose.connection.on('error', (error) => {
      console.error('❌ Error de conexión a MongoDB:', error);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  Conexión a MongoDB perdida');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔁 Conexión a MongoDB reestablecida');
    });

    // Manejar cierre graceful de la aplicación
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('👋 Conexión a MongoDB cerrada por terminación de la aplicación');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error al cerrar la conexión:', error);
        process.exit(1);
      }
    });
  }

  // Método para verificar el estado de la conexión
  getStatus() {
    return {
      connected: mongoose.connection.readyState === 1,
      state: this.getStateString(mongoose.connection.readyState),
      host: mongoose.connection.host,
      database: mongoose.connection.name,
    };
  }

  getStateString(state) {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
      99: 'uninitialized'
    };
    return states[state] || 'unknown';
  }

  // Método para cerrar la conexión
  async close() {
    try {
      await mongoose.connection.close();
      console.log('✅ Conexión a MongoDB cerrada correctamente');
    } catch (error) {
      console.error('❌ Error al cerrar la conexión:', error);
      throw error;
    }
  }
}

// Crear una instancia única (singleton)
const database = new Database();

// Exportar la instancia y la clase por si se necesita
export { Database };
export default database;