import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { FPSController } from './player/FPSController'
import { ChunkManager } from './world/ChunkManager'
import { PerformanceMonitor } from './core/PerformanceMonitor'

const canvas = document.getElementById('game') as HTMLCanvasElement
const hud = document.getElementById('hud')!
const overlay = document.getElementById('overlay')!
const enter = document.getElementById('enter')!
const notice = document.getElementById('notice')!

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
const scene = new THREE.Scene()
scene.background = new THREE.Color('#8a958e')
scene.fog = new THREE.FogExp2('#8b9690', 0.018)
const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.1, 300)
const perf = new PerformanceMonitor(hud)

// lights - brighter for PBR textures
scene.add(new THREE.HemisphereLight('#d6e2dc', '#4a5450', 1.9))
const sun = new THREE.DirectionalLight('#fff1cc', 2.2); sun.position.set(-30,40,20); scene.add(sun)
scene.add(new THREE.AmbientLight('#ffffff', 0.35))

// world
const chunkMgr = new ChunkManager(scene)

// player
const controller = new FPSController(camera, canvas)
// simple collision: stay inside generated bounds, no walls yet
function canMove(_from:THREE.Vector3,to:THREE.Vector3){ 
  if(Math.abs(to.x)>120 || Math.abs(to.z)>120) return false
  return true
}

// weapon AK rig
const loader = new GLTFLoader()
let weapon: THREE.Group | null = null
let mixer: THREE.AnimationMixer | null = null
let clips: THREE.AnimationClip[] = []
let actions = new Map<string, THREE.AnimationAction>()
let curAction: THREE.AnimationAction | null = null

async function loadWeapon(){
  try{
    const gltf = await loader.loadAsync('/assets/models/fps_ak-74m_animations.glb')
    const root = gltf.scene
    // Fix textures: sRGB
    root.traverse(o=>{
      const m = (o as any).material
      if(m){
        const mats = Array.isArray(m) ? m : [m]
        for(const mat of mats){
          if(mat.map) mat.map.colorSpace = THREE.SRGBColorSpace
          if((mat as any).emissiveMap) (mat as any).emissiveMap.colorSpace = THREE.SRGBColorSpace
          mat.needsUpdate = true
        }
      }
      if((o as any).isMesh){ (o as THREE.Mesh).castShadow=false; (o as THREE.Mesh).receiveShadow=false }
    })
    // Normalize: the file has RootNode with matrices scaling ~1.99 and 0.01 ; compute bbox and fit
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x,size.y,size.z)
    // target viewmodel size ~0.9 units tall
    const target = 0.45 // visor scale, was too big at 0.9
    const s = maxDim>0 ? target / maxDim : 1
    // reset stray root scales by applying uniform scale to root
    root.scale.setScalar(s)
    root.updateMatrixWorld(true)
    // recenter: bring pivot near camera
    const box2 = new THREE.Box3().setFromObject(root)
    const center = box2.getCenter(new THREE.Vector3())
    root.position.sub(center)
    // offset like shuter FPS (x right, y down, z forward)
    root.position.add(new THREE.Vector3(0.28, -0.34, -0.85))
    // arms are already facing -Z, no extra PI needed; keep slight pitch
    root.rotation.set(-0.06, Math.PI, 0.015)

    weapon = root
    camera.add(weapon)
    clips = gltf.animations
    if(clips.length){
      mixer = new THREE.AnimationMixer(root)
      for(const c of clips){
        const act = mixer.clipAction(c)
        actions.set(c.name, act)
      }
      play('Rig|AK_Idle', true)
    }
    showNotice(`AK cargado: ${clips.length} anims`)
  }catch(e){
    console.error(e)
    showNotice('AK no cargado (revisa public/assets/models)')
  }
}
function play(name:string, loop=true){
  if(!mixer) return
  const next = actions.get(name)
  if(!next) return
  if(curAction===next) return
  next.reset()
  next.setLoop(loop? THREE.LoopRepeat: THREE.LoopOnce, Infinity)
  next.clampWhenFinished=!loop
  next.fadeIn(0.12).play()
  if(curAction) curAction.fadeOut(0.12)
  curAction=next
}
function showNotice(t:string, ms=2400){
  notice.textContent=t
  notice.classList.add('show')
  setTimeout(()=>notice.classList.remove('show'), ms)
}

// pointer lock - robust
async function lockPointer(){
  try{ await canvas.requestPointerLock() }catch(e){ console.warn('pointerLock failed', e); showNotice('Click de nuevo para bloquear mouse') }
}
enter.addEventListener('click', (e)=>{ e.stopPropagation(); lockPointer() })
overlay.addEventListener('click', (e)=>{
  if((e.target as HTMLElement).id==='overlay' || (e.target as HTMLElement).closest('#panel')) {
    // if clicking panel background also lock
    if(document.pointerLockElement!==canvas) lockPointer()
  }
})
canvas.addEventListener('click', ()=>{
  if(document.pointerLockElement!==canvas) lockPointer()
  else {
    if(mixer) { play('Rig|AK_Shot', false); setTimeout(()=>play(isMovingAnim(), true), 220) }
  }
})
document.addEventListener('pointerlockchange', ()=>{
  if(document.pointerLockElement===canvas) overlay.classList.add('hidden')
  else overlay.classList.remove('hidden')
})
document.addEventListener('pointerlockerror', ()=>{ showNotice('Pointer lock bloqueado por navegador — usa click en ENTRAR'); console.error('pointerlockerror') })
document.addEventListener('keydown', e=>{
  if(e.code==='KeyR'){ e.preventDefault(); if(mixer){ play('Rig|AK_Reload', false); setTimeout(()=>play(isMovingAnim(), true), 1400)}}
})
function isMovingAnim(){
  if(controller.isSprinting()) return 'Rig|AK_Run'
  if(controller.isMoving()) return 'Rig|AK_Walk'
  return 'Rig|AK_Idle'
}

let last = performance.now()
let lastWalkState = ''
function loop(){
  const now = performance.now()
  const dt = Math.min((now-last)/1000, 0.05); last=now
  controller.update(dt, canMove)
  chunkMgr.update(controller.pos)
  // anim state by movement - guard against missing clips
  const state = isMovingAnim()
  const shotAct = actions.get('Rig|AK_Shot')
  const reloadAct = actions.get('Rig|AK_Reload')
  const shotBusy = shotAct ? mixer?.clipAction(shotAct as any)?.isRunning() : false
  const reloadBusy = reloadAct ? mixer?.clipAction(reloadAct as any)?.isRunning() : false
  if(state!==lastWalkState && mixer && !shotBusy && !reloadBusy){
    play(state, true); lastWalkState=state
  }
  mixer?.update(dt)
  const stats = chunkMgr.getStats()
  renderer.render(scene, camera)
  perf.endFrame(dt, { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, chunksLoaded: stats.loaded, chunksActive: stats.active, workerMs: stats.lastWorkerMs })
  requestAnimationFrame(loop)
}
function resize(){ renderer.setSize(innerWidth, innerHeight, false); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix() }
addEventListener('resize', resize)
resize()
scene.add(camera)
loadWeapon()
loop()
