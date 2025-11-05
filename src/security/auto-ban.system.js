// src/security/autoBanSystem.js
import fs from "fs";
import path from "path";

export class AutoBanSystem {
  constructor() {
    this.bannedIPs = new Set();
    this.suspiciousActivity = new Map(); // IP -> { count, lastActivity, patterns }
    this.banFilePath = path.join(process.cwd(), "data", "banned-ips.json");
    this.logDir = path.join(process.cwd(), "logs");

    // Patrones sospechosos de bots
    this.botPatterns = [
      /\/api\/v[0-9]+\/token/,
      /\/api\/v[0-9]+\/users/,
      /\/apis\/config/,
      /\/apis\/controllers/,
      /phpunit/,
      /eval-stdin\.php/,
      /\.env/,
      /wp-admin/,
      /wp-login/,
      /admin\/login/,
      /config\.php/,
      /setup\.php/,
      /install\.php/,
      /database/,
      /backup/,
      /\.git/,
      /\.svn/,
      /\.htaccess/,
      /shell/,
      /webshell/,
      /c99/,
      /r57/,
      /exploit/,
      /xmlrpc\.php/,
      /solr\/admin/,
      /elasticsearch/,
      /jenkins/,
      /phpmyadmin/,
      /adminer/,
      /sql/,
      /mysql/,
      /myadmin/,
      /console/,
      /debug/,
      /test/,
      /swagger/,
      /actuator/,
      /health$/,
      /status$/,
      /metrics$/,
      /info$/,
      /trace$/,
      /dump$/,
      /mappings$/,
      /configprops$/,
      /beans$/,
      /autoconfig$/,
      /env$/,
    ];

    // User agents sospechosos
    this.suspiciousUserAgents = [
      /python-requests/i,
      /curl/i,
      /wget/i,
      /scanner/i,
      /bot/i,
      /crawl/i,
      /spider/i,
      /^$/, // User agent vacío
      /masscan/i,
      /nmap/i,
      /sqlmap/i,
      /nikto/i,
      /gobuster/i,
      /dirb/i,
      /hydra/i,
      /burp/i,
      /owasp/i,
      /zap/i,
      /nuclei/i,
      /ffuf/i,
      /wpscan/i,
      /joomscan/i,
      /droopescan/i,
      /whatweb/i,
    ];

    // IPs whitelist (nunca banear)
    this.whitelist = new Set([
      "127.0.0.1",
      "::1",
      "localhost",
      "*.*.gob.ec",
      // Agrega aquí IPs de tu oficina/casa si las conoces
    ]);

    this.initializeDirectories();
    this.loadBannedIPs();

    // Limpiar actividad sospechosa cada hora
    this.cleanupInterval = setInterval(
      () => this.cleanupSuspiciousActivity(),
      60 * 60 * 1000
    );

    // Guardar IPs baneadas cada 5 minutos
    this.saveInterval = setInterval(() => this.saveBannedIPs(), 5 * 60 * 1000);
  }

