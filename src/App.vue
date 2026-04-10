<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { Search, Refresh, Sunny, Moon, Monitor, House, Bell } from '@element-plus/icons-vue'
import HomePage from './pages/HomePage.vue'
import EggSizePage from './pages/EggSizePage.vue'
import EggGroupPage from './pages/EggGroupPage.vue'
import EggBreedingPage from './pages/EggBreedingPage.vue'
import EggShinyPage from './pages/EggShinyPage.vue'
import {
  EGG_GROUP_INPUT,
  SHINY_SEED_PETS,
  NO_BREED_PETS,
  normalizeBreedingName
} from './data/breeding-config'

let html2canvasLib = null
let qrcodeLib = null
let mermaidLib = null
let mermaidInitialized = false

async function getHtml2canvas() {
  if (!html2canvasLib) {
    html2canvasLib = (await import('html2canvas')).default
  }
  return html2canvasLib
}

async function getQRCode() {
  if (!qrcodeLib) {
    qrcodeLib = (await import('qrcode')).default
  }
  return qrcodeLib
}

async function getMermaid() {
  if (!mermaidLib) {
    mermaidLib = (await import('mermaid')).default
  }
  if (!mermaidInitialized) {
    mermaidLib.initialize({
      startOnLoad: false,
      theme: activeTheme.value === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose'
    })
    mermaidInitialized = true
  }
  return mermaidLib
}

async function preloadLibrariesForPage(page) {
  if (page === 'size') {
    await Promise.all([
      getHtml2canvas(),
      getQRCode()
    ])
    return
  }

  if (page === 'shiny') {
    await Promise.all([
      getQRCode(),
      getMermaid()
    ])
  }
}

const router = useRouter()
const route = useRoute()
const currentPage = computed(() => String(route.name || 'home'))

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

const OFFICIAL_ACTIVITY_HIDDEN_KEY = 'rocom_official_activity_hidden'
const showOfficialActivity = ref(true)

function restoreOfficialActivityState() {
  if (typeof window === 'undefined') return
  const hiddenState = window.localStorage.getItem(OFFICIAL_ACTIVITY_HIDDEN_KEY)
  showOfficialActivity.value = hiddenState !== 'true'
}

function closeOfficialActivity() {
  showOfficialActivity.value = false
  if (typeof window === 'undefined') return
  window.localStorage.setItem(OFFICIAL_ACTIVITY_HIDDEN_KEY, 'true')
}

function openOfficialActivity() {
  showOfficialActivity.value = true
  if (typeof window === 'undefined') return
  window.localStorage.setItem(OFFICIAL_ACTIVITY_HIDDEN_KEY, 'false')
}

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
const showHomeNavButton = computed(() => currentPage.value !== 'home')
const showOfficialActivityNavButton = computed(() => currentPage.value === 'home' && !showOfficialActivity.value)
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

