<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Sunny, Moon, Monitor } from '@element-plus/icons-vue'
import html2canvas from 'html2canvas'
import QRCode from 'qrcode'
import mermaid from 'mermaid'
import GenderMaleIcon from './components/icons/GenderMaleIcon.vue'
import GenderFemaleIcon from './components/icons/GenderFemaleIcon.vue'
import {
  EGG_GROUP_INPUT,
  SHINY_SEED_PETS,
  NO_BREED_PETS,
  normalizeBreedingName
} from './data/breeding-config'

const currentMode = ref('size')
const groupSubMode = ref('group')

const loadingData = ref(false)
const searching = ref(false)
const hasSearched = ref(false)

const diameterInput = ref('')
const weightInput = ref('')

const rawItems = ref([])
const exactResults = ref([])
const candidates = ref([])
const searchMode = ref('matched')
const surveyUrl = 'https://f.wps.cn/ksform/w/write/YUmapbHA/#routePromt'
const sharingPoster = ref(false)
const sharingCapture = ref(false)
const shareImageUrl = ref('')
const shareImagesReady = ref(true)

const groupKeyword = ref('')
const groupStage = ref('')
const groupSearching = ref(false)
const groupHasSearched = ref(false)
const groupResults = ref([])

const breedTargetName = ref('')
const forceShiny = ref(false)
const breedSearching = ref(false)
const breedHasSearched = ref(false)
const breedResult = ref(null)
const breedCandidates = ref([])

const shinySearching = ref(false)
const shinyHasSearched = ref(false)
const shinyResult = ref(null)
const shinyCandidates = ref([])
const shinyFlowSvg = ref('')
const shinyFlowPreviewVisible = ref(false)

const shinyOwnedDraftName = ref('')
const shinyOwnedDraftGender = ref('female')
const shinyOwnedList = ref([])

const shinyPets = ref(new Set())

const shinySeedPets = new Set(SHINY_SEED_PETS)
const noBreedPets = new Set(NO_BREED_PETS)
const shinyFemaleOnlyPets = new Set(['雪影娃娃'])

const groupIndex = ref({
  groupsByPet: new Map(),
  stageToBase: new Map(),
  stageToFinal: new Map(),
  stageToChainText: new Map(),
  baseToMembers: new Map(),
  baseToChain: new Map(),
  baseToChains: new Map(),
  allPetNames: new Set()
})

const eggGroupInput = EGG_GROUP_INPUT
const groupStageOptions = computed(() =>
  Object.keys(eggGroupInput).sort((a, b) => a.localeCompare(b, 'zh-CN'))
)
const datasetCount = computed(() => rawItems.value.length)
const groupModeHint = computed(() => {
  if (groupSubMode.value === 'group') return '可单独查询精灵蛋组或者查询独自的蛋组，互斥'
  if (groupSubMode.value === 'breed') {
    return '孵蛋规则：需要同蛋组精灵，并且是一公一母；孵化出来的为母系精灵。父母均为普通精灵时，小概率出现异色/炫彩精灵；父母有异色/炫彩时，蛋出现异色/炫彩概率提高。'
  }
  return '添加异色清单，查询会自动引用你已添加的异色清单进行路线规划。'
})

const THEME_STORAGE_KEY = 'rocom_theme_mode'
const themeMode = ref('auto')
const systemDark = ref(false)
let themeMediaQuery = null

function getSystemDark() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(mode = themeMode.value) {
  if (typeof document === 'undefined') return
  const actual = mode === 'auto' ? (systemDark.value ? 'dark' : 'light') : mode
  document.documentElement.setAttribute('data-theme', actual)
  document.body?.setAttribute('data-theme', actual)
  document.documentElement.classList.toggle('dark', actual === 'dark')
  document.body?.classList.toggle('dark', actual === 'dark')
  document.documentElement.style.colorScheme = actual
}

function onSystemThemeChange(e) {
  systemDark.value = e.matches
  if (themeMode.value === 'auto') applyTheme('auto')
}

function initThemeMode() {
  if (typeof window === 'undefined') return
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'auto') {
    themeMode.value = saved
  }
  systemDark.value = getSystemDark()
  if (window.matchMedia) {
    themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    if (themeMediaQuery.addEventListener) {
      themeMediaQuery.addEventListener('change', onSystemThemeChange)
    } else if (themeMediaQuery.addListener) {
      themeMediaQuery.addListener(onSystemThemeChange)
    }
  }
  applyTheme(themeMode.value)
}

function setThemeMode(mode) {
  themeMode.value = mode
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  }
  applyTheme(mode)
}

function cycleThemeMode() {
  const order = ['light', 'dark', 'auto']
  const idx = order.indexOf(themeMode.value)
  const next = order[(idx + 1) % order.length]
  setThemeMode(next)
}

const themeModeLabel = computed(() => (themeMode.value === 'light' ? '浅色' : themeMode.value === 'dark' ? '深色' : '自动'))
const themeIcon = computed(() => (themeMode.value === 'light' ? Sunny : themeMode.value === 'dark' ? Moon : Monitor))
const activeTheme = computed(() => (themeMode.value === 'auto' ? (systemDark.value ? 'dark' : 'light') : themeMode.value))
const shinyVisualActive = computed(() => forceShiny.value && canEnableShinySwitch())
const shinyPetOptions = computed(() => {
  const finals = new Set()
  for (const name of shinyPets.value) {
    finals.add(groupIndex.value.stageToFinal.get(name) || name)
  }
  return [...finals].sort((a, b) => a.localeCompare(b, 'zh-CN'))
})
const shinyPetOptionSet = computed(() => new Set(shinyPetOptions.value))
const shinyPetOptionObjects = computed(() =>
  shinyPetOptions.value.map((name) => ({
    label: name,
    value: name
  }))
)

function addShinyOwned() {
  const name = (shinyOwnedDraftName.value || '').trim()
  if (!name) {
    ElMessage.warning('请先选择已有异色精灵')
    return
  }

  const finalName = groupIndex.value.stageToFinal.get(name) || name
  if (!shinyPetOptionSet.value.has(finalName)) {
    ElMessage.warning('仅可添加异色精灵')
    return
  }

  if (shinyFemaleOnlyPets.has(finalName) && shinyOwnedDraftGender.value === 'male') {
    ElMessage.warning(`${finalName} 无雄性，仅可添加雌性`)
    return
  }

  const key = `${finalName}::${shinyOwnedDraftGender.value}`
  const exists = shinyOwnedList.value.some((x) => `${x.name}::${x.gender}` === key)
  if (exists) {
    ElMessage.info('该已有异色记录已存在')
    return
  }

  shinyOwnedList.value = [
    ...shinyOwnedList.value,
    { name: finalName, gender: shinyOwnedDraftGender.value }
  ]

  shinyOwnedDraftName.value = ''
  ElMessage.success('已添加到已有异色清单')
}

function removeShinyOwned(item) {
  shinyOwnedList.value = shinyOwnedList.value.filter((x) => !(x.name === item.name && x.gender === item.gender))
}

function setMode(mode) {
  currentMode.value = mode
}

function setGroupSubMode(mode) {
  groupSubMode.value = mode
}

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

function normalizePetId(petId) {
  const raw = String(petId ?? '').trim()
  if (!raw || raw === '--') return ''
  const num = Number(raw)
  if (!Number.isFinite(num) || num <= 0) return ''
  return String(Math.trunc(num)).padStart(3, '0')
}

function getCreatureImageUrl(petId) {
  const id = normalizePetId(petId)
  if (!id) return ''
  return `${import.meta.env.BASE_URL || '/'}creature-id-images/${id}.png`
}

function updateShareImagesReady() {
  if (typeof document === 'undefined') return
  const imgs = Array.from(document.querySelectorAll('.share-poster-target img'))
  if (imgs.length === 0) {
    shareImagesReady.value = true
    return
  }
  shareImagesReady.value = imgs.every((img) => img.complete && img.naturalWidth > 0)
}

function evaluateRow(diameter, weight, row) {
  const dIn = inRange(diameter, row.diameterRange)
  const wIn = inRange(weight, row.weightRange)
  const dPoint = isPointRange(row.diameterRange)
  const wPoint = isPointRange(row.weightRange)

  const precise =
    dPoint &&
    wPoint &&
    nearlyEqual(diameter, row.diameterRange.min) &&
    nearlyEqual(weight, row.weightRange.min)

  if (precise) return { matchType: 'precise', score: 1200 }

  if (dPoint && wPoint) {
    const dDiff = Math.abs(diameter - row.diameterRange.min)
    const wDiff = Math.abs(weight - row.weightRange.min)

    if (dDiff <= 0.01 && wDiff <= 0.1) {
      const dNorm = dDiff / 0.01
      const wNorm = wDiff / 0.1
      const distance = Math.sqrt(dNorm * dNorm + wNorm * wNorm)
      const score = 1100 - distance * 120
      return { matchType: 'tolerance1', score }
    }

    if (dDiff <= 0.02 && wDiff <= 0.2) {
      const dNorm = dDiff / 0.02
      const wNorm = wDiff / 0.2
      const distance = Math.sqrt(dNorm * dNorm + wNorm * wNorm)
      const score = 900 - distance * 140
      return { matchType: 'tolerance2', score }
    }
  }

  if (dIn && wIn) {
    const dHalf = span(row.diameterRange) / 2
    const wHalf = span(row.weightRange) / 2
    const dBaseTol = 0.02
    const wBaseTol = 0.4
    const dZ = Math.abs(diameter - row.diameterCenter) / (dHalf + dBaseTol)
    const wZ = Math.abs(weight - row.weightCenter) / (wHalf + wBaseTol)
    const dScore = gaussian(dZ)
    const wScore = gaussian(wZ)
    let score = Math.pow(dScore, 0.58) * Math.pow(wScore, 0.42)
    const precisionBoost = 1 + 0.16 * (1 / (1 + span(row.diameterRange) * 12)) + 0.12 * (1 / (1 + span(row.weightRange) * 2))
    score *= clamp(precisionBoost, 1, 1.28)
    return { matchType: 'matched', score }
  }

  const score = 1 / (1 + distanceToRange(diameter, row.diameterRange) / 0.05 + distanceToRange(weight, row.weightRange) / 1.0)
  return { matchType: 'nearest', score }
}

function normalizeProbabilities(items) {
  const sum = items.reduce((acc, item) => acc + item._score, 0)
  if (sum <= 0) return items.map((item) => ({ ...item, probability: 0, color: probabilityColor(0) }))
  return items.map((item) => {
    const probability = Number(((item._score / sum) * 100).toFixed(2))
    return { ...item, probability, color: probabilityColor(probability) }
  })
}

