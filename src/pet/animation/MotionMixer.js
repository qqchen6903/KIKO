export class MotionMixer {
  constructor() { this.layers = new Map(); this.clock = 0; }
  play(name, clip, { priority = 1, loop = false, fadeIn = .16, fadeOut = .2 } = {}) {
    const now = this.clock;
    this.layers.set(name, { name, clip, priority, loop, start: now, fadeIn, fadeOut, weight: 0, stopping: false });
  }
  stop(name) { const layer = this.layers.get(name); if (layer) layer.stopping = true; }
  stopAll() { for (const layer of this.layers.values()) layer.stopping = true; }
  update(dt) {
    this.clock += Math.min(dt, .05);
    const result = {};
    for (const [name, layer] of this.layers) {
      const elapsed = this.clock - layer.start, duration = layer.clip.duration || 1;
      const progress = layer.loop ? (elapsed % duration) / duration : Math.min(1, elapsed / duration);
      const fade = Math.min(1, elapsed / Math.max(.001, layer.fadeIn));
      layer.weight = layer.stopping ? Math.max(0, layer.weight - dt / Math.max(.001, layer.fadeOut)) : fade;
      if (!layer.loop && elapsed >= duration && !layer.stopping) layer.stopping = true;
      if (layer.weight <= 0 && layer.stopping) { this.layers.delete(name); continue; }
      const pose = layer.clip.sample(progress);
      for (const [bone, values] of Object.entries(pose)) {
        result[bone] ||= {};
        for (const [key, value] of Object.entries(values)) {
          const current = result[bone][key];
          result[bone][key] = current == null ? value * layer.weight : current + value * layer.weight;
        }
      }
    }
    return result;
  }
}