function navigateTo(page) {
  router.push({ name: page })
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

function extractEggMeasurementRows(eggJson) {
  if (Array.isArray(eggJson?.items)) return eggJson.items

  const groups = Array.isArray(eggJson?.groups) ? eggJson.groups : []
  const rows = []

  for (const group of groups) {
    const pet = group?.pet
    const petId = group?.petId ?? '--'
    if (!pet) continue

    const rangeItems = Array.isArray(group?.rangeItems) ? group.rangeItems : []
    const exactItems = Array.isArray(group?.exactItems) ? group.exactItems : []

    for (const item of [...rangeItems, ...exactItems]) {
      if (!item) continue
      rows.push({
        id: item.id,
        pet,
        petId,
        eggDiameter: item.eggDiameter,
        eggWeight: item.eggWeight
      })
    }
  }

  return rows
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

    const rows = extractEggMeasurementRows(eggJson)
    rawItems.value = rows
      .map((row) => {
        const diameterRange = parseRange(row.eggDiameter)
        const weightRange = parseRange(row.eggWeight)
        if (!diameterRange || !weightRange) return null
        return {
          id: row.id,
          pet: row.pet,
          petId: row.petId ?? idMap.get(row.pet) ?? '--',
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
    const captureTheme = posterIsDark ? 'dark' : 'light'
    const captureThemeClass = posterIsDark ? 'theme-dark' : 'theme-light'

    const html2canvas = await getHtml2canvas()
    const canvas = await html2canvas(target, {
      backgroundColor: posterBg,
      useCORS: true,
      scale: Math.max(2, window.devicePixelRatio || 1),
      windowWidth: Math.max(document.documentElement.clientWidth, target.scrollWidth),
      windowHeight: Math.max(target.scrollHeight, target.clientHeight),
      scrollX: 0,
      scrollY: -window.scrollY,
      onclone: (clonedDoc) => {
        clonedDoc.documentElement.setAttribute('data-theme', captureTheme)
        clonedDoc.body?.setAttribute('data-theme', captureTheme)
        clonedDoc.documentElement.classList.toggle('dark', posterIsDark)
        clonedDoc.body?.classList.toggle('dark', posterIsDark)

        const clonedPage = clonedDoc.querySelector('.page')
        clonedPage?.classList.remove('theme-dark', 'theme-light')
        clonedPage?.classList.add(captureThemeClass)

        const clonedTarget =
          clonedDoc.querySelector('.share-poster-target') ||
          clonedDoc.querySelector('.panel') ||
          clonedDoc.querySelector('.page')

        clonedTarget?.classList.remove('theme-dark', 'theme-light')
        clonedTarget?.classList.add(captureThemeClass)
      }
    })

    const QRCode = await getQRCode()
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

    const mermaid = await getMermaid()
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
  const QRCode = await getQRCode()
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

  if (mode === 'size') navigateTo('size')
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

watch(activeTheme, () => {
  shareImageUrl.value = ''
})

watch(currentPage, (page) => {
  preloadLibrariesForPage(page)
})

onMounted(async () => {
  initThemeMode()
  restoreOfficialActivityState()
  await loadDataset()
  applySharedParamsFromUrl()
  preloadLibrariesForPage(currentPage.value)
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
        <span class="brand">
          <span class="brand-short">洛克星盘</span>
          <span class="brand-full">洛克星盘-洛克王国世界工具站</span>
        </span>
      </div>
      <div class="nav-right">
        <button
          v-if="showOfficialActivityNavButton"
          class="theme-toggle-btn official-activity-toggle-btn"
          type="button"
          title="显示官方活动"
          aria-label="显示官方活动"
          @click="openOfficialActivity"
        >
          <el-icon><Bell /></el-icon>
        </button>
        <button
          v-if="showHomeNavButton"
          class="theme-toggle-btn nav-home-btn"
          type="button"
          title="返回首页"
          aria-label="返回首页"
          @click="navigateTo('home')"
        >
          <el-icon><House /></el-icon>
        </button>
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

    <section v-if="showOfficialActivity && currentPage === 'home'" class="official-activity-card">
      <div class="official-activity-head">
        <div class="official-activity-title-wrap">
          <span class="official-activity-badge">官方活动</span>
        </div>
        <button type="button" class="official-activity-close" @click="closeOfficialActivity" aria-label="关闭官方活动">×</button>
      </div>
      <a
        class="official-activity-link"
        href="https://www.wegame.com.cn/act/wegame/lkwgsj20260409launch/index.html?wg_ad_from=communitycoverNew"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="official-activity-name">洛克王国世界启动签到领好礼</span>
      </a>
    </section>

    <HomePage
      v-if="currentPage === 'home'"
      @navigate="navigateTo"
    />

    <EggSizePage
      v-if="currentPage === 'size'"
      :sharing-capture="sharingCapture"
      :dataset-count="datasetCount"
      :shiny-visual-active="shinyVisualActive"
      :diameter-input="diameterInput"
      :weight-input="weightInput"
      :refresh-icon="Refresh"
      :search-icon="Search"
      :searching="searching"
      :loading-data="loadingData"
      :has-searched="hasSearched"
      :search-mode="searchMode"
      :exact-results="exactResults"
      :candidates="candidates"
      :sharing-poster="sharingPoster"
      :share-image-url="shareImageUrl"
      :share-images-ready="shareImagesReady"
      :get-creature-image-url="getCreatureImageUrl"
      @update:diameter-input="diameterInput = $event"
      @update:weight-input="weightInput = $event"
      @open-survey="onOpenSurvey"
      @reset="onReset"
      @search="onSearch"
      @share-long-image="onShareLongImage"
      @update-share-images-ready="updateShareImagesReady"
    />

    <EggGroupPage
      v-else-if="currentPage === 'group'"
      :group-keyword="groupKeyword"
      :group-stage="groupStage"
      :group-stage-options="groupStageOptions"
      :group-searching="groupSearching"
      :loading-data="loadingData"
      :group-has-searched="groupHasSearched"
      :group-results="groupResults"
      @update:group-keyword="groupKeyword = $event"
      @update:group-stage="groupStage = $event"
      @reset="onGroupReset"
      @search="onGroupSearch"
    />

    <EggBreedingPage
      v-else-if="currentPage === 'breeding'"
      :breed-target-name="breedTargetName"
      :force-shiny="forceShiny"
      :breed-searching="breedSearching"
      :loading-data="loadingData"
      :breed-has-searched="breedHasSearched"
      :breed-result="breedResult"
      :breed-candidates="breedCandidates"
      :can-enable-shiny-switch="canEnableShinySwitch"
      :refresh-icon="Refresh"
      :search-icon="Search"
      @update:breed-target-name="breedTargetName = $event"
      @update:force-shiny="forceShiny = $event"
      @reset="onBreedReset"
      @search="onBreedSearch"
    />

    <EggShinyPage
      v-else-if="currentPage === 'shiny'"
      :loading-data="loadingData"
      :shiny-searching="shinySearching"
      :shiny-has-searched="shinyHasSearched"
      :shiny-result="shinyResult"
      :shiny-candidates="shinyCandidates"
      :shiny-flow-svg="shinyFlowSvg"
      :shiny-flow-preview-visible="shinyFlowPreviewVisible"
      :shiny-owned-draft-name="shinyOwnedDraftName"
      :shiny-owned-draft-gender="shinyOwnedDraftGender"
      :shiny-owned-list="shinyOwnedList"
      :shiny-pet-option-objects="shinyPetOptionObjects"
      :current-page-title="'精灵蛋异色孵化'"
      :group-mode-hint="'添加异色清单，查询会自动引用你已添加的异色清单进行路线规划。'"
      :search-icon="Search"
      :refresh-icon="Refresh"
      @update:shiny-owned-draft-name="shinyOwnedDraftName = $event"
      @update:shiny-owned-draft-gender="shinyOwnedDraftGender = $event"
      @update:shiny-flow-preview-visible="shinyFlowPreviewVisible = $event"
      @add-shiny-owned="addShinyOwned"
      @remove-shiny-owned="removeShinyOwned"
      @reset="onShinyReset"
      @search="onShinySearch"
      @download-flow="downloadShinyFlowPng"
      @open-preview="openShinyFlowPreview"
      @close-preview="closeShinyFlowPreview"
    />

    <footer class="site-footer">
      <span>© 2026 洛克星盘</span>
      <a class="footer-link footer-github-link" href="https://github.com/mfskys/rocomegg" target="_blank" rel="noopener noreferrer">
        <svg class="footer-link-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"/>
        </svg>
        <span>项目主页</span>
      </a>
      <a
        class="footer-link footer-qq-link"
        href="https://qun.qq.com/universal-share/share?ac=1&authKey=g4C6V0n27jTeN4KpzuWKLr4zqWLtplm0jG9SebOJGl%2Bzs6zIXAEYtLE73V0dGQ6m&busi_data=eyJncm91cENvZGUiOiIxMDkxNTAzODE1IiwidG9rZW4iOiJZRlV6YXJmZmY0YXAraUNmZlR0R1hPTmIybW4xcFdreVVJUlZWQlYzdCs5cS9hQWZubGJ3RHdKVmxyWi9aclJoIiwidWluIjoiMTUwNzE5NDIwMyJ9&data=JTsiW6bq9rUG_Pk9SNgZv-7qgIoAL63OyUQry6BwdhMZJ4WyqUCvt1cn0WwvPXfMF7QrLq31bqIAZDplm5WpEw&svctype=4&tempid=h5_group_info"
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg class="footer-link-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none">
            <path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/>
            <path fill="currentColor" d="M12 2a6.285 6.285 0 0 0-6.276 5.937l-.146 2.63a28 28 0 0 0-.615 1.41c-1.24 3.073-1.728 5.773-1.088 6.032c.335.135.913-.426 1.566-1.432a6.67 6.67 0 0 0 1.968 3.593c-1.027.35-1.91.828-1.91 1.33c0 .509 2.48.503 4.239.5h.001c.549-.002 1.01-.008 1.38-.057a6.7 6.7 0 0 0 1.76 0c.37.05.833.055 1.382.056c1.76.004 4.239.01 4.239-.499c0-.502-.883-.979-1.909-1.33a6.67 6.67 0 0 0 1.967-3.586c.65 1.002 1.227 1.56 1.56 1.425c.64-.259.154-2.96-1.088-6.032a28 28 0 0 0-.607-1.395l-.147-2.645A6.285 6.285 0 0 0 12 2"/>
          </g>
        </svg>
        <span>官方Q群</span>
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

  --app-bg:
    linear-gradient(rgba(247, 251, 255, 0.78), rgba(237, 245, 255, 0.82)),
    url('/周年庆贺图.png') center / cover fixed no-repeat,
    radial-gradient(circle at top left, #f7fbff, #edf5ff 58%, #e4f0ff);
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

  --app-bg:
    linear-gradient(rgba(2, 6, 23, 0.72), rgba(11, 18, 32, 0.82)),
    url('/周年庆贺图.png') center / cover fixed no-repeat,
    radial-gradient(circle at top left, #020617, #0b1220 55%, #111827);
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
  max-width: 1180px;
  margin: 0 auto 14px;
  padding: 10px 12px;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.08));
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 14px 30px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-left .brand {
  font-weight: 800;
  color: var(--app-primary);
  letter-spacing: 0.3px;
}

.brand-short {
  display: none;
}

.brand-full {
  display: inline;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nav-home-btn,
.official-activity-toggle-btn {
  color: var(--app-primary);
}

.official-activity-card {
  position: relative;
  overflow: hidden;
  max-width: 1180px;
  margin: 0 auto 14px;
  padding: 12px 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.08));
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 24px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 14px 30px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
}

.official-activity-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 46px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  color: var(--app-primary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  border: 1px solid rgba(255, 255, 255, 0.24);
}

.official-activity-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.official-activity-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.official-activity-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.14));
  color: var(--app-primary);
  border-radius: 999px;
  width: 34px;
  height: 34px;
  padding: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 10px 20px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(14px) saturate(150%);
  -webkit-backdrop-filter: blur(14px) saturate(150%);
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}



.official-activity-close:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 14px 24px rgba(15, 23, 42, 0.14);
  border-color: rgba(255, 255, 255, 0.34);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.18));
}

