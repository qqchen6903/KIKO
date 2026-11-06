/* CPU linear-blend skinning for textured 2D meshes. Each vertex is transformed
 * from bind space through inverse-bind and current bone matrices. */
export class Skinning {
  constructor(mesh) {
    this.vertices = mesh.vertices.map(v => ({ x:v.x, y:v.y, weights:v.weights||[] }));
    this.indices = mesh.indices; this.base=this.vertices.map(v=>({x:v.x,y:v.y}));
    this.bindPose = new Map();
  }
  draw(ctx,image,skeleton,width,height) {
    if (!image?.complete || !image.naturalWidth) return;
    const sx=width/image.naturalWidth, sy=height/image.naturalHeight;
    const transformed=this.vertices.map(v=>{
      let x=0,y=0,total=0;
      for(const w of v.weights){
        const bone=skeleton.get(w.bone), inv=this.bindPose.get(w.bone);
        if(!bone||!inv) continue;
        const p=new DOMPoint(v.x,v.y).matrixTransform(inv).matrixTransform(bone.world);
        x+=p.x*w.weight; y+=p.y*w.weight; total+=w.weight;
      }
      return total?{x:x/total,y:y/total}:{x:v.x,y:v.y};
    });
    ctx.save();ctx.scale(sx,sy);
    for(let i=0;i<this.indices.length;i+=3)this.#triangle(ctx,image,this.base,transformed,this.indices.slice(i,i+3));
    ctx.restore();
  }
  #triangle(ctx,image,src,dst,ids){
    const [a,b,c]=ids.map(i=>({s:src[i],d:dst[i]}));
    const den=a.s.x*(b.s.y-c.s.y)+b.s.x*(c.s.y-a.s.y)+c.s.x*(a.s.y-b.s.y);
    if(Math.abs(den)<1e-5)return;
    const A=(a.d.x*(b.s.y-c.s.y)+b.d.x*(c.s.y-a.s.y)+c.d.x*(a.s.y-b.s.y))/den;
    const C=(a.d.x*(c.s.x-b.s.x)+b.d.x*(a.s.x-c.s.x)+c.d.x*(b.s.x-a.s.x))/den;
    const E=(a.d.x*(b.s.x*c.s.y-c.s.x*b.s.y)+b.d.x*(c.s.x*a.s.y-a.s.x*c.s.y)+c.d.x*(a.s.x*b.s.y-b.s.x*a.s.y))/den;
    const B=(a.d.y*(b.s.y-c.s.y)+b.d.y*(c.s.y-a.s.y)+c.d.y*(a.s.y-b.s.y))/den;
    const D=(a.d.y*(c.s.x-b.s.x)+b.d.y*(a.s.x-c.s.x)+c.d.y*(b.s.x-a.s.x))/den;
    const F=(a.d.y*(b.s.x*c.s.y-c.s.x*b.s.y)+b.d.y*(c.s.x*a.s.y-a.s.x*c.s.y)+c.d.y*(a.s.x*b.s.y-b.s.x*a.s.y))/den;
    ctx.save();ctx.beginPath();ctx.moveTo(a.d.x,a.d.y);ctx.lineTo(b.d.x,b.d.y);ctx.lineTo(c.d.x,c.d.y);ctx.closePath();ctx.clip();
    ctx.transform(A,B,C,D,E,F);ctx.drawImage(image,0,0);ctx.restore();
  }
}