function aggregateByPet(rows) {
  const group = new Map()
  for (const row of rows) {
    if (!group.has(row.pet)) group.set(row.pet, [])
    group.get(row.pet).push(row)
  }

  const merged = []
  for (const [pet, list] of group.entries()) {
    const sorted = [...list].sort((a, b) => b._score - a._score)
    let petScore = 0
    for (let i = 0; i < sorted.length; i++) petScore += sorted[i]._score * Math.pow(0.58, i)
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

function buildGroupIndex(masterNames, evolutionChains) {
  const groupsByPet = new Map()
  const stageToBase = new Map()
  const stageToFinal = new Map()
  const stageToChainText = new Map()
  const baseToMembers = new Map()
  const baseToChain = new Map()
  const baseToChains = new Map()
  const allPetNames = new Set(masterNames)

  const addGroup = (pet, group) => {
    if (!groupsByPet.has(pet)) groupsByPet.set(pet, new Set())
    groupsByPet.get(pet).add(group)
  }

  for (const [group, pets] of Object.entries(eggGroupInput)) {
    for (const pet of pets) {
      addGroup(pet, group)
      allPetNames.add(pet)
    }
  }

  for (const chain of evolutionChains) {
    if (!Array.isArray(chain) || chain.length === 0) continue
    const names = chain.map((s) => s.name).filter(Boolean)
    if (!names.length) continue

    const base = names[0]
    const final = names[names.length - 1]
    const chainText = names.join(' → ')

    if (!baseToMembers.has(base)) baseToMembers.set(base, new Set())
    const memberSet = baseToMembers.get(base)
    for (const name of names) memberSet.add(name)

    if (!baseToChain.has(base)) baseToChain.set(base, names)
    if (!baseToChains.has(base)) baseToChains.set(base, [])
    baseToChains.get(base).push(names)

    for (const name of names) {
      stageToBase.set(name, base)
      stageToFinal.set(name, final)
      stageToChainText.set(name, chainText)
      allPetNames.add(name)
    }

    const unionGroups = new Set()
    for (const name of names) {
      const gs = groupsByPet.get(name)
      if (!gs) continue
      for (const g of gs) unionGroups.add(g)
    }

    if (unionGroups.size > 0) {
      for (const name of names) {
        if (!groupsByPet.has(name)) groupsByPet.set(name, new Set())
        const target = groupsByPet.get(name)
        for (const g of unionGroups) target.add(g)
      }
    }
  }

  return { groupsByPet, stageToBase, stageToFinal, stageToChainText, baseToMembers, baseToChain, baseToChains, allPetNames }
}

async function loadDataset() {
  loadingData.value = true
  try {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const [eggRes, masterRes, evoRes] = await Promise.all([
      fetch(`${baseUrl}data/egg-measurements-final.json`, { cache: 'no-store' }),
      fetch(`${baseUrl}data/creatures-master-list.json`, { cache: 'no-store' }),
      fetch(`${baseUrl}data/evolution-chains.json`, { cache: 'no-store' })
    ])

    if (!eggRes.ok) throw new Error(`egg dataset HTTP ${eggRes.status}`)
    if (!masterRes.ok) throw new Error(`master dataset HTTP ${masterRes.status}`)

    const eggJson = await eggRes.json()
    const masterJson = await masterRes.json()
    const evoJson = evoRes.ok ? await evoRes.json() : { chains: [] }

    const idMap = new Map()
    const masterCreatures = Array.isArray(masterJson?.creatures) ? masterJson.creatures : []
    for (const c of masterCreatures) idMap.set(c.name, c.id)

    const masterNames = masterCreatures.map((c) => c.name)
    const evolutionChains = Array.isArray(evoJson?.chains) ? evoJson.chains : []
    groupIndex.value = buildGroupIndex(masterNames, evolutionChains)

    const shinySet = new Set()
    const { allPetNames, stageToBase, stageToFinal, baseToChains } = groupIndex.value
    for (const rawName of shinySeedPets) {
      const seedName = normalizeBreedingName(rawName)
      if (!seedName || !allPetNames.has(seedName)) continue

      const base = stageToBase.get(seedName) || seedName
      const chains = baseToChains.get(base) || []

      if (chains.length > 0) {
        for (const chain of chains) {
          if (!Array.isArray(chain) || chain.length === 0) continue
          const idx = chain.indexOf(seedName)
          if (idx === -1) continue
          for (let i = idx; i < chain.length; i++) {
            const name = chain[i]
            if (allPetNames.has(name)) shinySet.add(name)
          }
        }
      }

      if (!shinySet.has(seedName)) {
        const finalName = stageToFinal.get(seedName) || seedName
        if (allPetNames.has(finalName)) shinySet.add(finalName)
      }
    }
    shinyPets.value = shinySet

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
    groupIndex.value = {
      groupsByPet: new Map(),
      stageToBase: new Map(),
      stageToFinal: new Map(),
      stageToChainText: new Map(),
      baseToMembers: new Map(),
      baseToChain: new Map(),
      baseToChains: new Map(),
      allPetNames: new Set()
    }
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
  shareImageUrl.value = ''
  shareImagesReady.value = true
}

function onOpenSurvey() {
  window.open(surveyUrl, '_blank', 'noopener,noreferrer')
}

function downloadDataUrl(dataUrl, fileName = 'rocom-share.png') {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function buildShareFileName() {
  const normalize = (value) => {
    const text = String(value ?? '').trim()
    if (!text) return 'na'
    return text.replace(/[^\d.]+/g, '_').replace(/_+/g, '_')
  }

  const d = normalize(diameterInput.value)
  const w = normalize(weightInput.value)
  return `rocom-share_d${d}_w${w}.png`
}

async function onDownloadShareImage() {
  if (!shareImageUrl.value) {
    ElMessage.warning('暂无可下载图片，请先生成分享长图')
    return
  }
  downloadDataUrl(shareImageUrl.value, buildShareFileName())
}

function buildShareQueryUrl() {
  const url = new URL(window.location.href)
  url.searchParams.set('mode', 'size')
  url.searchParams.set('d', String(diameterInput.value || '').trim())
  url.searchParams.set('w', String(weightInput.value || '').trim())
  url.searchParams.set('auto', '1')
  return url.toString()
}

async function onShareLongImage() {
  if (!hasSearched.value) {
    ElMessage.warning('请先查询后再生成分享长图')
    return
  }

  if (shareImageUrl.value) {
    await onDownloadShareImage()
    return
  }

  updateShareImagesReady()
  if (!shareImagesReady.value) {
    ElMessage.warning('候选精灵图片仍在加载，请稍后再分享长图')
    return
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') return

  sharingPoster.value = true
  sharingCapture.value = true
  try {
    await nextTick()

    const target =
      document.querySelector('.share-poster-target') ||
      document.querySelector('.panel') ||
      document.querySelector('.page')

    if (!target) {
      ElMessage.warning('未找到可截图区域')
      return
    }

    const htmlTheme = document.documentElement.getAttribute('data-theme')
    const posterIsDark = activeTheme.value === 'dark' || htmlTheme === 'dark'
    const posterBg = posterIsDark ? '#0b1220' : '#ffffff'
    const footerTitleColor = posterIsDark ? '#e5e7eb' : '#111827'
    const footerTextColor = posterIsDark ? '#cbd5e1' : '#4b5563'
    const footerBorderColor = posterIsDark ? '#334155' : '#e5e7eb'

    const canvas = await html2canvas(target, {
      backgroundColor: posterBg,
      useCORS: true,
      scale: Math.max(2, window.devicePixelRatio || 1),
      windowWidth: Math.max(document.documentElement.clientWidth, target.scrollWidth),
      windowHeight: Math.max(target.scrollHeight, target.clientHeight),
      scrollX: 0,
      scrollY: -window.scrollY
    })

    const qrDataUrl = await QRCode.toDataURL(buildShareQueryUrl(), {
      width: 240,
      margin: 1,
      color: { dark: '#111827', light: '#ffffff' }
    })

    const footerHeight = 300
    const output = document.createElement('canvas')
    output.width = canvas.width
    output.height = canvas.height + footerHeight
    const ctx = output.getContext('2d')

    if (!ctx) {
      ElMessage.warning('生成图片失败，请重试')
      return
    }

    ctx.fillStyle = posterBg
    ctx.fillRect(0, 0, output.width, output.height)
    ctx.drawImage(canvas, 0, 0)

    const qr = new Image()
    qr.src = qrDataUrl
    await new Promise((resolve, reject) => {
      qr.onload = resolve
      qr.onerror = reject
    })

    const padding = 28
    const qrSize = 170
    const qrX = output.width - qrSize - padding
    const qrY = canvas.height + (footerHeight - qrSize) / 2

    ctx.fillStyle = footerTitleColor
    ctx.font = 'bold 34px sans-serif'
    ctx.fillText('洛克星盘-洛克王国世界工具站', padding, canvas.height + 92)

    ctx.fillStyle = footerTextColor
    ctx.font = '24px sans-serif'
    ctx.fillText('扫码自动回填尺寸与重量并查询', padding, canvas.height + 138)
    ctx.fillText('长按图片可保存到手机', padding, canvas.height + 176)
    ctx.fillText('洛克王国世界企鹅交流群：1091503815', padding, canvas.height + 214)

    ctx.strokeStyle = footerBorderColor
    ctx.lineWidth = 2
    ctx.strokeRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20)
    ctx.drawImage(qr, qrX, qrY, qrSize, qrSize)

    const dataUrl = output.toDataURL('image/png')
    shareImageUrl.value = dataUrl
    ElMessage.success('长图已生成，点击“点击下载”按钮保存')
  } catch (err) {
    console.error(err)
    ElMessage.warning('分享长图生成失败，请稍后重试')
  } finally {
    sharingCapture.value = false
    sharingPoster.value = false
  }
}

async function onSearch() {
  const d = toNumber(diameterInput.value)
  const w = toNumber(weightInput.value)

  if (!Number.isFinite(d) || !Number.isFinite(w)) {
    ElMessage.warning('请输入有效数字（蛋尺寸 / 蛋重量）')
    return
  }
  if (d <= 0 || w <= 0) {
    ElMessage.warning('蛋尺寸和蛋重量必须大于 0')
    return
  }
  if (!rawItems.value.length) {
    ElMessage.warning('暂无可查询数据，请稍后重试')
    return
  }

  shareImageUrl.value = ''
  shareImagesReady.value = false
  searching.value = true
  hasSearched.value = true
  await new Promise((resolve) => setTimeout(resolve, 220))

  const scoredRows = rawItems.value.map((row) => {
    const { matchType, score } = evaluateRow(d, w, row)
    return { ...row, matchType, _score: score }
  })

  const preciseRows = scoredRows
    .filter((r) => r.matchType === 'precise')
    .sort((a, b) => Number(a.petId) - Number(b.petId) || a.pet.localeCompare(b.pet, 'zh-CN'))

  if (preciseRows.length > 0) {
    searchMode.value = 'precise'
    exactResults.value = normalizeProbabilities(
      preciseRows.map((r) => ({
        pet: r.pet,
        petId: r.petId,
        eggDiameter: r.eggDiameter,
        eggWeight: r.eggWeight,
        _score: r._score
      }))
    )

    const rangeRows = scoredRows.filter((r) => r.matchType === 'matched')
    if (rangeRows.length > 0) {
      candidates.value = normalizeProbabilities(aggregateByPet(rangeRows).slice(0, 10))
    } else {
      const nearestRows = scoredRows.filter((r) => r.matchType === 'nearest').sort((a, b) => b._score - a._score).slice(0, 24)
      candidates.value = normalizeProbabilities(aggregateByPet(nearestRows).slice(0, 8))
    }

    await nextTick()
    updateShareImagesReady()
    await nextTick()
    updateShareImagesReady()
    searching.value = false
    return
  }

  const tolerance1Rows = scoredRows
    .filter((r) => r.matchType === 'tolerance1')
    .sort((a, b) => b._score - a._score)

  if (tolerance1Rows.length > 0) {
    searchMode.value = 'tolerance1'
    exactResults.value = normalizeProbabilities(
      tolerance1Rows.map((r) => ({
        pet: r.pet,
        petId: r.petId,
        eggDiameter: r.eggDiameter,
        eggWeight: r.eggWeight,
        _score: r._score
      }))
    )

    const rangeRows = scoredRows.filter((r) => r.matchType === 'matched')
    if (rangeRows.length > 0) {
      candidates.value = normalizeProbabilities(aggregateByPet(rangeRows).slice(0, 10))
    } else {
      const nearestRows = scoredRows.filter((r) => r.matchType === 'nearest').sort((a, b) => b._score - a._score).slice(0, 24)
      candidates.value = normalizeProbabilities(aggregateByPet(nearestRows).slice(0, 8))
    }

    await nextTick()
    updateShareImagesReady()
    searching.value = false
    return
  }

  const tolerance2Rows = scoredRows
    .filter((r) => r.matchType === 'tolerance2')
    .sort((a, b) => b._score - a._score)

  if (tolerance2Rows.length > 0) {
    searchMode.value = 'tolerance2'
    exactResults.value = normalizeProbabilities(
      tolerance2Rows.map((r) => ({
        pet: r.pet,
        petId: r.petId,
        eggDiameter: r.eggDiameter,
        eggWeight: r.eggWeight,
        _score: r._score
      }))
    )

    const rangeRows = scoredRows.filter((r) => r.matchType === 'matched')
    if (rangeRows.length > 0) {
      candidates.value = normalizeProbabilities(aggregateByPet(rangeRows).slice(0, 10))
    } else {
      const nearestRows = scoredRows.filter((r) => r.matchType === 'nearest').sort((a, b) => b._score - a._score).slice(0, 24)
      candidates.value = normalizeProbabilities(aggregateByPet(nearestRows).slice(0, 8))
    }

    searching.value = false
    return
  }

  exactResults.value = []

  const matchedRows = scoredRows.filter((r) => r.matchType === 'matched')
  if (matchedRows.length > 0) {
    searchMode.value = 'matched'
    candidates.value = normalizeProbabilities(aggregateByPet(matchedRows).slice(0, 12))
    searching.value = false
    return
  }

  searchMode.value = 'nearest'
  candidates.value = normalizeProbabilities(aggregateByPet(scoredRows.sort((a, b) => b._score - a._score).slice(0, 24)).slice(0, 8))
  await nextTick()
  updateShareImagesReady()
  searching.value = false
}

function onGroupReset() {
  groupKeyword.value = ''
  groupStage.value = ''
  groupHasSearched.value = false
  groupResults.value = []
}

async function onGroupSearch() {
  const petKeyword = groupKeyword.value.trim()
  const groupKeywordText = groupStage.value.trim()

  if (!petKeyword && !groupKeywordText) {
    ElMessage.warning('请至少输入一个查询条件')
    return
  }

  groupSearching.value = true
  groupHasSearched.value = true
  await new Promise((resolve) => setTimeout(resolve, 220))

  const { groupsByPet, stageToFinal, stageToChainText } = groupIndex.value
  const finalMap = new Map()

  for (const [pet, gset] of groupsByPet.entries()) {
    const finalPet = stageToFinal.get(pet) || pet
    const chain = stageToChainText.get(pet) || stageToChainText.get(finalPet) || finalPet
    const current = finalMap.get(finalPet)

    if (!current) {
      finalMap.set(finalPet, {
        pet: finalPet,
        chain,
        groups: new Set(gset)
      })
    } else {
      for (const g of gset) current.groups.add(g)
      if (current.chain.length < chain.length) current.chain = chain
    }
  }

  const rows = []
  for (const item of finalMap.values()) {
    const groups = [...item.groups].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    const byPet = !petKeyword || item.pet.includes(petKeyword) || item.chain.includes(petKeyword)
    const byGroup = !groupKeywordText || groups.some((g) => g.includes(groupKeywordText))
    if (byPet && byGroup) {
      rows.push({
        pet: item.pet,
        chain: item.chain,
        groups
      })
    }
  }

  groupResults.value = rows.sort((a, b) => a.pet.localeCompare(b.pet, 'zh-CN'))
  groupSearching.value = false
}

function onBreedReset() {
  breedTargetName.value = ''
  forceShiny.value = false
  breedHasSearched.value = false
  breedResult.value = null
  breedCandidates.value = []
}

function onShinyReset() {
  shinyHasSearched.value = false
  shinyResult.value = null
  shinyCandidates.value = []
  shinyFlowSvg.value = ''
  shinyFlowPreviewVisible.value = false
  shinyOwnedList.value = []
  shinyOwnedDraftName.value = ''
  shinyOwnedDraftGender.value = 'female'
}

function buildShinyCollectionPlan({ seedFinals, candidates, groupsByPet, stageToFinal, ownedFinalSet, ownedGenderMap }) {
  const normalizedSeeds = [...new Set(seedFinals.map((x) => stageToFinal.get(x) || x).filter(Boolean))]
  const nodes = [...new Set([...normalizedSeeds, ...candidates.map((c) => c.fatherPet)])]
  const candidateGroupMap = new Map(candidates.map((c) => [c.fatherPet, new Set(c.fatherAllGroups)]))

  const getGroups = (pet) => {
    const fromIndex = groupsByPet.get(pet)
    if (fromIndex && fromIndex.size > 0) return new Set(fromIndex)
    if (candidateGroupMap.has(pet)) return new Set(candidateGroupMap.get(pet))
    return new Set()
  }

  const groupTextOf = (pet) => {
    const groups = [...getGroups(pet)].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    return groups.length ? groups.join(' / ') : '无蛋组'
  }

  const graph = new Map(nodes.map((n) => [n, new Set()]))
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      const aGroups = getGroups(a)
      const bGroups = getGroups(b)
      let connected = false
      for (const g of aGroups) {
        if (bGroups.has(g)) {
          connected = true
          break
        }
      }
      if (connected) {
        graph.get(a).add(b)
        graph.get(b).add(a)
      }
    }
  }

  const available = new Set([...ownedFinalSet, ...normalizedSeeds])

  const malePool = new Set()
  for (const [pet, genders] of (ownedGenderMap || new Map()).entries()) {
    if (!shinyFemaleOnlyPets.has(pet) && genders?.has('male')) malePool.add(pet)
  }

  const distance = new Map()
  const bfsQueue = []
  for (const seed of normalizedSeeds) {
    distance.set(seed, 0)
    bfsQueue.push(seed)
  }
  while (bfsQueue.length > 0) {
    const cur = bfsQueue.shift()
    const curDist = distance.get(cur) ?? 0
    for (const nxt of graph.get(cur) || []) {
      if (distance.has(nxt)) continue
      distance.set(nxt, curDist + 1)
      bfsQueue.push(nxt)
    }
  }

  const genderText = (pet) => {
    const genders = ownedGenderMap?.get(pet)
    if (!genders || genders.size === 0) return ''
    if (genders.has('female') && genders.has('male')) return '（雌/雄）'
    return genders.has('female') ? '（雌性）' : '（雄性）'
  }

  const targets = [...nodes].sort((a, b) => {
    const aDone = ownedFinalSet.has(a) || normalizedSeeds.includes(a)
    const bDone = ownedFinalSet.has(b) || normalizedSeeds.includes(b)
    if (aDone !== bDone) return aDone ? -1 : 1

    const da = distance.get(a) ?? Number.MAX_SAFE_INTEGER
    const db = distance.get(b) ?? Number.MAX_SAFE_INTEGER
    if (da !== db) return da - db

    return a.localeCompare(b, 'zh-CN')
  })

  const pendingTargets = targets.filter((pet) => !ownedFinalSet.has(pet) && !normalizedSeeds.includes(pet))

  const needAsMaleDonor = (pet, pendingSet) => {
    if (shinyFemaleOnlyPets.has(pet)) return false
    for (const other of pendingSet) {
      if (other === pet) continue
      if ((graph.get(other) || new Set()).has(pet)) return true
    }
    return false
  }

  const hasOwnedMale = (pet) => ownedGenderMap?.get(pet)?.has('male') === true
  const hasOwnedFemale = (pet) => ownedGenderMap?.get(pet)?.has('female') === true

  const cards = []
  const deferredSeedMaleCards = new Map()
  const routeCards = []

  for (const seed of normalizedSeeds) {
    cards.push({
      title: `起点：${seed}${genderText(seed)}`,
      target: seed,
      groupText: groupTextOf(seed),
      desc: '该异色已在你的已有清单中。',
      status: 'done'
    })

    if (!hasOwnedMale(seed) && hasOwnedFemale(seed) && !shinyFemaleOnlyPets.has(seed) && needAsMaleDonor(seed, pendingTargets)) {
      malePool.add(seed)
      deferredSeedMaleCards.set(seed, {
        title: `收集：${seed}（雄性）`,
        target: seed,
        groupText: groupTextOf(seed),
        desc: '',
        pair: {
          female: seed,
          malePrefix: '同蛋组雄性',
          maleName: ''
        },
        status: 'can'
      })
    }
  }

  for (const pet of targets) {
    if (normalizedSeeds.includes(pet)) continue

    if (ownedFinalSet.has(pet)) {
      routeCards.push({
        title: `收集：${pet}${genderText(pet)}`,
        target: pet,
        groupText: groupTextOf(pet),
        desc: '该异色已在你的已有清单中。',
        status: 'done'
      })
      continue
    }

    let donorMale = null
    for (const donor of malePool) {
      if (donor === pet) continue
      if ((graph.get(pet) || new Set()).has(donor)) {
        donorMale = donor
        break
      }
    }

    const needMale = needAsMaleDonor(pet, pendingTargets)
    const genderLabel = shinyFemaleOnlyPets.has(pet) ? '（雌性）' : (needMale ? '（雄性）' : '')

    if (donorMale) {
      routeCards.push({
        title: `收集：${pet}${genderLabel}`,
        target: pet,
        groupText: groupTextOf(pet),
        desc: '',
        pair: {
          female: pet,
          malePrefix: '异色雄性',
          maleName: donorMale
        },
        status: 'can'
      })

      available.add(pet)
      if (needMale && !shinyFemaleOnlyPets.has(pet)) {
        malePool.add(pet)
      }
    } else {
      routeCards.push({
        title: `收集：${pet}${genderLabel}`,
        target: pet,
        groupText: groupTextOf(pet),
        desc: '当前不可直接获取，需先补齐可配对异色后再尝试。',
        status: 'blocked'
      })
    }
  }

  for (const seed of normalizedSeeds) {
    const deferredCard = deferredSeedMaleCards.get(seed)
    if (!deferredCard) continue
    const actuallyUsed = routeCards.some((card) => card.pair?.maleName === seed)
    if (actuallyUsed) cards.push(deferredCard)
  }

  cards.push(...routeCards)

  const total = targets.length
  const doneCount = targets.filter((t) => ownedFinalSet.has(t) || normalizedSeeds.includes(t)).length
  const progress = total > 0 ? Number(((doneCount / total) * 100).toFixed(2)) : 0

  const canGetSet = new Set(
    cards
      .filter((card) => card.target && (card.status === 'done' || card.status === 'can'))
      .map((card) => card.target)
  )

  return {
    targets,
    cards,
    total,
    doneCount,
    progress,
    canGetSet
  }
}

function escapeMermaidText(text) {
  return String(text ?? '')
    .replace(/"/g, '＂')
    .replace(/</g, '《')
    .replace(/>/g, '》')
    .replace(/\n+/g, ' ')
    .trim()
}

function buildShinyRouteMermaid(routePlan) {
  const cards = Array.isArray(routePlan?.cards)
    ? routePlan.cards.filter((card) => card.status !== 'blocked')
    : []
  if (!cards.length) return ''

  const lines = ['flowchart TB']
  const nodeIds = new Map()
  const currentPetNode = new Map()
  let nodeCounter = 0

  const getNodeId = (key) => {
    if (!nodeIds.has(key)) {
      nodeCounter += 1
      nodeIds.set(key, `n${nodeCounter}`)
    }
    return nodeIds.get(key)
  }

  const buildPetLabel = (text) => escapeMermaidText(text).replace(/｜/g, '<br/>')

  const ensurePetNode = (key, label, className = 'petNode') => {
    const id = getNodeId(key)
    lines.push(`${id}["${buildPetLabel(label)}"]`)
    lines.push(`class ${id} ${className};`)
    return id
  }

  const stripUnusedGender = (title, keepGender) => (
    keepGender ? title : title.replace(/（雌性）|（雄性）$/, '')
  )

  const visibleCards = cards.map((card, idx) => ({ ...card, _stepIndex: idx + 1 }))
  const seedCards = visibleCards.filter((card) => card.status === 'done')
  const routeCards = visibleCards.filter((card) => card.status !== 'done')

  for (const card of seedCards) {
    if (!card.target) continue
    const label = `异色·${card.title.replace(/^起点：/, '')}`
    const petId = ensurePetNode(`seed:${card.target}`, label, 'seedNode')
    currentPetNode.set(card.target, petId)
  }

  for (const card of routeCards) {
    const stepId = getNodeId(`step:${card._stepIndex}`)
    const usedLater = routeCards.some((laterCard) =>
      laterCard._stepIndex > card._stepIndex &&
      card.target &&
      (laterCard.pair?.maleName === card.target || laterCard.pair?.female === card.target)
    )
    const displayTitle = stripUnusedGender(card.title, usedLater)

    const detailText = card.pair
      ? `${card.pair.maleName
          ? card.pair.female
          : `异色·${card.pair.female}`
        } × ${
          card.pair.maleName
            ? `${card.pair.malePrefix === '异色雄性' ? '异色' : card.pair.malePrefix}·${card.pair.maleName}`
            : card.pair.malePrefix
        }`
      : (card.desc || '可继续推进')
    const stepLabel = escapeMermaidText(`${detailText}｜${displayTitle}`).replace(/｜/g, '<br/>')

    lines.push(`${stepId}["${stepLabel}"]`)
    lines.push(`class ${stepId} canStep;`)

    const sourceNodeIds = []

    if (card.pair?.maleName) {
      const maleSourceId = currentPetNode.get(card.pair.maleName) ||
        ensurePetNode(`seed:${card.pair.maleName}`, `已有：${card.pair.maleName}`, 'seedNode')
      currentPetNode.set(card.pair.maleName, maleSourceId)
      sourceNodeIds.push(maleSourceId)
    }

    if (card.pair?.female && !card.pair.maleName) {
      const femaleSourceId = currentPetNode.get(card.pair.female) ||
        ensurePetNode(`seed:${card.pair.female}`, `已有：${card.pair.female}`, 'seedNode')
      currentPetNode.set(card.pair.female, femaleSourceId)
      sourceNodeIds.push(femaleSourceId)
    }

    for (const sourceId of sourceNodeIds) {
      lines.push(`${sourceId} --> ${stepId}`)
    }

    if (card.target) {
      const resultLabel = `异色·${displayTitle.replace(/^收集：/, '')}`
      const resultId = ensurePetNode(`result:${card._stepIndex}:${card.target}`, resultLabel, 'resultNode')
      lines.push(`${stepId} --> ${resultId}`)
      currentPetNode.set(card.target, resultId)
    }
  }

  lines.push('classDef canStep fill:#eff6ff,stroke:#3b82f6,color:#1d4ed8,stroke-width:2px;')
  lines.push('classDef petNode fill:#ffffff,stroke:#cbd5e1,color:#111827,stroke-width:1.5px;')
  lines.push('classDef seedNode fill:#fff7ed,stroke:#fb923c,color:#9a3412,stroke-width:2px;')
  lines.push('classDef resultNode fill:#f8fafc,stroke:#64748b,color:#0f172a,stroke-width:1.5px;')

  return lines.join('\n')
}

async function renderShinyFlowchart(routePlan) {
  if (!routePlan?.cards?.length) {
    shinyFlowSvg.value = ''
    shinyFlowPreviewVisible.value = false
    return
  }

  try {
    const graphText = buildShinyRouteMermaid(routePlan)
    if (!graphText) {
      shinyFlowSvg.value = ''
      shinyFlowPreviewVisible.value = false
      return
    }

    const renderId = `shiny-flow-${Date.now()}`
    const { svg } = await mermaid.render(renderId, graphText)
    shinyFlowSvg.value = svg
    shinyFlowPreviewVisible.value = false
  } catch (err) {
    console.error(err)
    shinyFlowSvg.value = ''
    shinyFlowPreviewVisible.value = false
  }
}

function openShinyFlowPreview() {
  if (!shinyFlowSvg.value) {
    ElMessage.warning('暂无可预览的流程图')
    return
  }
  shinyFlowPreviewVisible.value = true
}

function closeShinyFlowPreview() {
  shinyFlowPreviewVisible.value = false
}

function getShinyFlowExportUrl() {
  if (typeof window === 'undefined') return 'https://rocom.mfsky.qzz.io/'
  return `${window.location.origin}${window.location.pathname}`
}

function buildShinyFlowWatermarkSvg(totalWidth, chartHeight, padding) {
  const rows = [0.18, 0.42, 0.66, 0.9]
  const cols = [0.18, 0.5, 0.82]
  const color = activeTheme.value === 'dark'
    ? 'rgba(148,163,184,0.08)'
    : 'rgba(148,163,184,0.12)'

  return rows.flatMap((row) =>
    cols.map((col, index) => {
      const x = Math.round(totalWidth * col)
      const y = Math.round((chartHeight + padding * 2) * row)
      const rotate = index % 2 === 0 ? -18 : -14
      return `<text x="${x}" y="${y}" text-anchor="middle" font-size="34" font-weight="800" letter-spacing="6" fill="${color}" transform="rotate(${rotate} ${x} ${y})">洛克星盘 · 异色路线规划</text>`
    })
  ).join('')
}

async function buildShinyFlowExportSvg() {
  if (!shinyFlowSvg.value) return ''

  const parser = new DOMParser()
  const svgDoc = parser.parseFromString(shinyFlowSvg.value, 'image/svg+xml')
  const sourceSvg = svgDoc.documentElement
  const serializer = new XMLSerializer()
  const svgNs = 'http://www.w3.org/2000/svg'

  const viewBoxText = sourceSvg.getAttribute('viewBox') || '0 0 1600 1200'
  const viewBoxParts = viewBoxText.trim().split(/\s+/).map(Number)
  const viewBoxX = Number.isFinite(viewBoxParts[0]) ? viewBoxParts[0] : 0
  const viewBoxY = Number.isFinite(viewBoxParts[1]) ? viewBoxParts[1] : 0
  const chartWidth = Math.max(viewBoxParts[2] || Number(sourceSvg.getAttribute('width')) || 1600, 1600)
  const chartHeight = Math.max(viewBoxParts[3] || Number(sourceSvg.getAttribute('height')) || 1200, 1200)

  const footerHeight = 220
  const totalHeight = chartHeight + footerHeight
  const footerTop = viewBoxY + chartHeight
  const footerTextY = footerTop + 78
  const footerSubTextY = footerTop + 116
  const qrSize = 150
  const qrX = viewBoxX + chartWidth - qrSize - 28
  const qrY = footerTop + 20

  const backgroundColor = activeTheme.value === 'dark' ? '#020617' : '#ffffff'
  const footerTitleColor = activeTheme.value === 'dark' ? '#e5e7eb' : '#111827'
  const footerLineColor = activeTheme.value === 'dark' ? '#334155' : '#e5e7eb'
  const qrDataUrl = await QRCode.toDataURL(getShinyFlowExportUrl(), {
    width: qrSize * 2,
    margin: 1,
    color: {
      dark: '#111827',
      light: '#ffffff'
    }
  })

  sourceSvg.setAttribute('xmlns', svgNs)
  sourceSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  sourceSvg.setAttribute('width', String(chartWidth))
  sourceSvg.setAttribute('height', String(totalHeight))
  sourceSvg.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${chartWidth} ${totalHeight}`)
  sourceSvg.setAttribute('overflow', 'visible')

  const watermarkLayer = svgDoc.createElementNS(svgNs, 'g')
  watermarkLayer.setAttribute('aria-hidden', 'true')

  const rows = [0.18, 0.42, 0.66, 0.9]
  const cols = [0.18, 0.5, 0.82]
  const watermarkColor = activeTheme.value === 'dark'
    ? 'rgba(148,163,184,0.08)'
    : 'rgba(148,163,184,0.12)'

  rows.forEach((row) => {
    cols.forEach((col, index) => {
      const x = Math.round(viewBoxX + chartWidth * col)
      const y = Math.round(viewBoxY + chartHeight * row)
      const rotate = index % 2 === 0 ? -18 : -14
      const text = svgDoc.createElementNS(svgNs, 'text')
      text.setAttribute('x', String(x))
      text.setAttribute('y', String(y))
      text.setAttribute('text-anchor', 'middle')
      text.setAttribute('font-size', '34')
      text.setAttribute('font-weight', '800')
      text.setAttribute('letter-spacing', '6')
      text.setAttribute('fill', watermarkColor)
      text.setAttribute('transform', `rotate(${rotate} ${x} ${y})`)
      text.textContent = '洛克星盘 · 异色路线规划'
      watermarkLayer.appendChild(text)
    })
  })

  sourceSvg.appendChild(watermarkLayer)

  const footerBg = svgDoc.createElementNS(svgNs, 'rect')
  footerBg.setAttribute('x', String(viewBoxX))
  footerBg.setAttribute('y', String(footerTop))
  footerBg.setAttribute('width', String(chartWidth))
  footerBg.setAttribute('height', String(footerHeight))
  footerBg.setAttribute('fill', backgroundColor)
  sourceSvg.appendChild(footerBg)

  const footerLine = svgDoc.createElementNS(svgNs, 'line')
  footerLine.setAttribute('x1', String(viewBoxX))
  footerLine.setAttribute('y1', String(footerTop))
  footerLine.setAttribute('x2', String(viewBoxX + chartWidth))
  footerLine.setAttribute('y2', String(footerTop))
  footerLine.setAttribute('stroke', footerLineColor)
  footerLine.setAttribute('stroke-width', '1.5')
  sourceSvg.appendChild(footerLine)

  const footerTitle = svgDoc.createElementNS(svgNs, 'text')
  footerTitle.setAttribute('x', String(viewBoxX + 28))
  footerTitle.setAttribute('y', String(footerTextY))
  footerTitle.setAttribute('fill', footerTitleColor)
  footerTitle.setAttribute('font-size', '34')
  footerTitle.setAttribute('font-weight', '800')
  footerTitle.textContent = '洛克星盘-洛克王国世界工具站'
  sourceSvg.appendChild(footerTitle)

  const footerSubtitle = svgDoc.createElementNS(svgNs, 'text')
  footerSubtitle.setAttribute('x', String(viewBoxX + 28))
  footerSubtitle.setAttribute('y', String(footerSubTextY))
  footerSubtitle.setAttribute('fill', footerTitleColor)
  footerSubtitle.setAttribute('font-size', '22')
  footerSubtitle.setAttribute('font-weight', '500')
  footerSubtitle.textContent = '洛克王国世界企鹅交流群：1091503815'
  sourceSvg.appendChild(footerSubtitle)

  const qrImage = svgDoc.createElementNS(svgNs, 'image')
  qrImage.setAttribute('href', qrDataUrl)
  qrImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', qrDataUrl)
  qrImage.setAttribute('x', String(qrX))
  qrImage.setAttribute('y', String(qrY))
  qrImage.setAttribute('width', String(qrSize))
  qrImage.setAttribute('height', String(qrSize))
  qrImage.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  sourceSvg.appendChild(qrImage)

  return serializer.serializeToString(sourceSvg)
}





async function downloadShinyFlowPng() {
  if (!shinyFlowSvg.value) {
    ElMessage.warning('暂无可保存的流程图')
    return
  }

  try {
    const brandedSvg = await buildShinyFlowExportSvg()
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(brandedSvg)}`
    const image = new Image()
    image.decoding = 'sync'

    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('SVG 图片加载失败'))
      image.src = svgDataUrl
    })

    const width = Math.max(
      1,
      image.naturalWidth || image.width || 1
    )
    const height = Math.max(
      1,
      image.naturalHeight || image.height || 1
    )
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      ElMessage.warning('PNG 导出失败：无法创建画布')
      return
    }

    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.fillStyle = activeTheme.value === 'dark' ? '#020617' : '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)

    downloadDataUrl(canvas.toDataURL('image/png'), 'rocom-shiny-flow.png')
  } catch (err) {
    console.error(err)
    ElMessage.warning(`PNG 导出失败：${err instanceof Error ? err.message : '请重试'}`)
  }
}

