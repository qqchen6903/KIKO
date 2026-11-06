export class Bone {
  constructor({ name, parent = null, x = 0, y = 0, length = 0, rotation = 0, scaleX = 1, scaleY = 1 }) {
    this.name = name; this.parent = parent; this.children = [];
    this.x = x; this.y = y; this.length = length; this.rotation = rotation;
    this.scaleX = scaleX; this.scaleY = scaleY;
    this.world = new DOMMatrix(); this.worldX = 0; this.worldY = 0;
    if (parent) parent.children.push(this);
  }
  update(parentMatrix = new DOMMatrix()) {
    const local = new DOMMatrix().translate(this.x, this.y).rotate(this.rotation * 180 / Math.PI).scale(this.scaleX, this.scaleY);
    this.world = parentMatrix.multiply(local);
    const p = new DOMPoint(0, 0).matrixTransform(this.world);
    this.worldX = p.x; this.worldY = p.y;
    for (const child of this.children) child.update(this.world);
  }
  setPose(pose = {}) {
    if (Number.isFinite(pose.x)) this.x = pose.x;
    if (Number.isFinite(pose.y)) this.y = pose.y;
    if (Number.isFinite(pose.rotation)) this.rotation = pose.rotation;
    if (Number.isFinite(pose.scaleX)) this.scaleX = pose.scaleX;
    if (Number.isFinite(pose.scaleY)) this.scaleY = pose.scaleY;
  }
}