.official-activity-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  color: var(--app-text);
  text-decoration: none;
  line-height: 1.6;
}

.official-activity-name {
  font-weight: 700;
  color: var(--app-text);
}

.page.theme-dark .top-nav {
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow:
    0 18px 36px rgba(2, 6, 23, 0.38),
    inset 0 1px 0 rgba(148, 163, 184, 0.1);
}

.page.theme-dark .official-activity-card {
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow:
    0 18px 36px rgba(2, 6, 23, 0.38),
    inset 0 1px 0 rgba(148, 163, 184, 0.1);
}

.official-activity-link:hover .official-activity-name {
  text-decoration: underline;
}

.page.theme-dark .official-activity-badge {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(148, 163, 184, 0.08));
  color: #bfdbfe;
  border-color: rgba(148, 163, 184, 0.22);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 10px 20px rgba(2, 6, 23, 0.18);
  backdrop-filter: blur(14px) saturate(150%);
  -webkit-backdrop-filter: blur(14px) saturate(150%);
}

.page.theme-dark .official-activity-close {
  border-color: rgba(148, 163, 184, 0.22);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(148, 163, 184, 0.08));
  color: #dbeafe;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 10px 20px rgba(2, 6, 23, 0.18);
}

.page.theme-dark .official-activity-close:hover {
  border-color: rgba(148, 163, 184, 0.3);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(148, 163, 184, 0.1));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    0 14px 24px rgba(2, 6, 23, 0.22);
}

