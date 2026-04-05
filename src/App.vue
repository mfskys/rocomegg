<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh } from '@element-plus/icons-vue'

const loadingData = ref(false)
const searching = ref(false)
const hasSearched = ref(false)

const diameterInput = ref('')
const weightInput = ref('')

const rawItems = ref([])
const exactResults = ref([])
const candidates = ref([])
const searchMode = ref('matched') // exact | matched | nearest

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : NaN
}

function normalizeRangeText(text) {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/—|–|－/g, '-')
    .replace(/～|〜/g, '~')
}

function parseRange(raw) {
  const text = normalizeRangeText(raw)
  if (!text) return null

  if (/^\d+(\.\d+)?$/.test(text)) {
    const v = Number(text)
    return Number.isFinite(v) ? { min: v, max: v } : null
  }

  const parts = text.split(/[-~]/).filter(Boolean)
  if (parts.length !== 2) return null

  const a = Number(parts[0])
  const b = Number(parts[1])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return a <= b ? { min: a, max: b } : { min: b, max: a }
}

function span(range) {
  return Math.max(0.000001, range.max - range.min)
}

function centerOfRange(range) {
  return (range.min + range.max) / 2
}

function inRange(value, range) {
  return value >= range.min && value <= range.max
}

function distanceToRange(value, range) {
  if (value < range.min) return range.min - value
  if (value > range.max) return value - range.max
  return 0
}

function isPointRange(range) {
  return Math.abs(range.max - range.min) < 1e-12
}

