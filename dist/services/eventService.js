"use strict";
const EventEmitter = require('events');
class EventService {
    constructor() {
        if (EventService.instance) {
            return EventService.instance;
        }
        this.emitter = new EventEmitter();
        EventService.instance = this;
    }
    static getInstance() {
        if (!EventService.instance) {
            EventService.instance = new EventService();
        }
        return EventService.instance;
    }
    on(event, listener) {
        this.emitter.on(event, listener);
    }
    once(event, listener) {
        this.emitter.once(event, listener);
    }
    emit(event, data) {
        this.emitter.emit(event, data);
    }
    // 检查是否已经有某个事件的监听器
    hasListeners(event) {
        return this.emitter.listenerCount(event) > 0;
    }
}
EventService.instance = null;
module.exports = { EventService };
