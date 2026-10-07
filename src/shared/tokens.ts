export const TYPES = {
  // Infrastructure
  EnvConfig: Symbol.for('EnvConfig'),
  DrizzleDatabase: Symbol.for('DrizzleDatabase'),
  ILogger: Symbol.for('ILogger'),
  INvdClient: Symbol.for('INvdClient'),
  IKevClient: Symbol.for('IKevClient'),
  IEpssClient: Symbol.for('IEpssClient'),

  // Repositories
  ICveIngestRepository: Symbol.for('ICveIngestRepository'),
  ISyncStateRepository: Symbol.for('ISyncStateRepository'),

  // Use cases / services
  SyncNvdUseCase: Symbol.for('SyncNvdUseCase'),
  SyncKevUseCase: Symbol.for('SyncKevUseCase'),
  SyncEpssUseCase: Symbol.for('SyncEpssUseCase'),
  SyncOrchestrator: Symbol.for('SyncOrchestrator'),
} as const;