  initializeDirectories() {
    const dataDir = path.dirname(this.banFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  loadBannedIPs() {
    try {
      if (fs.existsSync(this.banFilePath)) {
        const data = fs.readFileSync(this.banFilePath, "utf8");
        const bannedData = JSON.parse(data);
        this.bannedIPs = new Set(bannedData.ips || []);
        console.log(
          `🚫 [AutoBan] Cargadas ${this.bannedIPs.size} IPs baneadas desde archivo`
        );
      } else {
        console.log(
          `🆕 [AutoBan] Archivo de baneos no existe, creando nuevo sistema`
        );
      }
    } catch (error) {
      console.error("❌ [AutoBan] Error cargando IPs baneadas:", error.message);
      this.bannedIPs = new Set(); // Reset en caso de error
    }
  }

  saveBannedIPs() {
    try {
      const data = {
        ips: Array.from(this.bannedIPs),
        lastUpdate: new Date().toISOString(),
        count: this.bannedIPs.size,
        version: "1.0",
      };
      fs.writeFileSync(this.banFilePath, JSON.stringify(data, null, 2));
      // console.log(`💾 [AutoBan] Guardadas ${this.bannedIPs.size} IPs baneadas`);
    } catch (error) {
      console.error(
        "❌ [AutoBan] Error guardando IPs baneadas:",
        error.message
      );
    }
  }

  banIP(ip, reason = "Actividad sospechosa automática", metadata = {}) {
    if (this.whitelist.has(ip)) {
      console.log(`⚪ [AutoBan] IP ${ip} está en whitelist, no se banea`);
      return false;
    }

    if (!this.bannedIPs.has(ip)) {
      this.bannedIPs.add(ip);
      this.saveBannedIPs();

      const banData = {
        timestamp: new Date().toISOString(),
        ip: ip,
        reason: reason,
        action: "BANNED",
        metadata: metadata,
      };

      console.log(`🚫 [AutoBan] IP BANEADA: ${ip} - Razón: ${reason}`);
      this.logSecurity("BAN", banData);
      return true;
    }
    return false;
  }

  unbanIP(ip) {
    if (this.bannedIPs.has(ip)) {
      this.bannedIPs.delete(ip);
      this.saveBannedIPs();

      const unbanData = {
        timestamp: new Date().toISOString(),
        ip: ip,
        action: "UNBANNED",
      };

      console.log(`✅ [AutoBan] IP DESBANEADA: ${ip}`);
      this.logSecurity("UNBAN", unbanData);
      return true;
    }
    return false;
  }

  isBanned(ip) {
    return this.bannedIPs.has(ip);
  }

  isWhitelisted(ip) {
    return this.whitelist.has(ip);
  }

  addToWhitelist(ip) {
    this.whitelist.add(ip);
    console.log(`⚪ [AutoBan] IP ${ip} agregada a whitelist`);
  }

  removeFromWhitelist(ip) {
    this.whitelist.delete(ip);
    console.log(`🔴 [AutoBan] IP ${ip} removida de whitelist`);
  }

  analyzeRequest(req) {
    const ip = this.getRealIP(req);
    const userAgent = req.get("User-Agent") || "";
    const path = req.path;
    const method = req.method;
    const referer = req.get("Referer") || "";

    // Verificar whitelist
    if (this.isWhitelisted(ip)) {
      return {
        shouldBan: false,
        isBanned: false,
        isWhitelisted: true,
        reason: "IP en whitelist",
      };
    }

    // Verificar si ya está baneada
    if (this.isBanned(ip)) {
      return {
        shouldBan: false,
        isBanned: true,
        reason: "IP ya baneada",
      };
    }

    // Inicializar actividad sospechosa para esta IP
    if (!this.suspiciousActivity.has(ip)) {
      this.suspiciousActivity.set(ip, {
        count: 0,
        lastActivity: Date.now(),
        patterns: new Set(),
        requests: [],
        firstSeen: Date.now(),
      });
    }

    const activity = this.suspiciousActivity.get(ip);
    activity.count++;
    activity.lastActivity = Date.now();

    // Mantener historial de últimas 50 requests
    activity.requests.push({
      path,
      method,
      userAgent,
      referer,
      timestamp: Date.now(),
    });

    if (activity.requests.length > 500) {
      activity.requests = activity.requests.slice(-50);
    }

    let suspicionScore = 0;
    let reasons = [];

    // 1. Verificar patrones de ruta sospechosos
    for (const pattern of this.botPatterns) {
      if (pattern.test(path)) {
        suspicionScore += 10;
        reasons.push(`Ruta sospechosa: ${path}`);
        activity.patterns.add("suspicious_path");
        break;
      }
    }

    // 2. Verificar User-Agent sospechoso
    for (const pattern of this.suspiciousUserAgents) {
      if (pattern.test(userAgent)) {
        suspicionScore += 8;
        reasons.push(`User-Agent sospechoso: ${userAgent}`);
        activity.patterns.add("suspicious_ua");
        break;
      }
    }

    // 3. Verificar frecuencia de requests (más de 100 en 1 minuto)
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = activity.requests.filter(
      (r) => r.timestamp > oneMinuteAgo
    );
    if (recentRequests.length > 1000) {
      suspicionScore += 7;
      reasons.push(`Demasiados requests: ${recentRequests.length}/min`);
      activity.patterns.add("high_frequency");
    }

    // 4. Verificar requests a rutas 404 consecutivos
    const recent404s = activity.requests
      .slice(-10)
      .filter((r) => this.botPatterns.some((pattern) => pattern.test(r.path)));
    if (recent404s.length >= 15) {
      suspicionScore += 15;
      reasons.push(`Múltiples 404s sospechosos: ${recent404s.length}/10`);
      activity.patterns.add("multiple_404s");
    }

    // 5. Verificar scanning de directorios
    const uniquePaths = new Set(
      activity.requests.slice(-100).map((r) => r.path)
    );
    if (uniquePaths.size >= 15) {
      suspicionScore += 6;
      reasons.push(
        `Posible directory scanning: ${uniquePaths.size} rutas únicas`
      );
      activity.patterns.add("directory_scan");
    }

    // 6. Verificar requests sin Referer en rutas internas
    if (!referer && path.startsWith("/api") && method === "GET") {
      suspicionScore += 3;
      reasons.push("Request sin Referer a API interna");
      activity.patterns.add("no_referer");
    }

    // 7. Verificar velocidad de requests (menos de 100ms entre requests)
    if (activity.requests.length >= 2) {
      const lastTwo = activity.requests.slice(-2);
      const timeDiff = lastTwo[1].timestamp - lastTwo[0].timestamp;
      if (timeDiff < 100) {
        suspicionScore += 5;
        reasons.push(`Requests muy rápidos: ${timeDiff}ms entre requests`);
        activity.patterns.add("too_fast");
      }
    }

    // 8. Verificar métodos HTTP sospechosos en rutas específicas
    if (
      ["PUT", "DELETE", "PATCH"].includes(method) &&
      this.botPatterns.some((pattern) => pattern.test(path))
    ) {
      suspicionScore += 12;
      reasons.push(`Método ${method} sospechoso en ruta: ${path}`);
      activity.patterns.add("suspicious_method");
    }

    this.suspiciousActivity.set(ip, activity);

    // Decidir si banear
    const shouldBan =
      suspicionScore >= 15 ||
      (activity.patterns.has("suspicious_path") && activity.count >= 3) ||
      activity.patterns.has("multiple_404s") ||
      (activity.patterns.has("high_frequency") &&
        activity.patterns.has("suspicious_ua"));

    if (shouldBan) {
      const reason = `Score: ${suspicionScore}, Patrones: ${Array.from(activity.patterns).join(", ")}, Razones: ${reasons.join("; ")}`;
      const metadata = {
        suspicionScore,
        patterns: Array.from(activity.patterns),
        totalRequests: activity.count,
        timeSpan: Date.now() - activity.firstSeen,
        userAgent,
        lastPaths: activity.requests.slice(-5).map((r) => r.path),
      };

      this.banIP(ip, reason, metadata);
    }

    return {
      shouldBan,
      isBanned: false,
      isWhitelisted: false,
      suspicionScore,
      reasons,
      patterns: Array.from(activity.patterns),
      activityCount: activity.count,
      recentRequests: recentRequests.length,
    };
  }

  getRealIP(req) {
    // Orden de prioridad para obtener la IP real
    const xRealIP = req.get("X-Real-IP");
    const xForwardedFor = req.get("X-Forwarded-For");

    if (xRealIP && xRealIP !== "127.0.0.1") {
      return xRealIP;
    }

    if (xForwardedFor) {
      const ips = xForwardedFor.split(",").map((ip) => ip.trim());
      // Tomar la primera IP que no sea localhost
      for (const ip of ips) {
        if (
          ip !== "127.0.0.1" &&
          ip !== "::1" &&
          !ip.startsWith("192.168.") &&
          !ip.startsWith("10.")
        ) {
          return ip;
        }
      }
      // Si todas son privadas, tomar la primera
      return ips[0];
    }

    return (
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip ||
      "unknown"
    );
  }

  cleanupSuspiciousActivity() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let cleaned = 0;

    for (const [ip, activity] of this.suspiciousActivity.entries()) {
      if (activity.lastActivity < oneHourAgo) {
        this.suspiciousActivity.delete(ip);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(
        `🧹 [AutoBan] Limpieza: ${cleaned} entradas de actividad sospechosa eliminadas`
      );
    }
  }

  logSecurity(type, data) {
    const logFile = path.join(
      this.logDir,
      `security-${new Date().toISOString().split("T")[0]}.log`
    );
    const logEntry = `${new Date().toISOString()} [${type}] ${JSON.stringify(data)}\n`;

    try {
      fs.appendFileSync(logFile, logEntry);
    } catch (error) {
      console.error(
        "❌ [AutoBan] Error escribiendo log de seguridad:",
        error.message
      );
    }
  }

  getStats() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const recentActivity = Array.from(this.suspiciousActivity.entries())
      .filter(([ip, activity]) => activity.lastActivity > oneHourAgo)
      .map(([ip, activity]) => ({
        ip,
        count: activity.count,
        patterns: Array.from(activity.patterns),
        lastActivity: new Date(activity.lastActivity).toISOString(),
        recentPaths: activity.requests.slice(-3).map((r) => r.path),
      }))
      .slice(0, 100);

    return {
      bannedIPs: this.bannedIPs.size,
      suspiciousActivity: this.suspiciousActivity.size,
      totalBannedList: Array.from(this.bannedIPs),
      recentActivity,
      whitelist: Array.from(this.whitelist),
      stats: {
        totalBanned: this.bannedIPs.size,
        activeSuspicious: recentActivity.length,
        uptimeHours: Math.floor(process.uptime() / 3600),
      },
    };
  }

  getDashboard() {
    const stats = this.getStats();
    const now = new Date();

    return {
      timestamp: now.toISOString(),
      status: "active",
      summary: {
        totalBanned: stats.bannedIPs,
        activeSuspicious: stats.recentActivity.length,
        whitelisted: stats.whitelist.length,
      },
      recentBans: Array.from(this.bannedIPs).slice(-10),
      topSuspicious: stats.recentActivity.slice(0, 5),
      systemHealth: {
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        uptime: Math.floor(process.uptime()),
        nodeVersion: process.version,
      },
    };
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    this.saveBannedIPs();
    console.log("🔄 [AutoBan] Sistema de baneos destruido correctamente");
  }
}