async function onShinySearch() {
  if (!shinyOwnedList.value.length) {
    ElMessage.warning('请先添加已有异色')
    return
  }

  shinySearching.value = true
  shinyHasSearched.value = true
  await new Promise((resolve) => setTimeout(resolve, 220))

  const { groupsByPet, stageToFinal, stageToChainText } = groupIndex.value

  const seedFinals = [...new Set(
    shinyOwnedList.value
      .map((item) => stageToFinal.get(item.name) || item.name)
      .filter(Boolean)
  )]

  if (!seedFinals.length) {
    shinyResult.value = null
    shinyCandidates.value = []
    shinySearching.value = false
    ElMessage.warning('已有异色清单无有效数据')
    return
  }

  const candidateMap = new Map()
  for (const [pet, gset] of groupsByPet.entries()) {
    const finalPet = stageToFinal.get(pet) || pet
    if (!shinyPets.value.has(finalPet)) continue

    const fatherAllGroups = [...gset].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    const fatherChain = stageToChainText.get(pet) || stageToChainText.get(finalPet) || finalPet
    const current = candidateMap.get(finalPet)

    if (!current) {
      candidateMap.set(finalPet, {
        fatherPet: finalPet,
        fatherChain,
        fatherAllGroups: new Set(fatherAllGroups),
        blockedByBreed: noBreedPets.has(finalPet)
      })
    } else {
      for (const g of fatherAllGroups) current.fatherAllGroups.add(g)
      if (current.fatherChain.length < fatherChain.length) current.fatherChain = fatherChain
      current.blockedByBreed = current.blockedByBreed || noBreedPets.has(finalPet)
    }
  }

  for (const finalPet of shinyPetOptions.value) {
    if (!candidateMap.has(finalPet)) {
      candidateMap.set(finalPet, {
        fatherPet: finalPet,
        fatherChain: stageToChainText.get(finalPet) || finalPet,
        fatherAllGroups: new Set(),
        blockedByBreed: noBreedPets.has(finalPet)
      })
    }
  }

  const candidates = [...candidateMap.values()]
    .map((item) => ({
      fatherPet: item.fatherPet,
      fatherChain: item.fatherChain,
      fatherAllGroups: [...item.fatherAllGroups].sort((a, b) => a.localeCompare(b, 'zh-CN')),
      blockedByBreed: item.blockedByBreed
    }))
    .sort((a, b) => a.fatherPet.localeCompare(b.fatherPet, 'zh-CN'))

  const ownedFinalSet = new Set(seedFinals)
  const ownedGenderMap = new Map()
  for (const item of shinyOwnedList.value) {
    const finalName = stageToFinal.get(item.name) || item.name
    if (!ownedGenderMap.has(finalName)) ownedGenderMap.set(finalName, new Set())
    ownedGenderMap.get(finalName).add(item.gender)
  }

  const routePlan = buildShinyCollectionPlan({
    seedFinals,
    candidates,
    groupsByPet,
    stageToFinal,
    ownedFinalSet,
    ownedGenderMap
  })

  shinyResult.value = {
    routePlan
  }

  await nextTick()
  await renderShinyFlowchart(routePlan)

  const canGetSet = routePlan.canGetSet || new Set()
  shinyCandidates.value = candidates
    .map((item) => ({
      ...item,
      canGet: canGetSet.has(item.fatherPet) && !item.blockedByBreed
    }))
    .sort((a, b) => {
      if (a.canGet !== b.canGet) return a.canGet ? -1 : 1
      return a.fatherPet.localeCompare(b.fatherPet, 'zh-CN')
    })
  shinySearching.value = false
}

