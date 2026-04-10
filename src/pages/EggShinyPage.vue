<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GenderMaleIcon from '../components/icons/GenderMaleIcon.vue'
import GenderFemaleIcon from '../components/icons/GenderFemaleIcon.vue'
import '../styles/tool-pages.css'

const props = defineProps({
  loadingData: {
    type: Boolean,
    default: false
  },
  shinySearching: {
    type: Boolean,
    default: false
  },
  shinyHasSearched: {
    type: Boolean,
    default: false
  },
  shinyResult: {
    type: Object,
    default: null
  },
  shinyCandidates: {
    type: Array,
    default: () => []
  },
  shinyFlowSvg: {
    type: String,
    default: ''
  },
  shinyFlowPreviewVisible: {
    type: Boolean,
    default: false
  },
  shinyOwnedDraftName: {
    type: String,
    default: ''
  },
  shinyOwnedDraftGender: {
    type: String,
    default: 'female'
  },
  shinyOwnedList: {
    type: Array,
    default: () => []
  },
  shinyPetOptionObjects: {
    type: Array,
    default: () => []
  },
  currentPageTitle: {
    type: String,
    default: '精灵蛋异色孵化'
  },
  groupModeHint: {
    type: String,
    default: '添加异色清单，查询会自动引用你已添加的异色清单进行路线规划。'
  },
  searchIcon: {
    type: [Object, Function],
    default: null
  },
  refreshIcon: {
    type: [Object, Function],
    default: null
  }
})

const emit = defineEmits([
  'update:shinyOwnedDraftName',
  'update:shinyOwnedDraftGender',
  'update:shinyFlowPreviewVisible',
  'add-shiny-owned',
  'remove-shiny-owned',
  'search',
  'reset',
  'download-flow',
  'open-preview',
  'close-preview'
])

function updateShinyOwnedDraftName(value) {
  emit('update:shinyOwnedDraftName', value)
}

function updateShinyOwnedDraftGender(value) {
  emit('update:shinyOwnedDraftGender', value)
}

const isMobileViewport = ref(false)
const shinyFlowCollapsed = ref(false)

function syncMobileViewport() {
  if (typeof window === 'undefined') return
  isMobileViewport.value = window.innerWidth <= 640
}

watch(
  () => [props.shinyHasSearched, props.shinyFlowSvg],
  ([hasSearched, flowSvg]) => {
    if (!flowSvg) {
      shinyFlowCollapsed.value = false
      return
    }

    if (isMobileViewport.value && hasSearched) {
      shinyFlowCollapsed.value = true
    }
  }
)

onMounted(() => {
  syncMobileViewport()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', syncMobileViewport)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', syncMobileViewport)
  }
})
</script>