.page.theme-dark .official-activity-link,
.page.theme-dark .official-activity-name {
  color: #e5eefb;
}





.theme-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.14));
  color: var(--app-primary);
  border-radius: 999px;
  width: 34px;
  height: 34px;
  padding: 0;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 10px 20px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(14px) saturate(150%);
  -webkit-backdrop-filter: blur(14px) saturate(150%);
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.theme-toggle-btn:hover {
  border-color: rgba(255, 255, 255, 0.34);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.18));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 14px 24px rgba(15, 23, 42, 0.14);
  transform: translateY(-1px);
}

.theme-toggle-btn :deep(svg) {
  width: 18px;
  height: 18px;
}

.page.theme-dark .top-nav {
  border-color: rgba(148, 163, 184, 0.16);
  box-shadow:
    0 18px 36px rgba(2, 6, 23, 0.38),
    inset 0 1px 0 rgba(148, 163, 184, 0.1);
}

.page.theme-dark .theme-toggle-btn {
  border-color: rgba(148, 163, 184, 0.22);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(148, 163, 184, 0.08));
  color: #dbeafe;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 10px 20px rgba(2, 6, 23, 0.18);
}

.page.theme-dark .theme-toggle-btn:hover {
  border-color: rgba(148, 163, 184, 0.3);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(148, 163, 184, 0.1));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    0 14px 24px rgba(2, 6, 23, 0.22);
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

.footer-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.site-footer a:hover {
  text-decoration: underline;
}

.footer-link-icon {
  width: 1em;
  height: 1em;
  flex-shrink: 0;
}

.page.theme-dark .site-footer {
  color: var(--app-text-muted);
}

@media (max-width: 640px) {
  .page {
    --app-bg:
      linear-gradient(rgba(247, 251, 255, 0.78), rgba(237, 245, 255, 0.82)),
      url('/周年庆贺图.png') center / cover no-repeat,
      radial-gradient(circle at top left, #f7fbff, #edf5ff 58%, #e4f0ff);
  }

  .page.theme-dark {
    --app-bg:
      linear-gradient(rgba(2, 6, 23, 0.72), rgba(11, 18, 32, 0.82)),
      url('/周年庆贺图.png') center / cover no-repeat,
      radial-gradient(circle at top left, #020617, #0b1220 55%, #111827);
  }

  .brand-short {
    display: inline;
  }

  .brand-full {
    display: none;
  }
}

@media (min-width: 860px) {
  .top-nav {
    padding: 12px 16px;
  }
}
</style>