function resolveTargetName(inputName) {
  const name = inputName.trim()
  if (!name) return null
  const { allPetNames } = groupIndex.value
  if (allPetNames.has(name)) return name
  const fuzzy = [...allPetNames].filter((n) => n.includes(name))
  if (fuzzy.length === 1) return fuzzy[0]
  return fuzzy.length > 1 ? fuzzy[0] : null
}

function canEnableShinySwitch() {
  const resolved = resolveTargetName(breedTargetName.value || '')
  if (!resolved) return false
  return shinyPets.value.has(resolved)
}

async function onBreedSearch() {
  const inputName = breedTargetName.value.trim()
  if (!inputName) {
    ElMessage.warning('请输入目标精灵名')
    return
  }

  breedSearching.value = true
  breedHasSearched.value = true
  await new Promise((resolve) => setTimeout(resolve, 220))

  const resolved = resolveTargetName(inputName)
  if (!resolved) {
    breedResult.value = null
    breedCandidates.value = []
    breedSearching.value = false
    ElMessage.warning('未找到对应精灵，请检查名称')
    return
  }

  if (!shinyPets.value.has(resolved)) {
    forceShiny.value = false
  }

  if (noBreedPets.has(resolved)) {
    breedResult.value = {
      inputName,
      motherPet: resolved,
      eggName: '-',
      motherGroups: [],
      chain: [resolved],
      blocked: true
    }
    breedCandidates.value = []
    breedSearching.value = false
    ElMessage.warning('该精灵属于不可孵蛋名单')
    return
  }

  const { groupsByPet, stageToBase, stageToFinal, stageToChainText, baseToMembers, baseToChain } = groupIndex.value
  const base = stageToBase.get(resolved) || resolved
  const members = baseToMembers.get(base) || new Set([base])
  const chain = baseToChain.get(base) || [base]
  const motherGroups = [...(groupsByPet.get(resolved) || groupsByPet.get(base) || new Set())].sort((a, b) => a.localeCompare(b, 'zh-CN'))

  if (!motherGroups.length) {
    breedResult.value = {
      inputName,
      motherPet: resolved,
      eggName: base,
      motherGroups: [],
      chain,
      blocked: false
    }
    breedCandidates.value = []
    breedSearching.value = false
    ElMessage.warning('该精灵暂无蛋组数据')
    return
  }

  const candidateMap = new Map()
  for (const [pet, gset] of groupsByPet.entries()) {
    if (noBreedPets.has(pet)) continue

    const fatherAllGroups = [...gset].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    const fatherSharedGroups = fatherAllGroups.filter((g) => motherGroups.includes(g))
    if (!fatherSharedGroups.length) continue

    const finalPet = stageToFinal.get(pet) || pet
    if (noBreedPets.has(finalPet)) continue

    if (forceShiny.value && !shinyPets.value.has(finalPet)) continue

    const fatherChain = stageToChainText.get(pet) || stageToChainText.get(finalPet) || finalPet
    const current = candidateMap.get(finalPet)

    if (!current) {
      candidateMap.set(finalPet, {
        fatherPet: finalPet,
        fatherChain,
        fatherSharedGroups: new Set(fatherSharedGroups),
        fatherAllGroups: new Set(fatherAllGroups),
        isSameChain: members.has(finalPet) || members.has(pet),
        isShiny: shinyPets.value.has(finalPet)
      })
    } else {
      for (const g of fatherSharedGroups) current.fatherSharedGroups.add(g)
      for (const g of fatherAllGroups) current.fatherAllGroups.add(g)
      current.isSameChain = current.isSameChain || members.has(finalPet) || members.has(pet)
      if (current.fatherChain.length < fatherChain.length) current.fatherChain = fatherChain
      current.isShiny = current.isShiny || shinyPets.value.has(finalPet)
    }
  }

  const candidates = [...candidateMap.values()].map((item) => ({
    fatherPet: item.fatherPet,
    fatherChain: item.fatherChain,
    fatherSharedGroups: [...item.fatherSharedGroups].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    fatherAllGroups: [...item.fatherAllGroups].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    isSameChain: item.isSameChain,
    isShiny: item.isShiny
  }))

  candidates.sort((a, b) => {
    if (a.isSameChain !== b.isSameChain) return a.isSameChain ? -1 : 1
    if (b.fatherSharedGroups.length !== a.fatherSharedGroups.length) return b.fatherSharedGroups.length - a.fatherSharedGroups.length
    return a.fatherPet.localeCompare(b.fatherPet, 'zh-CN')
  })

  breedResult.value = {
    inputName,
    motherPet: resolved,
    eggName: base,
    motherGroups,
    chain,
    blocked: false,
    motherIsShiny: shinyPets.value.has(resolved)
  }
  breedCandidates.value = candidates
  breedSearching.value = false
}

