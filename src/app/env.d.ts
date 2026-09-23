interface ImportMetaEnv {
  /** URL base do serviço ergo que o site usa para preview e validação. */
  readonly VITE_ERGO_ENGINE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