function nearlyEqual(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

function gaussian(z) {
  return Math.exp(-0.5 * z * z)
}

function probabilityColor(p) {
  if (p >= 60) return '#67c23a'
  if (p >= 30) return '#e6a23c'
  return '#909399'
}

/**
 * 分类评分逻辑：
 * 1) 完全命中（exact）：
 *    - 仅当记录本身是“单点直径 + 单点重量”
 *    - 且输入值与两者完全相等
 * 2) 范围命中（matched）：
 *    - 直径与重量均落入区间
 * 3) 近似候选（nearest）：
 *    - 至少一维超出区间，按距离衰减评分
 */
function evaluateRow(diameter, weight, row) {
  const dIn = inRange(diameter, row.diameterRange)
  const wIn = inRange(weight, row.weightRange)
  const dPoint = isPointRange(row.diameterRange)
  const wPoint = isPointRange(row.weightRange)

  const exact =
    dPoint &&
    wPoint &&
    nearlyEqual(diameter, row.diameterRange.min) &&
    nearlyEqual(weight, row.weightRange.min)

  if (exact) {
    return {
      matchType: 'exact',
      score: 1000 // 完全命中优先级绝对最高
    }
  }

  // 范围内评分：离中心越近越高
  if (dIn && wIn) {
    const dHalf = span(row.diameterRange) / 2
    const wHalf = span(row.weightRange) / 2

    const dBaseTol = 0.02
    const wBaseTol = 0.4

    const dZ = Math.abs(diameter - row.diameterCenter) / (dHalf + dBaseTol)
    const wZ = Math.abs(weight - row.weightCenter) / (wHalf + wBaseTol)

    const dScore = gaussian(dZ)
    const wScore = gaussian(wZ)

    // 直径权重略高
    let score = Math.pow(dScore, 0.58) * Math.pow(wScore, 0.42)

    // 区间越窄，辨识度越高，给轻量加成（有上限）
    const dSpan = span(row.diameterRange)
    const wSpan = span(row.weightRange)
    const precisionBoost = 1 + 0.16 * (1 / (1 + dSpan * 12)) + 0.12 * (1 / (1 + wSpan * 2))

    score *= clamp(precisionBoost, 1, 1.28)

    return {
      matchType: 'matched',
      score
    }
  }

  // 近似评分：按超出区间距离衰减
  const dOut = distanceToRange(diameter, row.diameterRange)
  const wOut = distanceToRange(weight, row.weightRange)

  const dPenalty = dOut / 0.05
  const wPenalty = wOut / 1.0
  const score = 1 / (1 + dPenalty + wPenalty)

  return {
    matchType: 'nearest',
    score
  }
}

function normalizeProbabilities(items) {
  const sum = items.reduce((acc, item) => acc + item._score, 0)
  if (sum <= 0) return items.map((item) => ({ ...item, probability: 0, color: probabilityColor(0) }))

  return items.map((item) => {
    const probability = Number(((item._score / sum) * 100).toFixed(2))
    return {
      ...item,
      probability,
      color: probabilityColor(probability)
    }
  })
}

// 按精灵聚合（用于范围命中和近似候选）
function aggregateByPet(rows) {
  const group = new Map()

  for (const row of rows) {
    if (!group.has(row.pet)) group.set(row.pet, [])
    group.get(row.pet).push(row)
  }

  const merged = []
  for (const [pet, list] of group.entries()) {
    const sorted = [...list].sort((a, b) => b._score - a._score)

    // 多条记录衰减叠加（支持同精灵多个单独记录）
    let petScore = 0
    for (let i = 0; i < sorted.length; i++) {
      petScore += sorted[i]._score * Math.pow(0.58, i)
    }

    const best = sorted[0]
    merged.push({
      pet,
      petId: best.petId,
      eggDiameter: best.eggDiameter,
      eggWeight: best.eggWeight,
      matchCount: sorted.length,
      _score: petScore
    })
  }

  return merged.sort((a, b) => b._score - a._score)
}

async function loadDataset() {
  loadingData.value = true
  try {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const [eggRes, masterRes] = await Promise.all([
      fetch(`${baseUrl}data/egg-measurements-final.json`, { cache: 'no-store' }),
      fetch(`${baseUrl}data/creatures-master-list.json`, { cache: 'no-store' })
    ])

    if (!eggRes.ok) throw new Error(`egg dataset HTTP ${eggRes.status}`)
    if (!masterRes.ok) throw new Error(`master dataset HTTP ${masterRes.status}`)

    const eggJson = await eggRes.json()
    const masterJson = await masterRes.json()

    const idMap = new Map()
    const masterCreatures = Array.isArray(masterJson?.creatures) ? masterJson.creatures : []
    for (const c of masterCreatures) idMap.set(c.name, c.id)

    const rows = Array.isArray(eggJson?.items) ? eggJson.items : []
    rawItems.value = rows
      .map((row) => {
        const diameterRange = parseRange(row.eggDiameter)
        const weightRange = parseRange(row.eggWeight)
        if (!diameterRange || !weightRange) return null

        return {
          id: row.id,
          pet: row.pet,
          petId: idMap.get(row.pet) ?? '--',
          eggDiameter: row.eggDiameter,
          eggWeight: row.eggWeight,
          diameterRange,
          weightRange,
          diameterCenter: centerOfRange(diameterRange),
          weightCenter: centerOfRange(weightRange)
        }
      })
      .filter(Boolean)
  } catch (err) {
    rawItems.value = []
    ElMessage.error('数据加载失败，请检查 public/data/*.json')
    console.error(err)
  } finally {
    loadingData.value = false
  }
}

function onReset() {
  diameterInput.value = ''
  weightInput.value = ''
  hasSearched.value = false
  exactResults.value = []
  candidates.value = []
  searchMode.value = 'matched'
}

async function onSearch() {
  const d = toNumber(diameterInput.value)
  const w = toNumber(weightInput.value)

  if (!Number.isFinite(d) || !Number.isFinite(w)) {
    ElMessage.warning('请输入有效数字（蛋直径 / 蛋重量）')
    return
  }
  if (d <= 0 || w <= 0) {
    ElMessage.warning('蛋直径和蛋重量必须大于 0')
    return
  }
  if (!rawItems.value.length) {
    ElMessage.warning('暂无可查询数据，请稍后重试')
    return
  }

  searching.value = true
  hasSearched.value = true
  await new Promise((resolve) => setTimeout(resolve, 220))

  const scoredRows = rawItems.value.map((row) => {
    const { matchType, score } = evaluateRow(d, w, row)
    return { ...row, matchType, _score: score }
  })

  // 1) 完全命中（精确记录）优先显示，且可多条
  const exactRows = scoredRows
    .filter((r) => r.matchType === 'exact')
    .sort((a, b) => Number(a.petId) - Number(b.petId) || a.pet.localeCompare(b.pet, 'zh-CN'))

  if (exactRows.length > 0) {
    searchMode.value = 'exact'
    exactResults.value = normalizeProbabilities(
      exactRows.map((r) => ({
        pet: r.pet,
        petId: r.petId,
        eggDiameter: r.eggDiameter,
        eggWeight: r.eggWeight,
        _score: r._score
      }))
    )

    // 仍提供其他候选：先范围命中，再近似
    const rangeRows = scoredRows.filter((r) => r.matchType === 'matched')
    if (rangeRows.length > 0) {
      const merged = aggregateByPet(rangeRows).slice(0, 10)
      candidates.value = normalizeProbabilities(merged)
    } else {
      const nearestRows = scoredRows
        .filter((r) => r.matchType === 'nearest')
        .sort((a, b) => b._score - a._score)
        .slice(0, 24)
      const merged = aggregateByPet(nearestRows).slice(0, 8)
      candidates.value = normalizeProbabilities(merged)
    }

    searching.value = false
    return
  }

  exactResults.value = []

  // 2) 范围命中
  const matchedRows = scoredRows.filter((r) => r.matchType === 'matched')
  if (matchedRows.length > 0) {
    searchMode.value = 'matched'
    const merged = aggregateByPet(matchedRows).slice(0, 12)
    candidates.value = normalizeProbabilities(merged)
    searching.value = false
    return
  }

  // 3) 近似候选
  searchMode.value = 'nearest'
  const nearestRows = scoredRows.sort((a, b) => b._score - a._score).slice(0, 24)
  const merged = aggregateByPet(nearestRows).slice(0, 8)
  candidates.value = normalizeProbabilities(merged)
  searching.value = false
}

onMounted(loadDataset)
</script>

<template>
  <div class="page">
    <header class="hero">
      <h1>洛克王国世界精灵蛋查询站</h1>
      <p>输入蛋直径（m）和蛋重量（kg），查询可能孵化的候选精灵</p>
    </header>

    <main class="panel">
      <section class="search-card">
        <h2>查询条件</h2>
        <el-form label-position="top" class="search-form">
          <div class="grid">
            <el-form-item label="蛋直径（m）">
              <el-input
                v-model="diameterInput"
                type="number"
                step="0.001"
                placeholder="例如：0.58"
                clearable
                size="large"
              />
            </el-form-item>

            <el-form-item label="蛋重量（kg）">
              <el-input
                v-model="weightInput"
                type="number"
                step="0.001"
                placeholder="例如：8.6"
                clearable
                size="large"
              />
            </el-form-item>
          </div>

          <div class="actions">
            <el-button class="reset-btn" size="large" :icon="Refresh" @click="onReset">重置</el-button>
            <el-button
              class="query-btn"
              type="primary"
              size="large"
              :icon="Search"
              :loading="searching || loadingData"
              @click="onSearch"
            >
              立即查询
            </el-button>
          </div>
        </el-form>
      </section>

      <section class="result-card">
        <div class="result-header">
          <h2>候选精灵</h2>
          <el-tag v-if="hasSearched && searchMode === 'exact'" type="danger" effect="light" round>
            完全命中优先
          </el-tag>
          <el-tag v-else-if="hasSearched && searchMode === 'matched'" type="success" effect="light" round>
            范围命中
          </el-tag>
          <el-tag v-else-if="hasSearched && searchMode === 'nearest'" type="warning" effect="light" round>
            近似候选
          </el-tag>
        </div>

        <el-skeleton :loading="loadingData || searching" animated :rows="5">
          <template #default>
            <div v-if="!hasSearched" class="empty">请输入蛋直径和蛋重量后点击查询</div>
            <div v-else-if="!exactResults.length && !candidates.length" class="empty">未查询到候选精灵</div>

            <!-- 完全命中（精确记录）单独展示，可多条 -->
            <div v-if="exactResults.length" class="exact-block">
              <div class="sub-head">完全命中（精确记录）</div>
              <transition-group name="rank" tag="div" class="result-list">
                <article v-for="(item, index) in exactResults" :key="`exact-${item.petId}-${index}`" class="result-item exact-item">
                  <div class="left">
                    <div class="title-row">
                      <h3>{{ index + 1 }}. {{ item.pet }}</h3>
                      <span class="pet-id">#{{ item.petId }}</span>
                    </div>
                    <p>精确直径：{{ item.eggDiameter }} m</p>
                    <p>精确重量：{{ item.eggWeight }} kg</p>
                  </div>
                  <div class="right">
                    <div class="prob">{{ item.probability }}%</div>
                    <el-progress :percentage="item.probability" :stroke-width="10" :show-text="false" :color="item.color" />
                  </div>
                </article>
              </transition-group>
            </div>

            <!-- 其他候选 -->
            <div v-if="candidates.length" class="other-block">
              <div class="sub-head">{{ exactResults.length ? '其他候选' : '结果列表' }}</div>
              <transition-group name="rank" tag="div" class="result-list">
                <article v-for="(item, index) in candidates" :key="`${item.petId}-${item.pet}`" class="result-item">
                  <div class="left">
                    <div class="title-row">
                      <h3>{{ index + 1 }}. {{ item.pet }}</h3>
                      <span class="pet-id">#{{ item.petId }}</span>
                    </div>
                    <p>蛋直径范围：{{ item.eggDiameter }} m</p>
                    <p>蛋重量范围：{{ item.eggWeight }} kg</p>
                    <p v-if="item.matchCount > 1" class="meta">命中记录：{{ item.matchCount }} 条</p>
                  </div>
                  <div class="right">
                    <div class="prob">{{ item.probability }}%</div>
                    <el-progress :percentage="item.probability" :stroke-width="10" :show-text="false" :color="item.color" />
                  </div>
                </article>
              </transition-group>
            </div>
          </template>
        </el-skeleton>
      </section>
    </main>

    <footer class="site-footer">
      <span>© 2026 洛克王国世界精灵蛋查询站</span>
      <a
        href="https://github.com/mfskys/rocomegg"
        target="_blank"
        rel="noopener noreferrer"
      >
        GitHub 项目主页
      </a>
    </footer>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 28px 14px 46px;
  background: radial-gradient(circle at top left, #faf8ff, #eeedf5 58%, #e8e7ef);
}

.hero {
  max-width: 980px;
  margin: 0 auto 18px;
  text-align: center;
}
.hero h1 {
  margin: 0;
  color: #5140b3;
  font-size: clamp(28px, 4.4vw, 46px);
}
.hero p {
  margin: 10px 0 8px;
  color: #474553;
}

.panel {
  max-width: 980px;
  margin: 0 auto;
  display: grid;
  gap: 16px;
}

.search-card,
.result-card {
  background: rgba(255, 255, 255, 0.85);
  border-radius: 22px;
  padding: 20px;
  box-shadow: 0 18px 36px rgba(81, 64, 179, 0.08);
  border: 1px solid rgba(201, 196, 213, 0.45);
  backdrop-filter: blur(8px);
}

.search-card h2,
.result-card h2 {
  margin: 0 0 12px;
  color: #5140b3;
}

.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.actions {
  display: flex;
  gap: 12px;
  flex-wrap: nowrap;
  justify-content: flex-end;
  width: 100%;
}
.query-btn {
  border-radius: 999px !important;
  border: none !important;
  padding: 12px 28px !important;
  background: linear-gradient(135deg, #5140b3, #6a5acd) !important;
  box-shadow: 0 10px 20px rgba(81, 64, 179, 0.22);
}
.reset-btn {
  border-radius: 999px !important;
  border: none !important;
  padding: 12px 26px !important;
  background: #f4f3fb !important;
  color: #5140b3 !important;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 10px;
}
.empty {
  text-align: center;
  color: #6a6880;
  padding: 28px 10px;
}

.sub-head {
  font-weight: 700;
  color: #4e48a6;
  margin: 8px 2px 10px;
}
.other-block {
  margin-top: 12px;
}

.result-list {
  display: grid;
  gap: 12px;
}
.result-item {
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(81, 64, 179, 0.06);
  padding: 14px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
.exact-item {
  border: 1px solid rgba(245, 108, 108, 0.35);
  background: linear-gradient(180deg, #fff, #fff9f9);
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.left h3 {
  margin: 0 0 8px;
  color: #1a1b21;
  font-size: 18px;
}
.pet-id {
  font-size: 12px;
  font-weight: 700;
  color: #6a5acd;
  background: #f1eefe;
  border: 1px solid #ddd4ff;
  border-radius: 999px;
  padding: 3px 9px;
}
.left p {
  margin: 3px 0;
  color: #5f5d72;
  font-size: 13px;
}
.meta {
  color: #7c7498;
}

.right {
  display: grid;
  gap: 8px;
}
.prob {
  font-size: 20px;
  font-weight: 800;
  color: #5140b3;
}

/* 排序动画 */
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

:deep(.el-form-item__label) {
  color: #4532a6 !important;
  font-weight: 700;
}
:deep(.el-input__wrapper) {
  border-radius: 14px;
  background: #e8e7ef;
  box-shadow: none;
}
:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px rgba(255, 215, 0, 0.65) inset !important;
}

.site-footer {
  max-width: 980px;
  margin: 18px auto 0;
  padding: 12px 6px 0;
  display: flex;
  justify-content: center;
  gap: 14px;
  color: #6f6a86;
  font-size: 13px;
}

.site-footer a {
  color: #5140b3;
  text-decoration: none;
  font-weight: 600;
}

.site-footer a:hover {
  text-decoration: underline;
}

@media (min-width: 860px) {
  .grid {
    grid-template-columns: 1fr 1fr;
  }
  .result-item {
    grid-template-columns: 1.2fr 0.8fr;
    align-items: center;
  }
}
</style>