function applySharedParamsFromUrl() {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
  const d = (params.get('d') || '').trim()
  const w = (params.get('w') || '').trim()
  const mode = (params.get('mode') || '').trim()

  if (mode === 'size') currentMode.value = 'size'
  if (!d || !w) return

  const dNum = Number(d)
  const wNum = Number(w)
  if (!Number.isFinite(dNum) || !Number.isFinite(wNum) || dNum <= 0 || wNum <= 0) return

  diameterInput.value = d
  weightInput.value = w

  if (params.get('auto') === '1') {
    setTimeout(() => {
      onSearch()
    }, 0)
  }
}

onMounted(async () => {
  initThemeMode()
  mermaid.initialize({
    startOnLoad: false,
    theme: activeTheme.value === 'dark' ? 'dark' : 'default',
    securityLevel: 'loose'
  })
  await loadDataset()
  applySharedParamsFromUrl()
})

onBeforeUnmount(() => {
  if (!themeMediaQuery) return
  if (themeMediaQuery.removeEventListener) {
    themeMediaQuery.removeEventListener('change', onSystemThemeChange)
  } else if (themeMediaQuery.removeListener) {
    themeMediaQuery.removeListener(onSystemThemeChange)
  }
})
</script>

<template>
  <div class="page" :class="{ 'theme-dark': activeTheme === 'dark', 'theme-light': activeTheme === 'light', 'shiny-active': shinyVisualActive }">
    <nav class="top-nav">
      <div class="nav-left">
        <span class="brand">洛克星盘-洛克王国世界工具站</span>
      </div>
      <div class="nav-right">
        <button
          class="theme-toggle-btn"
          type="button"
          :title="`主题模式：${themeModeLabel}（点击切换）`"
          :aria-label="`主题模式：${themeModeLabel}`"
          @click="cycleThemeMode"
        >
          <el-icon><component :is="themeIcon" /></el-icon>
        </button>
      </div>
    </nav>

    <section class="mode-switch-card">
      <button type="button" class="mode-switch-btn" :class="{ active: currentMode === 'size' }" @click="setMode('size')">
        精灵蛋尺寸查询
      </button>
      <button type="button" class="mode-switch-btn" :class="{ active: currentMode === 'group' }" @click="setMode('group')">
        精灵蛋蛋组查询
      </button>
    </section>

    <template v-if="currentMode === 'size'">
      <main class="panel">
        <section v-if="!sharingCapture" class="search-card">
          <h3>数据个数：<span style="color: var(--app-primary); font-weight: 800;">{{ datasetCount }}</span></h3>
          <p class="chain-text">可进行查询精灵蛋数据，同时可进行投稿，洛克王国世界交流企鹅群：1091503815</p>
        </section>

        <section class="search-card">
          <h2>查询条件</h2>
          <el-form label-position="top" class="search-form" @submit.prevent>
            <div class="grid">
              <el-form-item label="蛋尺寸" :class="{ 'shiny-field': shinyVisualActive }">
                <el-input v-model="diameterInput" type="number" step="0.001" placeholder="例如：0.58" clearable size="large" @keyup.enter="onSearch" />
              </el-form-item>
              <el-form-item label="蛋重量" :class="{ 'shiny-field': shinyVisualActive }">
                <el-input v-model="weightInput" type="number" step="0.001" placeholder="例如：8.6" clearable size="large" @keyup.enter="onSearch" />
              </el-form-item>
            </div>

            <div v-if="!sharingCapture" class="actions">
              <el-button class="submit-btn" size="large" @click="onOpenSurvey">投稿数据</el-button>
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
              <el-button
                v-if="hasSearched"
                class="share-btn"
                size="large"
                :loading="sharingPoster"
                :disabled="searching || loadingData || (!shareImageUrl && !shareImagesReady)"
                @click="onShareLongImage"
              >
                {{ shareImageUrl ? '点击下载' : '分享长图' }}
              </el-button>
            </div>
          </el-form>
        </section>

        <section class="result-card share-poster-target">
          <div v-if="sharingCapture" class="share-query-wrap">
            <div class="sub-head">查询条件</div>
            <div class="share-query-meta">
              <p class="share-query-item-line">蛋尺寸：{{ String(diameterInput || '').trim() || '--' }} ｜ 蛋重量：{{ String(weightInput || '').trim() || '--' }}</p>
            </div>
          </div>
          <div v-if="!sharingCapture" class="result-header">
            <h2>候选精灵</h2>
            <el-tag v-if="hasSearched && searchMode === 'precise'" type="danger" effect="light" round>精准命中</el-tag>
            <el-tag v-else-if="hasSearched && searchMode === 'tolerance1'" type="warning" effect="light" round>容差命中（尺寸 ±0.01，重量 ±0.1）</el-tag>
            <el-tag v-else-if="hasSearched && searchMode === 'tolerance2'" type="warning" effect="light" round>容差命中（尺寸 ±0.02，重量 ±0.2）</el-tag>
            <el-tag v-else-if="hasSearched && searchMode === 'matched'" type="success" effect="light" round>范围命中</el-tag>
            <el-tag v-else-if="hasSearched && searchMode === 'nearest'" type="info" effect="light" round>近似候选</el-tag>
          </div>

          <el-skeleton :loading="loadingData || searching" animated :rows="5">
            <template #default>
              <div v-if="!hasSearched" class="empty">请输入蛋尺寸和蛋重量后点击查询</div>
              <div v-else-if="!exactResults.length && !candidates.length" class="empty">未查询到候选精灵</div>

              <div v-if="exactResults.length" class="exact-block">
                <div class="sub-head">
                  {{
                    searchMode === 'precise'
                      ? '精准命中'
                      : searchMode === 'tolerance1'
                        ? '容差命中（容差：尺寸 ±0.01，重量 ±0.1）'
                        : '容差命中（容差：尺寸 ±0.02，重量 ±0.2）'
                  }}
                </div>
                <transition-group name="rank" tag="div" class="result-list">
                  <article v-for="(item, index) in exactResults" :key="`exact-${item.petId}-${index}`" class="result-item exact-item">
                    <div class="left">
                      <div class="pet-row">
                        <div class="pet-avatar" v-if="getCreatureImageUrl(item.petId)">
                          <img :src="getCreatureImageUrl(item.petId)" :alt="item.pet" loading="lazy" @load="updateShareImagesReady" @error="updateShareImagesReady" />
                        </div>
                        <div class="pet-meta">
                          <div class="title-row">
                            <h3>{{ index + 1 }}. {{ item.pet }}</h3>
                            <span class="pet-id">#{{ item.petId }}</span>
                          </div>
                          <p>精确尺寸：{{ item.eggDiameter }} m</p>
                          <p>精确重量：{{ item.eggWeight }} kg</p>
                        </div>
                      </div>
                    </div>
                    <div class="right">
                      <div class="prob">{{ item.probability }}%</div>
                      <el-progress :percentage="item.probability" :stroke-width="10" :show-text="false" :color="item.color" />
                    </div>
                  </article>
                </transition-group>
              </div>

              <div v-if="candidates.length" class="other-block">
                <div class="sub-head">{{ exactResults.length ? '其他候选' : '结果列表' }}</div>
                <transition-group name="rank" tag="div" class="result-list">
                  <article v-for="(item, index) in candidates" :key="`${item.petId}-${item.pet}`" class="result-item">
                    <div class="left">
                      <div class="pet-row">
                        <div class="pet-avatar" v-if="getCreatureImageUrl(item.petId)">
                          <img :src="getCreatureImageUrl(item.petId)" :alt="item.pet" loading="lazy" @load="updateShareImagesReady" @error="updateShareImagesReady" />
                        </div>
                        <div class="pet-meta">
                          <div class="title-row">
                            <h3>{{ index + 1 }}. {{ item.pet }}</h3>
                            <span class="pet-id">#{{ item.petId }}</span>
                          </div>
                          <p>蛋尺寸范围：{{ item.eggDiameter }} m</p>
                          <p>蛋重量范围：{{ item.eggWeight }} kg</p>
                          <p v-if="item.matchCount > 1" class="meta">命中记录：{{ item.matchCount }} 条</p>
                        </div>
                      </div>
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
    </template>

    <template v-else>
      <main class="panel">
        <section class="search-card">
          <div class="title-row">
            <h3>模式说明</h3>
          </div>
          <p class="chain-text">{{ groupModeHint }}</p>
        </section>

        <section class="search-card">
          <h2>查询模式</h2>
          <section class="inner-switch-card">
            <button type="button" class="inner-switch-btn" :class="{ active: groupSubMode === 'group' }" @click="setGroupSubMode('group')">
              蛋组查询
            </button>
            <button type="button" class="inner-switch-btn" :class="{ active: groupSubMode === 'breed' }" @click="setGroupSubMode('breed')">
              繁殖查询
            </button>
            <button type="button" class="inner-switch-btn" :class="{ active: groupSubMode === 'shiny' }" @click="setGroupSubMode('shiny')">
              异色孵化
            </button>
          </section>



          <el-form v-if="groupSubMode === 'group'" label-position="top" class="search-form" @submit.prevent>
            <div class="grid">
              <el-form-item label="精灵名称">
                <el-input
                  v-model="groupKeyword"
                  placeholder="请输入精灵名称"
                  clearable
                  size="large"
                  :disabled="!!groupStage"
                />
              </el-form-item>
              <el-form-item label="蛋组">
                <el-select
                  v-model="groupStage"
                  placeholder="请选择蛋组"
                  clearable

                  size="large"
                  :disabled="!!groupKeyword"
                >
                  <el-option v-for="group in groupStageOptions" :key="group" :label="group" :value="group" />
                </el-select>
              </el-form-item>
            </div>
            <div class="actions">
              <el-button class="reset-btn" size="large" :icon="Refresh" @click="onGroupReset">重置</el-button>
              <el-button class="query-btn" type="primary" size="large" :icon="Search" :loading="groupSearching || loadingData" @click="onGroupSearch">
                立即查询
              </el-button>
            </div>
          </el-form>

          <el-form v-else-if="groupSubMode === 'breed'" label-position="top" class="search-form" @submit.prevent>
            <div class="grid">
              <el-form-item label="目标精灵（母系）">
                <el-input v-model="breedTargetName" placeholder="例如：魔力猫、火神、书魔虫" clearable size="large" @keyup.enter="onBreedSearch" />
              </el-form-item>
              <el-form-item label="指定异色">
                <div class="switch-row">
                  <el-switch
                    v-model="forceShiny"
                    :disabled="!canEnableShinySwitch()"
                    active-text="只看异色父系"
                    inactive-text="全部父系"
                  />
                </div>
              </el-form-item>
            </div>
            <div class="actions">
              <el-button class="reset-btn" size="large" :icon="Refresh" @click="onBreedReset">重置</el-button>
              <el-button class="query-btn" type="primary" size="large" :icon="Search" :loading="breedSearching || loadingData" @click="onBreedSearch">
                查询繁殖方案
              </el-button>
            </div>
          </el-form>

          <el-form v-else label-position="top" class="search-form" @submit.prevent>
            <div class="grid">
              <el-form-item label="添加已有异色">
                <div class="owned-add-row">
                  <el-select-v2
                    v-model="shinyOwnedDraftName"
                    clearable
                    placeholder="选择已有异色精灵"
                    size="large"
                    class="owned-add-select"
                    :options="shinyPetOptionObjects"
                    :height="300"
                  />
                  <el-radio-group v-model="shinyOwnedDraftGender" size="large" class="owned-gender-group">
                    <el-radio-button label="female" class="owned-gender-female">
                      <span style="display: inline-flex; align-items: center; gap: 6px;">
                        <GenderFemaleIcon />
                        <span class="gender-label-full">雌性</span>
                        <span class="gender-label-short">雌</span>
                      </span>
                    </el-radio-button>
                    <el-radio-button label="male" class="owned-gender-male">
                      <span style="display: inline-flex; align-items: center; gap: 6px;">
                        <GenderMaleIcon />
                        <span class="gender-label-full">雄性</span>
                        <span class="gender-label-short">雄</span>
                      </span>
                    </el-radio-button>
                  </el-radio-group>
                  <el-button class="query-btn owned-add-btn" type="primary" size="large" @click="addShinyOwned">+</el-button>
                </div>
                <div v-if="shinyOwnedList.length" class="group-tags">
                  <el-tag
                    v-for="item in shinyOwnedList"
                    :key="`owned-${item.name}-${item.gender}`"
                    :class="item.gender === 'female' ? 'owned-tag-female' : 'owned-tag-male'"
                    closable
                    effect="light"
                    @close="removeShinyOwned(item)"
                  >
                    <span style="display: inline-flex; align-items: center; gap: 6px;">
                      <GenderFemaleIcon v-if="item.gender === 'female'" />
                      <GenderMaleIcon v-else />
                      <span>{{ item.name }}</span>
                    </span>
                  </el-tag>
                </div>
              </el-form-item>
            </div>
            <div class="actions">
              <el-button class="reset-btn" size="large" :icon="Refresh" @click="onShinyReset">重置</el-button>
              <el-button class="query-btn" type="primary" size="large" :icon="Search" :loading="shinySearching || loadingData" @click="onShinySearch">
                查询异色孵化
              </el-button>
            </div>
          </el-form>
        </section>

        <section class="result-card" v-if="groupSubMode === 'group'">
          <div class="result-header">
            <h2>蛋组查询结果</h2>
            <el-tag v-if="groupHasSearched" type="success" effect="light" round>匹配 {{ groupResults.length }} 条</el-tag>
            <el-tag v-else type="info" effect="light" round>待查询</el-tag>
          </div>

          <el-skeleton :loading="groupSearching || loadingData" animated :rows="6">
            <template #default>
              <div v-if="!groupHasSearched" class="empty">请输入精灵名称或选择蛋组后点击查询</div>
              <div v-else-if="!groupResults.length" class="empty">未查询到匹配结果</div>

              <transition-group v-else name="rank" tag="div" class="group-result-list">
                <article v-for="item in groupResults" :key="item.pet" class="result-item group-item">
                  <div class="left">
                    <div class="title-row">
                      <h3 class="group-pet-name">{{ item.pet }}</h3>
                      <span class="pet-id">蛋组 {{ item.groups.length }} 个</span>
                    </div>
                    <p class="chain-text">{{ item.chain }}</p>
                    <div class="group-tags">
                      <el-tag v-for="group in item.groups" :key="`${item.pet}-${group}`" effect="light" round>{{ group }}</el-tag>
                    </div>
                  </div>
                </article>
              </transition-group>
            </template>
          </el-skeleton>
        </section>

        <section class="result-card" v-else-if="groupSubMode === 'breed'">
          <div class="result-header">
            <h2>繁殖匹配结果</h2>
            <el-tag v-if="breedHasSearched" type="success" effect="light" round>父系候选 {{ breedCandidates.length }} 个</el-tag>
            <el-tag v-else type="info" effect="light" round>待查询</el-tag>
          </div>

          <el-skeleton :loading="breedSearching || loadingData" animated :rows="7">
            <template #default>
              <div v-if="!breedHasSearched" class="empty">输入目标精灵后，展示母系蛋组、进化链与父系候选</div>
              <div v-else-if="!breedResult" class="empty">未找到目标精灵</div>
              <div v-else>
                <article class="result-item group-summary group-summary-card">
                  <div class="left">
                    <div class="title-row">
                      <h3>母系精灵：{{ breedResult.motherPet }}</h3>
                      <span class="pet-id">孵化蛋：{{ breedResult.eggName }}</span>
                    </div>
                    <p>{{ breedResult.chain.join(' → ') }}</p>
                    <p v-if="breedResult.blocked" class="blocked-tip">该精灵不可孵蛋</p>
                  </div>
                </article>

                <div v-if="!breedCandidates.length" class="empty">没有可匹配的父系候选</div>

                <transition-group v-else name="rank" tag="div" class="group-result-list">
                  <article v-for="item in breedCandidates" :key="item.fatherPet" class="result-item group-item">
                    <div class="left">
                      <div class="title-row">
                        <h3 class="group-pet-name">{{ item.fatherPet }}</h3>
                        <span class="pet-id">{{ item.isSameChain ? '同进化链' : '可配对' }}</span>
                      </div>
                      <p class="chain-text">{{ item.fatherChain }}</p>
                      <div class="group-tags">
                        <el-tag v-for="group in item.fatherAllGroups" :key="`${item.fatherPet}-${group}`" effect="light" round>{{ group }}</el-tag>
                      </div>
                    </div>
                  </article>
                </transition-group>
              </div>
            </template>
          </el-skeleton>
        </section>

        <section class="result-card" v-else>
          <div class="result-header">
            <h2>异色路线规划</h2>
            <div v-if="shinyFlowSvg" class="shiny-flow-action-group">
              <button type="button" class="shiny-flow-btn shiny-flow-save-btn" @click="downloadShinyFlowPng">保存图片</button>
            </div>
          </div>

          <el-skeleton :loading="shinySearching || loadingData" animated :rows="7">
            <template #default>
              <div v-if="!shinyHasSearched" class="empty">添加已有异色后点击查询，系统将规划全异色收集路线</div>
              <div v-else-if="!shinyResult" class="empty">暂无可规划数据</div>
              <div v-else>
                <article v-if="shinyResult.routePlan" class="result-item group-summary group-summary-card">
                  <div class="left">
                    <div v-if="shinyFlowSvg" class="shiny-flow-card">
                      <div class="shiny-flow-wrap shiny-flow-preview-trigger" @click="openShinyFlowPreview">
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

                    <el-dialog
                      v-model="shinyFlowPreviewVisible"
                      fullscreen
                      append-to-body
                      class="shiny-flow-preview-dialog"
                      :show-close="false"
                    >
                      <template #header>
                        <div class="shiny-flow-preview-head">
                          <div class="shiny-flow-preview-title">
                            <h3 class="group-pet-name">洛克星盘-异色孵化流程图</h3>
                          </div>
                          <div class="shiny-flow-action-group">
                            <button type="button" class="shiny-flow-btn shiny-flow-save-btn" @click="downloadShinyFlowPng">保存图片</button>
                            <button type="button" class="shiny-flow-btn" @click="closeShinyFlowPreview">关闭</button>
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
                </article>

                <div v-if="!shinyCandidates.length" class="empty">没有可匹配的异色父系候选</div>

                <transition-group v-else name="rank" tag="div" class="group-result-list">
                  <article v-for="item in shinyCandidates" :key="item.fatherPet" class="result-item group-item">
                    <div class="left">
                      <div class="title-row">
                        <h3 class="group-pet-name">{{ item.fatherPet }}</h3>
                        <span class="pet-id">{{ item.canGet ? '可获取（可孵化）' : '不可获取（当前条件）' }}</span>
                      </div>
                      <p class="chain-text">{{ item.fatherChain }}</p>
                      <div class="group-tags">
                        <el-tag v-for="group in item.fatherAllGroups" :key="`${item.fatherPet}-${group}`" effect="light" round>{{ group }}</el-tag>
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

    <footer class="site-footer">
      <span>© 2026 洛克星盘</span>
      <a class="footer-github-link" href="https://github.com/mfskys/rocomegg" target="_blank" rel="noopener noreferrer">
        <svg class="footer-github-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"/>
        </svg>
        <span>项目主页</span>
      </a>
    </footer>
  </div>
