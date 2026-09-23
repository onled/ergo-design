import { inject, type App, type InjectionKey, type Plugin } from 'vue'
import type { ErgoEngine } from '../engine/engine'

export type ErgoTheme = 'light' | 'dark' | 'auto'

/** Só tokens do pacote podem ser sobrescritos, e sempre pelo nome semântico. */
export type ErgoTokenName = `--ergo-${string}`

export interface ErgoDesignConfig {
  /**
   * Quem renderiza e valida. O editor nunca conhece a URL do ergo:
   * `createHttpEngine('/api')` atrás de um proxy, ou um adaptador do host que
   * passa pelo próprio servidor.
   */
  engine: ErgoEngine
  /** Padrão: `auto`, que segue o sistema operacional. */
  theme?: ErgoTheme
  /** Locale enviado ao render. Padrão: `pt-BR`. */
  locale?: string
  /** Sobrescritas de token aplicadas no elemento raiz do editor. */
  tokens?: Partial<Record<ErgoTokenName, string>>
}

export type ResolvedErgoDesignConfig = Required<ErgoDesignConfig>

const CONFIG_KEY: InjectionKey<ResolvedErgoDesignConfig> = Symbol('ergo-design-config')

export function resolveConfig(config: ErgoDesignConfig): ResolvedErgoDesignConfig {
  return {
    engine: config.engine,
    theme: config.theme ?? 'auto',
    locale: config.locale ?? 'pt-BR',
    tokens: config.tokens ?? {},
  }
}

/**
 * Plugin de instalação:
 *
 *   app.use(createErgoDesign({ engine: createHttpEngine('/api') }))
 */
export function createErgoDesign(config: ErgoDesignConfig): Plugin {
  const resolved = resolveConfig(config)
  return {
    install(app: App) {
      app.provide(CONFIG_KEY, resolved)
    },
  }
}

export function useErgoConfig(): ResolvedErgoDesignConfig {
  const config = inject(CONFIG_KEY, null)
  if (!config) {
    throw new Error(
      '[ergo-design] configuração ausente: instale o plugin com app.use(createErgoDesign({ engine }))',
    )
  }
  return config
}
