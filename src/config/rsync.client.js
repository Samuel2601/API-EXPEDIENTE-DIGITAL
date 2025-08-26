import { exec } from 'child_process';
import { promisify } from 'util';
import 'dotenv/config';

const execAsync = promisify(exec);

class RsyncClient {
  constructor() {
    this.validateConfig();
  }

  validateConfig() {
    const requiredVars = [
      'RSYNC_REMOTE_HOST',
      'RSYNC_REMOTE_USER',
      'RSYNC_REMOTE_PATH'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Faltan variables de entorno requeridas: ${missingVars.join(', ')}`);
    }
  }

  /**
   * Construye el comando rsync con las opciones adecuadas
   */
  buildCommand(sourcePath, destinationFileName = null) {
    const {
      RSYNC_REMOTE_HOST,
      RSYNC_REMOTE_USER,
      RSYNC_REMOTE_PASSWORD,
      RSYNC_REMOTE_PORT = '22',
      RSYNC_REMOTE_PATH,
      RSYNC_SSH_KEY_PATH,
      RSYNC_OPTIONS = '-avz --progress'
    } = process.env;

    let destinationPath;
    if (destinationFileName) {
      destinationPath = `${RSYNC_REMOTE_PATH}/${destinationFileName}`;
    } else {
      destinationPath = RSYNC_REMOTE_PATH;
    }

    let command = 'rsync ';
    
    // Agregar opciones
    command += `${RSYNC_OPTIONS} `;
    
    // Configurar SSH si se usa puerto personalizado o clave SSH
    if (RSYNC_REMOTE_PORT !== '22' || RSYNC_SSH_KEY_PATH) {
      let sshOptions = `ssh -p ${RSYNC_REMOTE_PORT} `;
      
      if (RSYNC_SSH_KEY_PATH) {
        sshOptions += `-i ${RSYNC_SSH_KEY_PATH} `;
      }
      
      // Deshabilitar checks de host estrictos para evitar prompts
      sshOptions += '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ';
      
      command += `-e "${sshOptions}" `;
    }

    // Agregar source y destination
    command += `${sourcePath} `;
    command += `${RSYNC_REMOTE_USER}@${RSYNC_REMOTE_HOST}:${destinationPath}`;

    return command;
  }

  /**
   * Ejecuta un comando rsync para transferir archivos
   */
  async transferFile(localFilePath, remoteFileName = null) {
    try {
      const command = this.buildCommand(localFilePath, remoteFileName);
      
      console.log(`🔄 Ejecutando comando: ${command}`);
      
      // Si hay contraseña, la manejamos con sshpass
      let finalCommand = command;
      if (process.env.RSYNC_REMOTE_PASSWORD) {
        finalCommand = `sshpass -p "${process.env.RSYNC_REMOTE_PASSWORD}" ${command}`;
      }

      const { stdout, stderr } = await execAsync(finalCommand);
      
      if (stderr) {
        console.warn('⚠️  Advertencias durante la transferencia:', stderr);
      }
      
      console.log('✅ Transferencia completada exitosamente');
      return { success: true, stdout, stderr };
      
    } catch (error) {
      console.error('❌ Error en la transferencia rsync:', error.message);
      throw new Error(`Error en rsync: ${error.stderr || error.message}`);
    }
  }

  /**
   * Transfiere múltiples archivos
   */
  async transferFiles(files) {
    const results = [];
    
    for (const file of files) {
      try {
        const result = await this.transferFile(file.localPath, file.remoteName);
        results.push({
          file: file.localPath,
          success: true,
          result
        });
      } catch (error) {
        results.push({
          file: file.localPath,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Sincroniza un directorio completo
   */
  async syncDirectory(localDirPath) {
    try {
      const command = this.buildCommand(localDirPath);
      
      let finalCommand = command;
      if (process.env.RSYNC_REMOTE_PASSWORD) {
        finalCommand = `sshpass -p "${process.env.RSYNC_REMOTE_PASSWORD}" ${command}`;
      }

      const { stdout, stderr } = await execAsync(finalCommand);
      
      console.log('✅ Sincronización de directorio completada');
      return { success: true, stdout, stderr };
      
    } catch (error) {
      console.error('❌ Error en la sincronización:', error.message);
      throw error;
    }
  }

  /**
   * Lista archivos en el directorio remoto
   */
  async listRemoteFiles() {
    try {
      const { RSYNC_REMOTE_HOST, RSYNC_REMOTE_USER, RSYNC_REMOTE_PATH } = process.env;
      
      let command = `ssh ${RSYNC_REMOTE_USER}@${RSYNC_REMOTE_HOST} "ls -la ${RSYNC_REMOTE_PATH}"`;
      
      if (process.env.RSYNC_REMOTE_PASSWORD) {
        command = `sshpass -p "${process.env.RSYNC_REMOTE_PASSWORD}" ${command}`;
      }

      const { stdout } = await execAsync(command);
      return stdout.split('\n').filter(line => line.trim());
      
    } catch (error) {
      console.error('❌ Error listando archivos remotos:', error.message);
      throw error;
    }
  }
}

// Crear y exportar una instancia singleton
const rsyncClient = new RsyncClient();
export default rsyncClient;