import { EventEmitter } from 'node:events';

import { Injectable } from '@nestjs/common';

export interface UploadParseEvent {
  type: 'upload-parse';
  resumeId: string;
  userId: string;
  status: 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface AnalysisProgressEvent {
  type: 'analysis';
  analysisId: string;
  resumeId: string;
  userId: string;
  status: string;
  step?: string;
  /** Analysis display name - used by notification titles (#48). */
  name?: string;
}

export interface NotificationEvent {
  type: 'notification';
  userId: string;
  notificationId?: string;
  analysisId?: string;
  action: 'cleared' | 'created' | 'replaced';
}

export type ProgressEvent = UploadParseEvent | AnalysisProgressEvent | NotificationEvent;

/**
 * In-process progress bus (issue #41 / 4.4): pipelines publish, the SSE hub
 * (#48) subscribes per user. Single-node by design alongside D7's runner —
 * both swap to a broker together if horizontal scale-out ever lands.
 */
@Injectable()
export class ProgressBusService {
  private readonly emitter = new EventEmitter().setMaxListeners(1000);

  publish(event: ProgressEvent): void {
    this.emitter.emit(`user:${event.userId}`, event);
    this.emitter.emit('*', event);
  }

  subscribe(userId: string, listener: (e: ProgressEvent) => void): () => void {
    const channel = `user:${userId}`;
    this.emitter.on(channel, listener);
    return () => this.emitter.off(channel, listener);
  }

  subscribeAll(listener: (e: ProgressEvent) => void): () => void {
    this.emitter.on('*', listener);
    return () => this.emitter.off('*', listener);
  }
}
