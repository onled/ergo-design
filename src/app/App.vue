<script setup lang="ts">
import { ref } from 'vue'
import { createEmptyTemplate, ErgoDesigner } from '@onled/ergo-design'

// Começa em branco: carregar os dados, depois montar o impresso sobre eles.
const template = ref(createEmptyTemplate())
const data = ref<unknown>()
</script>

<template>
  <ErgoDesigner v-model="template" v-model:data="data" />
</template>