<template>
  <main class="panel shiny-page">
    <section class="search-card shiny-hero-card">
      <div class="page-hero__content">
        <div class="page-hero__title-row">
          <h1 class="page-hero__title">{{ currentPageTitle }}</h1>
        </div>
        <p class="page-hero__desc">{{ groupModeHint }}</p>
      </div>
    </section>

    <section class="search-card">
      <div class="title-row">
        <h2>添加已有异色</h2>
      </div>

      <el-form label-position="top" class="search-form" @submit.prevent>
        <div class="grid">
          <el-form-item label="添加已有异色">
            <div class="owned-add-row">
              <el-select-v2
                :model-value="shinyOwnedDraftName"
                clearable
                placeholder="选择已有异色精灵"
                size="large"
                class="owned-add-select"
                :options="shinyPetOptionObjects"
                :height="300"
                @update:model-value="updateShinyOwnedDraftName"
              />
              <el-radio-group
                :model-value="shinyOwnedDraftGender"
                size="large"
                class="owned-gender-group"
                @update:model-value="updateShinyOwnedDraftGender"
              >
                <el-radio-button label="female" class="owned-gender-female">
                  <span class="gender-button-label">
                    <GenderFemaleIcon />
                    <span class="gender-label-full">雌性</span>
                    <span class="gender-label-short">雌</span>
                  </span>
                </el-radio-button>
                <el-radio-button label="male" class="owned-gender-male">
                  <span class="gender-button-label">
                    <GenderMaleIcon />
                    <span class="gender-label-full">雄性</span>
                    <span class="gender-label-short">雄</span>
                  </span>
                </el-radio-button>
              </el-radio-group>
              <el-button class="query-btn owned-add-btn" type="primary" size="large" @click="emit('add-shiny-owned')">
                +
              </el-button>
            </div>

            <div v-if="shinyOwnedList.length" class="group-tags">
              <el-tag
                v-for="item in shinyOwnedList"
                :key="`owned-${item.name}-${item.gender}`"
                :class="item.gender === 'female' ? 'owned-tag-female' : 'owned-tag-male'"
                closable
                effect="light"
                @close="emit('remove-shiny-owned', item)"
              >
                <span class="owned-tag-label">
                  <GenderFemaleIcon v-if="item.gender === 'female'" />
                  <GenderMaleIcon v-else />
                  <span>{{ item.name }}</span>
                </span>
              </el-tag>
            </div>
          </el-form-item>
        </div>

        <div class="actions">
          <el-button
            class="reset-btn"
            size="large"
            :icon="refreshIcon"
            @click="emit('reset')"
          >
            重置
          </el-button>
          <el-button
            class="query-btn"
            type="primary"
            size="large"
            :icon="searchIcon"
            :loading="shinySearching || loadingData"
            @click="emit('search')"
          >
            查询异色孵化
          </el-button>
        </div>
      </el-form>
    </section>

    <section class="result-card">
      <div class="result-header">
        <h2>异色路线规划</h2>
        <div v-if="shinyFlowSvg" class="shiny-flow-action-group">
          <button type="button" class="shiny-flow-btn shiny-flow-save-btn" @click="emit('download-flow')">
            保存图片
          </button>
        </div>
      </div>

      <el-skeleton :loading="shinySearching || loadingData" animated :rows="7">
        <template #default>
          <div v-if="!shinyHasSearched" class="empty">
            添加已有异色后点击查询，系统将规划全异色收集路线
          </div>
          <div v-else-if="!shinyResult" class="empty">暂无可规划数据</div>
          <div v-else>
            <div v-if="shinyResult.routePlan" class="shiny-flow-card">
              <button
                v-if="shinyFlowSvg && isMobileViewport"
                type="button"
                class="shiny-flow-collapse-btn"
                @click="shinyFlowCollapsed = !shinyFlowCollapsed"
              >
                {{ shinyFlowCollapsed ? '展开流程图预览' : '收起流程图预览' }}
              </button>

              <div
                v-if="shinyFlowSvg && (!isMobileViewport || !shinyFlowCollapsed)"
                class="shiny-flow-wrap shiny-flow-preview-trigger"
                @click="emit('open-preview')"
              >
                <div class="shiny-flow-watermark" aria-hidden="true">
                  <span>洛克星盘 · 异色路线规划</span>
                  <span>洛克星盘 · 异色路线规划</span>
                  <span>洛克星盘 · 异色路线规划</span>
                  <span>洛克星盘 · 异色路线规划</span>
                  <span>洛克星盘 · 异色路线规划</span>
                  <span>洛克星盘 · 异色路线规划</span>
                  <span>洛克星盘 · 异色路线规划</span>
                  <span>洛克星盘 · 异色路线规划</span>
                </div>
                <div class="shiny-flow-canvas" v-html="shinyFlowSvg"></div>
              </div>

              <el-dialog
                :model-value="shinyFlowPreviewVisible"
                fullscreen
                append-to-body
                class="shiny-flow-preview-dialog"
                :show-close="false"
                @update:model-value="emit('update:shinyFlowPreviewVisible', $event)"
              >
                <template #header>
                  <div class="shiny-flow-preview-head">
                    <div class="shiny-flow-preview-title">
                      <h3 class="group-pet-name">洛克星盘-异色孵化流程图</h3>
                    </div>
                    <div class="shiny-flow-action-group">
                      <button type="button" class="shiny-flow-btn shiny-flow-save-btn" @click="emit('download-flow')">
                        保存图片
                      </button>
                      <button type="button" class="shiny-flow-btn" @click="emit('close-preview')">
                        关闭
                      </button>
                    </div>
                  </div>
                </template>
                <div class="shiny-flow-preview-body">
                  <div class="shiny-flow-wrap shiny-flow-wrap-preview">
                    <div class="shiny-flow-watermark" aria-hidden="true">
                      <span>洛克星盘 · 异色路线规划</span>
                      <span>洛克星盘 · 异色路线规划</span>
                      <span>洛克星盘 · 异色路线规划</span>
                      <span>洛克星盘 · 异色路线规划</span>
                      <span>洛克星盘 · 异色路线规划</span>
                      <span>洛克星盘 · 异色路线规划</span>
                      <span>洛克星盘 · 异色路线规划</span>
                      <span>洛克星盘 · 异色路线规划</span>
                    </div>
                    <div class="shiny-flow-canvas" v-html="shinyFlowSvg"></div>
                  </div>
                </div>
              </el-dialog>
            </div>

            <div v-if="!shinyCandidates.length" class="empty">没有可匹配的异色父系候选</div>

            <transition-group v-else name="rank" tag="div" class="group-result-list">
              <article v-for="item in shinyCandidates" :key="item.fatherPet" class="result-item group-item">
                <div class="left">
                  <div class="title-row">
                    <h3 class="group-pet-name">{{ item.fatherPet }}</h3>
                    <span class="pet-id">
                      {{ item.canGet ? '可获取（可孵化）' : '不可获取（当前条件）' }}
                    </span>
                  </div>
                  <p class="chain-text">{{ item.fatherChain }}</p>
                  <div class="group-tags">
                    <el-tag
                      v-for="group in item.fatherAllGroups"
                      :key="`${item.fatherPet}-${group}`"
                      effect="light"
                      round
                    >
                      {{ group }}
                    </el-tag>
                  </div>
                </div>
              </article>
            </transition-group>
          </div>
        </template>
      </el-skeleton>
    </section>
  </main>