</template>

<style scoped>
.page {
  --app-primary: #3f83bd;
  --app-primary-soft: #67a9de;
  --app-primary-weak: #edf6ff;
  --app-border: rgba(148, 188, 225, 0.55);
  --app-shadow: rgba(63, 131, 189, 0.12);

  --app-bg: radial-gradient(circle at top left, #f7fbff, #edf5ff 58%, #e4f0ff);
  --app-surface: rgba(255, 255, 255, 0.94);
  --app-surface-soft: rgba(255, 255, 255, 0.9);
  --app-item-bg: #ffffff;
  --app-item-bg-soft: linear-gradient(180deg, #ffffff, #f7fbff);
  --app-text: #1a1b21;
  --app-text-soft: #5f5d72;
  --app-text-muted: #6a6880;
  --app-tag-bg: #eff6ff;
  --app-tag-border: #bfdbfe;

  min-height: 100vh;
  padding: 16px 14px 46px;
  background: var(--app-bg);
}

.page.theme-dark {
  --app-primary: #60a5fa;
  --app-primary-soft: #3b82f6;
  --app-primary-weak: #1e3a8a;
  --app-border: rgba(96, 165, 250, 0.4);
  --app-shadow: rgba(2, 6, 23, 0.55);

  --app-bg: radial-gradient(circle at top left, #020617, #0b1220 55%, #111827);
  --app-surface: #0b1220;
  --app-surface-soft: #0f172a;
  --app-item-bg: #111827;
  --app-item-bg-soft: linear-gradient(180deg, #111827, #0b1220);
  --app-text: #e5e7eb;
  --app-text-soft: #d5deea;
  --app-text-muted: #9fb0c6;
  --app-tag-bg: #1e293b;
  --app-tag-border: #334155;
}

.top-nav {
  max-width: 980px;
  margin: 0 auto 14px;
  padding: 10px 12px;
  border-radius: 22px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  box-shadow: 0 10px 24px var(--app-shadow);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-left .brand {
  font-weight: 800;
  color: var(--app-primary);
  letter-spacing: 0.3px;
}

.nav-right {
  display: flex;
  align-items: center;
}

.theme-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--app-tag-border);
  background: var(--app-item-bg);
  color: var(--app-primary);
  border-radius: 999px;
  width: 34px;
  height: 34px;
  padding: 0;
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-toggle-btn:hover {
  border-color: var(--app-primary-soft);
  background: var(--app-tag-bg);
  transform: translateY(-1px);
}

.theme-toggle-btn :deep(svg) {
  width: 18px;
  height: 18px;
}

.mode-switch-card {
  max-width: 980px;
  margin: 0 auto 14px;
  padding: 10px;
  border-radius: 22px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  box-shadow: 0 10px 24px var(--app-shadow);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.mode-switch-btn {
  width: 100%;
  border: 1px solid var(--app-tag-border);
  background: var(--app-item-bg);
  color: var(--app-primary);
  font-weight: 700;
  border-radius: 14px;
  min-height: 44px;
  padding: 10px 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  line-height: 1.2;
}

.mode-switch-btn:hover {
  border-color: #93c5fd;
  transform: translateY(-1px);
}

.mode-switch-btn.active {
  background: linear-gradient(135deg, var(--app-primary), var(--app-primary-soft));
  border-color: transparent;
  color: #fff;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.22);
}

.inner-switch-card {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.inner-switch-btn {
  width: 100%;
  border: 1px solid var(--app-tag-border);
  background: var(--app-item-bg);
  color: var(--app-primary);
  font-weight: 700;
  border-radius: 12px;
  min-height: 40px;
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.inner-switch-btn.active {
  background: var(--app-tag-bg);
  border-color: var(--app-primary-soft);
}

.panel {
  max-width: 980px;
  margin: 0 auto;
  display: grid;
  gap: 16px;
}

.search-card,
.result-card {
  background: var(--app-surface-soft);
  border-radius: 22px;
  padding: 20px;
  box-shadow: 0 18px 36px rgba(37, 99, 235, 0.08);
  border: 1px solid rgba(147, 197, 253, 0.45);
  backdrop-filter: blur(8px);
}

.search-card h2,
.result-card h2 {
  margin: 0 0 12px;
  color: var(--app-primary);
}

.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.actions {
  display: flex;
  gap: 10px;
  flex-direction: column;
  width: 100%;
}

.actions :deep(.el-button) {
  min-width: 120px;
  flex: 1 1 100%;
  width: 100%;
}

.actions :deep(.el-button + .el-button) {
  margin-left: 0 !important;
}

.query-btn {
  border-radius: 999px !important;
  border: none !important;
  padding: 12px 28px !important;
  background: linear-gradient(135deg, var(--app-primary), var(--app-primary-soft)) !important;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.22);
}

.reset-btn {
  border-radius: 999px !important;
  border: none !important;
  padding: 12px 26px !important;
  background: #eff6ff !important;
  color: var(--app-primary) !important;
}

.submit-btn {
  border-radius: 999px !important;
  border: 1px solid #bfdbfe !important;
  padding: 12px 26px !important;
  background: #ffffff !important;
  color: var(--app-primary) !important;
}

.share-btn {
  border-radius: 999px !important;
  border: 1px dashed var(--app-primary-soft) !important;
  padding: 12px 26px !important;
  background: var(--app-tag-bg) !important;
  color: var(--app-primary) !important;
}



.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 10px;
}

.share-query-wrap {
  margin-bottom: 10px;
}

.share-query-meta {
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--app-item-bg);
  border: 1px dashed var(--app-tag-border);
}

.share-query-item-line {
  margin: 0;
  font-size: 14px;
  color: var(--app-text-soft);
  font-weight: 700;
}

.empty {
  text-align: center;
  color: #6a6880;
  padding: 28px 10px;
}

.sub-head {
  font-weight: 700;
  color: var(--app-primary);
  margin: 8px 2px 10px;
}

.other-block {
  margin-top: 12px;
}

.group-result-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.result-list {
  display: grid;
  gap: 12px;
}

.result-item {
  border-radius: 16px;
  background: var(--app-item-bg);
  border: 1px solid rgba(148, 188, 225, 0.32);
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.06);
  padding: 14px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.exact-item {
  border: 1px solid rgba(245, 108, 108, 0.35);
  background: linear-gradient(180deg, #fff, #fff9f9);
}

.group-summary {
  border: 1px solid rgba(37, 99, 235, 0.2);
  background: var(--app-item-bg-soft);
}

.group-summary-card {
  margin-bottom: 12px;
}

.group-item {
  grid-template-columns: 1fr;
}

.group-pet-name {
  margin: 0 !important;
}

.pet-row {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 12px;
  align-items: center;
}

.pet-avatar {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  border: 1px solid rgba(148, 188, 225, 0.38);
  background: #fff;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pet-avatar img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pet-meta {
  min-width: 0;
}

.group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
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
  color: var(--app-primary);
  background: var(--app-tag-bg);
  border: 1px solid var(--app-tag-border);
  border-radius: 999px;
  padding: 3px 9px;
}

.left p {
  margin: 3px 0;
  color: var(--app-text-soft);
  font-size: 13px;
}

.chain-text {
  margin: 2px 0 4px;
  color: var(--app-text-muted);
  font-size: 12px;
}

.route-progress {
  margin-top: 10px;
}

.route-progress-head {
  display: flex;
  justify-content: space-between;
  color: var(--app-text-soft);
  font-size: 13px;
}

.shiny-flow-card {
  margin-top: 10px;
}

.shiny-flow-toolbar {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
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
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.9);
  padding: 12px;
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

.page.theme-dark .shiny-flow-card {
}

.page.theme-dark .shiny-flow-btn {
  background: rgba(15, 23, 42, 0.92);
  color: #e2e8f0;
  border-color: rgba(71, 85, 105, 0.7);
}

.page.theme-dark .shiny-flow-btn:hover {
  color: #93c5fd;
  border-color: rgba(96, 165, 250, 0.7);
}

.page.theme-dark .shiny-flow-wrap {
  background: rgba(2, 6, 23, 0.92);
}

.page.theme-dark .shiny-flow-watermark span {
  color: rgba(148, 163, 184, 0.1);
}

.route-cards {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.route-card {
  border: 1px solid var(--app-tag-border);
  border-radius: 12px;
  padding: 10px;
  background: var(--app-item-bg);
}

.route-card.done {
  border-color: #67c23a;
  background: rgba(103, 194, 58, 0.08);
}

.route-card.can {
  border-color: #409eff;
  background: rgba(64, 158, 255, 0.1);
}

.route-card.blocked {
  border-color: #f56c6c;
  background: rgba(245, 108, 108, 0.1);
}

.sex-female {
  color: #ec4899;
  font-weight: 700;
}

.sex-male {
  color: #2563eb;
  font-weight: 700;
}

.switch-row {
  display: flex;
  align-items: center;
  min-height: 40px;
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
  border-radius: 12px;
}

.gender-label-short {
  display: none;
}

.owned-gender-female :deep(.el-radio-button__inner) {
  color: #dc2626;
  border-color: #fca5a5;
  background: #fff1f2;
}

.owned-gender-female :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  color: #fff;
  background: #ef4444;
  border-color: #ef4444;
  box-shadow: -1px 0 0 0 #ef4444;
}

.owned-gender-male :deep(.el-radio-button__inner) {
  color: #1d4ed8;
  border-color: #93c5fd;
  background: #eff6ff;
}

.owned-gender-male :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  color: #fff;
  background: #2563eb;
  border-color: #2563eb;
  box-shadow: -1px 0 0 0 #2563eb;
}

.owned-tag-female {
  color: #dc2626 !important;
  border-color: #fca5a5 !important;
  background: #fff1f2 !important;
}

.owned-tag-male {
  color: #1d4ed8 !important;
  border-color: #93c5fd !important;
  background: #eff6ff !important;
}

.owned-add-btn {
  width: 42px !important;
  height: 42px !important;
  min-width: 42px !important;
  border-radius: 999px !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  justify-self: end;
}

.switch-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #7a7690;
  line-height: 1.5;
}

.blocked-tip {
  color: #e86a6a !important;
  font-weight: 700;
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
  color: var(--app-primary);
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

:deep(.el-form-item__label) {
  color: #1d4ed8 !important;
  font-weight: 700;
}

:deep(.el-input__wrapper) {
  border-radius: 14px;
  background: #e8e7ef;
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.12) inset !important;
  min-height: 42px;
  align-items: center;
}

:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.16) inset !important;
}

:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2) inset !important;
}

:deep(.el-input__inner) {
  height: 42px;
  line-height: 42px;
}

:deep(.el-input__inner:focus) {
  outline: none !important;
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
  flex-wrap: wrap;
}

.site-footer a {
  color: var(--app-primary);
  text-decoration: none;
  font-weight: 600;
}

.footer-github-link {
  display: inline-flex;
  align-items: center;
  gap: 0;
}

.site-footer a:hover {
  text-decoration: underline;
}

.footer-github-icon {
  width: 1em;
  height: 1em;
  flex-shrink: 0;
}

.page.theme-dark .left h3,
.page.theme-dark .group-pet-name {
  color: var(--app-text);
}

.page.theme-dark .left p,
.page.theme-dark .chain-text {
  color: var(--app-text-soft);
}

.page.theme-dark .result-item {
  background: #0b1220;
  border-color: rgba(96, 165, 250, 0.28);
  box-shadow: 0 12px 28px rgba(2, 6, 23, 0.55);
}

.page.theme-dark .exact-item {
  background: linear-gradient(180deg, #1a2130, #121827);
  border-color: rgba(248, 113, 113, 0.55);
}

.page.theme-dark .group-summary {
  background: linear-gradient(180deg, #111827, #0b1220);
  border-color: rgba(96, 165, 250, 0.35);
}

.page.theme-dark .pet-id {
  color: #bfdbfe;
  background: #172554;
  border-color: #1d4ed8;
}

.page.theme-dark .empty,
.page.theme-dark .site-footer {
  color: var(--app-text-muted);
}

.page.theme-dark :deep(.el-input__wrapper) {
  background: #020617;
  color: #e5e7eb;
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.2) inset !important;
}

.page.theme-dark :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(147, 197, 253, 0.28) inset !important;
}

