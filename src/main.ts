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

// lights
scene.add(new THREE.HemisphereLight('#cbd6cf', '#3a4440', 1.6))
const sun = new THREE.DirectionalLight('#ffe8c2', 1.8); sun.position.set(-30,40,20); scene.add(sun)

// world
const chunkMgr = new ChunkManager(scene)

// player
const controller = new FPSController(camera)
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
    // Normalize scale 100 -> 1 (nodes already scaled). Take cloned scene
    const root = gltf.scene
    // Sketchfab root has extra transforms; find Rig/arms
    root.traverse(o=>{ if((o as any).isMesh){ (o as THREE.Mesh).castShadow=false; (o as THREE.Mesh).receiveShadow=false }})
    // Put weapon in camera space
    weapon = root
    // The model is in world scale ~2 units; attach to camera with offset like shuter
    weapon.scale.setScalar(0.9)
    weapon.position.set(0.28, -0.34, -0.62)
    weapon.rotation.set(0, Math.PI, 0)
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

// pointer lock
enter.addEventListener('click', ()=> canvas.requestPointerLock())
canvas.addEventListener('click', ()=>{
  if(document.pointerLockElement!==canvas) canvas.requestPointerLock()
  else {
    // shoot anim
    if(mixer) { play('Rig|AK_Shot', false); setTimeout(()=>play(isMovingAnim(), true), 220) }
  }
})
document.addEventListener('pointerlockchange', ()=>{
  if(document.pointerLockElement===canvas) overlay.classList.add('hidden')
  else overlay.classList.remove('hidden')
})
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
  // anim state by movement
  const state = isMovingAnim()
  if(state!==lastWalkState && mixer && !mixer.clipAction(actions.get('Rig|AK_Shot')!).isRunning() && !mixer.clipAction(actions.get('Rig|AK_Reload')!)?.isRunning()){
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