</template>

<style scoped>


.left h3 {
  margin: 0 0 8px;
  color: var(--app-text, #1a1b21);
  font-size: 18px;
}

.pet-id {
  font-size: 12px;
  font-weight: 700;
  color: var(--app-primary, #2563eb);
  background: var(--app-tag-bg, #eff6ff);
  border: 1px solid var(--app-tag-border, #bfdbfe);
  border-radius: 999px;
  padding: 3px 9px;
}

.left p {
  margin: 3px 0;
  color: var(--app-text-soft, #64748b);
  font-size: 13px;
}

.chain-text {
  margin: 2px 0 4px;
  color: var(--app-text-muted, #6b7280);
  font-size: 12px;
}

.shiny-flow-card {
  margin-top: 0;
  margin-bottom: 12px;
}

.shiny-flow-collapse-btn {
  display: none;
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.7);
  color: #334155;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.3),
    0 8px 18px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
}

.shiny-flow-action-group {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.shiny-flow-btn {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: #fff;
  color: #334155;
  border-radius: 10px;
  height: 34px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.shiny-flow-btn:hover {
  border-color: rgba(59, 130, 246, 0.45);
  color: #1d4ed8;
}

.shiny-flow-save-btn {
  color: #0f766e;
}

.shiny-flow-wrap {
  position: relative;
  margin-top: 10px;
  overflow: auto;
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.shiny-flow-watermark {
  position: absolute;
  inset: 0;
  pointer-events: none;
  user-select: none;
  z-index: 0;
  overflow: hidden;
}

.shiny-flow-watermark span {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 420px;
  font-size: clamp(18px, 3.2vw, 34px);
  font-weight: 800;
  letter-spacing: 0.16em;
  color: rgba(148, 163, 184, 0.14);
  white-space: nowrap;
}

.shiny-flow-watermark span:nth-child(1) {
  top: 10%;
  left: 2%;
  transform: rotate(-18deg);
}

.shiny-flow-watermark span:nth-child(2) {
  top: 12%;
  left: 48%;
  transform: rotate(-16deg);
}

.shiny-flow-watermark span:nth-child(3) {
  top: 36%;
  left: -2%;
  transform: rotate(-18deg);
}

.shiny-flow-watermark span:nth-child(4) {
  top: 38%;
  left: 44%;
  transform: rotate(-16deg);
}

.shiny-flow-watermark span:nth-child(5) {
  top: 62%;
  left: 0;
  transform: rotate(-18deg);
}

.shiny-flow-watermark span:nth-child(6) {
  top: 64%;
  left: 50%;
  transform: rotate(-16deg);
}

.shiny-flow-watermark span:nth-child(7) {
  top: 84%;
  left: 8%;
  transform: rotate(-18deg);
}

.shiny-flow-watermark span:nth-child(8) {
  top: 86%;
  left: 56%;
  transform: rotate(-16deg);
}

.shiny-flow-preview-trigger {
  cursor: zoom-in;
}

.shiny-flow-canvas {
  position: relative;
  z-index: 1;
  min-width: 100%;
}

.shiny-flow-canvas :deep(svg) {
  display: block;
  width: 100%;
  max-width: none;
  height: auto;
}

.shiny-flow-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.shiny-flow-preview-title {
  min-width: 0;
}

.shiny-flow-preview-body {
  height: calc(100vh - 92px);
}

.shiny-flow-wrap-preview {
  height: 100%;
  margin-top: 0;
}

.owned-add-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.owned-add-select {
  width: 100%;
}

.owned-gender-group :deep(.el-radio-button__inner) {
  min-width: 72px;
  min-height: 42px;
  border-radius: 12px !important;
  font-weight: 700;
  box-shadow: none !important;
}

.gender-button-label,
.owned-tag-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.gender-label-short {
  display: none;
}

.owned-gender-female :deep(.el-radio-button__inner) {
  color: #dc2626 !important;
  border-color: #fca5a5 !important;
  background: #fff1f2 !important;
}

.owned-gender-female :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  color: #fff !important;
  background: #ef4444 !important;
  border-color: #ef4444 !important;
  box-shadow: -1px 0 0 0 #ef4444 !important;
}

.owned-gender-male :deep(.el-radio-button__inner) {
  color: #1d4ed8 !important;
  border-color: #93c5fd !important;
  background: #eff6ff !important;
}

.owned-gender-male :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  color: #fff !important;
  background: #2563eb !important;
  border-color: #2563eb !important;
  box-shadow: -1px 0 0 0 #2563eb !important;
}

.shiny-page .group-tags .owned-tag-female {
  color: #dc2626 !important;
  border-color: #fca5a5 !important;
  background: #fff1f2 !important;
}

.shiny-page .group-tags .owned-tag-male {
  color: #1d4ed8 !important;
  border-color: #93c5fd !important;
  background: #eff6ff !important;
}

.owned-add-btn {
  width: 42px !important;
  height: 42px !important;
  min-width: 42px !important;
  min-height: 42px !important;
  flex: 0 0 42px !important;
  border-radius: 50% !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  justify-self: end;
  aspect-ratio: 1 / 1;
}

.rank-enter-active,
.rank-leave-active {
  transition: all 0.35s ease;
}

.rank-enter-from,
.rank-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
}

.rank-move {
  transition: transform 0.35s ease;
}

@media (max-width: 768px) {
  .shiny-flow-preview-title {
    display: none;
  }

  .shiny-flow-preview-head {
    justify-content: flex-end;
  }

  .gender-label-full {
    display: none;
  }

  .gender-label-short {
    display: inline;
  }
}

@media (max-width: 640px) {
  .shiny-flow-collapse-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}



@media (min-width: 860px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