.page.theme-dark :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.32) inset !important;
}

.page.theme-dark :deep(.el-input__inner) {
  color: #f1f5f9;
}

.page.theme-dark :deep(.el-input__inner::placeholder) {
  color: #94a3b8;
}

.page.theme-dark :deep(.el-form-item__label) {
  color: #93c5fd !important;
}

.shiny-field :deep(.el-form-item__label),
.page.shiny-active :deep(.el-form-item__label) {
  color: #38bdf8 !important;
}

.page.shiny-active :deep(.el-input__wrapper) {
  background: #e0f2fe;
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.3) inset !important;
}

.page.theme-dark.shiny-active :deep(.el-input__wrapper) {
  background: #082f49;
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.4) inset !important;
}

@media (max-width: 859px) {
  .route-card .route-group-tag {
    display: none;
  }
}

@media (min-width: 860px) {
  .top-nav {
    padding: 12px 16px;
  }

  .mode-switch-card {
    padding: 12px;
  }

  .grid {
    grid-template-columns: 1fr 1fr;
  }

  .actions {
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: flex-end;
    gap: 12px;
  }

  .actions :deep(.el-button) {
    flex: 0 0 auto;
    width: auto;
    min-width: 132px;
  }

  .result-item {
    grid-template-columns: 1.2fr 0.8fr;
    align-items: center;
  }

  .group-item,
  .group-summary {
    grid-template-columns: 1fr;
  }

  .group-result-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
