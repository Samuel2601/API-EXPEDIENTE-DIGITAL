// src/module/notifications/events/notification.events.js

import { EventEmitter } from "events";

class NotificationEvents extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20); // Aumentar si tienes muchos listeners
  }
}

export default new NotificationEvents();
