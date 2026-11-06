import { Skeleton } from './Skeleton.js';
import { Skinning } from './Skinning.js';
import { MotionMixer } from './MotionMixer.js';
export class AnimationEngine {
  constructor(canvas, image, rig) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: true });
    this.image = image; this.definition = rig.skeleton;
    this.skeleton = new Skeleton(this.definition); this.skin = new Skinning(rig.mesh);
    this.mixer = new MotionMixer(); this.running = false; this.last = 0; this.raf = 0;
    this.width = rig.width; this.height = rig.height;
    this.skeleton.update();
    this.bindPose = new Map([...this.skeleton.bones].map(([name,bone]) => [name, bone.world.inverse()]));
    this.skin.bindPose = this.bindPose;
    this.resize();
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.width*dpr; this.canvas.height=this.height*dpr;
    this.canvas.style.width=this.width+'px'; this.canvas.style.height=this.height+'px';
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  play(name, clip, options) { this.mixer.play(name, clip, options); }
  start() { if (this.running) return; this.running=true; this.last=performance.now(); this.raf=requestAnimationFrame(this.#tick); }
  stop() { this.running=false; cancelAnimationFrame(this.raf); }
  #tick = now => {
    if (!this.running) return;
    const dt=(now-this.last)/1000; this.last=now;
    this.skeleton.reset(this.definition); this.skeleton.pose(this.mixer.update(dt));
    const ctx=this.ctx; ctx.clearRect(0,0,this.width,this.height);
    this.skin.draw(ctx,this.image,this.skeleton,this.width,this.height);
    this.raf=requestAnimationFrame(this.#tick);
  };
}
