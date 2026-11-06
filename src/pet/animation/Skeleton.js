import { Bone } from './Bone.js';
export class Skeleton {
  constructor(definition) {
    this.bones = new Map();
    for (const item of definition.bones) {
      const parent = item.parent ? this.bones.get(item.parent) : null;
      if (item.parent && !parent) throw new Error('Unknown parent bone: ' + item.parent);
      this.bones.set(item.name, new Bone({ ...item, parent }));
    }
    this.root = this.bones.get(definition.root);
    if (!this.root) throw new Error('Missing skeleton root');
  }
  update() { this.root.update(); }
  pose(values) { for (const [name, pose] of Object.entries(values || {})) this.bones.get(name)?.setPose(pose); this.update(); }
  get(name) { return this.bones.get(name); }
  reset(definition) { for (const item of definition.bones) this.bones.get(item.name)?.setPose(item); this.update(); }
}
