/*
 * API pública do @onled/ergo-design. O que não é exportado aqui é interno e
 * pode mudar sem aviso — o site ergo.onled.cloud também só usa este arquivo.
 *
 * Os estilos são importados à parte, uma vez, por quem instala:
 *
 *   import '@onled/ergo-design/style.css'
 */

export { default as ErgoDesigner } from './components/ErgoDesigner.vue'

export {
  createErgoDesign,
  useErgoConfig,
  type ErgoDesignConfig,
  type ErgoTheme,
  type ErgoTokenName,
} from './config/config'

export {
  createHttpEngine,
  type EngineError,
  type ErgoEngine,
  type HttpEngineOptions,
  type RenderRequest,
  type RenderResult,
  type ValidateResult,
} from './engine/engine'

export * from './spec/template'
